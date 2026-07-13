import express from 'express';
import cors from 'cors';
import { getDb, save, newId } from './store.js';
import { WHITELIST, BLACKLIST, CUSTOMS, detectLeak } from './rules.js';
import { hashPassword, verifyPassword, newToken, sixDigitCode, validRegistration, EMAIL_RE, rateLimit } from './auth.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '25mb' }));

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
    createdAt: u.createdAt,
  };

const findUser = (id) => db.users.find((u) => u.id === id);

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

// Notifications in-app aux transitions d'état (PRD §4.5)
function notify(userIds, text, txId = null) {
  db.notifications = db.notifications || [];
  for (const uid of new Set(userIds.filter(Boolean))) {
    db.notifications.push({ id: newId('n'), userId: uid, text, txId, read: false, at: Date.now() });
  }
}

const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
function validPhotos(photos) {
  if (!Array.isArray(photos)) return false;
  return photos.every((p) => IMG_RE.test(p) && p.length <= 700 * 1024);
}

// Liste blanche effective = base statique + catégories promues depuis la zone grise
// après validation admin (évite de rejuger indéfiniment le même produit — §4.2).
const combinedWhitelist = () => [...WHITELIST, ...db.customWhitelist];

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

function makeUser({ name, email, phone, provider, emailVerified, passwordHash, cguAcceptedAt }) {
  return {
    id: newId('u'), name: name.trim(), email: normEmail(email), phone: phone || '',
    passwordHash: passwordHash || null, provider, emailVerified: !!emailVerified,
    city: '', kycStatus: 'none', rating: null, ratingCount: 0, completed: 0, cancelRate: 0,
    // Plafonds progressifs (PRD §0.3) : nouveau compte = 100 €, 1 transaction active
    maxValue: 100, maxActive: 1, badges: [], createdAt: Date.now(),
    cguAcceptedAt: cguAcceptedAt || null,
  };
}

function openSession(res, user) {
  const token = newToken();
  db.sessions[token] = user.id;
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
  const user = makeUser({ name, email, phone, provider: 'email', passwordHash: hashPassword(password), cguAcceptedAt: Date.now() });
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
  openSession(res, user);
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
  openSession(res, user);
});

// OAuth Google — simulé en démo. En prod : flux OAuth 2.0 / OpenID Connect
// (échange du "credential" Google Identity Services contre l'identité vérifiée).
app.post('/api/auth/google', (req, res) => {
  const { email, name, cguAccepted } = req.body;
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email Google invalide' });
  let user = findByEmail(email);
  if (!user) {
    if (!cguAccepted) return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation' });
    user = makeUser({ name: name || email.split('@')[0], email, provider: 'google', emailVerified: true, cguAcceptedAt: Date.now() });
    db.users.push(user);
  }
  openSession(res, user);
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
  openSession(res, user);
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

// ---------- KYC manuel (PRD KYC) ----------
// Statuts : none | pending | verified | rejected | refused
const MAX_KYC_ATTEMPTS = 3; // au-delà de 3 rejets, passage automatique en 'refused'

// Vue KYC côté utilisateur : sa demande active, sans exposer les décisions internes.
function kycUserView(user) {
  const mine = db.kycSubmissions.filter((s) => s.userId === user.id).sort((a, b) => b.submittedAt - a.submittedAt);
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
  const rejectedCount = db.kycSubmissions.filter((s) => s.userId === req.user.id && s.status === 'rejected').length;
  if (rejectedCount >= MAX_KYC_ATTEMPTS)
    return res.status(403).json({ error: 'Nombre maximum de tentatives atteint — contactez le support' });

  const submission = {
    id: newId('kyc'), userId: req.user.id, submittedAt: Date.now(),
    legalName: String(legalName).trim().slice(0, 120),
    birthDate, age, documentType,
    selfiePhoto, idFrontPhoto, idBackPhoto: documentType === 'id_card' ? idBackPhoto : null,
    status: 'pending', reviewedBy: null, reviewedAt: null, decisionReason: null,
  };
  db.kycSubmissions.push(submission);
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
    messages: db.messages.filter((m) => m.from === uid),
    disputes: db.disputes.filter((d) => d.openedBy === uid),
    // Métadonnées KYC sans les images (données biométriques sensibles — non incluses
    // dans l'export standard, PRD KYC §6 ; communiquées séparément sur demande justifiée).
    kyc: db.kycSubmissions.filter((s) => s.userId === uid).map((s) => ({
      id: s.id, submittedAt: s.submittedAt, status: s.status,
      legalName: s.legalName, birthDate: s.birthDate, documentType: s.documentType,
      reviewedAt: s.reviewedAt, decisionReason: s.decisionReason,
    })),
  };
  res.setHeader('Content-Disposition', `attachment; filename="cloudkilo-donnees-${uid}.json"`);
  res.json(data);
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
  req.user.email = `deleted-${uid}@cloudkilo.invalid`;
  req.user.phone = '';
  req.user.city = '';
  req.user.photoUrl = null;
  req.user.passwordHash = null;
  req.user.provider = 'deleted';
  req.user.deletedAt = Date.now();
  // Purge des images KYC (données biométriques) — on conserve seulement la trace de décision
  // anonymisée pour l'audit de conformité, sans les photos.
  for (const s of db.kycSubmissions) {
    if (s.userId === uid) { s.selfiePhoto = null; s.idFrontPhoto = null; s.idBackPhoto = null; s.legalName = '(supprimé)'; }
  }
  for (const [tok, id] of Object.entries(db.sessions)) if (id === uid) delete db.sessions[tok];
  save();
  res.json({ ok: true });
});

// ---------- Notifications ----------
app.get('/api/notifications', auth, (req, res) => {
  const mine = (db.notifications || [])
    .filter((n) => n.userId === req.user.id)
    .sort((a, b) => b.at - a.at)
    .slice(0, 30);
  res.json({ notifications: mine, unread: mine.filter((n) => !n.read).length });
});

app.post('/api/notifications/read', auth, (req, res) => {
  for (const n of db.notifications || []) if (n.userId === req.user.id) n.read = true;
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
  res.json({ whitelist: combinedWhitelist(), blacklist: BLACKLIST, customs: CUSTOMS });
});

// ---------- Trajets voyageur (PRD §2.1) ----------
app.get('/api/trips/mine', auth, (req, res) => {
  res.json({ trips: db.trips.filter((t) => t.travelerId === req.user.id) });
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
  if (q) open = open.filter((l) => l.title.toLowerCase().includes(String(q).toLowerCase()));

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
    db.reviewQueue.push({ id: newId('rq'), type: 'listing', refId: listing.id, status: 'open', createdAt: Date.now() });
  }
  save();
  res.json({ listing });
});

// ---------- Transactions (machine à états) ----------
// accepted → sealed → in_transit → delivered → released | disputed
const CLOSED_STATUSES = ['released', 'refunded', 'cancelled'];
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

// Acceptation par le voyageur → escrow séquestré immédiatement (PRD §2.3)
app.post('/api/listings/:id/accept', auth, (req, res) => {
  if (req.user.kycStatus !== 'verified')
    return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });
  // Formation courte obligatoire au premier transport (PRD §5.4)
  if (!req.user.trainingDone && !req.user.isAdmin)
    return res.status(403).json({ error: 'Formation voyageur requise', needsTraining: true });
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing || listing.status !== 'published')
    return res.status(400).json({ error: 'Annonce indisponible' });
  if (listing.senderId === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas transporter votre propre annonce' });
  const active = db.transactions.filter(
    (t) => t.travelerId === req.user.id && !['released', 'refunded', 'cancelled'].includes(t.status)
  );
  if (active.length >= req.user.maxActive)
    return res.status(400).json({ error: `Plafond atteint : ${req.user.maxActive} transaction(s) active(s) max` });

  listing.status = 'matched';
  const total = listing.travelerPay + Math.round(listing.travelerPay * listing.commissionRate * 100) / 100;
  const tx = {
    id: newId('tx'), listingId: listing.id, senderId: listing.senderId,
    travelerId: req.user.id, recipientId: listing.recipientId || listing.senderId,
    status: 'accepted',
    escrow: { amount: total, travelerPay: listing.travelerPay, commission: Math.round(listing.travelerPay * listing.commissionRate * 100) / 100, state: 'held', heldAt: Date.now() },
    pickupCode: code6(), deliveryCode: code6(),
    sealingVideo: null, events: [], createdAt: Date.now(),
  };
  addEvent(tx, 'accepted', req.user.id, { escrowHeld: total });
  notify([tx.senderId, tx.recipientId !== tx.senderId ? tx.recipientId : null], `${req.user.name} transporte « ${listing.title} ». Paiement séquestré.`, tx.id);
  db.transactions.push(tx);
  save();
  res.json({ transaction: txView(req.user)(tx) });
});

// Vidéo de scellage (PRD §3.2) — caméra in-app uniquement, horodatée
app.post('/api/transactions/:id/sealing-video', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'accepted') return res.status(400).json({ error: 'Étape invalide' });
  if (t.senderId !== req.user.id) return res.status(403).json({ error: "Seul l'expéditeur filme le scellage" });
  t.sealingVideo = {
    dataUrl: req.body.dataUrl || null, simulated: !!req.body.simulated,
    recordedAt: Date.now(), geo: req.body.geo || null, txCode: t.id,
  };
  t.status = 'sealed';
  addEvent(t, 'sealed', req.user.id, { simulated: !!req.body.simulated });
  notify([t.travelerId], `Colis scellé et filmé pour « ${db.listings.find((l) => l.id === t.listingId)?.title} ». Organisez la remise.`, t.id);
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Double validation remise : le voyageur saisit le code présenté par l'expéditeur (PRD §3.4)
app.post('/api/transactions/:id/confirm-pickup', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'sealed') return res.status(400).json({ error: 'Étape invalide' });
  if (t.travelerId !== req.user.id) return res.status(403).json({ error: 'Seul le voyageur valide la prise en charge' });
  if ((req.body.code || '').toUpperCase() !== t.pickupCode)
    return res.status(400).json({ error: 'Code invalide — scannez le QR de l\'expéditeur' });
  t.status = 'in_transit';
  addEvent(t, 'in_transit', req.user.id, { responsibility: 'traveler' });
  notify([t.senderId, t.recipientId !== t.senderId ? t.recipientId : null], 'Colis pris en charge par le voyageur — en transit.', t.id);
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Refus sans pénalité avant prise en charge (PRD §3.3)
app.post('/api/transactions/:id/refuse', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || !['accepted', 'sealed'].includes(t.status)) return res.status(400).json({ error: 'Étape invalide' });
  if (t.travelerId !== req.user.id) return res.status(403).json({ error: 'Réservé au voyageur' });
  t.status = 'cancelled';
  t.escrow.state = 'refunded';
  const listing = db.listings.find((l) => l.id === t.listingId);
  if (listing) listing.status = 'published';
  addEvent(t, 'refused_no_penalty', req.user.id, { reason: req.body.reason || '' });
  notify([t.senderId], 'Le voyageur a refusé le transport (sans pénalité). Votre annonce est republiée et remboursée.', t.id);
  save();
  res.json({ transaction: txView(req.user)(t) });
});

// Double validation livraison : le destinataire saisit le code du voyageur → escrow libéré (PRD §5.3/5.4)
app.post('/api/transactions/:id/confirm-delivery', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || t.status !== 'in_transit') return res.status(400).json({ error: 'Étape invalide' });
  if (t.recipientId !== req.user.id) return res.status(403).json({ error: 'Seul le destinataire valide la livraison' });
  if ((req.body.code || '').toUpperCase() !== t.deliveryCode)
    return res.status(400).json({ error: 'Code invalide — scannez le QR du voyageur' });
  t.status = 'released';
  t.escrow.state = 'released';
  t.escrow.releasedAt = Date.now();
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
  notify([t.travelerId], `Livraison validée — ${t.escrow.travelerPay} € versés sur votre compte.`, t.id);
  notify([t.senderId], 'Colis livré et validé par le destinataire. Pensez à noter vos partenaires.', t.id);
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
  t.ratings = t.ratings || [];
  if (t.ratings.some((r) => r.by === req.user.id && r.target === targetId))
    return res.status(400).json({ error: 'Déjà noté' });
  t.ratings.push({ by: req.user.id, target: targetId, stars: Number(stars), at: Date.now() });
  const prev = (target.rating || 0) * target.ratingCount;
  target.ratingCount += 1;
  target.rating = Math.round(((prev + Number(stars)) / target.ratingCount) * 10) / 10;
  addEvent(t, 'rated', req.user.id, { target: targetId, stars });
  save();
  res.json({ ok: true });
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

app.post('/api/transactions/:id/dispute', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t || !['in_transit', 'released'].includes(t.status))
    return res.status(400).json({ error: 'Litige impossible à ce stade' });
  if (!isPartyToTx(t, req.user.id))
    return res.status(403).json({ error: 'Réservé aux parties de la transaction' });
  if (!req.body.reason || String(req.body.reason).trim().length < 10)
    return res.status(400).json({ error: 'Merci de détailler le motif (10 caractères minimum)' });
  t.status = 'disputed';
  t.escrow.state = 'frozen';
  const dispute = {
    id: newId('d'), txId: t.id, openedBy: req.user.id, reason: String(req.body.reason).trim().slice(0, 2000),
    evidence: [], status: 'open', createdAt: Date.now(),
  };
  db.disputes.push(dispute);
  db.reviewQueue.push({ id: newId('rq'), type: 'dispute', refId: dispute.id, status: 'open', createdAt: Date.now() });
  addEvent(t, 'dispute_opened', req.user.id, { reason: dispute.reason });
  notify([t.senderId, t.travelerId].filter((id) => id !== req.user.id), 'Litige ouvert — escrow gelé. Soumettez vos preuves sous 72 h.', t.id);
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
  res.json({ messages: db.messages.filter((m) => m.txId === req.params.id) });
});

app.post('/api/transactions/:id/messages', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });
  const text = String(req.body.text || '').slice(0, 2000);
  const flagged = detectLeak(text);
  const msg = { id: newId('m'), txId: t.id, from: req.user.id, text, flagged, at: Date.now() };
  db.messages.push(msg);
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

app.get('/api/admin/overview', auth, adminOnly, (req, res) => {
  res.json({
    reviewQueue: db.reviewQueue.filter((r) => r.status === 'open').map((r) => ({
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
      flaggedMessages: db.messages.filter((m) => m.flagged).length,
      escrowHeld: db.transactions.filter((t) => t.escrow?.state === 'held' || t.escrow?.state === 'frozen')
        .reduce((s, t) => s + t.escrow.amount, 0),
    },
    disputes: db.disputes,
    customWhitelist: db.customWhitelist,
  });
});

// Retire une catégorie promue (repasse en zone grise pour les prochains envois).
app.delete('/api/admin/whitelist/:id', auth, adminOnly, (req, res) => {
  const i = db.customWhitelist.findIndex((c) => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Catégorie introuvable' });
  db.customWhitelist.splice(i, 1);
  save();
  res.json({ ok: true });
});

// ---------- Back-office KYC (PRD KYC §5) ----------
const KYC_SLA_MS = 24 * 3600e3;

// Résumé d'une soumission pour la vue liste (sans les photos — allège la charge).
function kycSummary(s) {
  const u = findUser(s.userId);
  const priorRejects = db.kycSubmissions.filter(
    (x) => x.userId === s.userId && x.status === 'rejected' && x.submittedAt < s.submittedAt
  ).length;
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
  const statusMap = { pending: 'pending', verified: 'approved', rejected: 'rejected', refused: 'refused' };

  let list = [...db.kycSubmissions];
  if (filter !== 'all') list = list.filter((s) => s.status === statusMap[filter]);
  if (q) {
    list = list.filter((s) => {
      const u = findUser(s.userId);
      return s.legalName.toLowerCase().includes(q) || (u && u.email.toLowerCase().includes(q));
    });
  }
  // FIFO pour les demandes en attente (équité), antichronologique pour l'historique.
  list.sort((a, b) => (filter === 'pending' ? a.submittedAt - b.submittedAt : b.submittedAt - a.submittedAt));

  const pending = db.kycSubmissions.filter((s) => s.status === 'pending');
  const reviewed = db.kycSubmissions.filter((s) => s.reviewedAt);
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
  const s = db.kycSubmissions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Demande introuvable' });
  const u = findUser(s.userId);
  const history = db.kycDecisions
    .filter((d) => d.userId === s.userId)
    .sort((a, b) => b.at - a.at)
    .map((d) => ({ ...d, adminName: findUser(d.adminId)?.name || d.adminId }));
  res.json({
    submission: {
      ...s,
      user: u ? {
        name: u.name, email: u.email, createdAt: u.createdAt, kycStatus: u.kycStatus,
        phone: u.phone, city: u.city,
      } : null,
      priorRejects: db.kycSubmissions.filter((x) => x.userId === s.userId && x.status === 'rejected' && x.submittedAt < s.submittedAt).length,
    },
    history,
  });
});

// Décision admin : approve | reject | refuse (motif obligatoire pour reject/refuse).
app.post('/api/admin/kyc/:id/decide', auth, adminOnly, (req, res) => {
  const s = db.kycSubmissions.find((x) => x.id === req.params.id);
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
    notify([user.id], 'Votre identité a été vérifiée. Vous pouvez maintenant envoyer et transporter.');
  } else if (decision === 'reject') {
    s.status = 'rejected';
    const rejectedCount = db.kycSubmissions.filter((x) => x.userId === user.id && x.status === 'rejected').length;
    // Passage automatique en refus définitif au-delà de la limite (PRD §7).
    if (rejectedCount >= MAX_KYC_ATTEMPTS) {
      user.kycStatus = 'refused';
      notify([user.id], 'Votre vérification a été refusée définitivement après plusieurs tentatives. Contactez le support.');
    } else {
      user.kycStatus = 'rejected';
      notify([user.id], `Votre vérification a été rejetée : ${cleanReason}. Vous pouvez soumettre à nouveau.`);
    }
  } else { // refuse
    s.status = 'refused';
    user.kycStatus = 'refused';
    notify([user.id], `Votre vérification a été définitivement refusée : ${cleanReason}. Contactez le support.`);
  }

  db.kycDecisions.push({
    id: newId('kycd'), submissionId: s.id, userId: user.id, adminId: req.user.id,
    decision, reason: cleanReason, at: Date.now(),
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
  const desintermediationRate = db.messages.length ? db.messages.filter((m) => m.flagged).length / db.messages.length : 0;

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
      desintermediationRate: { value: desintermediationRate, target: 0.15, direction: 'below', sampleSize: db.messages.length },
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

app.post('/api/admin/review/:id', auth, adminOnly, (req, res) => {
  const item = db.reviewQueue.find((r) => r.id === req.params.id);
  if (!item) return res.status(404).json({ error: 'Introuvable' });
  const { decision, maxQty } = req.body; // approve | reject
  item.status = 'closed';
  item.decision = decision;
  if (item.type === 'listing') {
    const l = db.listings.find((x) => x.id === item.refId);
    if (l) {
      l.status = decision === 'approve' ? 'published' : 'rejected';
      // Promotion en liste blanche : les envois suivants de cette catégorie
      // passeront directement, sans repasser en revue humaine à chaque fois.
      if (decision === 'approve' && l.whitelistVerdict === 'gray'
          && !combinedWhitelist().some((c) => c.id === l.categoryId)) {
        db.customWhitelist.push({
          id: l.categoryId, label: l.categoryLabel,
          maxQty: String(maxQty || 'Usage personnel (à confirmer)').slice(0, 40),
          icon: '📦', addedFrom: l.id, addedAt: Date.now(),
        });
      }
    }
  }
  if (item.type === 'dispute') {
    const d = db.disputes.find((x) => x.id === item.refId);
    const t = db.transactions.find((x) => x.id === d.txId);
    d.status = 'resolved';
    d.resolution = decision; // release_traveler | refund_sender
    d.resolvedAt = Date.now();
    if (decision === 'release_traveler') {
      t.status = 'released'; t.escrow.state = 'released';
    } else {
      t.status = 'refunded'; t.escrow.state = 'refunded';
    }
    addEvent(t, 'dispute_resolved', req.user.id, { decision });
    notify([t.senderId, t.travelerId, t.recipientId], decision === 'release_traveler' ? 'Litige tranché : paiement versé au voyageur.' : 'Litige tranché : expéditeur remboursé.', t.id);
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
      email: `test${n}@demo.cloudkilo.app`,
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
app.listen(PORT, () => console.log(`API CloudKilo sur http://localhost:${PORT}`));
