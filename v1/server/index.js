import express from 'express';
import cors from 'cors';
import { getDb, save, newId } from './store.js';
import { WHITELIST, BLACKLIST, CUSTOMS, detectLeak, localizeCategory } from './rules.js';
import { hashPassword, verifyPassword, newToken, sixDigitCode, validRegistration, EMAIL_RE, rateLimit } from './auth.js';
import { langMiddleware } from './errors.js';
import { renderNotification } from './notify-i18n.js';
import { createEscrow, transitionEscrow } from './escrow.js';
import { createPersistence } from './persistence.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));
// i18n des erreurs API : traduit body.error à la sortie selon Accept-Language (fr/ar/nl).
app.use(langMiddleware);

const db = getDb();

// Mode démo : désactivé par défaut (secure by default). Doit être explicitement activé
// (DEMO=true) pour exposer les endpoints /api/dev/* (bascule de compte sans mot de
// passe) et les codes de vérification en clair dans les réponses API — jamais en
// production, où un vrai prestataire email/SMS doit être branché à la place.
const DEMO = process.env.DEMO === 'true';

// Endpoint public : le client s'en sert pour savoir s'il doit afficher les outils de
// démo (bascule de compte, remplissage auto). Ne révèle rien de sensible en lui-même.
app.get('/api/config', (req, res) => res.json({ demo: DEMO }));

// ---------- Helpers ----------
const publicUser = (u) =>
  u && {
    id: u.id, name: u.name, city: u.city, kycStatus: u.kycStatus, rating: u.rating,
    ratingCount: u.ratingCount, completed: u.completed, cancelRate: u.cancelRate,
    badges: u.badges, photoUrl: u.photoUrl || null, isAdmin: !!u.isAdmin,
    createdAt: u.createdAt, onboardingDone: !!u.settings?.onboardingDone,
  };

const findUser = (id) => db.users.find((u) => u.id === id);
const { repositories } = createPersistence({ db, save, newId, findUser, publicUser });
const DEFAULT_NOTIFICATION_SETTINGS = {
  transactions: true,
  messages: true,
  shipments: true,
  reminders: true,
  security: true,
};
const OFFER_REMINDER_MS = 6 * 3600e3;

function userSettings(user) {
  return repositories.settings.ensure(user);
}

// Seules les parties d'une transaction (ou un admin) peuvent en consulter le détail,
// les messages, le récap douane, ou agir sur un litige qui s'y rattache.
const isPartyToTx = (t, userId) => [t.senderId, t.travelerId, t.recipientId].includes(userId);

function auth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const userId = db.sessions[token];
  if (!userId) return res.status(401).json({ error: 'Non authentifié' });
  req.user = findUser(userId);
  if (!req.user) return res.status(401).json({ error: 'Utilisateur inconnu' });
  next();
}

function addEvent(tx, type, actorId, meta = {}) {
  tx.events.push({ id: newId('e'), type, actorId, meta, at: Date.now() });
}

async function audit(actorId, action, targetType, targetId, meta = {}) {
  return repositories.auditLogs.append({ actorId, action, targetType, targetId, meta });
}

// Notifications in-app aux transitions d'état (PRD §4.5). `textOrKey` accepte soit une
// chaîne française littérale (legacy), soit { key, params } — dans ce cas la traduction
// se fait à la LECTURE selon la langue du lecteur (voir notify-i18n.js), pas à la création :
// une notification est persistée une fois mais peut être lue par un compte qui a changé de
// langue, ou par un admin dans une autre langue que le destinataire.
async function notify(userIds, textOrKey, txId = null, type = 'transactions', section = null) {
  const isKeyed = textOrKey && typeof textOrKey === 'object';
  const writes = [];
  for (const uid of new Set(userIds.filter(Boolean))) {
    const user = findUser(uid);
    const kind = DEFAULT_NOTIFICATION_SETTINGS[type] === undefined ? 'transactions' : type;
    const prefs = user ? userSettings(user).notifications : DEFAULT_NOTIFICATION_SETTINGS;
    if (kind !== 'security' && prefs[kind] === false) continue;
    const payload = isKeyed
      ? { key: textOrKey.key, params: textOrKey.params || {}, text: renderNotification('fr', textOrKey) }
      : { text: textOrKey };
    writes.push(repositories.notifications.append({ userId: uid, txId, type: kind, section, ...payload }));
  }
  return Promise.all(writes);
}

function matchingOfferWaitingUser(offer) {
  if (offer.status === 'pending_traveler') return offer.travelerId;
  if (offer.status === 'countered_sender') return offer.senderId;
  return null;
}

async function runMatchingOfferReminders({ persist = false } = {}) {
  let changed = normalizeMatchingOffers();
  const writes = [];
  const now = Date.now();
  for (const offer of db.matchingOffers || []) {
    normalizeMatchingOffer(offer);
    const listing = db.listings.find((l) => l.id === offer.listingId);
    const title = listing?.title || 'une proposition';
    offer.reminders = offer.reminders || {};

    if (['pending_traveler', 'countered_sender'].includes(offer.status)) {
      const waitingUserId = matchingOfferWaitingUser(offer);
      const expiresIn = (offer.expiresAt || 0) - now;
      if (waitingUserId && expiresIn > 0 && expiresIn <= OFFER_REMINDER_MS && !offer.reminders.expiresSoonAt) {
        offer.reminders.expiresSoonAt = now;
        writes.push(notify([waitingUserId], { key: 'offer.expiring', params: { title } }, null, 'reminders', 'matching'));
        changed = true;
      }
    }

    if (offer.status === 'expired' && !offer.reminders.expiredAt) {
      offer.reminders.expiredAt = now;
      writes.push(notify([offer.senderId, offer.travelerId], { key: 'offer.expired', params: { title } }, null, 'reminders', 'matching'));
      changed = true;
    }
  }
  await Promise.all(writes);
  if (changed && persist) save();
  return changed;
}

const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
function validPhotos(photos) {
  if (!Array.isArray(photos)) return false;
  return photos.every((p) => IMG_RE.test(p) && p.length <= 700 * 1024);
}

// Liste blanche effective = base statique + catégories promues depuis la zone grise
// après validation admin (évite de rejuger indéfiniment le même produit — §4.2).
const combinedWhitelist = () => repositories.customWhitelist.combinedWith(WHITELIST);

function evaluateCategoryDynamic(categoryId) {
  const white = combinedWhitelist().find((c) => c.id === categoryId);
  if (white) return { verdict: 'whitelisted', category: white };
  const black = BLACKLIST.find((c) => c.id === categoryId);
  if (black) return { verdict: 'blacklisted', category: black };
  return { verdict: 'gray' };
}

// Plage Unicode des diacritiques combinants (U+0300-U+036F), construite par code
// point pour éviter tout souci d'encodage de caractère combinant dans le fichier source.
const DIACRITICS_RE = new RegExp(`[\\u0300-\\u036f]`, 'g');
function slugify(s) {
  return String(s || '')
    .normalize('NFD').replace(DIACRITICS_RE, '') // retire les accents
    .toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'produit';
}

const code6 = () => Math.random().toString(36).slice(2, 8).toUpperCase();

// Nombre positif (ou nul si allowZero) — rejette NaN, chaînes non numériques et valeurs négatives.
function positiveNumber(v, { allowZero = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || (!allowZero && n === 0)) return null;
  return n;
}

// ---------- Auth : email + mot de passe, Google (simulé), reset ----------
const normEmail = (e) => String(e || '').trim().toLowerCase();
const findByEmail = (email) => db.users.find((u) => u.email === normEmail(email));

function makeUser({ name, email, phone, provider, emailVerified, passwordHash, cguAcceptedAt, registerIp }) {
  return {
    id: newId('u'), name: name.trim(), email: normEmail(email), phone: phone || '',
    passwordHash: passwordHash || null, provider, emailVerified: !!emailVerified,
    city: '', kycStatus: 'none', rating: null, ratingCount: 0, completed: 0, cancelRate: 0,
    // Plafonds progressifs (PRD §0.3) : nouveau compte = 100 €, 1 transaction active
    maxValue: 100, maxActive: 1, badges: [], createdAt: Date.now(),
    cguAcceptedAt: cguAcceptedAt || null,
    // Indice de corrélation pour le dashboard fraude (§4.7) — pas une preuve à elle seule.
    registerIp: registerIp || '', lastIp: registerIp || '',
  };
}

// IP au sens du proxy (best-effort — falsifiable côté client, sert d'indice de
// corrélation pour le dashboard fraude, pas de preuve à elle seule).
const clientIp = (req) => (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';

function openSession(res, user, req) {
  const token = newToken();
  db.sessions[token] = user.id;
  if (req) {
    user.lastIp = clientIp(req);
    user.lastLoginAt = Date.now();
  }
  save();
  res.json({ token, user: publicUser(user) });
}

// Le code n'est renvoyé dans la réponse API qu'en mode démo (pas de prestataire email
// branché). En production, il doit être envoyé par email/SMS et jamais échoir ici —
// sinon n'importe qui connaissant un email pourrait vérifier ou réinitialiser un compte
// qui n'est pas le sien, sans jamais avoir accès à sa boîte mail.
const demoHintFor = (code) => (DEMO ? `Code de vérification (démo) : ${code}` : undefined);

app.post('/api/auth/register', (req, res) => {
  const { name, email, phone, password, cguAccepted } = req.body;
  const invalid = validRegistration({ name, email, password });
  if (invalid) return res.status(400).json({ error: invalid });
  if (!cguAccepted) return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation' });
  if (findByEmail(email)) return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
  const user = makeUser({ name, email, phone, provider: 'email', passwordHash: hashPassword(password), cguAcceptedAt: Date.now(), registerIp: clientIp(req) });
  db.users.push(user);
  const code = sixDigitCode();
  db.pendingVerifications[user.email] = { code, expires: Date.now() + 15 * 60e3 };
  save();
  res.json({ pendingEmail: user.email, demoHint: demoHintFor(code) });
});

app.post('/api/auth/verify-email', (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`verify:${email}`))
    return res.status(429).json({ error: 'Trop de tentatives — demandez un nouveau code' });
  const pending = db.pendingVerifications[email];
  if (!pending || pending.expires < Date.now())
    return res.status(400).json({ error: 'Code expiré — demandez un nouvel envoi' });
  if (pending.code !== String(req.body.code || '').trim())
    return res.status(400).json({ error: 'Code incorrect' });
  const user = findByEmail(email);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  user.emailVerified = true;
  delete db.pendingVerifications[email];
  openSession(res, user, req);
});

app.post('/api/auth/resend-code', (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`resend:${email}`))
    return res.status(429).json({ error: 'Trop de demandes — réessayez plus tard' });
  const user = findByEmail(email);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  const code = sixDigitCode();
  db.pendingVerifications[email] = { code, expires: Date.now() + 15 * 60e3 };
  save();
  res.json({ ok: true, demoHint: demoHintFor(code) });
});

app.post('/api/auth/login', (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`login:${email}`))
    return res.status(429).json({ error: 'Trop de tentatives — réessayez dans 10 minutes' });
  const user = findByEmail(email);
  if (!user || !verifyPassword(req.body.password || '', user.passwordHash))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  if (!user.emailVerified) {
    const code = sixDigitCode();
    db.pendingVerifications[email] = { code, expires: Date.now() + 15 * 60e3 };
    save();
    return res.json({ needsVerification: true, pendingEmail: email, demoHint: demoHintFor(code) });
  }
  openSession(res, user, req);
});

// OAuth Google — simulé en démo. En prod : flux OAuth 2.0 / OpenID Connect
// (échange du "credential" Google Identity Services contre l'identité vérifiée).
app.post('/api/auth/google', (req, res) => {
  const { email, name, cguAccepted } = req.body;
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email Google invalide' });
  let user = findByEmail(email);
  if (!user) {
    if (!cguAccepted) return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation' });
    user = makeUser({ name: name || email.split('@')[0], email, provider: 'google', emailVerified: true, cguAcceptedAt: Date.now(), registerIp: clientIp(req) });
    db.users.push(user);
  }
  openSession(res, user, req);
});

app.post('/api/auth/forgot', (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`forgot:${email}`))
    return res.status(429).json({ error: 'Trop de demandes — réessayez plus tard' });
  const user = findByEmail(email);
  let code = null;
  // Réponse identique que le compte existe ou non (pas d'énumération d'emails)
  if (user && user.provider !== 'google') {
    code = sixDigitCode();
    db.resets[email] = { code, expires: Date.now() + 15 * 60e3 };
    save();
  }
  res.json({
    ok: true,
    demoHint: user?.provider === 'google' ? 'Ce compte utilise Google — connectez-vous avec Google.' : demoHintFor(code || '—'),
  });
});

app.post('/api/auth/reset', (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`reset:${email}`))
    return res.status(429).json({ error: 'Trop de tentatives — refaites une demande' });
  const reset = db.resets[email];
  if (!reset || reset.expires < Date.now())
    return res.status(400).json({ error: 'Code expiré — refaites une demande' });
  if (reset.code !== String(req.body.code || '').trim())
    return res.status(400).json({ error: 'Code incorrect' });
  if (!req.body.password || req.body.password.length < 8)
    return res.status(400).json({ error: 'Mot de passe : 8 caractères minimum' });
  const user = findByEmail(email);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  user.passwordHash = hashPassword(req.body.password);
  user.emailVerified = true;
  delete db.resets[email];
  // Sécurité : invalide toutes les sessions existantes du compte
  for (const [tok, uid] of Object.entries(db.sessions)) if (uid === user.id) delete db.sessions[tok];
  openSession(res, user, req);
});

app.post('/api/auth/logout', auth, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  delete db.sessions[token];
  save();
  res.json({ ok: true });
});

app.get('/api/me', auth, (req, res) => {
  res.json({
    user: publicUser(req.user), email: req.user.email, provider: req.user.provider,
    phone: req.user.phone, maxValue: req.user.maxValue, maxActive: req.user.maxActive,
    trainingDone: !!req.user.trainingDone,
    kycStatus: req.user.kycStatus, kyc: kycUserView(req.user),
  });
});

app.get('/api/settings', auth, (req, res) => {
  res.json({ settings: userSettings(req.user) });
});

app.post('/api/settings', auth, (req, res) => {
  const input = req.body?.notifications || {};
  repositories.settings.updateNotifications(req.user, input);
  save();
  res.json({ settings: userSettings(req.user) });
});

app.post('/api/onboarding/complete', auth, (req, res) => {
  repositories.settings.markOnboardingDone(req.user);
  save();
  res.json({ user: publicUser(req.user), settings: userSettings(req.user) });
});

// ---------- KYC manuel (PRD KYC) ----------
// Statuts : none | pending | verified | rejected | refused
const MAX_KYC_ATTEMPTS = 3; // au-delà de 3 rejets, passage automatique en 'refused'

// Vue KYC côté utilisateur : sa demande active, sans exposer les décisions internes.
function kycUserView(user) {
  const mine = repositories.kyc.listForUser(user.id);
  const latest = mine[0] || null;
  const rejectedCount = mine.filter((s) => s.status === 'rejected').length;
  return {
    status: user.kycStatus || 'none',
    latestDecisionReason: latest && ['rejected', 'refused'].includes(latest.status) ? latest.decisionReason : null,
    submittedAt: latest?.submittedAt || null,
    attempts: mine.length,
    canResubmit: user.kycStatus === 'rejected' && rejectedCount < MAX_KYC_ATTEMPTS,
    documentType: latest?.documentType || null,
  };
}

function computeAge(birthDate) {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}

app.post('/api/kyc/submit', auth, (req, res) => {
  if (req.user.kycStatus === 'verified')
    return res.status(400).json({ error: 'Votre identité est déjà vérifiée' });
  if (req.user.kycStatus === 'pending')
    return res.status(400).json({ error: 'Une demande est déjà en cours de vérification' });
  if (req.user.kycStatus === 'refused')
    return res.status(403).json({ error: 'Vérification définitivement refusée — contactez le support' });

  const { legalName, birthDate, documentType, selfiePhoto, idFrontPhoto, idBackPhoto } = req.body;

  if (!legalName || String(legalName).trim().length < 3)
    return res.status(400).json({ error: 'Nom légal complet requis' });
  if (!['id_card', 'passport'].includes(documentType))
    return res.status(400).json({ error: 'Type de document invalide' });

  const age = computeAge(birthDate);
  if (age === null) return res.status(400).json({ error: 'Date de naissance invalide' });
  if (age < 18) return res.status(400).json({ error: 'Vous devez avoir 18 ans ou plus' });

  if (!validPhotos([selfiePhoto])) return res.status(400).json({ error: 'Selfie invalide (JPEG/PNG/WebP, 500 Ko max)' });
  if (!validPhotos([idFrontPhoto])) return res.status(400).json({ error: 'Photo du recto invalide' });
  if (documentType === 'id_card' && !validPhotos([idBackPhoto]))
    return res.status(400).json({ error: 'Photo du verso invalide (obligatoire pour une carte d\'identité)' });

  // Garde-fou anti-fraude : au-delà de la limite de tentatives, on refuse d'accepter
  // une nouvelle soumission automatiquement (le compte reste 'rejected', support requis).
  const rejectedCount = repositories.kyc.rejectedCountForUser(req.user.id);
  if (rejectedCount >= MAX_KYC_ATTEMPTS)
    return res.status(403).json({ error: 'Nombre maximum de tentatives atteint — contactez le support' });

  repositories.kyc.appendSubmission({
    userId: req.user.id,
    legalName: String(legalName).trim().slice(0, 120),
    birthDate, age, documentType,
    selfiePhoto, idFrontPhoto, idBackPhoto: documentType === 'id_card' ? idBackPhoto : null,
  });
  req.user.kycStatus = 'pending';
  save();
  res.json({ kyc: kycUserView(req.user) });
});

// ---------- Profil ----------
app.post('/api/profile', auth, (req, res) => {
  const { name, city, phone } = req.body;
  if (name !== undefined) {
    if (String(name).trim().length < 2) return res.status(400).json({ error: 'Nom trop court' });
    req.user.name = String(name).trim().slice(0, 60);
  }
  if (city !== undefined) req.user.city = String(city).trim().slice(0, 60);
  if (phone !== undefined) req.user.phone = String(phone).trim().slice(0, 20);
  save();
  res.json({ user: publicUser(req.user) });
});

app.post('/api/profile/photo', auth, (req, res) => {
  const { dataUrl } = req.body;
  if (dataUrl === null) {
    req.user.photoUrl = null;
    save();
    return res.json({ user: publicUser(req.user) });
  }
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl || ''))
    return res.status(400).json({ error: 'Format d\'image invalide (JPEG, PNG ou WebP)' });
  if (dataUrl.length > 700 * 1024)
    return res.status(400).json({ error: 'Image trop lourde (500 Ko max après compression)' });
  req.user.photoUrl = dataUrl;
  save();
  res.json({ user: publicUser(req.user) });
});

// ---------- RGPD : export et suppression de compte (PRD §6) ----------
app.get('/api/profile/export', auth, (req, res) => {
  const uid = req.user.id;
  const { passwordHash, ...userSafe } = req.user;
  const data = {
    exportedAt: new Date().toISOString(),
    user: userSafe,
    listings: db.listings.filter((l) => l.senderId === uid),
    trips: db.trips.filter((t) => t.travelerId === uid),
    transactions: db.transactions.filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(uid)),
    messages: repositories.messages.listFromUser(uid),
    disputes: db.disputes.filter((d) => d.openedBy === uid),
    // Métadonnées KYC sans les images (données biométriques sensibles — non incluses
    // dans l'export standard, PRD KYC §6 ; communiquées séparément sur demande justifiée).
    kyc: repositories.kyc.listForUser(uid).map((s) => ({
      id: s.id, submittedAt: s.submittedAt, status: s.status,
      legalName: s.legalName, birthDate: s.birthDate, documentType: s.documentType,
      reviewedAt: s.reviewedAt, decisionReason: s.decisionReason,
    })),
  };
  res.setHeader('Content-Disposition', `attachment; filename="wigofly-donnees-${uid}.json"`);
  res.json(data);
});

function documentCenterFor(user) {
  const uid = user.id;
  const txs = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(uid))
    .sort((a, b) => b.createdAt - a.createdAt);
  const dossiers = txs.map((tx) => {
    const listing = db.listings.find((l) => l.id === tx.listingId) || null;
    const dispute = db.disputes.find((d) => d.txId === tx.id) || null;
    const role = tx.senderId === uid ? 'sender' : tx.travelerId === uid ? 'traveler' : 'recipient';
    const docs = [
      {
        id: 'customs',
        status: tx.sealingVideo || ['sealed', 'in_transit', 'released', 'disputed', 'refunded'].includes(tx.status) ? 'ready' : 'pending',
        href: `/transactions/${tx.id}#douane`,
      },
      {
        id: 'sealing',
        status: tx.sealingVideo ? 'ready' : tx.status === 'accepted' && role === 'sender' ? 'action' : 'pending',
        href: `/transactions/${tx.id}#actions`,
        meta: tx.sealingVideo ? {
          recordedAt: tx.sealingVideo.recordedAt,
          simulated: !!tx.sealingVideo.simulated,
          hasVideo: !!tx.sealingVideo.dataUrl,
          geo: tx.sealingVideo.geo || null,
        } : null,
      },
      {
        id: 'escrow',
        status: tx.escrow?.state || 'pending',
        href: `/transactions/${tx.id}#suivi`,
        meta: tx.escrow || null,
      },
    ];
    if (dispute) {
      docs.push({
        id: 'dispute',
        status: dispute.status,
        href: `/transactions/${tx.id}#litige`,
        meta: {
          evidenceCount: dispute.evidence?.length || 0,
          myEvidenceCount: (dispute.evidence || []).filter((e) => e.by === uid).length,
          evidenceDeadline: dispute.createdAt + EVIDENCE_WINDOW_MS,
        },
      });
    }
    return {
      txId: tx.id,
      role,
      status: tx.status,
      listing: listing ? {
        id: listing.id,
        title: listing.title,
        from: listing.from,
        to: listing.to,
        valueEur: listing.valueEur,
        categoryId: listing.categoryId,
      } : null,
      createdAt: tx.createdAt,
      docs,
    };
  });
  const kyc = repositories.kyc.listForUser(uid)
    .map((s) => ({
      id: s.id,
      status: s.status,
      submittedAt: s.submittedAt,
      reviewedAt: s.reviewedAt || null,
      documentType: s.documentType,
      retainedByProvider: true,
    }));
  return {
    totals: {
      dossiers: dossiers.length,
      ready: dossiers.reduce((sum, d) => sum + d.docs.filter((doc) => doc.status === 'ready' || doc.status === 'released' || doc.status === 'held').length, 0),
      actions: dossiers.reduce((sum, d) => sum + d.docs.filter((doc) => doc.status === 'action').length, 0),
      disputes: dossiers.filter((d) => d.docs.some((doc) => doc.id === 'dispute')).length,
      kyc: kyc.length,
    },
    dossiers,
    kyc,
  };
}

app.get('/api/documents-center', auth, (req, res) => {
  res.json({ documents: documentCenterFor(req.user) });
});

app.post('/api/profile/delete', auth, (req, res) => {
  const uid = req.user.id;
  const activeTx = db.transactions.filter(
    (t) => [t.senderId, t.travelerId, t.recipientId].includes(uid) && !CLOSED_STATUSES.includes(t.status)
  );
  if (activeTx.length > 0)
    return res.status(400).json({ error: `Impossible : ${activeTx.length} transaction(s) encore en cours. Terminez-les d'abord.` });

  // Anonymisation plutôt que suppression physique : préserve l'intégrité des transactions passées
  // (traçabilité douanière/litiges) tout en effaçant les données personnelles identifiantes.
  req.user.name = 'Compte supprimé';
  req.user.email = `deleted-${uid}@wigofly.invalid`;
  req.user.phone = '';
  req.user.city = '';
  req.user.photoUrl = null;
  req.user.passwordHash = null;
  req.user.provider = 'deleted';
  req.user.deletedAt = Date.now();
  // Purge des images KYC (données biométriques) — on conserve seulement la trace de décision
  // anonymisée pour l'audit de conformité, sans les photos.
  repositories.kyc.purgeSensitiveForUser(uid);
  for (const [tok, id] of Object.entries(db.sessions)) if (id === uid) delete db.sessions[tok];
  save();
  res.json({ ok: true });
});

// ---------- Notifications ----------
app.get('/api/notifications', auth, async (req, res) => {
  await runMatchingOfferReminders({ persist: true });
  const mine = (await repositories.notifications.listForUser(req.user.id, { limit: 30 }))
    // Traduit à la lecture selon req.lang (posé par langMiddleware) — le texte français
    // stocké sert de repli pour les notifications persistées avant l'introduction des clés.
    .map((n) => ({ ...n, text: renderNotification(req.lang, n) }));
  res.json({ notifications: mine, unread: await repositories.notifications.unreadCount(req.user.id) });
});

app.post('/api/notifications/read', auth, async (req, res) => {
  await repositories.notifications.markAllRead(req.user.id);
  save();
  res.json({ ok: true });
});

// ---------- Formation voyageur (PRD §5.4) ----------
const TRAINING_ANSWERS = { q1: 'b', q2: 'c', q3: 'a' };
app.post('/api/training/complete', auth, (req, res) => {
  const a = req.body.answers || {};
  const wrong = Object.entries(TRAINING_ANSWERS).filter(([k, v]) => a[k] !== v).map(([k]) => k);
  if (wrong.length > 0)
    return res.status(400).json({ error: 'Certaines réponses sont incorrectes — relisez les règles.', wrong });
  req.user.trainingDone = true;
  save();
  res.json({ ok: true });
});

// ---------- Référentiels ----------
app.get('/api/rules', (req, res) => {
  // Labels localisés selon Accept-Language (req.lang posé par langMiddleware).
  // Les i18n internes ne sortent pas de l'API ; les catégories promues (sans i18n)
  // et le français restent tels quels.
  res.json({
    whitelist: combinedWhitelist().map((c) => localizeCategory(c, req.lang)),
    blacklist: BLACKLIST.map((c) => localizeCategory(c, req.lang)),
    customs: CUSTOMS,
  });
});

// ---------- Trajets voyageur (PRD §2.1) ----------
function complianceCenterFor(user) {
  const listings = db.listings
    .filter((l) => l.senderId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const reviewQueue = repositories.reviewQueue.open({ type: 'listing' });
  const items = listings.map((listing) => {
    const corridorKey = listing.from === 'Casablanca' ? 'MA-EU' : 'EU-MA';
    const limitEur = corridorKey === 'MA-EU' ? 430 : 185;
    const queueItem = reviewQueue.find((r) => r.refId === listing.id);
    return {
      listing,
      corridorKey,
      customsLimitEur: limitEur,
      overFranchise: listing.valueEur > limitEur,
      reviewPending: listing.status === 'pending_review',
      queueId: queueItem?.id || null,
      action: listing.status === 'pending_review'
        ? { id: 'wait_review', priority: 'medium', href: '/envois' }
        : listing.valueEur > limitEur
          ? { id: 'customs_value', priority: 'medium', href: `/annonce/${listing.id}` }
          : { id: 'ok', priority: 'low', href: `/annonce/${listing.id}` },
    };
  });
  const gray = items.filter((i) => i.listing.whitelistVerdict === 'gray' || i.reviewPending);
  const over = items.filter((i) => i.overFranchise);
  return {
    corridors: Object.entries(CUSTOMS).map(([id, c]) => ({
      id,
      label: c.label,
      franchise: c.franchise,
      rules: c.rules,
      limitEur: id === 'MA-EU' ? 430 : 185,
    })),
    catalogue: {
      allowed: combinedWhitelist(),
      forbidden: BLACKLIST,
      grayExamples: gray.slice(0, 4).map((i) => ({
        id: i.listing.id,
        title: i.listing.title,
        categoryLabel: i.listing.categoryLabel,
        status: i.listing.status,
      })),
    },
    totals: {
      listings: listings.length,
      reviewPending: gray.length,
      overFranchise: over.length,
      allowedCategories: combinedWhitelist().length,
      forbiddenCategories: BLACKLIST.length,
    },
    actions: [...gray, ...over]
      .sort((a, b) => {
        const rank = { medium: 0, low: 1 };
        return rank[a.action.priority] - rank[b.action.priority] || b.listing.createdAt - a.listing.createdAt;
      })
      .slice(0, 6)
      .map((i) => ({
        id: `${i.listing.id}:${i.action.id}`,
        listingId: i.listing.id,
        title: i.listing.title,
        categoryLabel: i.listing.categoryLabel,
        action: i.action,
      })),
    items,
  };
}

app.get('/api/compliance-center', auth, (req, res) => {
  res.json({ compliance: complianceCenterFor(req.user) });
});

app.get('/api/trips/mine', auth, (req, res) => {
  res.json({ trips: db.trips.filter((t) => t.travelerId === req.user.id) });
});

app.get('/api/trips/mission', auth, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const trips = db.trips
    .filter((t) => t.travelerId === req.user.id && t.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const open = db.listings.filter((l) => l.status === 'published' && l.senderId !== req.user.id);
  const missions = trips.map((trip) => {
    const matches = open
      .filter((l) => matchesTrip(l, trip))
      .sort((a, b) => b.travelerPay - a.travelerPay)
      .map((l) => ({ ...l, sender: publicUser(findUser(l.senderId)) }));
    const totalPay = matches.reduce((s, l) => s + l.travelerPay, 0);
    const totalWeight = matches.reduce((s, l) => s + l.weightKg, 0);
    const totalValue = matches.reduce((s, l) => s + l.valueEur, 0);
    const corridor = trip.from === 'Casablanca' ? CUSTOMS['MA-EU'] : CUSTOMS['EU-MA'];
    const customsLimit = trip.from === 'Casablanca' ? 430 : 185;
    return {
      trip,
      matchCount: matches.length,
      totalPay,
      totalWeight: Math.round(totalWeight * 10) / 10,
      remainingKg: Math.max(0, Math.round((trip.capacityKg - totalWeight) * 10) / 10),
      totalValue,
      customs: { corridor, limitEur: customsLimit, overLimit: totalValue > customsLimit },
      matchIds: matches.map((l) => l.id),
      topMatches: matches.slice(0, 3),
    };
  });
  res.json({
    missions,
    totals: {
      trips: missions.length,
      matches: missions.reduce((s, m) => s + m.matchCount, 0),
      potentialPay: missions.reduce((s, m) => s + m.totalPay, 0),
    },
  });
});

app.post('/api/trips', auth, (req, res) => {
  if (req.user.kycStatus !== 'verified')
    return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });
  const { from, to, date, capacityKg } = req.body;
  if (!from || !to || !date) return res.status(400).json({ error: 'Trajet, sens et date requis' });
  if (from === to) return res.status(400).json({ error: 'Départ et arrivée identiques' });
  if (new Date(date) < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'La date est déjà passée' });
  const trip = {
    id: newId('t'), travelerId: req.user.id, from, to, date,
    capacityKg: Math.max(1, Math.min(30, Number(capacityKg) || 5)), createdAt: Date.now(),
  };
  db.trips.push(trip);
  save();
  res.json({ trip });
});

app.delete('/api/trips/:id', auth, (req, res) => {
  const i = db.trips.findIndex((t) => t.id === req.params.id && t.travelerId === req.user.id);
  if (i === -1) return res.status(404).json({ error: 'Trajet introuvable' });
  db.trips.splice(i, 1);
  save();
  res.json({ ok: true });
});

// Compatibilité annonce ↔ trajet : même sens, fenêtre de dates qui contient la date du vol, poids ≤ capacité.
function matchesTrip(listing, trip) {
  return listing.from === trip.from && listing.to === trip.to
    && listing.dateFrom <= trip.date && trip.date <= listing.dateTo
    && (!listing.weightKg || listing.weightKg <= trip.capacityKg);
}

// ---------- Annonces ----------
// Feed filtré par trajet déclaré (PRD §2.1). ?all=1 pour tout voir.
// Filtres optionnels : ?category=, ?minPrice=, ?maxPrice=, ?q= (titre)
app.get('/api/listings', auth, (req, res) => {
  let open = db.listings
    .filter((l) => l.status === 'published' && l.senderId !== req.user.id);

  const { category, minPrice, maxPrice, q } = req.query;
  if (category) open = open.filter((l) => l.categoryId === category);
  if (minPrice) open = open.filter((l) => l.travelerPay >= Number(minPrice));
  if (maxPrice) open = open.filter((l) => l.travelerPay <= Number(maxPrice));
  // Recherche élargie (PRD UI/UX U11) : titre + description + libellé de catégorie.
  if (q) {
    const needle = String(q).toLowerCase();
    open = open.filter((l) =>
      `${l.title} ${l.description || ''} ${l.categoryLabel || ''}`.toLowerCase().includes(needle));
  }

  const myTrips = db.trips.filter((t) => t.travelerId === req.user.id && t.date >= new Date().toISOString().slice(0, 10));
  const showAll = req.query.all === '1' || myTrips.length === 0;
  const listings = (showAll ? open : open.filter((l) => myTrips.some((t) => matchesTrip(l, t))))
    .map((l) => ({ ...l, sender: publicUser(findUser(l.senderId)), matched: myTrips.some((t) => matchesTrip(l, t)) }));
  res.json({ listings, filteredByTrip: !showAll, tripCount: myTrips.length, totalOpen: open.length });
});

app.get('/api/listings/mine', auth, (req, res) => {
  const listings = db.listings.filter((l) => l.senderId === req.user.id);
  res.json({ listings });
});

// Modification d'une annonce tant qu'aucun voyageur ne l'a acceptée (statut 'published' ou 'pending_review').
function shipmentActionFor(listing, tx) {
  if (listing.status === 'pending_review') return { id: 'review', priority: 'medium', href: '/envois' };
  if (listing.status === 'published') return { id: 'wait_traveler', priority: 'medium', href: `/annonce/${listing.id}` };
  if (!tx) return { id: listing.status === 'cancelled' ? 'cancelled' : 'closed', priority: 'low', href: '/envois' };
  if (tx.status === 'accepted') return { id: 'seal', priority: 'high', href: `/transactions/${tx.id}#actions` };
  if (tx.status === 'sealed') return { id: 'handoff', priority: 'high', href: `/transactions/${tx.id}#messages` };
  if (tx.status === 'in_transit') return { id: 'track', priority: 'medium', href: `/transactions/${tx.id}#suivi` };
  if (tx.status === 'disputed') return { id: 'dispute', priority: 'high', href: `/transactions/${tx.id}#litige` };
  if (tx.status === 'released') return { id: 'rate', priority: 'low', href: `/transactions/${tx.id}#actions` };
  return { id: 'closed', priority: 'low', href: `/transactions/${tx.id}` };
}

function shipmentCommandCenterFor(user) {
  const mine = db.listings
    .filter((l) => l.senderId === user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const items = mine.map((listing) => {
    const tx = db.transactions
      .filter((t) => t.listingId === listing.id)
      .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
    const action = shipmentActionFor(listing, tx);
    return {
      listing,
      transaction: tx ? txView(user)(tx) : null,
      action,
      risk: {
        customs: listing.valueEur > (listing.from === 'Casablanca' ? 430 : 185),
        gray: listing.whitelistVerdict === 'gray',
        disputed: tx?.status === 'disputed',
      },
    };
  });
  const actions = items
    .filter((i) => ['high', 'medium'].includes(i.action.priority))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.action.priority] - rank[b.action.priority] || b.listing.createdAt - a.listing.createdAt;
    })
    .slice(0, 5)
    .map((i) => ({
      id: `${i.listing.id}:${i.action.id}`,
      listingId: i.listing.id,
      title: i.listing.title,
      action: i.action,
      status: i.transaction?.status || i.listing.status,
    }));
  return {
    totals: {
      total: mine.length,
      active: items.filter((i) => !['cancelled', 'rejected'].includes(i.listing.status)).length,
      published: mine.filter((l) => l.status === 'published').length,
      pendingReview: mine.filter((l) => l.status === 'pending_review').length,
      matched: mine.filter((l) => l.status === 'matched').length,
      inTransit: items.filter((i) => i.transaction?.status === 'in_transit').length,
      disputed: items.filter((i) => i.transaction?.status === 'disputed').length,
      escrowHeld: items.reduce((sum, i) => sum + (i.transaction?.escrow?.state === 'held' ? i.transaction.escrow.amount : 0), 0),
    },
    actions,
    items,
  };
}

app.get('/api/shipments/command-center', auth, (req, res) => {
  res.json({ commandCenter: shipmentCommandCenterFor(req.user) });
});

function senderMatchingCenterFor(user) {
  const today = new Date().toISOString().slice(0, 10);
  const mine = db.listings
    .filter((l) => l.senderId === user.id && ['published', 'pending_review'].includes(l.status))
    .sort((a, b) => b.createdAt - a.createdAt);
  const trips = db.trips
    .filter((t) => t.travelerId !== user.id && t.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date));
  const items = mine.map((listing) => {
    const candidates = trips
      .filter((trip) => matchesTrip(listing, trip))
      .map((trip) => {
        const traveler = findUser(trip.travelerId);
        const capacityFit = listing.weightKg ? Math.min(100, Math.round((listing.weightKg / trip.capacityKg) * 100)) : 0;
        const offer = (db.matchingOffers || [])
          .filter((o) => o.listingId === listing.id && o.tripId === trip.id && o.senderId === user.id)
          .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
        return {
          trip,
          traveler: publicUser(traveler),
          score: Math.min(100, Math.max(40, 100 - capacityFit + Math.min(10, traveler?.completed || 0))),
          capacityFit,
          offer,
        };
      })
      .sort((a, b) => b.score - a.score || a.trip.date.localeCompare(b.trip.date));
    const action = listing.status === 'pending_review'
      ? { id: 'wait_review', priority: 'medium', href: '/envois' }
      : candidates.length
        ? { id: 'contact_ready', priority: 'high', href: `/annonce/${listing.id}` }
        : { id: 'adjust_listing', priority: 'medium', href: '/envois' };
    return {
      listing,
      candidates: candidates.slice(0, 5),
      candidateCount: candidates.length,
      action,
    };
  });
  return {
    totals: {
      listings: mine.length,
      matched: items.filter((i) => i.candidateCount > 0).length,
      candidates: items.reduce((s, i) => s + i.candidateCount, 0),
      pendingReview: mine.filter((l) => l.status === 'pending_review').length,
    },
    actions: items
      .filter((i) => i.action.priority !== 'low')
      .sort((a, b) => {
        const rank = { high: 0, medium: 1, low: 2 };
        return rank[a.action.priority] - rank[b.action.priority] || b.candidateCount - a.candidateCount;
      })
      .slice(0, 6)
      .map((i) => ({
        id: `${i.listing.id}:${i.action.id}`,
        listingId: i.listing.id,
        title: i.listing.title,
        action: i.action,
        candidateCount: i.candidateCount,
      })),
    items,
  };
}

app.get('/api/sender-matching', auth, async (req, res) => {
  await runMatchingOfferReminders({ persist: true });
  res.json({ matching: senderMatchingCenterFor(req.user) });
});

app.get('/api/matching-offers', auth, async (req, res) => {
  await runMatchingOfferReminders({ persist: true });
  const offers = (db.matchingOffers || [])
    .map(normalizeMatchingOffer)
    .filter((o) => o.senderId === req.user.id || o.travelerId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((o) => ({
      ...o,
      myRole: o.senderId === req.user.id ? 'sender' : 'traveler',
      listing: db.listings.find((l) => l.id === o.listingId),
      trip: db.trips.find((t) => t.id === o.tripId),
      sender: publicUser(findUser(o.senderId)),
      traveler: publicUser(findUser(o.travelerId)),
    }));
  res.json({ offers });
});

function matchingOfferSnapshot(offer) {
  if (!offer) return '';
  return JSON.stringify({
    status: offer.status,
    offeredPay: offer.offeredPay,
    expiresAt: offer.expiresAt,
    respondedAt: offer.respondedAt,
    historyLength: Array.isArray(offer.history) ? offer.history.length : 0,
  });
}

function normalizeMatchingOffers({ persist = false } = {}) {
  let changed = false;
  for (const offer of db.matchingOffers || []) {
    const before = matchingOfferSnapshot(offer);
    normalizeMatchingOffer(offer);
    if (matchingOfferSnapshot(offer) !== before) changed = true;
  }
  if (changed && persist) save();
  return changed;
}

function normalizeMatchingOfferAndSave(offer) {
  const before = matchingOfferSnapshot(offer);
  normalizeMatchingOffer(offer);
  if (matchingOfferSnapshot(offer) !== before) save();
  return offer;
}

function normalizeMatchingOffer(offer) {
  if (!offer) return offer;
  const now = Date.now();
  const listing = db.listings.find((l) => l.id === offer.listingId);
  if (!offer.offeredPay && listing) offer.offeredPay = listing.travelerPay;
  if (!offer.expiresAt) offer.expiresAt = offer.createdAt + 72 * 36e5;
  if (!offer.history) {
    offer.history = [{
      by: offer.senderId,
      type: 'created',
      pay: offer.offeredPay || listing?.travelerPay || 0,
      message: offer.message || '',
      at: offer.createdAt,
    }];
  }
  if (offer.status === 'pending') offer.status = 'pending_traveler';
  if (['pending_traveler', 'countered_sender'].includes(offer.status) && offer.expiresAt <= now) {
    offer.status = 'expired';
    offer.respondedAt = now;
    if (!offer.history.some((h) => h.type === 'expired')) {
      offer.history.push({ by: 'system', type: 'expired', pay: offer.offeredPay || 0, message: '', at: now });
    }
  }
  return offer;
}

app.post('/api/matching-offers', auth, async (req, res) => {
  normalizeMatchingOffers({ persist: true });
  const { listingId, tripId, message = '', offeredPay, expiresInHours } = req.body || {};
  const listing = db.listings.find((l) => l.id === listingId);
  const trip = db.trips.find((t) => t.id === tripId);
  if (!listing || listing.senderId !== req.user.id)
    return res.status(404).json({ error: 'Annonce introuvable' });
  if (listing.status !== 'published')
    return res.status(400).json({ error: 'Cette annonce ne peut plus recevoir de proposition' });
  if (!trip || trip.travelerId === req.user.id)
    return res.status(400).json({ error: 'Trajet incompatible' });
  if (!matchesTrip(listing, trip))
    return res.status(400).json({ error: 'Ce trajet ne correspond pas aux contraintes de l annonce' });

  const pay = positiveNumber(offeredPay === undefined ? listing.travelerPay : offeredPay);
  if (pay === null) return res.status(400).json({ error: 'Montant proposé invalide' });

  const existing = (db.matchingOffers || []).find((o) =>
    o.listingId === listing.id && o.tripId === trip.id && ['pending_traveler', 'countered_sender'].includes(o.status)
  );
  if (existing) return res.json({ offer: existing });

  const now = Date.now();
  const rawTtl = expiresInHours === undefined ? 72 : Number(expiresInHours);
  const ttlHours = Number.isFinite(rawTtl) ? Math.max(0, Math.min(168, rawTtl)) : 72;
  const offer = {
    id: newId('mo'), listingId: listing.id, tripId: trip.id,
    senderId: req.user.id, travelerId: trip.travelerId,
    status: 'pending_traveler',
    offeredPay: pay,
    message: String(message || '').trim().slice(0, 500),
    history: [{
      by: req.user.id,
      type: 'offer',
      pay,
      message: String(message || '').trim().slice(0, 500),
      at: now,
    }],
    createdAt: now, expiresAt: now + ttlHours * 36e5, respondedAt: null, txId: null,
  };
  db.matchingOffers.push(offer);
  await notify([offer.travelerId], { key: 'offer.received', params: { name: req.user.name, title: listing.title } }, null, 'messages', 'matching');
  save();
  res.json({ offer });
});

app.put('/api/listings/:id', auth, (req, res) => {
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
  if (listing.senderId !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
  if (!['published', 'pending_review'].includes(listing.status))
    return res.status(400).json({ error: 'Cette annonce ne peut plus être modifiée (déjà acceptée)' });

  const { title, description, weightKg, valueEur, dateFrom, dateTo, travelerPay, photos } = req.body;
  if (title !== undefined) listing.title = String(title).trim().slice(0, 120);
  if (description !== undefined) listing.description = String(description).trim().slice(0, 1000);
  if (weightKg !== undefined) {
    const n = positiveNumber(weightKg);
    if (n === null) return res.status(400).json({ error: 'Poids invalide' });
    listing.weightKg = n;
  }
  if (valueEur !== undefined) {
    const n = positiveNumber(valueEur);
    if (n === null) return res.status(400).json({ error: 'Valeur déclarée invalide' });
    if (n > req.user.maxValue)
      return res.status(400).json({ error: `Plafond dépassé : votre compte est limité à ${req.user.maxValue} € par envoi` });
    listing.valueEur = n;
  }
  if (dateFrom !== undefined) listing.dateFrom = dateFrom;
  if (dateTo !== undefined) listing.dateTo = dateTo;
  if (travelerPay !== undefined) {
    const n = positiveNumber(travelerPay);
    if (n === null) return res.status(400).json({ error: 'Rémunération voyageur invalide' });
    listing.travelerPay = n;
  }
  if (photos !== undefined) {
    if (photos.length === 0) return res.status(400).json({ error: 'Au moins une photo est obligatoire' });
    if (!validPhotos(photos) || photos.length > 3)
      return res.status(400).json({ error: 'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)' });
    listing.photos = photos;
  }
  save();
  res.json({ listing });
});

// Retrait d'une annonce par l'expéditeur, tant qu'aucun voyageur ne l'a acceptée.
app.post('/api/listings/:id/cancel', auth, (req, res) => {
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
  if (listing.senderId !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
  if (!['published', 'pending_review'].includes(listing.status))
    return res.status(400).json({ error: 'Cette annonce ne peut plus être retirée (déjà acceptée)' });
  listing.status = 'cancelled';
  save();
  res.json({ listing });
});

function listingPreflight(user, body) {
  const {
    title, categoryId: rawCategoryId, categoryLabel: rawCategoryLabel, description,
    weightKg, valueEur, from, to, dateFrom, dateTo, travelerPay, customsAccepted,
    recipientPhone, photos,
  } = body;
  const checks = [];
  const warnings = [];
  const blockers = [];
  const addCheck = (id, ok, label, severity = 'blocker', detail = null) => {
    checks.push({ id, ok, label, severity, detail });
    if (!ok && severity === 'blocker') blockers.push(id);
    if (!ok && severity === 'warning') warnings.push(id);
  };

  addCheck('kyc', user.kycStatus === 'verified', 'Identité vérifiée');
  addCheck('required', !!title && !!rawCategoryId && !!valueEur && !!from && !!to, 'Informations essentielles complètes');
  addCheck('photos', !!photos?.length && photos.length <= 3 && validPhotos(photos), 'Photos produit exploitables');
  addCheck('customs', !!customsAccepted, 'Responsabilités douanières acceptées');

  const valueNum = positiveNumber(valueEur);
  const weightNum = positiveNumber(weightKg);
  const payNum = positiveNumber(travelerPay);
  addCheck('value', valueNum !== null, 'Valeur déclarée valide');
  addCheck('weight', weightNum !== null, 'Poids valide');
  addCheck('pay', payNum !== null, 'Rémunération voyageur valide');
  addCheck('limit', valueNum !== null && valueNum <= user.maxValue, `Plafond compte : ${user.maxValue} €`);
  addCheck('route', !!from && !!to && from !== to, 'Trajet cohérent');
  addCheck('dates', !!dateFrom && !!dateTo && dateFrom <= dateTo, 'Fenêtre de dates cohérente');

  const categoryId = rawCategoryId === 'autre' && rawCategoryLabel ? slugify(rawCategoryLabel) : rawCategoryId;
  const evalRes = categoryId ? evaluateCategoryDynamic(categoryId) : { verdict: 'gray' };
  const cat = combinedWhitelist().find((c) => c.id === categoryId);
  addCheck('category', evalRes.verdict !== 'blacklisted', 'Catégorie autorisée',
    evalRes.verdict === 'blacklisted' ? 'blocker' : 'warning',
    evalRes.category?.reason || null);
  if (evalRes.verdict === 'gray') {
    addCheck('review', false, 'Revue humaine nécessaire', 'warning', 'Publication après validation admin.');
  } else {
    addCheck('review', true, 'Publication directe possible', 'warning');
  }

  const corridor = from === 'Casablanca' ? CUSTOMS['MA-EU'] : CUSTOMS['EU-MA'];
  const customsLimit = from === 'Casablanca' ? 430 : 185;
  if (valueNum !== null && valueNum > customsLimit) {
    addCheck('customs-value', false, `Valeur au-dessus de la franchise indicative (${customsLimit} €)`, 'warning');
  } else {
    addCheck('customs-value', true, 'Valeur dans la franchise indicative', 'warning');
  }

  const recipient = recipientPhone ? db.users.find((u) => u.phone === recipientPhone) : null;
  if (recipientPhone && !recipient) {
    addCheck('recipient', false, 'Destinataire non reconnu dans Wigofly', 'warning');
  } else {
    addCheck('recipient', true, recipient ? 'Destinataire reconnu' : 'Destinataire optionnel', 'warning');
  }

  const publishStatus = blockers.length > 0
    ? 'blocked'
    : evalRes.verdict === 'gray'
      ? 'pending_review'
      : 'published';
  return {
    status: publishStatus,
    canSubmit: blockers.length === 0,
    blockers,
    warnings,
    checks,
    category: {
      id: categoryId,
      label: cat?.label || rawCategoryLabel || categoryId || '',
      verdict: evalRes.verdict,
      maxQty: cat?.maxQty || null,
      reason: evalRes.category?.reason || null,
    },
    customs: {
      corridor,
      franchiseLimitEur: customsLimit,
      valueEur: valueNum,
      overFranchise: valueNum !== null ? valueNum > customsLimit : false,
    },
    costs: payNum === null ? null : {
      travelerPay: payNum,
      commission: Math.round(payNum * 0.18 * 100) / 100,
      total: Math.round(payNum * 1.18 * 100) / 100,
    },
  };
}

app.post('/api/listings/preflight', auth, (req, res) => {
  res.json({ preflight: listingPreflight(req.user, req.body || {}) });
});

app.post('/api/listings', auth, (req, res) => {
  if (req.user.kycStatus !== 'verified')
    return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });
  const { title, categoryId: rawCategoryId, categoryLabel: rawCategoryLabel, description, weightKg, valueEur, from, to, dateFrom, dateTo, travelerPay, customsAccepted, recipientPhone, photos } = req.body;
  if (!title || !rawCategoryId || !valueEur || !from || !to)
    return res.status(400).json({ error: 'Champs obligatoires manquants' });
  // Photos obligatoires (PRD §1.1) : le voyageur doit tout voir avant d'accepter.
  if (!photos || photos.length === 0)
    return res.status(400).json({ error: 'Au moins une photo du produit est obligatoire' });
  if (!validPhotos(photos) || photos.length > 3)
    return res.status(400).json({ error: 'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)' });
  if (!customsAccepted)
    return res.status(400).json({ error: 'Acceptation explicite des règles douanières requise' });
  const valueNum = positiveNumber(valueEur);
  const weightNum = positiveNumber(weightKg);
  const payNum = positiveNumber(travelerPay);
  if (valueNum === null) return res.status(400).json({ error: 'Valeur déclarée invalide' });
  if (weightNum === null) return res.status(400).json({ error: 'Poids invalide' });
  if (payNum === null) return res.status(400).json({ error: 'Rémunération voyageur invalide' });
  if (valueNum > req.user.maxValue)
    return res.status(400).json({ error: `Plafond dépassé : votre compte est limité à ${req.user.maxValue} € par envoi` });

  // Catégorie "Autre" : le libellé libre saisi par l'expéditeur devient sa propre
  // catégorie (slug dédié), évaluée pour elle-même — pas un fourre-tout partagé.
  const categoryId = rawCategoryId === 'autre' && rawCategoryLabel ? slugify(rawCategoryLabel) : rawCategoryId;

  const evalRes = evaluateCategoryDynamic(categoryId);
  if (evalRes.verdict === 'blacklisted')
    return res.status(400).json({ error: `Catégorie refusée : ${evalRes.category.reason}`, verdict: 'blacklisted' });

  const cat = combinedWhitelist().find((c) => c.id === categoryId);
  const recipient = recipientPhone ? db.users.find((u) => u.phone === recipientPhone) : null;
  const listing = {
    id: newId('l'), senderId: req.user.id, title,
    categoryId, categoryLabel: cat ? cat.label : rawCategoryLabel || categoryId,
    icon: cat ? cat.icon : '📦', description, photos: photos || [], weightKg: weightNum, valueEur: valueNum,
    from, to, dateFrom, dateTo, travelerPay: payNum, commissionRate: 0.18,
    status: evalRes.verdict === 'gray' ? 'pending_review' : 'published',
    whitelistVerdict: evalRes.verdict, recipientId: recipient?.id || null, createdAt: Date.now(),
  };
  db.listings.push(listing);
  if (evalRes.verdict === 'gray') {
    repositories.reviewQueue.append({ type: 'listing', refId: listing.id });
  }
  save();
  res.json({ listing });
});

// ---------- Transactions (machine à états) ----------
// accepted → sealed → in_transit → delivered → released | disputed
const CLOSED_STATUSES = ['released', 'refunded', 'cancelled'];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function trustCenterFor(user) {
  const txs = db.transactions.filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(user.id));
  const active = txs.filter((t) => !CLOSED_STATUSES.includes(t.status));
  const released = txs.filter((t) => t.status === 'released');
  const cancelled = txs.filter((t) => t.status === 'cancelled' || t.status === 'refunded');
  const disputes = db.disputes
    .filter((d) => {
      const tx = db.transactions.find((t) => t.id === d.txId);
      return tx && isPartyToTx(tx, user.id);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const openDisputes = disputes.filter((d) => d.status === 'open');
  const flaggedMessages = repositories.messages.flaggedFromUser(user.id);
  const kyc = kycUserView(user);

  let score = 35;
  if (user.emailVerified) score += 8;
  if (user.kycStatus === 'verified') score += 25;
  else if (user.kycStatus === 'pending') score += 10;
  score += Math.min(18, (user.completed || released.length) * 4);
  if (user.ratingCount > 0) score += clamp(((user.rating || 0) - 3) * 5, 0, 10);
  score -= Math.round((user.cancelRate || 0) * 35);
  score -= Math.min(18, disputes.length * 6);
  score -= Math.min(12, flaggedMessages.length * 4);
  score = clamp(Math.round(score), 0, 100);

  const level = score >= 85 ? 'excellent' : score >= 70 ? 'solid' : score >= 50 ? 'limited' : 'risk';
  const actions = [];
  if (user.kycStatus !== 'verified') {
    actions.push({
      id: 'verify-identity',
      status: user.kycStatus || 'none',
      priority: user.kycStatus === 'pending' ? 'medium' : 'high',
      href: '/verification',
    });
  }
  if ((user.ratingCount || 0) < 3) {
    actions.push({ id: 'build-reviews', status: 'todo', priority: 'medium', href: '/trajets' });
  }
  if (openDisputes.length > 0) {
    const d = openDisputes[0];
    actions.push({ id: 'answer-dispute', status: 'urgent', priority: 'high', href: `/transactions/${d.txId}#litige` });
  }
  if (flaggedMessages.length > 0) {
    actions.push({ id: 'keep-chat-in-app', status: 'warning', priority: 'medium', href: '/cgu' });
  }
  if (active.length >= user.maxActive) {
    actions.push({ id: 'active-limit', status: 'locked', priority: 'medium', href: '/transactions' });
  }

  return {
    user: publicUser(user),
    score,
    level,
    stats: {
      completed: user.completed || released.length,
      rating: user.rating,
      ratingCount: user.ratingCount || 0,
      cancelRate: user.cancelRate || 0,
      active: active.length,
      released: released.length,
      disputes: disputes.length,
      openDisputes: openDisputes.length,
      flaggedMessages: flaggedMessages.length,
      memberSince: user.createdAt,
    },
    limits: {
      maxValue: user.maxValue,
      maxActive: user.maxActive,
      active: active.length,
      nextValue: user.completed >= 3 ? user.maxValue : 500,
      nextActive: user.completed >= 3 ? user.maxActive : 3,
      completedForUpgrade: Math.min(user.completed || 0, 3),
      requiredForUpgrade: 3,
    },
    identity: {
      emailVerified: !!user.emailVerified,
      kycStatus: user.kycStatus || 'none',
      kyc,
    },
    actions,
    incidents: {
      disputes: disputes.slice(0, 4).map((d) => ({
        id: d.id,
        txId: d.txId,
        status: d.status,
        reason: d.reason,
        createdAt: d.createdAt,
        evidenceCount: d.evidence?.length || 0,
      })),
      flaggedMessages: flaggedMessages.slice(-4).reverse().map((m) => ({
        id: m.id,
        txId: m.txId,
        at: m.at,
      })),
    },
    protections: [
      { id: 'escrow', enabled: true },
      { id: 'kyc', enabled: user.kycStatus === 'verified' },
      { id: 'video', enabled: true },
      { id: 'dispute', enabled: true },
      { id: 'customs', enabled: true },
    ],
  };
}

app.get('/api/trust-center', auth, (req, res) => {
  res.json({ trust: trustCenterFor(req.user) });
});

app.get('/api/dashboard', auth, async (req, res) => {
  await runMatchingOfferReminders({ persist: true });
  const today = new Date().toISOString().slice(0, 10);
  const trips = db.trips
    .filter((t) => t.travelerId === req.user.id && t.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 4);
  const txs = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(req.user.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const activeRaw = txs.filter((t) => !CLOSED_STATUSES.includes(t.status));
  const activeTx = activeRaw.map(txView(req.user));
  const actions = activeTx.filter((t) => {
    if (t.status === 'accepted') return t.myRole === 'sender';
    if (t.status === 'sealed') return t.myRole === 'traveler';
    if (t.status === 'in_transit') return t.myRole === 'recipient';
    if (t.status === 'disputed') return true;
    return false;
  }).slice(0, 5);
  const openListings = db.listings
    .filter((l) => l.status === 'published' && l.senderId !== req.user.id);
  const matches = openListings
    .filter((l) => trips.some((tr) => matchesTrip(l, tr)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((l) => ({ ...l, sender: publicUser(findUser(l.senderId)), matched: true }))
    .slice(0, 5);
  const mine = db.listings.filter((l) => l.senderId === req.user.id);
  const myOffers = (db.matchingOffers || [])
    .map(normalizeMatchingOffer)
    .filter((o) => o.senderId === req.user.id || o.travelerId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt);
  const offerTurn = (o) =>
    (o.status === 'pending_traveler' && o.travelerId === req.user.id)
    || (o.status === 'countered_sender' && o.senderId === req.user.id);
  const activeOffers = myOffers.filter((o) => ['pending_traveler', 'countered_sender'].includes(o.status));
  const notifications = (await repositories.notifications.listForUser(req.user.id, { limit: 5 }))
    .map((n) => ({ ...n, text: renderNotification(req.lang, n) }));
  const unread = await repositories.notifications.unreadCount(req.user.id);
  res.json({
    user: publicUser(req.user),
    trust: {
      kycStatus: req.user.kycStatus || 'none',
      trainingDone: !!req.user.trainingDone,
      maxValue: req.user.maxValue,
      maxActive: req.user.maxActive,
      activeCount: activeRaw.length,
      completed: req.user.completed,
      rating: req.user.rating,
    },
    actions,
    activeTx: activeTx.slice(0, 5),
    trips,
    matches,
    shipments: {
      total: mine.length,
      published: mine.filter((l) => l.status === 'published').length,
      pendingReview: mine.filter((l) => l.status === 'pending_review').length,
      matched: mine.filter((l) => l.status === 'matched').length,
    },
    offers: {
      active: activeOffers.length,
      mineToAct: activeOffers.filter(offerTurn).length,
      sent: myOffers.filter((o) => o.senderId === req.user.id).length,
      received: myOffers.filter((o) => o.travelerId === req.user.id).length,
      latest: activeOffers.slice(0, 3).map((o) => ({
        id: o.id,
        status: o.status,
        offeredPay: o.offeredPay,
        expiresAt: o.expiresAt,
        myRole: o.senderId === req.user.id ? 'sender' : 'traveler',
        waitingForMe: offerTurn(o),
        listing: db.listings.find((l) => l.id === o.listingId),
        other: publicUser(findUser(o.senderId === req.user.id ? o.travelerId : o.senderId)),
      })),
    },
    notifications,
    unread,
  });
});

app.get('/api/transactions', auth, (req, res) => {
  const mine = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(req.user.id))
    .filter((t) => (req.query.history === '1' ? CLOSED_STATUSES.includes(t.status) : !CLOSED_STATUSES.includes(t.status)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map(txView(req.user));
  res.json({ transactions: mine });
});

function txView(user) {
  return (t) => {
    const v = {
      ...t,
      sender: publicUser(findUser(t.senderId)),
      traveler: publicUser(findUser(t.travelerId)),
      recipient: publicUser(findUser(t.recipientId)),
      listing: db.listings.find((l) => l.id === t.listingId),
    };
    // Codes de validation : chacun ne voit que le code qu'il doit PRÉSENTER (PRD §3.4/5.3)
    if (user) {
      v.myRole = t.senderId === user.id ? 'sender' : t.travelerId === user.id ? 'traveler' : 'recipient';
      v.showPickupCode = v.myRole === 'sender';
      v.showDeliveryCode = v.myRole === 'traveler';
      if (!v.showPickupCode && !user.isAdmin) delete v.pickupCode;
      if (!v.showDeliveryCode && !user.isAdmin) delete v.deliveryCode;
    }
    return v;
  };
}

app.get('/api/transactions/:id', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  res.json({ transaction: txView(req.user)(t) });
});

function assertTravelerCanAccept(user, listing) {
  if (!user) return { status: 404, body: { error: 'Voyageur introuvable' } };
  if (user.kycStatus !== 'verified')
    return { status: 403, body: { error: 'Vérification d\'identité requise', needsKyc: true } };
  if (!user.trainingDone && !user.isAdmin)
    return { status: 403, body: { error: 'Formation voyageur requise', needsTraining: true } };
  if (!listing || listing.status !== 'published')
    return { status: 400, body: { error: 'Annonce indisponible' } };
  if (listing.senderId === user.id)
    return { status: 400, body: { error: 'Vous ne pouvez pas transporter votre propre annonce' } };
  const active = db.transactions.filter(
    (t) => t.travelerId === user.id && !['released', 'refunded', 'cancelled'].includes(t.status)
  );
  if (active.length >= user.maxActive)
    return { status: 400, body: { error: `Plafond atteint : ${user.maxActive} transaction(s) active(s) max` } };
  return null;
}

async function acceptListingWithTraveler(listing, traveler, offer = null) {
  if (offer?.offeredPay) listing.travelerPay = offer.offeredPay;
  listing.status = 'matched';
  const commission = Math.round(listing.travelerPay * listing.commissionRate * 100) / 100;
  const total = listing.travelerPay + commission;
  const tx = {
    id: newId('tx'), listingId: listing.id, senderId: listing.senderId,
    travelerId: traveler.id, recipientId: listing.recipientId || listing.senderId,
    status: 'accepted',
    escrow: createEscrow({ travelerPay: listing.travelerPay, commission }),
    pickupCode: code6(), deliveryCode: code6(),
    sealingVideo: null, events: [], createdAt: Date.now(),
  };
  addEvent(tx, 'accepted', traveler.id, { escrowHeld: total, offerId: offer?.id || null });
  await notify([tx.senderId, tx.recipientId !== tx.senderId ? tx.recipientId : null], { key: 'tx.accepted', params: { name: traveler.name, title: listing.title } }, tx.id, 'transactions', 'suivi');
  db.transactions.push(tx);
  for (const o of db.matchingOffers || []) {
    normalizeMatchingOffer(o);
    if (o.listingId !== listing.id) continue;
    if (offer && o.id === offer.id) {
      o.status = 'accepted';
      o.respondedAt = Date.now();
      o.txId = tx.id;
    } else if (['pending', 'pending_traveler', 'countered_sender'].includes(o.status)) {
      o.status = 'closed';
      o.respondedAt = Date.now();
    }
  }
  return tx;
}

// Acceptation par le voyageur → escrow séquestré immédiatement (PRD §2.3)
app.post('/api/listings/:id/accept', auth, async (req, res) => {
  const listing = db.listings.find((l) => l.id === req.params.id);
  const blocked = assertTravelerCanAccept(req.user, listing);
  if (blocked) return res.status(blocked.status).json(blocked.body);
  const tx = await acceptListingWithTraveler(listing, req.user);
  save();
  res.json({ transaction: txView(req.user)(tx) });
});

app.post('/api/matching-offers/:id/accept', auth, async (req, res) => {
  const offer = normalizeMatchingOfferAndSave((db.matchingOffers || []).find((o) => o.id === req.params.id));
  if (!offer || ![offer.travelerId, offer.senderId].includes(req.user.id))
    return res.status(404).json({ error: 'Proposition introuvable' });
  if (!['pending_traveler', 'countered_sender'].includes(offer.status))
    return res.status(400).json({ error: 'Cette proposition n est plus active' });
  if (offer.status === 'pending_traveler' && offer.travelerId !== req.user.id)
    return res.status(403).json({ error: 'En attente de la réponse du voyageur' });
  if (offer.status === 'countered_sender' && offer.senderId !== req.user.id)
    return res.status(403).json({ error: 'En attente de la réponse de l expéditeur' });
  const listing = db.listings.find((l) => l.id === offer.listingId);
  const traveler = findUser(offer.travelerId);
  const blocked = assertTravelerCanAccept(traveler, listing);
  if (blocked) return res.status(blocked.status).json(blocked.body);
  offer.history.push({ by: req.user.id, type: 'accepted', pay: offer.offeredPay, message: '', at: Date.now() });
  const tx = await acceptListingWithTraveler(listing, traveler, offer);
  save();
  res.json({ offer, transaction: txView(req.user)(tx) });
});

app.post('/api/matching-offers/:id/decline', auth, async (req, res) => {
  const offer = normalizeMatchingOfferAndSave((db.matchingOffers || []).find((o) => o.id === req.params.id));
  if (!offer || ![offer.travelerId, offer.senderId].includes(req.user.id))
    return res.status(404).json({ error: 'Proposition introuvable' });
  if (!['pending_traveler', 'countered_sender'].includes(offer.status))
    return res.status(400).json({ error: 'Cette proposition n est plus active' });
  offer.status = 'declined';
  offer.respondedAt = Date.now();
  offer.history.push({ by: req.user.id, type: 'declined', pay: offer.offeredPay, message: '', at: Date.now() });
  await notify([req.user.id === offer.senderId ? offer.travelerId : offer.senderId], { key: 'offer.declined', params: { name: req.user.name } }, null, 'messages', 'matching');
  save();
  res.json({ offer });
});

app.post('/api/matching-offers/:id/withdraw', auth, async (req, res) => {
  const offer = normalizeMatchingOfferAndSave((db.matchingOffers || []).find((o) => o.id === req.params.id));
  if (!offer || offer.senderId !== req.user.id)
    return res.status(404).json({ error: 'Proposition introuvable' });
  if (!['pending_traveler', 'countered_sender'].includes(offer.status))
    return res.status(400).json({ error: 'Cette proposition n est plus active' });
  offer.status = 'withdrawn';
  offer.respondedAt = Date.now();
  offer.history.push({ by: req.user.id, type: 'withdrawn', pay: offer.offeredPay, message: '', at: Date.now() });
  await notify([offer.travelerId], { key: 'offer.withdrawn', params: { name: req.user.name } }, null, 'messages', 'matching');
  save();
  res.json({ offer });
});

app.post('/api/matching-offers/:id/counter', auth, async (req, res) => {
  const offer = normalizeMatchingOfferAndSave((db.matchingOffers || []).find((o) => o.id === req.params.id));
  if (!offer || ![offer.travelerId, offer.senderId].includes(req.user.id))
    return res.status(404).json({ error: 'Proposition introuvable' });
  if (!['pending_traveler', 'countered_sender'].includes(offer.status))
    return res.status(400).json({ error: 'Cette proposition n est plus active' });
  const pay = positiveNumber(req.body?.offeredPay);
  if (pay === null) return res.status(400).json({ error: 'Montant proposé invalide' });
  const message = String(req.body?.message || '').trim().slice(0, 500);
  offer.offeredPay = pay;
  offer.message = message;
  offer.status = req.user.id === offer.travelerId ? 'countered_sender' : 'pending_traveler';
  offer.expiresAt = Date.now() + 72 * 36e5;
  offer.history.push({ by: req.user.id, type: 'counter', pay, message, at: Date.now() });
  await notify([req.user.id === offer.senderId ? offer.travelerId : offer.senderId], { key: 'offer.countered', params: { name: req.user.name } }, null, 'messages', 'matching');
  save();
  res.json({ offer });
});

// Vidéo de scellage (PRD §3.2) — caméra in-app uniquement, horodatée
app.post('/api/transactions/:id/sealing-video', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'accepted') return res.status(400).json({ error: 'Étape invalide' });
  if (t.senderId !== req.user.id) return res.status(403).json({ error: "Seul l'expéditeur filme le scellage" });
  t.sealingVideo = {
    dataUrl: req.body.dataUrl || null, simulated: !!req.body.simulated,
    recordedAt: Date.now(), geo: req.body.geo || null, txCode: t.id,
  };
  t.status = 'sealed';
  addEvent(t, 'sealed', req.user.id, { simulated: !!req.body.simulated });
  await notify([t.travelerId], { key: 'tx.sealed', params: { title: db.listings.find((l) => l.id === t.listingId)?.title } }, t.id, 'shipments', 'actions');
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Double validation remise : le voyageur saisit le code présenté par l'expéditeur (PRD §3.4)
app.post('/api/transactions/:id/confirm-pickup', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'sealed') return res.status(400).json({ error: 'Étape invalide' });
  if (t.travelerId !== req.user.id) return res.status(403).json({ error: 'Seul le voyageur valide la prise en charge' });
  if ((req.body.code || '').toUpperCase() !== t.pickupCode)
    return res.status(400).json({ error: 'Code invalide — scannez le QR de l\'expéditeur' });
  t.status = 'in_transit';
  addEvent(t, 'in_transit', req.user.id, { responsibility: 'traveler' });
  await notify([t.senderId, t.recipientId !== t.senderId ? t.recipientId : null], { key: 'tx.pickedUp' }, t.id, 'shipments', 'suivi');
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Refus sans pénalité avant prise en charge (PRD §3.3)
app.post('/api/transactions/:id/refuse', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || !['accepted', 'sealed'].includes(t.status)) return res.status(400).json({ error: 'Étape invalide' });
  if (t.travelerId !== req.user.id) return res.status(403).json({ error: 'Réservé au voyageur' });
  t.status = 'cancelled';
  transitionEscrow(t.escrow, 'refunded');
  const listing = db.listings.find((l) => l.id === t.listingId);
  if (listing) listing.status = 'published';
  addEvent(t, 'refused_no_penalty', req.user.id, { reason: req.body.reason || '' });
  await notify([t.senderId], { key: 'tx.refused' }, t.id, 'shipments', 'suivi');
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Double validation livraison : le destinataire saisit le code du voyageur → escrow libéré (PRD §5.3/5.4)
app.post('/api/transactions/:id/confirm-delivery', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'in_transit') return res.status(400).json({ error: 'Étape invalide' });
  if (t.recipientId !== req.user.id) return res.status(403).json({ error: 'Seul le destinataire valide la livraison' });
  if ((req.body.code || '').toUpperCase() !== t.deliveryCode)
    return res.status(400).json({ error: 'Code invalide — scannez le QR du voyageur' });
  t.status = 'released';
  transitionEscrow(t.escrow, 'released');
  const traveler = findUser(t.travelerId);
  traveler.completed += 1;
  if (traveler.completed >= 5 && !traveler.badges.includes('voyageur-confirme'))
    traveler.badges.push('voyageur-confirme');
  // Plafonds relevés avec l'historique (PRD §0.3)
  if (traveler.completed >= 3) { traveler.maxValue = 500; traveler.maxActive = 3; }
  const sender = findUser(t.senderId);
  if (sender.completed !== undefined) sender.completed += 1;
  if (sender.completed >= 3) { sender.maxValue = 500; sender.maxActive = 3; }
  addEvent(t, 'delivered_and_released', req.user.id, { released: t.escrow.travelerPay });
  await notify([t.travelerId], { key: 'tx.delivered.traveler', params: { amount: t.escrow.travelerPay } }, t.id, 'shipments', 'suivi');
  await notify([t.senderId], { key: 'tx.delivered.sender' }, t.id, 'shipments', 'suivi');
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Notation mutuelle (PRD §5.5)
app.post('/api/transactions/:id/rate', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'released') return res.status(400).json({ error: 'Notation après livraison uniquement' });
  const { targetId, stars } = req.body;
  const target = findUser(targetId);
  if (!target || ![t.senderId, t.travelerId, t.recipientId].includes(targetId))
    return res.status(400).json({ error: 'Cible invalide' });
  const n = Number(stars);
  if (!Number.isInteger(n) || n < 1 || n > 5) return res.status(400).json({ error: 'Note invalide (1 à 5)' });
  t.ratings = t.ratings || [];
  if (t.ratings.some((r) => r.by === req.user.id && r.target === targetId))
    return res.status(400).json({ error: 'Déjà noté' });
  const comment = String(req.body.comment || '').trim().slice(0, 400);
  // Un avis est visible de tout utilisateur connecté (bien plus exposé qu'un message de
  // chat privé) — contrairement au chat, qui avertit mais laisse passer, on rejette ici
  // plutôt que d'exposer publiquement une coordonnée de contact (PRD §4.5).
  if (comment && detectLeak(comment))
    return res.status(400).json({ error: "L'avis ne peut pas contenir de coordonnées de contact (téléphone, email, WhatsApp…)" });
  t.ratings.push({ by: req.user.id, target: targetId, stars: n, comment: comment || null, at: Date.now() });
  const prev = (target.rating || 0) * target.ratingCount;
  target.ratingCount += 1;
  target.rating = Math.round(((prev + n) / target.ratingCount) * 10) / 10;
  addEvent(t, 'rated', req.user.id, { target: targetId, stars: n });
  save();
  res.json({ ok: true });
});

// Avis reçus par un utilisateur — agrège les notations de toutes ses transactions livrées.
// Public au sens "connecté" (pas de données sensibles : prénom initiale, note, commentaire).
app.get('/api/users/:id/reviews', auth, (req, res) => {
  const target = findUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'Introuvable' });
  const reviews = [];
  for (const t of db.transactions) {
    for (const r of t.ratings || []) {
      if (r.target !== req.params.id) continue;
      const author = findUser(r.by);
      reviews.push({ stars: r.stars, comment: r.comment || null, at: r.at, authorName: author?.name || 'Membre Wigofly' });
    }
  }
  reviews.sort((a, b) => b.at - a.at);
  res.json({ reviews, rating: target.rating, ratingCount: target.ratingCount });
});

// ---------- Litiges (PRD §3 Phase 6, §4.6) ----------
const EVIDENCE_WINDOW_MS = 72 * 3600e3; // 72h pour soumettre des preuves (PRD §3 Phase 6)
const RESOLUTION_TARGET_MS = 7 * 864e5; // cible 7 jours (PRD §4.6)

function disputeView(d, t) {
  return {
    ...d,
    evidenceDeadline: d.createdAt + EVIDENCE_WINDOW_MS,
    resolutionTarget: d.createdAt + RESOLUTION_TARGET_MS,
  };
}

function financeActionFor(user, tx, dispute) {
  if (dispute?.status === 'open') {
    const mine = dispute.evidence.filter((e) => e.by === user.id).length;
    return {
      id: mine ? 'follow_dispute' : 'add_evidence',
      priority: mine ? 'medium' : 'high',
      href: `/transactions/${tx.id}#litige`,
    };
  }
  if (tx.status === 'accepted' && tx.senderId === user.id) {
    return { id: 'seal_to_unlock', priority: 'high', href: `/transactions/${tx.id}#actions` };
  }
  if (tx.status === 'sealed' && [tx.senderId, tx.travelerId].includes(user.id)) {
    return { id: 'handoff_to_move', priority: 'medium', href: `/transactions/${tx.id}#messages` };
  }
  if (tx.status === 'in_transit') {
    return { id: 'wait_delivery', priority: 'medium', href: `/transactions/${tx.id}#suivi` };
  }
  if (tx.status === 'released' && tx.travelerId === user.id) {
    return { id: 'payout_done', priority: 'low', href: `/transactions/${tx.id}` };
  }
  if (tx.status === 'refunded' && tx.senderId === user.id) {
    return { id: 'refund_done', priority: 'low', href: `/transactions/${tx.id}` };
  }
  return { id: 'monitor', priority: 'low', href: `/transactions/${tx.id}` };
}

function financeCenterFor(user) {
  const txs = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(user.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const rows = txs.map((tx) => {
    const dispute = db.disputes.find((d) => d.txId === tx.id) || null;
    const listing = db.listings.find((l) => l.id === tx.listingId) || null;
    const role = tx.senderId === user.id ? 'sender' : tx.travelerId === user.id ? 'traveler' : 'recipient';
    return {
      transaction: txView(user)(tx),
      listing,
      dispute: dispute ? disputeView(dispute, tx) : null,
      role,
      action: financeActionFor(user, tx, dispute),
    };
  });
  const totals = {
    held: txs.filter((t) => t.escrow?.state === 'held').reduce((s, t) => s + t.escrow.amount, 0),
    frozen: txs.filter((t) => t.escrow?.state === 'frozen').reduce((s, t) => s + t.escrow.amount, 0),
    releasedToMe: txs
      .filter((t) => t.travelerId === user.id && t.escrow?.state === 'released')
      .reduce((s, t) => s + t.escrow.travelerPay, 0),
    paidByMe: txs
      .filter((t) => t.senderId === user.id && ['held', 'frozen', 'released'].includes(t.escrow?.state))
      .reduce((s, t) => s + t.escrow.amount, 0),
    refundedToMe: txs
      .filter((t) => t.senderId === user.id && t.escrow?.state === 'refunded')
      .reduce((s, t) => s + t.escrow.amount, 0),
    commission: txs
      .filter((t) => ['held', 'frozen', 'released'].includes(t.escrow?.state))
      .reduce((s, t) => s + (t.escrow.commission || 0), 0),
  };
  const openDisputes = rows.filter((r) => r.dispute?.status === 'open');
  const actions = rows
    .filter((r) => ['high', 'medium'].includes(r.action.priority))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.action.priority] - rank[b.action.priority] || b.transaction.createdAt - a.transaction.createdAt;
    })
    .slice(0, 6)
    .map((r) => ({
      id: `${r.transaction.id}:${r.action.id}`,
      txId: r.transaction.id,
      title: r.listing?.title || r.transaction.id,
      status: r.transaction.status,
      action: r.action,
    }));
  return {
    totals: Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, Math.round(v * 100) / 100])),
    counts: {
      transactions: txs.length,
      active: txs.filter((t) => !CLOSED_STATUSES.includes(t.status)).length,
      openDisputes: openDisputes.length,
      completed: txs.filter((t) => t.status === 'released').length,
    },
    actions,
    rows,
  };
}

app.get('/api/finance-center', auth, (req, res) => {
  res.json({ finance: financeCenterFor(req.user) });
});

function supportActionFor(user, tx, dispute) {
  const role = tx.senderId === user.id ? 'sender' : tx.travelerId === user.id ? 'traveler' : 'recipient';
  if (dispute?.status === 'open') {
    const mine = (dispute.evidence || []).some((e) => e.by === user.id);
    return {
      id: mine ? 'follow_dispute' : 'add_evidence',
      priority: mine ? 'medium' : 'high',
      href: `/transactions/${tx.id}#litige`,
    };
  }
  if (tx.status === 'in_transit' || tx.status === 'released') {
    return { id: 'open_dispute', priority: 'medium', href: `/transactions/${tx.id}#actions` };
  }
  if (tx.status === 'accepted' && role === 'sender') {
    return { id: 'seal_first', priority: 'high', href: `/transactions/${tx.id}#actions` };
  }
  if (tx.status === 'sealed') {
    return { id: 'organize_handoff', priority: 'medium', href: `/transactions/${tx.id}#messages` };
  }
  return { id: 'read_rules', priority: 'low', href: '/cgu#litiges' };
}

function supportCenterFor(user) {
  const txs = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(user.id))
    .sort((a, b) => b.createdAt - a.createdAt);
  const cases = txs.map((tx) => {
    const dispute = db.disputes.find((d) => d.txId === tx.id) || null;
    const listing = db.listings.find((l) => l.id === tx.listingId) || null;
    const role = tx.senderId === user.id ? 'sender' : tx.travelerId === user.id ? 'traveler' : 'recipient';
    const canOpenDispute = !dispute && ['in_transit', 'released'].includes(tx.status);
    return {
      txId: tx.id,
      role,
      status: tx.status,
      listing: listing ? {
        id: listing.id,
        title: listing.title,
        from: listing.from,
        to: listing.to,
        categoryId: listing.categoryId,
      } : null,
      dispute: dispute ? disputeView(dispute, tx) : null,
      canOpenDispute,
      action: supportActionFor(user, tx, dispute),
    };
  });
  const openDisputes = cases.filter((c) => c.dispute?.status === 'open');
  const urgent = cases
    .filter((c) => ['high', 'medium'].includes(c.action.priority))
    .sort((a, b) => {
      const rank = { high: 0, medium: 1, low: 2 };
      return rank[a.action.priority] - rank[b.action.priority];
    })
    .slice(0, 6)
    .map((c) => ({
      id: `${c.txId}:${c.action.id}`,
      txId: c.txId,
      title: c.listing?.title || c.txId,
      status: c.status,
      action: c.action,
    }));
  return {
    totals: {
      cases: cases.length,
      openDisputes: openDisputes.length,
      canOpenDispute: cases.filter((c) => c.canOpenDispute).length,
      urgent: urgent.filter((a) => a.action.priority === 'high').length,
    },
    urgent,
    cases,
    guide: [
      { id: 'stay_in_app', href: '/cgu#interdits' },
      { id: 'inspect_before_pickup', href: '/cgu#transaction' },
      { id: 'customs_truth', href: '/cgu#douane' },
      { id: 'evidence_72h', href: '/cgu#litiges' },
    ],
  };
}

app.get('/api/support-center', auth, (req, res) => {
  res.json({ support: supportCenterFor(req.user) });
});

app.post('/api/transactions/:id/dispute', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || !['in_transit', 'released'].includes(t.status))
    return res.status(400).json({ error: 'Litige impossible à ce stade' });
  if (!isPartyToTx(t, req.user.id))
    return res.status(403).json({ error: 'Réservé aux parties de la transaction' });
  if (!req.body.reason || String(req.body.reason).trim().length < 10)
    return res.status(400).json({ error: 'Merci de détailler le motif (10 caractères minimum)' });
  t.status = 'disputed';
  transitionEscrow(t.escrow, 'frozen');
  const dispute = {
    id: newId('d'), txId: t.id, openedBy: req.user.id, reason: String(req.body.reason).trim().slice(0, 2000),
    evidence: [], status: 'open', createdAt: Date.now(),
  };
  db.disputes.push(dispute);
  repositories.reviewQueue.append({ type: 'dispute', refId: dispute.id });
  addEvent(t, 'dispute_opened', req.user.id, { reason: dispute.reason });
  await notify([t.senderId, t.travelerId].filter((id) => id !== req.user.id), { key: 'dispute.opened' }, t.id, 'security', 'litige');
  save();
  res.json({ dispute: disputeView(dispute, t) });
});

// Consultation d'un litige par les parties de la transaction concernée (ou l'admin).
app.get('/api/transactions/:id/dispute', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  const d = db.disputes.find((x) => x.txId === t.id);
  if (!d) return res.status(404).json({ error: 'Aucun litige pour cette transaction' });
  res.json({ dispute: disputeView(d, t) });
});

app.post('/api/disputes/:id/evidence', auth, (req, res) => {
  const d = db.disputes.find((x) => x.id === req.params.id);
  if (!d || d.status !== 'open') return res.status(400).json({ error: 'Litige clos ou introuvable' });
  const t = db.transactions.find((x) => x.id === d.txId);
  if (!t || (!isPartyToTx(t, req.user.id) && !req.user.isAdmin))
    return res.status(403).json({ error: 'Réservé aux parties du litige' });
  const text = String(req.body.text || '').trim().slice(0, 2000);
  const { photo } = req.body;
  if (!text && !photo) return res.status(400).json({ error: 'Ajoutez un commentaire ou une photo' });
  if (photo) {
    if (!validPhotos([photo])) return res.status(400).json({ error: 'Photo invalide (JPEG/PNG/WebP, 500 Ko max)' });
  }
  d.evidence.push({ by: req.user.id, text: text || null, photo: photo || null, at: Date.now() });
  save();
  res.json({ dispute: disputeView(d, t) });
});

// ---------- Messagerie (PRD §4.5) ----------
app.get('/api/transactions/:id/messages', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  res.json({ messages: repositories.messages.listForTransaction(req.params.id) });
});

app.post('/api/transactions/:id/messages', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });
  const text = String(req.body.text || '').slice(0, 2000);
  const flagged = detectLeak(text);
  const msg = repositories.messages.append({ txId: t.id, from: req.user.id, text, flagged });
  await notify([t.senderId, t.travelerId, t.recipientId].filter((id) => id !== req.user.id), { key: 'chat.message', params: { name: req.user.name } }, t.id, 'messages', 'messages');
  save();
  res.json({ message: msg, warning: flagged ? "⚠️ Le partage de coordonnées est contraire aux CGU. L'escrow et l'assistance ne couvrent que les échanges dans l'app." : null });
});

// ---------- Récapitulatif douane (PRD §4.1 Phase 4) ----------
app.get('/api/transactions/:id/customs-recap', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  const listing = db.listings.find((l) => l.id === t.listingId);
  const corridor = listing.from === 'Casablanca' ? CUSTOMS['MA-EU'] : CUSTOMS['EU-MA'];
  res.json({
    recap: {
      txId: t.id, product: listing.title, category: listing.categoryLabel,
      description: listing.description, valueEur: listing.valueEur, weightKg: listing.weightKg,
      sender: publicUser(findUser(t.senderId)), traveler: publicUser(findUser(t.travelerId)),
      sealedAt: t.sealingVideo?.recordedAt || null, corridor,
    },
  });
});

// ---------- Back-office (PRD §4.7) ----------
function adminOnly(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: 'Réservé aux admins' });
  next();
}

const KYC_SLA_MS = 24 * 3600e3;
const OFFER_WATCH_MS = 24 * 3600e3;

function adminRiskSignals() {
  const humans = db.users.filter((u) => !u.isAdmin);
  const groupsFor = (key) => {
    const groups = {};
    for (const u of humans) {
      const v = u[key];
      if (!v) continue;
      (groups[v] = groups[v] || []).push(u);
    }
    return Object.values(groups).filter((g) => g.length > 1);
  };

  const pairMap = {};
  for (const t of db.transactions) {
    const ids = [t.senderId, t.travelerId].sort().join('|');
    pairMap[ids] = pairMap[ids] || { transactionCount: 0, disputedCount: 0 };
    pairMap[ids].transactionCount += 1;
    if (t.status === 'disputed' || db.disputes.some((d) => d.txId === t.id)) pairMap[ids].disputedCount += 1;
  }

  const disputeCountByUser = {};
  for (const d of db.disputes) {
    const t = db.transactions.find((x) => x.id === d.txId);
    if (!t) continue;
    for (const uid of [t.senderId, t.travelerId, t.recipientId]) disputeCountByUser[uid] = (disputeCountByUser[uid] || 0) + 1;
  }

  const kycRejectionsByUser = repositories.kyc.rejectionCountsByUser();

  return {
    linkedAccounts: groupsFor('phone').length + groupsFor('registerIp').length,
    repeatPairs: Object.values(pairMap).filter((p) => p.transactionCount >= 3).length,
    flaggedMessaging: repositories.messages.flaggedSenderCount(),
    abnormalCancel: humans.filter((u) => u.completed >= 3 && u.cancelRate > 0.2).length,
    disputeProne: Object.values(disputeCountByUser).filter((count) => count >= 2).length,
    kycRepeatRejections: Object.values(kycRejectionsByUser).filter((count) => count >= 2).length,
  };
}

async function adminOpsSummary() {
  await runMatchingOfferReminders({ persist: true });
  const now = Date.now();
  const reviewOpen = repositories.reviewQueue.open();
  const reviewDisputes = reviewOpen.filter((r) => r.type === 'dispute');
  const reviewListings = reviewOpen.filter((r) => r.type === 'listing');
  const pendingKyc = repositories.kyc.pending();
  const overdueKyc = pendingKyc.filter((s) => (Date.now() - s.submittedAt) > KYC_SLA_MS);
  const openDisputes = db.disputes.filter((d) => d.status === 'open');
  const flaggedMessages = repositories.messages.flagged();
  const escrowHeld = db.transactions
    .filter((t) => t.escrow?.state === 'held' || t.escrow?.state === 'frozen')
    .reduce((s, t) => s + t.escrow.amount, 0);
  const risk = adminRiskSignals();
  const riskCount = Object.values(risk).reduce((s, n) => s + n, 0);
  const activeOfferStatuses = ['pending_traveler', 'countered_sender'];
  const offerQueue = (db.matchingOffers || [])
    .map(normalizeMatchingOffer)
    .filter((o) => activeOfferStatuses.includes(o.status) || o.status === 'expired')
    .map((o) => {
      const listing = db.listings.find((l) => l.id === o.listingId);
      const expiresIn = (o.expiresAt || 0) - now;
      const severity = o.status === 'expired' || expiresIn <= 0 ? 'critical'
        : expiresIn <= OFFER_WATCH_MS ? 'warning'
          : 'ok';
      return {
        id: o.id,
        status: o.status,
        severity,
        waitingFor: o.status === 'pending_traveler' ? 'traveler' : o.status === 'countered_sender' ? 'sender' : 'none',
        offeredPay: o.offeredPay,
        expiresAt: o.expiresAt,
        expiresIn,
        listing: listing ? {
          id: listing.id,
          title: listing.title,
          from: listing.from,
          to: listing.to,
          valueEur: listing.valueEur,
        } : null,
        sender: publicUser(findUser(o.senderId)),
        traveler: publicUser(findUser(o.travelerId)),
      };
    })
    .sort((a, b) => {
      const rank = { critical: 0, warning: 1, ok: 2 };
      return rank[a.severity] - rank[b.severity] || a.expiresAt - b.expiresAt;
    });
  const offersAtRisk = offerQueue.filter((o) => o.severity !== 'ok').length;

  const tasks = [
    {
      id: 'review-disputes',
      severity: reviewDisputes.length ? 'critical' : 'ok',
      count: reviewDisputes.length,
      tab: 'review',
      title: 'Litiges à arbitrer',
      body: 'Escrow gelé, preuves à lire et décision admin à prendre.',
    },
    {
      id: 'kyc-overdue',
      severity: overdueKyc.length ? 'critical' : pendingKyc.length ? 'warning' : 'ok',
      count: overdueKyc.length || pendingKyc.length,
      tab: 'kyc',
      title: 'Identités à traiter',
      body: overdueKyc.length ? 'Demandes KYC au-delà du SLA 24 h.' : 'Demandes KYC en attente de revue.',
    },
    {
      id: 'gray-listings',
      severity: reviewListings.length ? 'warning' : 'ok',
      count: reviewListings.length,
      tab: 'review',
      title: 'Annonces en zone grise',
      body: 'Catégories à accepter, refuser ou promouvoir en liste blanche.',
    },
    {
      id: 'fraud-signals',
      severity: riskCount ? 'warning' : 'ok',
      count: riskCount,
      tab: 'fraud',
      title: 'Signaux de risque',
      body: 'Comptes liés, messages hors app, litiges répétés ou comportements atypiques.',
    },
    {
      id: 'offer-watch',
      severity: offersAtRisk ? 'warning' : 'ok',
      count: offersAtRisk || offerQueue.length,
      tab: 'ops',
      title: 'Offres a surveiller',
      body: offersAtRisk ? 'Propositions expirees ou proches de l expiration.' : 'Flux de negociation sous controle.',
    },
  ];

  return {
    generatedAt: Date.now(),
    health: {
      status: reviewDisputes.length || overdueKyc.length ? 'critical' : reviewOpen.length || riskCount || offersAtRisk ? 'watch' : 'clear',
      reviewOpen: reviewOpen.length,
      kycPending: pendingKyc.length,
      kycOverdue: overdueKyc.length,
      openDisputes: openDisputes.length,
      flaggedMessages: flaggedMessages.length,
      escrowHeld,
      riskSignals: riskCount,
      offersActive: offerQueue.filter((o) => activeOfferStatuses.includes(o.status)).length,
      offersAtRisk,
    },
    tasks,
    risk,
    latest: {
      reviewQueue: reviewOpen
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 5)
        .map((r) => ({
          id: r.id,
          type: r.type,
          createdAt: r.createdAt,
          refId: r.refId,
          label: r.type === 'listing'
            ? db.listings.find((l) => l.id === r.refId)?.title
            : db.disputes.find((d) => d.id === r.refId)?.reason,
        })),
      kyc: pendingKyc
        .sort((a, b) => a.submittedAt - b.submittedAt)
        .slice(0, 5)
        .map((s) => {
          const u = findUser(s.userId);
          return {
            id: s.id,
            legalName: s.legalName,
            submittedAt: s.submittedAt,
            overdue: (Date.now() - s.submittedAt) > KYC_SLA_MS,
            user: u ? { name: u.name, email: u.email } : null,
          };
        }),
      offers: offerQueue.slice(0, 6),
    },
  };
}

app.get('/api/admin/ops', auth, adminOnly, async (req, res) => {
  res.json({ ops: await adminOpsSummary() });
});

app.get('/api/admin/overview', auth, adminOnly, (req, res) => {
  res.json({
    reviewQueue: repositories.reviewQueue.open().map((r) => ({
      ...r,
      listing: r.type === 'listing' ? db.listings.find((l) => l.id === r.refId) : null,
      dispute: r.type === 'dispute'
        ? (() => { const d = db.disputes.find((x) => x.id === r.refId); return d ? disputeView(d) : null; })()
        : null,
    })),
    stats: {
      users: db.users.length,
      listings: db.listings.length,
      transactions: db.transactions.length,
      released: db.transactions.filter((t) => t.status === 'released').length,
      disputed: db.transactions.filter((t) => t.status === 'disputed').length,
      flaggedMessages: repositories.messages.flagged().length,
      escrowHeld: db.transactions.filter((t) => t.escrow?.state === 'held' || t.escrow?.state === 'frozen')
        .reduce((s, t) => s + t.escrow.amount, 0),
    },
    disputes: db.disputes,
    customWhitelist: repositories.customWhitelist.all(),
  });
});

// Retire une catégorie promue (repasse en zone grise pour les prochains envois).
app.delete('/api/admin/whitelist/:id', auth, adminOnly, async (req, res) => {
  const removed = repositories.customWhitelist.remove(req.params.id);
  if (!removed) return res.status(404).json({ error: 'Catégorie introuvable' });
  await audit(req.user.id, 'custom_whitelist.remove', 'custom_whitelist', removed.id, { label: removed.label });
  save();
  res.json({ ok: true });
});

app.get('/api/admin/audit-logs', auth, adminOnly, async (req, res) => {
  res.json({ logs: await repositories.auditLogs.list({ limit: req.query.limit }) });
});

// ---------- Back-office KYC (PRD KYC §5) ----------
// Résumé d'une soumission pour la vue liste (sans les photos — allège la charge).
function kycSummary(s) {
  const u = findUser(s.userId);
  const priorRejects = repositories.kyc.rejectedCountForUser(s.userId, { before: s.submittedAt });
  return {
    id: s.id, userId: s.userId, submittedAt: s.submittedAt, status: s.status,
    legalName: s.legalName, documentType: s.documentType, age: s.age,
    reviewedBy: s.reviewedBy, reviewedAt: s.reviewedAt, decisionReason: s.decisionReason,
    user: u ? { name: u.name, email: u.email, createdAt: u.createdAt, kycStatus: u.kycStatus } : null,
    priorRejects,
    overdue: s.status === 'pending' && (Date.now() - s.submittedAt) > KYC_SLA_MS,
  };
}

// File KYC. ?status=pending|verified|rejected|refused|all (défaut: pending), ?q= recherche nom/email.
app.get('/api/admin/kyc', auth, adminOnly, (req, res) => {
  const filter = req.query.status || 'pending';
  const q = String(req.query.q || '').toLowerCase().trim();
  const list = repositories.kyc.list({ filter, q });
  const pending = repositories.kyc.pending();
  const reviewed = repositories.kyc.reviewed();
  const avgReviewMs = reviewed.length
    ? reviewed.reduce((sum, s) => sum + (s.reviewedAt - s.submittedAt), 0) / reviewed.length
    : null;

  res.json({
    submissions: list.map(kycSummary),
    stats: {
      pending: pending.length,
      overdue: pending.filter((s) => (Date.now() - s.submittedAt) > KYC_SLA_MS).length,
      verified: db.users.filter((u) => u.kycStatus === 'verified').length,
      avgReviewHours: avgReviewMs !== null ? Math.round(avgReviewMs / 3600e3 * 10) / 10 : null,
    },
  });
});

// Détail complet d'une soumission (avec photos) — réservé admin.
app.get('/api/admin/kyc/:id', auth, adminOnly, (req, res) => {
  const s = repositories.kyc.findSubmission(req.params.id);
  if (!s) return res.status(404).json({ error: 'Demande introuvable' });
  const u = findUser(s.userId);
  const history = repositories.kyc.historyForUser(s.userId)
    .map((d) => ({ ...d, adminName: findUser(d.adminId)?.name || d.adminId }));
  res.json({
    submission: {
      ...s,
      user: u ? {
        name: u.name, email: u.email, createdAt: u.createdAt, kycStatus: u.kycStatus,
        phone: u.phone, city: u.city,
      } : null,
      priorRejects: repositories.kyc.rejectedCountForUser(s.userId, { before: s.submittedAt }),
    },
    history,
  });
});

// Décision admin : approve | reject | refuse (motif obligatoire pour reject/refuse).
app.post('/api/admin/kyc/:id/decide', auth, adminOnly, async (req, res) => {
  const s = repositories.kyc.findSubmission(req.params.id);
  if (!s) return res.status(404).json({ error: 'Demande introuvable' });
  if (s.status !== 'pending') return res.status(400).json({ error: 'Cette demande a déjà été traitée' });

  const { decision, reason } = req.body; // approve | reject | refuse
  if (!['approve', 'reject', 'refuse'].includes(decision))
    return res.status(400).json({ error: 'Décision invalide' });
  if (['reject', 'refuse'].includes(decision) && (!reason || String(reason).trim().length < 5))
    return res.status(400).json({ error: 'Motif obligatoire (5 caractères minimum)' });

  const user = findUser(s.userId);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const cleanReason = reason ? String(reason).trim().slice(0, 500) : null;
  s.reviewedBy = req.user.id;
  s.reviewedAt = Date.now();
  s.decisionReason = cleanReason;

  if (decision === 'approve') {
    s.status = 'approved';
    user.kycStatus = 'verified';
    await notify([user.id], { key: 'kyc.verified' }, null, 'security');
  } else if (decision === 'reject') {
    s.status = 'rejected';
    const rejectedCount = repositories.kyc.rejectedCountForUser(user.id);
    // Passage automatique en refus définitif au-delà de la limite (PRD §7).
    if (rejectedCount >= MAX_KYC_ATTEMPTS) {
      user.kycStatus = 'refused';
      await notify([user.id], { key: 'kyc.refusedFinal' }, null, 'security');
    } else {
      user.kycStatus = 'rejected';
      await notify([user.id], { key: 'kyc.rejected', params: { reason: cleanReason } }, null, 'security');
    }
  } else { // refuse
    s.status = 'refused';
    user.kycStatus = 'refused';
    await notify([user.id], { key: 'kyc.refused', params: { reason: cleanReason } }, null, 'security');
  }

  repositories.kyc.appendDecision({
    submissionId: s.id, userId: user.id, adminId: req.user.id,
    decision, reason: cleanReason,
  });
  await audit(req.user.id, `kyc.${decision}`, 'kyc_submission', s.id, {
    userId: user.id,
    status: user.kycStatus,
    reason: cleanReason,
  });
  save();
  res.json({ ok: true, status: user.kycStatus });
});

// KPIs de suivi (PRD §8, plan de projet §7) — instrumentés dès la V1, pas après coup.
app.get('/api/admin/kpis', auth, adminOnly, (req, res) => {
  const now = Date.now();
  const DAY = 864e5;
  const released = db.transactions.filter((t) => t.status === 'released');

  // Transactions complétées / mois — moyenne sur l'historique disponible (mois entiers écoulés depuis la 1ère transaction).
  const firstTxAt = db.transactions.length ? Math.min(...db.transactions.map((t) => t.createdAt)) : now;
  const monthsElapsed = Math.max(1, (now - firstTxAt) / (30 * DAY));
  const perMonth = released.length / monthsElapsed;

  // Répartition mensuelle des 6 derniers mois pour affichage en mini-graphe.
  const monthly = [];
  for (let i = 5; i >= 0; i--) {
    const start = new Date(now - i * 30 * DAY);
    const label = start.toLocaleDateString('fr-BE', { month: 'short' });
    const from = now - (i + 1) * 30 * DAY, to = now - i * 30 * DAY;
    monthly.push({ label, count: released.filter((t) => t.escrow?.releasedAt >= from && t.escrow?.releasedAt < to).length });
  }

  // Taux de litige : parmi les transactions arrivées au moins en transit (litige possible), combien ont été contestées.
  const disputable = db.transactions.filter((t) => ['in_transit', 'released', 'disputed', 'refunded'].includes(t.status));
  const disputeRate = disputable.length ? db.disputes.length / disputable.length : 0;

  // Résolution < 7 jours parmi les litiges déjà résolus.
  const resolved = db.disputes.filter((d) => d.status === 'resolved' && d.resolvedAt);
  const resolvedFast = resolved.filter((d) => d.resolvedAt - d.createdAt <= 7 * DAY);
  const resolutionRate = resolved.length ? resolvedFast.length / resolved.length : null;

  // Voyageurs récurrents : parmi les voyageurs ayant au moins 1 transaction, combien en ont 2+.
  const byTraveler = {};
  for (const t of db.transactions) byTraveler[t.travelerId] = (byTraveler[t.travelerId] || 0) + 1;
  const travelerIds = Object.keys(byTraveler);
  const recurring = travelerIds.filter((id) => byTraveler[id] >= 2).length;
  const recurringRate = travelerIds.length ? recurring / travelerIds.length : 0;

  // Désintermédiation estimée : messages signalés / total messages échangés.
  const messageCount = repositories.messages.count();
  const desintermediationRate = messageCount ? repositories.messages.flagged().length / messageCount : 0;

  // Délai moyen de matching : annonce publiée → acceptée.
  const matchDelays = db.transactions.map((t) => {
    const listing = db.listings.find((l) => l.id === t.listingId);
    return listing ? t.createdAt - listing.createdAt : null;
  }).filter((d) => d !== null && d >= 0);
  const avgMatchHours = matchDelays.length ? (matchDelays.reduce((s, d) => s + d, 0) / matchDelays.length) / 3600e3 : null;

  res.json({
    kpis: {
      transactionsPerMonth: { value: Math.round(perMonth * 10) / 10, target: 150, direction: 'above', monthly },
      disputeRate: { value: disputeRate, target: 0.05, direction: 'below' },
      resolutionRate: { value: resolutionRate, target: 0.9, direction: 'above', sampleSize: resolved.length },
      recurringTravelers: { value: recurringRate, target: 0.4, direction: 'above', sampleSize: travelerIds.length },
      desintermediationRate: { value: desintermediationRate, target: 0.15, direction: 'below', sampleSize: messageCount },
      avgMatchHours: { value: avgMatchHours, target: 72, direction: 'below' },
      nps: { value: null, target: 50, direction: 'above', note: 'Nécessite un sondage post-transaction — non instrumenté' },
    },
    totals: {
      transactions: db.transactions.length,
      released: released.length,
      disputes: db.disputes.length,
      users: db.users.length,
    },
  });
});

// Dashboard fraude (PRD §4.7) : comptes liés, patterns anormaux, transactions atypiques.
// Signaux, pas verdicts — un rapprochement d'IP ou un taux d'annulation élevé appelle une
// revue humaine, jamais une sanction automatique.
app.get('/api/admin/fraud', auth, adminOnly, (req, res) => {
  const humans = db.users.filter((u) => !u.isAdmin);

  const groupBy = (key) => {
    const groups = {};
    for (const u of humans) {
      const v = u[key];
      if (!v) continue;
      (groups[v] = groups[v] || []).push(u);
    }
    return Object.entries(groups).filter(([, list]) => list.length > 1);
  };

  const linkedAccounts = [
    ...groupBy('phone').map(([value, list]) => ({ signal: 'phone', value, users: list })),
    ...groupBy('registerIp').map(([value, list]) => ({ signal: 'ip', value, users: list })),
  ].map(({ signal, value, users }) => ({
    signal, value,
    users: users.map((u) => ({ id: u.id, name: u.name, email: u.email, createdAt: u.createdAt })),
  }));

  // Paires expéditeur/voyageur récurrentes : signal de collusion (double validation
  // contournée entre deux comptes qui transigent toujours ensemble — PRD §5).
  const pairCounts = {};
  for (const t of db.transactions) {
    const key = [t.senderId, t.travelerId].sort().join('|');
    (pairCounts[key] = pairCounts[key] || []).push(t);
  }
  const repeatPairs = Object.entries(pairCounts)
    .filter(([, txs]) => txs.length >= 2)
    .map(([key, txs]) => {
      const [aId, bId] = key.split('|');
      const disputed = txs.filter((t) => t.status === 'disputed' || db.disputes.some((d) => d.txId === t.id)).length;
      return {
        users: [aId, bId].map((id) => { const u = findUser(id); return u ? { id: u.id, name: u.name } : { id, name: '?' }; }),
        transactionCount: txs.length, disputedCount: disputed,
        totalValueEur: Math.round(txs.reduce((s, t) => s + (t.escrow?.amount || 0), 0) * 100) / 100,
      };
    })
    .sort((a, b) => b.transactionCount - a.transactionCount);

  // Désintermédiation : utilisateurs à l'origine de messages signalés (partage de coordonnées).
  const flaggedByUser = {};
  for (const m of repositories.messages.all()) {
    if (!m.flagged) continue;
    (flaggedByUser[m.from] = flaggedByUser[m.from] || 0);
    flaggedByUser[m.from] += 1;
  }
  const flaggedMessaging = Object.entries(flaggedByUser)
    .map(([userId, count]) => { const u = findUser(userId); return { userId, name: u?.name || '?', count }; })
    .sort((a, b) => b.count - a.count);

  // Annulations anormales : au moins 3 transactions passées, taux d'annulation > 20 %.
  const abnormalCancel = humans
    .filter((u) => u.completed >= 3 && u.cancelRate > 0.2)
    .map((u) => ({ id: u.id, name: u.name, completed: u.completed, cancelRate: u.cancelRate }))
    .sort((a, b) => b.cancelRate - a.cancelRate);

  // Litiges répétés : un compte qui revient souvent dans des litiges (ouvreur ou partie).
  const disputeCountByUser = {};
  for (const d of db.disputes) {
    const t = db.transactions.find((x) => x.id === d.txId);
    if (!t) continue;
    for (const uid of new Set([t.senderId, t.travelerId, t.recipientId].filter(Boolean))) {
      disputeCountByUser[uid] = (disputeCountByUser[uid] || 0) + 1;
    }
  }
  const disputeProne = Object.entries(disputeCountByUser)
    .filter(([, count]) => count >= 2)
    .map(([userId, count]) => { const u = findUser(userId); return { userId, name: u?.name || '?', disputeCount: count }; })
    .sort((a, b) => b.disputeCount - a.disputeCount);

  // Faux KYC répétés : plusieurs soumissions rejetées avant, éventuellement, un refus définitif.
  const kycRejectionsByUser = repositories.kyc.rejectionCountsByUser();
  const kycRepeatRejections = Object.entries(kycRejectionsByUser)
    .filter(([, count]) => count >= 2)
    .map(([userId, count]) => { const u = findUser(userId); return { userId, name: u?.name || '?', rejectionCount: count, currentStatus: u?.kycStatus }; })
    .sort((a, b) => b.rejectionCount - a.rejectionCount);

  res.json({ linkedAccounts, repeatPairs, flaggedMessaging, abnormalCancel, disputeProne, kycRepeatRejections });
});

app.post('/api/admin/review/:id', auth, adminOnly, async (req, res) => {
  const item = repositories.reviewQueue.find(req.params.id);
  if (!item) return res.status(404).json({ error: 'Introuvable' });
  const { decision, maxQty } = req.body; // approve | reject
  repositories.reviewQueue.close(item, decision);
  if (item.type === 'listing') {
    const l = db.listings.find((x) => x.id === item.refId);
    if (l) {
      l.status = decision === 'approve' ? 'published' : 'rejected';
      let promoted = false;
      // Promotion en liste blanche : les envois suivants de cette catégorie
      // passeront directement, sans repasser en revue humaine à chaque fois.
      if (decision === 'approve' && l.whitelistVerdict === 'gray'
          && !repositories.customWhitelist.hasIn(WHITELIST, l.categoryId)) {
        repositories.customWhitelist.promoteFromListing(l, { maxQty });
        promoted = true;
      }
      await audit(req.user.id, `review.listing.${decision}`, 'listing', l.id, {
        reviewId: item.id,
        categoryId: l.categoryId,
        promoted,
      });
    }
  }
  if (item.type === 'dispute') {
    const d = db.disputes.find((x) => x.id === item.refId);
    const t = db.transactions.find((x) => x.id === d.txId);
    d.status = 'resolved';
    d.resolution = decision; // release_traveler | refund_sender
    d.resolvedAt = Date.now();
    if (decision === 'release_traveler') {
      t.status = 'released'; transitionEscrow(t.escrow, 'released');
    } else {
      t.status = 'refunded'; transitionEscrow(t.escrow, 'refunded');
    }
    addEvent(t, 'dispute_resolved', req.user.id, { decision });
    await audit(req.user.id, `review.dispute.${decision}`, 'dispute', d.id, {
      reviewId: item.id,
      txId: t.id,
      escrowState: t.escrow?.state || null,
    });
    await notify([t.senderId, t.travelerId, t.recipientId], { key: decision === 'release_traveler' ? 'dispute.resolved.traveler' : 'dispute.resolved.sender' }, t.id, 'security', 'litige');
  }
  save();
  res.json({ ok: true });
});

// ---------- Mode démo/test (à retirer en production) ----------
if (DEMO) {
  // Connexion directe à un compte de démo, sans mot de passe.
  app.post('/api/dev/impersonate', (req, res) => {
    const user = findByEmail(req.body.email);
    if (!user) return res.status(404).json({ error: 'Compte inconnu' });
    openSession(res, user);
  });

  // Crée un utilisateur de test aléatoire, vérifié et KYC ok, connecté.
  app.post('/api/dev/random-user', (req, res) => {
    const n = Math.floor(Math.random() * 9000) + 1000;
    const names = ['Salma', 'Youssef', 'Nadia', 'Hamza', 'Leila', 'Adam', 'Sofia', 'Bilal'];
    const user = makeUser({
      name: `${names[n % names.length]} T${n}`,
      email: `test${n}@demo.wigofly.app`,
      phone: `+3247${n}000`,
      provider: 'email',
      emailVerified: true,
      passwordHash: hashPassword('demo1234'),
    });
    user.kycStatus = 'verified';
    db.users.push(user);
    openSession(res, user);
  });

  // Révèle les codes de validation d'une transaction (impossible en prod).
  app.get('/api/dev/tx-codes/:id', auth, (req, res) => {
    const t = db.transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
    res.json({ pickupCode: t.pickupCode, deliveryCode: t.deliveryCode });
  });
}

const PORT = process.env.PORT || 4517;
app.listen(PORT, () => console.log(`API Wigofly sur http://localhost:${PORT}`));
