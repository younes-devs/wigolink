import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import {
  acquireDatabaseState, createPersistentSession, databasePool, deletePersistentSession, deletePersistentSessionsForUser,
  databaseHealth, getDb, getPersistentSession, refreshDatabaseState, releaseDatabaseState, save, newId, usesDatabase,
} from './store.js';
import { WHITELIST, BLACKLIST, CUSTOMS, detectLeak, analyzeMessageSafety, localizeCategory, localizeCustoms } from './rules.js';
import { hashPassword, verifyPassword, newToken, sixDigitCode, validRegistration, EMAIL_RE, rateLimit } from './auth.js';
import { langMiddleware } from './middleware/language.js';
import { renderNotification } from './notify-i18n.js';
import { createEscrow, transitionEscrow } from './escrow.js';
import { createPersistence } from './persistence.js';
import { emailConfig, sendVerificationEmail } from './email.js';
import {
  listRelationalTrips, relationalTripReadsEnabled, relationalUserFromSession,
  snapshotRelationalTripState, syncRelationalTripState,
} from './relational-trip-feed.js';
import {
  listRelationalConversations, relationalConversation, relationalMessageReadsEnabled,
} from './relational-messaging.js';
import { adminOnly } from './middleware/admin-only.js';
import { createSecurityHeaders } from './middleware/security-headers.js';
import { createDatabaseAvailability } from './middleware/database-availability.js';
import { createPersistenceState } from './middleware/persistence-state.js';
import { createSessionAuth } from './middleware/session-auth.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createCorsOptions } from './config/cors-options.js';
import { createSystemRouter } from './routes/system.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createAccountSettingsRouter } from './routes/account-settings.js';

const app = express();
const {
  isProduction: IS_PRODUCTION,
  appOrigins: APP_ORIGINS,
  supabaseUrl: SUPABASE_URL,
  supabaseRealtimeOrigin: SUPABASE_REALTIME_ORIGIN,
} = loadRuntimeConfig();
const EMAIL_READY = !!(emailConfig().apiKey && emailConfig().from);
// The database URL is server-only and already mandatory in production. A dedicated
// OPERATION_CODE_SECRET can supersede it without making deployments brittle.
const OPERATION_CODE_SECRET = process.env.OPERATION_CODE_SECRET || process.env.DATABASE_URL || 'wigofly-local-operation-code-secret';
app.set('trust proxy', 1);
app.use(cors(createCorsOptions({
  isProduction: IS_PRODUCTION,
  appOrigins: APP_ORIGINS,
})));
app.use(createSecurityHeaders({
  newRequestId: () => newId('req'),
  supabaseUrl: SUPABASE_URL,
  supabaseRealtimeOrigin: SUPABASE_REALTIME_ORIGIN,
}));
app.use(express.json({ limit: '25mb' }));
// i18n des erreurs API : traduit body.error à la sortie selon Accept-Language (fr/ar/nl).
app.use(langMiddleware);

// Production never falls back to the packaged JSON data when Supabase is missing.
// Health remains public so Vercel can show the configuration problem clearly.
app.use(createDatabaseAvailability({
  isProduction: IS_PRODUCTION,
  databaseHealth,
}));

const db = getDb();

// Les lectures reutilisent un cache tres court par fonction Vercel. Seules les
// ecritures prennent le verrou Postgres et attendent la validation avant reponse.
app.use(createPersistenceState({
  db,
  usesDatabase,
  refreshDatabaseState,
  acquireDatabaseState,
  releaseDatabaseState,
  relationalTripReadsEnabled,
  relationalMessageReadsEnabled,
  snapshotRelationalTripState,
  syncRelationalTripState,
}));
// Flux temps reel leger (SSE). Il reste dans le processus Express afin de fonctionner
// aussi bien en local qu'avec un serveur Node classique, sans dependance WebSocket.
const realtimeClients = new Map();
const lastSeenByUser = new Map();

function realtimeBroadcastConfig() {
  const publishableKey = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();
  const secretKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!SUPABASE_URL || !publishableKey || !secretKey) return null;
  return { url: SUPABASE_URL, publishableKey, secretKey };
}

function ensureRealtimeChannel(user) {
  if (!user.realtimeChannel) user.realtimeChannel = `wigofly:${newToken()}`;
  return user.realtimeChannel;
}

async function publishRealtimeUpdate(userId, payload) {
  const config = realtimeBroadcastConfig();
  const user = findUser(userId);
  if (!config || !user?.realtimeChannel) return;
  try {
    await fetch(`${config.url}/realtime/v1/api/broadcast/${encodeURIComponent(user.realtimeChannel)}/events/update`, {
      method: 'POST',
      headers: {
        apikey: config.secretKey,
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    // Realtime improves responsiveness but must never block a message or its persistence.
    console.error('Echec de diffusion temps reel', error);
  }
}

// Mode démo : désactivé par défaut (secure by default). Doit être explicitement activé
// (DEMO=true) pour exposer les endpoints /api/dev/* (bascule de compte sans mot de
// passe) et les codes de vérification en clair dans les réponses API — jamais en
// production, où un vrai prestataire email/SMS doit être branché à la place.
const DEMO = process.env.DEMO === 'true';

app.use('/api', createSystemRouter({
  demo: DEMO,
  isProduction: IS_PRODUCTION,
  emailReady: EMAIL_READY,
  databaseHealth,
}));

// Vercel serverless ne conserve pas suffisamment longtemps une connexion SSE.
// Les clients utilisent donc le WebSocket gere par Supabase Realtime.
app.get('/api/realtime', auth, (req, res) => {
  res.status(410).json({ error: 'Le temps reel SSE est remplace par la synchronisation automatique.' });
});

app.post('/api/realtime/session', auth, (req, res) => {
  const config = realtimeBroadcastConfig();
  if (!config) return res.json({ enabled: false });
  res.json({
    enabled: true,
    url: config.url,
    publishableKey: config.publishableKey,
    channel: ensureRealtimeChannel(req.user),
  });
});

// ---------- Helpers ----------
const publicUser = (u) =>
  u && {
    id: u.id, name: u.name, city: u.city, kycStatus: u.kycStatus, rating: u.rating,
    ratingCount: u.ratingCount, completed: u.completed, cancelRate: u.cancelRate,
    badges: u.badges, photoUrl: u.photoUrl || null, isAdmin: !!u.isAdmin,
    createdAt: u.createdAt, onboardingDone: !!u.settings?.onboardingDone,
    emailVerified: !!u.emailVerified,
  };

const findUser = (id) => db.users.find((u) => u.id === id);
const { repositories } = createPersistence({ db, save, newId, findUser, publicUser, pool: databasePool() });
const DEFAULT_NOTIFICATION_SETTINGS = {
  transactions: true,
  messages: true,
  shipments: true,
  reminders: true,
  security: true,
};
const OFFER_REMINDER_MS = 6 * 3600e3;
const SESSION_DURATION_MS = 24 * 60 * 60 * 1000;
const REMEMBER_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const TODAY_ISO = () => new Date().toISOString().slice(0, 10);

function userSettings(user) {
  return repositories.settings.ensure(user);
}

// Les comptes email restent bloques jusqu'a la verification de leur boite.
// Google ne pourra etre exempte que lorsqu'un vrai flux OAuth est active.
const canAccessApp = (user) => !!user && (user.emailVerified === true || user.provider === 'google');

const sessionAuth = createSessionAuth({
  getPersistentSession,
  deletePersistentSession,
  findUser,
  canAccessApp,
  save,
});

async function clearUserSessions(userId) {
  await deletePersistentSessionsForUser(userId);
}

async function activeSession(token) {
  return sessionAuth.activeSession(token);
}

// Seules les parties d'une transaction (ou un admin) peuvent en consulter le détail,
// les messages, le récap douane, ou agir sur un litige qui s'y rattache.
const isPartyToTx = (t, userId) => [t.senderId, t.travelerId, t.recipientId].includes(userId);

async function auth(req, res, next) {
  return sessionAuth.auth(req, res, next);
}

async function authRealtime(req, res, next) {
  return sessionAuth.authRealtime(req, res, next);
}

async function relationalTripAuth(req, res, next) {
  if (!relationalTripReadsEnabled()) return next('route');
  const pool = databasePool();
  if (!pool) return res.status(503).json({ error: 'Base de donnees temporairement indisponible.' });
  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const user = await relationalUserFromSession({ token, getSession: activeSession, pool });
    if (!user) return res.status(401).json({ error: 'Utilisateur inconnu ou session expiree' });
    if (!canAccessApp(user)) return res.status(403).json({
      needsVerification: true,
      pendingEmail: user.email,
      error: 'Verifiez votre adresse email avant d acceder a l application.',
    });
    req.user = user;
    return next();
  } catch (error) {
    console.error('Echec de lecture relationnelle des trajets', error);
    return res.status(503).json({ error: 'Recherche temporairement indisponible. Reessayez.' });
  }
}

// High-traffic trip discovery bypasses the legacy JSON state when the relational
// migration is enabled. The existing routes below remain the safe fallback until
// the imported row counts have been checked in Supabase.
app.get('/api/trips/mine', relationalTripAuth, async (req, res, next) => {
  if (!relationalTripReadsEnabled()) return next('route');
  try {
    res.json(await listRelationalTrips({
      pool: databasePool(), user: req.user, query: req.query, mine: true, today: TODAY_ISO(),
    }));
  } catch (error) {
    console.error('Echec de lecture de mes trajets', error);
    res.status(503).json({ error: 'Mes trajets sont temporairement indisponibles. Reessayez.' });
  }
});

app.get('/api/trips', relationalTripAuth, async (req, res, next) => {
  if (!relationalTripReadsEnabled()) return next('route');
  try {
    res.json(await listRelationalTrips({
      pool: databasePool(), user: req.user, query: req.query, today: TODAY_ISO(),
    }));
  } catch (error) {
    console.error('Echec de recherche relationnelle des trajets', error);
    res.status(503).json({ error: 'Recherche temporairement indisponible. Reessayez.' });
  }
});

app.get('/api/trips/overview', relationalTripAuth, async (req, res, next) => {
  if (!relationalTripReadsEnabled()) return next('route');
  try {
    const pool = databasePool();
    const [feed, mine] = await Promise.all([
      listRelationalTrips({
        pool, user: req.user, query: { ...req.query, excludeMine: '1' }, today: TODAY_ISO(),
      }),
      listRelationalTrips({
        pool, user: req.user, query: req.query, mine: true, today: TODAY_ISO(),
      }),
    ]);
    res.json({ trips: feed.trips, myTrips: mine.trips });
  } catch (error) {
    console.error('Echec de chargement de l apercu des trajets', error);
    res.status(503).json({ error: 'Les trajets sont temporairement indisponibles. Reessayez.' });
  }
});

// Conversation reads use the indexed conversation and message tables once their
// mirror is enabled. Writes deliberately keep the existing atomic state path.
app.get('/api/conversations', relationalTripAuth, async (req, res, next) => {
  if (!relationalMessageReadsEnabled()) return next('route');
  try {
    res.json(await listRelationalConversations({
      pool: databasePool(), user: req.user, query: req.query, today: TODAY_ISO(),
    }));
  } catch (error) {
    console.error('Echec de lecture relationnelle des conversations', error);
    res.status(503).json({ error: 'Messagerie temporairement indisponible. Reessayez.' });
  }
});

app.get('/api/conversations/:id', relationalTripAuth, async (req, res, next) => {
  if (!relationalMessageReadsEnabled()) return next('route');
  try {
    const data = await relationalConversation({
      pool: databasePool(), user: req.user, id: req.params.id, today: TODAY_ISO(),
    });
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(data);
  } catch (error) {
    console.error('Echec de lecture relationnelle de conversation', error);
    return res.status(503).json({ error: 'Conversation temporairement indisponible. Reessayez.' });
  }
});

app.get('/api/conversations/:id/messages', relationalTripAuth, async (req, res, next) => {
  if (!relationalMessageReadsEnabled()) return next('route');
  try {
    const data = await relationalConversation({
      pool: databasePool(), user: req.user, id: req.params.id, query: req.query, today: TODAY_ISO(), includeMessages: true,
    });
    if (!data) return res.status(404).json({ error: 'Conversation introuvable' });
    return res.json(data);
  } catch (error) {
    console.error('Echec de lecture relationnelle des messages', error);
    return res.status(503).json({ error: 'Messages temporairement indisponibles. Reessayez.' });
  }
});

function sendRealtime(userId, payload) {
  for (const client of realtimeClients.get(userId) || []) {
    client.write(`event: update\ndata: ${JSON.stringify(payload)}\n\n`);
  }
}

function broadcastConversation(conversation, payload, exceptUserId = null) {
  for (const userId of conversation.participantIds || []) {
    if (userId !== exceptUserId) {
      const update = { conversationId: conversation.id, ...payload, at: Date.now() };
      sendRealtime(userId, update);
      void publishRealtimeUpdate(userId, update);
    }
  }
}

function broadcastPresence(userId, online) {
  for (const conversation of db.conversations.filter((item) => item.participantIds.includes(userId))) {
    broadcastConversation(conversation, { type: 'presence', userId, online }, userId);
  }
}

function addEvent(tx, type, actorId, meta = {}) {
  tx.events.push({ id: newId('e'), type, actorId, meta, at: Date.now() });
}

const OPERATION_CODE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OPERATION_CODE_MAX_ATTEMPTS = 5;

function newOperationCode() {
  return crypto.randomInt(10_000_000, 100_000_000).toString();
}

function operationCodeHash(txId, kind, code) {
  return crypto.createHmac('sha256', OPERATION_CODE_SECRET).update(`${txId}:${kind}:${code}`).digest('hex');
}

function issueOperationCode(tx, kind, recipientId) {
  const code = newOperationCode();
  tx.securityCodes = tx.securityCodes || {};
  tx.securityCodes[kind] = {
    hash: operationCodeHash(tx.id, kind, code),
    recipientId,
    issuedAt: Date.now(),
    expiresAt: Date.now() + OPERATION_CODE_TTL_MS,
    attempts: 0,
    lockedAt: null,
  };
  return code;
}

function operationCodePublicState(code) {
  if (!code) return { issued: false, locked: false };
  return {
    issued: true,
    locked: !!code.lockedAt,
    expiresAt: code.expiresAt,
    attemptsRemaining: Math.max(0, OPERATION_CODE_MAX_ATTEMPTS - Number(code.attempts || 0)),
  };
}

function verifyOperationCode(tx, kind, enteredCode) {
  const record = tx.securityCodes?.[kind];
  if (!record) return { ok: false, error: 'Le code de securite n est pas encore disponible.', status: 400 };
  if (record.lockedAt) return { ok: false, error: 'Ce code est verrouille apres trop de tentatives. Signalez un probleme pour continuer.', status: 429 };
  if (record.expiresAt <= Date.now()) return { ok: false, error: 'Ce code a expire. Son titulaire doit en generer un nouveau.', status: 400 };

  const candidate = String(enteredCode || '').trim();
  const expected = Buffer.from(record.hash, 'hex');
  const actual = Buffer.from(operationCodeHash(tx.id, kind, candidate), 'hex');
  const matches = /^\d{8}$/.test(candidate) && expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  if (matches) return { ok: true };

  record.attempts = Number(record.attempts || 0) + 1;
  if (record.attempts >= OPERATION_CODE_MAX_ATTEMPTS) record.lockedAt = Date.now();
  return {
    ok: false,
    error: record.lockedAt
      ? 'Ce code est verrouille apres trop de tentatives. Signalez un probleme pour continuer.'
      : 'Code invalide.',
    status: record.lockedAt ? 429 : 400,
  };
}

async function audit(actorId, action, targetType, targetId, meta = {}) {
  return repositories.auditLogs.append({ actorId, action, targetType, targetId, meta });
}

// Journal immuable des changements importants. On ne conserve jamais de mot de
// passe, de jeton ou de contenu binaire (photos) dans ce journal.
function auditValue(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'string') return value.slice(0, 1000);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  return null;
}

function auditChanges(before = {}, after = {}, fields = []) {
  return fields.flatMap((field) => {
    const previous = auditValue(before[field]);
    const next = auditValue(after[field]);
    return Object.is(previous, next) ? [] : [{ field, before: previous, after: next }];
  });
}

async function auditChange({ actorId, action, targetType, targetId, subjectUserId, before, after, fields, meta = {} }) {
  const changes = auditChanges(before, after, fields);
  if (!changes.length && !meta.recordEmpty) return null;
  return audit(actorId, action, targetType, targetId, {
    ...meta,
    subjectUserId,
    changes,
  });
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

const LOCATION_EXPIRY_MINUTES = new Set([30, 120]);
function locationCanBePrecise(conversation) {
  const operation = conversation.operationId ? db.transactions.find((item) => item.id === conversation.operationId) : null;
  const status = operation?.operationStatus || operation?.status;
  return ['paye', 'collecte_prevue', 'en_transport'].includes(status);
}

function normalizeMessageLocation(value, conversation, now = Date.now()) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const kind = value.kind === 'place' ? 'place' : value.kind === 'current' ? 'current' : null;
  if (!kind) return null;
  const label = String(value.label || '').trim().slice(0, 120);
  const city = String(value.city || '').trim().slice(0, 80);
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  const hasCoordinates = Number.isFinite(latitude) && Number.isFinite(longitude)
    && latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180;
  if (kind === 'current' && !hasCoordinates) return null;
  if (kind === 'place' && !label && !city) return null;
  const precise = hasCoordinates && locationCanBePrecise(conversation);
  const expiresInMinutes = LOCATION_EXPIRY_MINUTES.has(Number(value.expiresInMinutes))
    ? Number(value.expiresInMinutes)
    : 120;
  return {
    kind,
    labelKey: label ? null : (kind === 'current' ? 'messages.location.myCurrent' : 'messages.location.meeting'),
    label: label || (kind === 'current' ? 'Position actuelle' : 'Lieu de rendez-vous'),
    city: city || null,
    latitude: hasCoordinates ? (precise ? latitude : Number(latitude.toFixed(2))) : null,
    longitude: hasCoordinates ? (precise ? longitude : Number(longitude.toFixed(2))) : null,
    accuracy: hasCoordinates && Number.isFinite(Number(value.accuracy)) ? Math.round(Math.max(0, Math.min(Number(value.accuracy), 10000))) : null,
    precision: precise ? 'exact' : 'approximate',
    expiresAt: now + expiresInMinutes * 60 * 1000,
  };
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

async function openSession(res, user, req, { rememberMe = false } = {}) {
  if (!canAccessApp(user)) {
    return res.status(403).json({
      needsVerification: true,
      pendingEmail: user.email,
      error: 'Verifiez votre adresse email avant d acceder a l application.',
    });
  }
  const token = newToken();
  const sessionDurationMs = rememberMe ? REMEMBER_SESSION_DURATION_MS : SESSION_DURATION_MS;
  const sessionExpiresAt = Date.now() + sessionDurationMs;
  await createPersistentSession({ token, userId: user.id, expiresAt: sessionExpiresAt });
  if (req) {
    user.lastIp = clientIp(req);
    user.lastLoginAt = Date.now();
  }
  save();
  res.json({ token, user: publicUser(user), sessionExpiresAt, sessionDurationDays: rememberMe ? 30 : 1 });
}

// Le code n'est renvoyé dans la réponse API qu'en mode démo (pas de prestataire email
// branché). En production, il doit être envoyé par email/SMS et jamais échoir ici —
// sinon n'importe qui connaissant un email pourrait vérifier ou réinitialiser un compte
// qui n'est pas le sien, sans jamais avoir accès à sa boîte mail.
const demoHintFor = (code, lang = 'fr') => {
  if (!DEMO) return undefined;
  if (lang === 'ar') return `رمز التحقق (تجريبي): ${code}`;
  if (lang === 'nl') return `Verificatiecode (demo): ${code}`;
  return `Code de vérification (démo) : ${code}`;
};

async function deliverAuthCode(email, code, purpose, lang = 'fr') {
  if (DEMO) return;
  if (!EMAIL_READY) throw new Error('La verification par email n est pas encore configuree.');
  await sendVerificationEmail({ to: email, code, purpose, lang });
}

app.post('/api/auth/register', async (req, res) => {
  const { name, email, phone, password, cguAccepted, rememberMe } = req.body;
  const invalid = validRegistration({ name, email, password });
  if (invalid) return res.status(400).json({ error: invalid });
  if (!cguAccepted) return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation' });
  if (findByEmail(email)) return res.status(400).json({ error: 'Un compte existe déjà avec cet email' });
  const user = makeUser({ name, email, phone, provider: 'email', passwordHash: hashPassword(password), cguAcceptedAt: Date.now(), registerIp: clientIp(req) });
  const code = sixDigitCode();
  try {
    await deliverAuthCode(user.email, code, 'verify', req.lang);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  db.users.push(user);
  db.pendingVerifications[user.email] = { code, expires: Date.now() + 15 * 60e3, rememberMe: rememberMe === true };
  save();
  res.json({ pendingEmail: user.email, message: 'Un code de verification vient d etre envoye.', demoHint: demoHintFor(code, req.lang) });
});

app.post('/api/auth/verify-email', async (req, res) => {
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
  await openSession(res, user, req, { rememberMe: req.body.rememberMe === true || pending.rememberMe === true });
});

app.post('/api/auth/resend-code', async (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`resend:${email}`))
    return res.status(429).json({ error: 'Trop de demandes — réessayez plus tard' });
  const user = findByEmail(email);
  if (!user) return res.status(404).json({ error: 'Compte introuvable' });
  const code = sixDigitCode();
  try {
    await deliverAuthCode(email, code, 'verify', req.lang);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  db.pendingVerifications[email] = {
    code,
    expires: Date.now() + 15 * 60e3,
    rememberMe: db.pendingVerifications[email]?.rememberMe === true,
  };
  save();
  res.json({ ok: true, message: 'Un nouveau code vient d etre envoye.', demoHint: demoHintFor(code, req.lang) });
});

app.post('/api/auth/login', async (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`login:${email}`))
    return res.status(429).json({ error: 'Trop de tentatives — réessayez dans 10 minutes' });
  const user = findByEmail(email);
  if (!user || !verifyPassword(req.body.password || '', user.passwordHash))
    return res.status(401).json({ error: 'Email ou mot de passe incorrect' });
  if (user.suspendedUntil && user.suspendedUntil > Date.now()) {
    const token = newToken();
    await createPersistentSession({ token, userId: user.id, expiresAt: Date.now() + SESSION_DURATION_MS });
    return res.status(403).json({
      code: 'account_suspended', token, suspended: true, suspendedUntil: user.suspendedUntil,
      reason: user.suspensionReason || null,
      error: 'Votre compte est temporairement suspendu. Vous pouvez envoyer un recours.',
    });
  }
  if (!canAccessApp(user)) {
    const code = sixDigitCode();
    try {
      await deliverAuthCode(email, code, 'verify', req.lang);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
    db.pendingVerifications[email] = { code, expires: Date.now() + 15 * 60e3, rememberMe: req.body.rememberMe === true };
    save();
    return res.json({ needsVerification: true, pendingEmail: email, message: 'Un code de verification vient d etre envoye.', demoHint: demoHintFor(code, req.lang) });
  }
  await openSession(res, user, req, { rememberMe: req.body.rememberMe === true });
});

// OAuth Google — simulé en démo. En prod : flux OAuth 2.0 / OpenID Connect
// (échange du "credential" Google Identity Services contre l'identité vérifiée).
app.post('/api/auth/google', (req, res) => {
  return res.status(410).json({ error: 'Connexion Google indisponible' });
  /*
  const { email, name, cguAccepted } = req.body;
  if (!EMAIL_RE.test(email || '')) return res.status(400).json({ error: 'Email Google invalide' });
  let user = findByEmail(email);
  if (!user) {
    if (!cguAccepted) return res.status(400).json({ error: 'Vous devez accepter les Conditions Générales d\'Utilisation' });
    user = makeUser({ name: name || email.split('@')[0], email, provider: 'google', emailVerified: true, cguAcceptedAt: Date.now(), registerIp: clientIp(req) });
    db.users.push(user);
  }
  openSession(res, user, req); */
});

app.post('/api/auth/forgot', async (req, res) => {
  const email = normEmail(req.body.email);
  if (rateLimit(`forgot:${email}`))
    return res.status(429).json({ error: 'Trop de demandes — réessayez plus tard' });
  const user = findByEmail(email);
  let code = null;
  // Réponse identique que le compte existe ou non (pas d'énumération d'emails)
  if (user) {
    code = sixDigitCode();
    try {
      await deliverAuthCode(email, code, 'reset', req.lang);
    } catch (error) {
      return res.status(503).json({ error: error.message });
    }
    db.resets[email] = { code, expires: Date.now() + 15 * 60e3 };
    save();
  }
  res.json({
    ok: true,
    demoHint: demoHintFor(code || '—', req.lang),
  });
});

app.post('/api/auth/reset', async (req, res) => {
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
  delete db.resets[email];
  // Sécurité : invalide toutes les sessions existantes du compte
  await clearUserSessions(user.id);
  if (!canAccessApp(user)) {
    save();
    return res.json({
      needsVerification: true,
      pendingEmail: email,
      message: 'Mot de passe mis a jour. Verifiez maintenant votre adresse email pour acceder a l application.',
    });
  }
  await openSession(res, user, req);
});

app.post('/api/auth/logout', auth, async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  await deletePersistentSession(token);
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

app.use('/api', createAccountSettingsRouter({
  auth,
  settings: repositories.settings,
  auditChange,
  publicUser,
  save,
}));

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
app.post('/api/profile', auth, async (req, res) => {
  const before = { ...req.user };
  const { name, city, phone } = req.body;
  if (name !== undefined) {
    if (String(name).trim().length < 2) return res.status(400).json({ error: 'Nom trop court' });
    req.user.name = String(name).trim().slice(0, 60);
  }
  if (city !== undefined) req.user.city = String(city).trim().slice(0, 60);
  if (phone !== undefined) req.user.phone = String(phone).trim().slice(0, 20);
  await auditChange({
    actorId: req.user.id, action: 'profile.update', targetType: 'user', targetId: req.user.id,
    subjectUserId: req.user.id, before, after: req.user, fields: ['name', 'city', 'phone'],
  });
  save();
  res.json({ user: publicUser(req.user) });
});

app.post('/api/profile/photo', auth, async (req, res) => {
  const before = { hasPhoto: !!req.user.photoUrl };
  const { dataUrl } = req.body;
  if (dataUrl === null) {
    req.user.photoUrl = null;
    await auditChange({
      actorId: req.user.id, action: 'profile.photo.update', targetType: 'user', targetId: req.user.id,
      subjectUserId: req.user.id, before, after: { hasPhoto: false }, fields: ['hasPhoto'],
    });
    save();
    return res.json({ user: publicUser(req.user) });
  }
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(dataUrl || ''))
    return res.status(400).json({ error: 'Format d\'image invalide (JPEG, PNG ou WebP)' });
  if (dataUrl.length > 700 * 1024)
    return res.status(400).json({ error: 'Image trop lourde (500 Ko max après compression)' });
  req.user.photoUrl = dataUrl;
  await auditChange({
    actorId: req.user.id, action: 'profile.photo.update', targetType: 'user', targetId: req.user.id,
    subjectUserId: req.user.id, before, after: { hasPhoto: true }, fields: ['hasPhoto'],
  });
  save();
  res.json({ user: publicUser(req.user) });
});

// ---------- RGPD : export et suppression de compte (PRD §6) ----------
app.post('/api/profile/password', auth, async (req, res) => {
  const currentPassword = String(req.body?.currentPassword || '');
  const password = String(req.body?.password || '');
  if (!req.user.passwordHash || !verifyPassword(currentPassword, req.user.passwordHash))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe : 8 caracteres minimum' });
  req.user.passwordHash = hashPassword(password);
  await clearUserSessions(req.user.id);
  await auditChange({
    actorId: req.user.id, action: 'profile.password.update', targetType: 'user', targetId: req.user.id,
    subjectUserId: req.user.id, before: {}, after: {}, fields: [], meta: { recordEmpty: true },
  });
  save();
  res.json({ ok: true, mustRelogin: true });
});

function accountConfirmation(userId) {
  if (!db.accountConfirmations) db.accountConfirmations = {};
  return db.accountConfirmations[userId] || null;
}

app.post('/api/profile/email/change/request', auth, async (req, res) => {
  const newEmail = normEmail(req.body?.newEmail);
  const currentPassword = String(req.body?.currentPassword || '');
  if (!EMAIL_RE.test(newEmail)) return res.status(400).json({ error: 'Adresse email invalide' });
  if (newEmail === req.user.email) return res.status(400).json({ error: 'Utilisez une adresse email differente' });
  if (findByEmail(newEmail)) return res.status(400).json({ error: 'Un compte utilise deja cette adresse email' });
  if (!req.user.passwordHash || !verifyPassword(currentPassword, req.user.passwordHash))
    return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
  if (rateLimit(`change-email:${req.user.id}`)) return res.status(429).json({ error: 'Trop de demandes. Reessayez plus tard.' });
  const code = sixDigitCode();
  try {
    await deliverAuthCode(newEmail, code, 'change_email', req.lang);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  db.accountConfirmations[req.user.id] = { type: 'change_email', newEmail, code, expires: Date.now() + 15 * 60e3 };
  save();
  res.json({ ok: true, demoHint: demoHintFor(code, req.lang) });
});

app.post('/api/profile/email/change/confirm', auth, async (req, res) => {
  const pending = accountConfirmation(req.user.id);
  const code = String(req.body?.code || '').trim();
  if (!pending || pending.type !== 'change_email' || pending.expires < Date.now())
    return res.status(400).json({ error: 'Code expire. Recommencez la demande.' });
  if (pending.code !== code) return res.status(400).json({ error: 'Code incorrect' });
  if (findByEmail(pending.newEmail)) return res.status(400).json({ error: 'Cette adresse email est deja utilisee' });
  const previousEmail = req.user.email;
  req.user.email = pending.newEmail;
  req.user.emailVerified = true;
  delete db.accountConfirmations[req.user.id];
  await clearUserSessions(req.user.id);
  await auditChange({
    actorId: req.user.id, action: 'profile.email.update', targetType: 'user', targetId: req.user.id,
    subjectUserId: req.user.id, before: { email: previousEmail }, after: req.user, fields: ['email'],
  });
  save();
  res.json({ ok: true, mustRelogin: true });
});

app.post('/api/profile/delete/request', auth, async (req, res) => {
  if (rateLimit(`delete-account:${req.user.id}`)) return res.status(429).json({ error: 'Trop de demandes. Reessayez plus tard.' });
  const code = sixDigitCode();
  try {
    await deliverAuthCode(req.user.email, code, 'delete_account', req.lang);
  } catch (error) {
    return res.status(503).json({ error: error.message });
  }
  db.accountConfirmations[req.user.id] = { type: 'delete_account', code, expires: Date.now() + 15 * 60e3 };
  save();
  res.json({ ok: true, demoHint: demoHintFor(code, req.lang) });
});

app.get('/api/profile/export', auth, async (req, res) => {
  const uid = req.user.id;
  const { passwordHash, ...userSafe } = req.user;
  const data = {
    exportedAt: new Date().toISOString(),
    user: userSafe,
    listings: db.listings.filter((l) => l.senderId === uid),
    trips: db.trips.filter((t) => t.travelerId === uid),
    transactions: db.transactions.filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(uid)),
    messages: await repositories.messages.listFromUser(uid),
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

app.post('/api/profile/delete', auth, async (req, res) => {
  const pending = accountConfirmation(req.user.id);
  const code = String(req.body?.code || '').trim();
  if (!pending || pending.type !== 'delete_account' || pending.expires < Date.now())
    return res.status(400).json({ error: 'Code de confirmation expire. Demandez-en un nouveau.' });
  if (pending.code !== code) return res.status(400).json({ error: 'Code de confirmation incorrect' });
  const uid = req.user.id;
  const activeTx = db.transactions.filter(
    (t) => [t.senderId, t.travelerId, t.recipientId].includes(uid) && !CLOSED_STATUSES.includes(t.status)
  );
  if (activeTx.length > 0)
    return res.status(400).json({ error: `Impossible : ${activeTx.length} transaction(s) encore en cours. Terminez-les d'abord.` });

  const beforeDeletion = { ...req.user };

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
  delete db.accountConfirmations[uid];
  // Purge des images KYC (données biométriques) — on conserve seulement la trace de décision
  // anonymisée pour l'audit de conformité, sans les photos.
  repositories.kyc.purgeSensitiveForUser(uid);
  await clearUserSessions(uid);
  await auditChange({
    actorId: uid, action: 'profile.delete', targetType: 'user', targetId: uid,
    subjectUserId: uid, before: beforeDeletion, after: req.user,
    fields: ['name', 'email', 'phone', 'city', 'provider'], meta: { recordEmpty: true },
  });
  save();
  res.json({ ok: true });
});

// ---------- Notifications ----------
app.use('/api/notifications', createNotificationsRouter({
  auth,
  notifications: repositories.notifications,
  runMatchingOfferReminders,
  renderNotification,
  save,
}));

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
    customs: localizeCustoms(CUSTOMS, req.lang),
  });
});

function localizedListingView(listing, lang = 'fr') {
  if (!listing) return listing;
  const category = combinedWhitelist().find((item) => item.id === listing.categoryId)
    || BLACKLIST.find((item) => item.id === listing.categoryId);
  return category
    ? { ...listing, categoryLabel: localizeCategory(category, lang).label }
    : { ...listing };
}

function localeForLang(lang) {
  return lang === 'nl' ? 'nl-BE' : lang === 'ar' ? 'ar-MA' : 'fr-BE';
}

// ---------- Trajets voyageur (PRD §2.1) ----------
function complianceCenterFor(user, lang = 'fr') {
  const localizedCustoms = localizeCustoms(CUSTOMS, lang);
  const localizedAllowed = combinedWhitelist().map((category) => localizeCategory(category, lang));
  const localizedForbidden = BLACKLIST.map((category) => localizeCategory(category, lang));
  const localizedCategoryLabel = (listing) => {
    const category = combinedWhitelist().find((item) => item.id === listing.categoryId)
      || BLACKLIST.find((item) => item.id === listing.categoryId);
    return category ? localizeCategory(category, lang).label : listing.categoryLabel;
  };
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
    corridors: Object.entries(localizedCustoms).map(([id, c]) => ({
      id,
      label: c.label,
      franchise: c.franchise,
      rules: c.rules,
      limitEur: id === 'MA-EU' ? 430 : 185,
    })),
    catalogue: {
      allowed: localizedAllowed,
      forbidden: localizedForbidden,
      grayExamples: gray.slice(0, 4).map((i) => ({
        id: i.listing.id,
        title: i.listing.title,
        categoryLabel: localizedCategoryLabel(i.listing),
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
        categoryLabel: localizedCategoryLabel(i.listing),
        action: i.action,
      })),
    items,
  };
}

app.get('/api/compliance-center', auth, (req, res) => {
  res.json({ compliance: complianceCenterFor(req.user, req.lang) });
});

const TRIP_TRANSPORT_MODES = new Set(['plane', 'car']);

function tripTransportMode(value) {
  return value === 'car' ? 'car' : 'plane';
}

app.get('/api/trips/mine', auth, (req, res) => {
  const trips = db.trips
    .filter((t) => t.travelerId === req.user.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((t) => {
      const view = tripPostView(t, req.user);
      const operations = db.transactions.filter((tx) => tx.tripId === t.id && !CLOSED_STATUSES.includes(tx.status));
      return { ...view, activeOperations: operations.length };
    });
  res.json({ trips });
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
      .map((l) => ({ ...localizedListingView(l, req.lang), sender: publicUser(findUser(l.senderId)) }));
    const totalPay = matches.reduce((s, l) => s + l.travelerPay, 0);
    const totalWeight = matches.reduce((s, l) => s + l.weightKg, 0);
    const totalValue = matches.reduce((s, l) => s + l.valueEur, 0);
    const corridorKey = trip.from === 'Casablanca' ? 'MA-EU' : 'EU-MA';
    const corridor = localizeCustoms(CUSTOMS, req.lang)[corridorKey];
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

app.post('/api/trips', auth, async (req, res) => {
  if (req.user.kycStatus !== 'verified')
    return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });
  const { from, to, date, departureDate, capacityKg, price, description, conditions, transportMode = 'plane' } = req.body;
  const travelDate = date || departureDate;
  if (!from || !to || !travelDate) return res.status(400).json({ error: 'Trajet, sens et date requis' });
  if (from === to) return res.status(400).json({ error: 'Départ et arrivée identiques' });
  if (!TRIP_TRANSPORT_MODES.has(transportMode))
    return res.status(400).json({ error: 'Type de transport invalide' });
  if (new Date(travelDate) < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'La date est déjà passée' });
  const proposedPrice = positiveNumber(price === undefined ? 25 : price);
  if (proposedPrice === null) return res.status(400).json({ error: 'Prix invalide' });
  const trip = {
    id: newId('t'), travelerId: req.user.id,
    from: String(from).trim().slice(0, 60),
    to: String(to).trim().slice(0, 60),
    date: travelDate,
    departureDate: travelDate,
    transportMode,
    price: proposedPrice,
    currency: 'EUR',
    description: String(description || 'Voyageur disponible pour transporter un colis propre et conforme.').trim().slice(0, 700),
    conditions: String(conditions || 'Petit colis propre, ferme et conforme aux regles douanieres.').trim().slice(0, 500),
    status: 'published',
    capacityKg: Math.max(1, Math.min(30, Number(capacityKg) || 5)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  db.trips.push(trip);
  await auditChange({
    actorId: req.user.id, action: 'trip.create', targetType: 'trip', targetId: trip.id,
    subjectUserId: req.user.id, before: {}, after: trip,
    fields: ['from', 'to', 'departureDate', 'transportMode', 'capacityKg', 'price', 'description', 'conditions', 'status'],
  });
  save();
  res.json({ trip: tripPostView(trip, req.user) });
});

app.patch('/api/trips/:id', auth, async (req, res) => {
  const trip = db.trips.find((t) => t.id === req.params.id && t.travelerId === req.user.id);
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
  if ((trip.status || 'published') !== 'published')
    return res.status(400).json({ error: 'Trajet indisponible' });
  const activeOperations = db.transactions.filter((tx) => tx.tripId === trip.id && !CLOSED_STATUSES.includes(tx.status));
  if (activeOperations.length > 0)
    return res.status(400).json({ error: 'Impossible de modifier un trajet avec operation en cours' });

  const before = { ...trip };

  const { from, to, date, departureDate, capacityKg, price, description, conditions, transportMode } = req.body || {};
  const travelDate = date || departureDate || trip.departureDate || trip.date;
  const nextFrom = String(from ?? trip.from).trim().slice(0, 60);
  const nextTo = String(to ?? trip.to).trim().slice(0, 60);
  const nextTransportMode = transportMode === undefined ? tripTransportMode(trip.transportMode) : transportMode;
  if (!nextFrom || !nextTo || !travelDate) return res.status(400).json({ error: 'Trajet, sens et date requis' });
  if (nextFrom === nextTo) return res.status(400).json({ error: 'Depart et arrivee identiques' });
  if (!TRIP_TRANSPORT_MODES.has(nextTransportMode))
    return res.status(400).json({ error: 'Type de transport invalide' });
  if (new Date(travelDate) < new Date(new Date().toDateString()))
    return res.status(400).json({ error: 'La date est deja passee' });
  const proposedPrice = positiveNumber(price === undefined ? trip.price : price);
  if (proposedPrice === null) return res.status(400).json({ error: 'Prix invalide' });

  trip.from = nextFrom;
  trip.to = nextTo;
  trip.date = travelDate;
  trip.departureDate = travelDate;
  trip.transportMode = nextTransportMode;
  trip.price = proposedPrice;
  trip.capacityKg = Math.max(1, Math.min(30, Number(capacityKg ?? trip.capacityKg) || 5));
  trip.description = String(description ?? trip.description ?? '').trim().slice(0, 700)
    || 'Voyageur disponible pour transporter un colis propre et conforme.';
  trip.conditions = String(conditions ?? trip.conditions ?? '').trim().slice(0, 500)
    || 'Petit colis propre, ferme et conforme aux regles douanieres.';
  trip.updatedAt = Date.now();
  await auditChange({
    actorId: req.user.id, action: 'trip.update', targetType: 'trip', targetId: trip.id,
    subjectUserId: req.user.id, before, after: trip,
    fields: ['from', 'to', 'departureDate', 'transportMode', 'capacityKg', 'price', 'description', 'conditions'],
  });
  save();
  res.json({ trip: tripPostView(trip, req.user) });
});

app.delete('/api/trips/:id', auth, async (req, res) => {
  const trip = db.trips.find((t) => t.id === req.params.id && t.travelerId === req.user.id);
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
  const activeOperations = db.transactions.filter((tx) => tx.tripId === trip.id && !CLOSED_STATUSES.includes(tx.status));
  if (activeOperations.length > 0)
    return res.status(400).json({ error: 'Impossible de retirer un trajet avec operation en cours' });
  const before = { ...trip };
  trip.status = 'removed';
  trip.removedAt = Date.now();
  db.savedTrips = db.savedTrips.filter((saved) => saved.tripId !== trip.id);
  await auditChange({
    actorId: req.user.id, action: 'trip.remove', targetType: 'trip', targetId: trip.id,
    subjectUserId: req.user.id, before, after: trip, fields: ['status'],
  });
  save();
  res.json({ ok: true });
});

// Compatibilité annonce ↔ trajet : même sens, fenêtre de dates qui contient la date du vol, poids ≤ capacité.
function matchesTrip(listing, trip) {
  return listing.from === trip.from && listing.to === trip.to
    && listing.dateFrom <= trip.date && trip.date <= listing.dateTo
    && (!listing.weightKg || listing.weightKg <= trip.capacityKg);
}

function tripPostView(trip, user = null) {
  const traveler = findUser(trip.travelerId);
  const saved = user ? db.savedTrips.some((s) => s.userId === user.id && s.tripId === trip.id) : false;
  const price = Number(trip.price ?? trip.proposedPrice ?? trip.travelerPay ?? trip.priceEur ?? 25);
  return {
    ...trip,
    departureDate: trip.departureDate || trip.date,
    ticketDate: trip.ticketDate || trip.date,
    transportMode: tripTransportMode(trip.transportMode),
    price,
    currency: trip.currency || 'EUR',
    capacityKg: Number(trip.capacityKg || 0),
    description: trip.description || 'Voyageur disponible pour transporter un colis propre et conforme.',
    conditions: trip.conditions || 'Petit colis propre, ferme et conforme aux regles douanieres.',
    status: trip.status || (trip.date < TODAY_ISO() ? 'expired' : 'published'),
    traveler: publicUser(traveler),
    saved,
  };
}

function availableTripPosts(user, query = {}) {
  const today = TODAY_ISO();
  let trips = db.trips
    .map((trip) => ({ ...trip, status: trip.status || (trip.date < today ? 'expired' : 'published') }))
    .filter((trip) => trip.status === 'published' && (trip.departureDate || trip.date) >= today)
    .filter((trip) => findUser(trip.travelerId)?.kycStatus === 'verified');
  if (query.excludeMine === '1') trips = trips.filter((trip) => trip.travelerId !== user.id);
  if (query.from) trips = trips.filter((t) => t.from.toLowerCase().includes(String(query.from).toLowerCase()));
  if (query.to) trips = trips.filter((t) => t.to.toLowerCase().includes(String(query.to).toLowerCase()));
  if (query.date) trips = trips.filter((t) => (t.departureDate || t.date) >= String(query.date));
  const minCapacity = Number(query.capacityKg);
  if (Number.isFinite(minCapacity) && minCapacity >= 0 && String(query.capacityKg).trim() !== '')
    trips = trips.filter((t) => Number(t.capacityKg || 0) >= minCapacity);
  const maxPrice = Number(query.maxPrice);
  if (Number.isFinite(maxPrice) && maxPrice >= 0 && String(query.maxPrice).trim() !== '')
    trips = trips.filter((t) => Number(t.price ?? t.proposedPrice ?? 25) <= maxPrice);
  if (query.q) {
    const needle = String(query.q).toLowerCase();
    trips = trips.filter((t) => `${t.from} ${t.to} ${t.description || ''} ${findUser(t.travelerId)?.name || ''}`.toLowerCase().includes(needle));
  }
  return trips.sort((a, b) => (a.departureDate || a.date).localeCompare(b.departureDate || b.date)).map((t) => tripPostView(t, user));
}

function cleanupSavedTrips() {
  const today = TODAY_ISO();
  const before = db.savedTrips.length;
  db.savedTrips = db.savedTrips.filter((saved) => {
    const trip = db.trips.find((t) => t.id === saved.tripId);
    return trip && (trip.status || 'published') === 'published' && (trip.departureDate || trip.date) >= today;
  });
  return before !== db.savedTrips.length;
}

function conversationParticipants(conversation, viewerId) {
  return conversation.participantIds.map((id) => publicUser(findUser(id))).filter(Boolean);
}

function operationAction(tx, viewerId) {
  if (!tx) return { actionRequired: false, actionKey: null, actionLabel: null, actionHref: null };
  const status = tx.operationStatus || (tx.status === 'accepted' ? 'paiement_requis' : tx.status);
  const href = `/operations/${tx.id}`;
  if (status === 'attente_confirmation') {
    return {
      actionRequired: tx.travelerId === viewerId,
      actionKey: tx.travelerId === viewerId ? 'messages.action.confirmTrip' : 'messages.action.waitTraveler',
      actionLabel: tx.travelerId === viewerId ? 'Confirmer le trajet' : 'En attente du voyageur',
      actionHref: href,
    };
  }
  if (status === 'paiement_requis') {
    return {
      actionRequired: tx.senderId === viewerId,
      actionKey: tx.senderId === viewerId ? 'messages.action.payContinue' : 'messages.action.paymentExpected',
      actionLabel: tx.senderId === viewerId ? 'Payer pour continuer' : 'Paiement attendu',
      actionHref: href,
    };
  }
  if (status === 'paye') return { actionRequired: true, actionKey: 'messages.action.organizeHandoff', actionLabel: 'Organiser la remise', actionHref: href };
  if (status === 'collecte_prevue') return { actionRequired: true, actionKey: 'messages.action.confirmPickup', actionLabel: 'Confirmer la collecte', actionHref: href };
  if (status === 'en_transport') return { actionRequired: true, actionKey: 'messages.action.trackDelivery', actionLabel: 'Suivre la livraison', actionHref: href };
  if (status === 'litige') return { actionRequired: true, actionKey: 'messages.action.trackDispute', actionLabel: 'Suivre le litige', actionHref: href };
  return { actionRequired: false, actionKey: 'messages.action.viewRecap', actionLabel: 'Consulter le recap', actionHref: href };
}

function conversationStatus(conversation, viewerId, operation) {
  if ((conversation.archivedBy || []).includes(viewerId)) return 'archived';
  if (operation) {
    const status = operation.operationStatus || operation.status;
    if (['termine', 'released', 'refunded', 'cancelled'].includes(status)) return 'completed';
    const action = operationAction(operation, viewerId);
    return action.actionRequired ? 'waiting_user' : 'waiting_other';
  }
  const trip = conversation.tripId ? db.trips.find((t) => t.id === conversation.tripId) : null;
  if (trip && (trip.departureDate || trip.date) < TODAY_ISO()) return 'completed';
  return 'active';
}

function conversationContextSummary({ trip, operation }) {
  if (operation) {
    return {
      type: 'operation',
      labelKey: operation.title ? null : 'messages.operation.active',
      label: operation.title || 'Operation en cours',
      detail: operation.operationStatus || operation.status || 'en cours',
      href: `/operations/${operation.id}`,
    };
  }
  if (trip) {
    return {
      type: 'trip',
      label: `${trip.from} -> ${trip.to}`,
      detail: trip.departureDate || trip.date || null,
      href: `/trajets/${trip.id}`,
    };
  }
  return { type: 'direct', labelKey: 'messages.status.direct', label: 'Discussion directe', detail: null, href: null };
}

function conversationView(conversation, viewerId) {
  const messages = db.messages.filter((m) => m.conversationId === conversation.id).sort((a, b) => a.at - b.at);
  const lastMessage = messages[messages.length - 1] || null;
  const unread = messages.filter((m) => m.from !== viewerId && !(m.readBy || []).includes(viewerId)).length;
  const trip = conversation.tripId ? db.trips.find((t) => t.id === conversation.tripId) : null;
  const operation = conversation.operationId ? db.transactions.find((t) => t.id === conversation.operationId) : null;
  const operationUi = operation ? operationView(operation, findUser(viewerId)) : null;
  const tripUi = trip ? tripPostView(trip) : null;
  const action = operation ? operationAction(operation, viewerId) : {
    actionRequired: false,
    actionKey: trip ? 'messages.action.viewTrip' : null,
    actionLabel: trip ? 'Voir le trajet' : null,
    actionHref: trip ? `/trajets/${trip.id}` : null,
  };
  const status = conversationStatus(conversation, viewerId, operation);
  const lastMessageAt = lastMessage?.at || conversation.lastMessageAt || conversation.createdAt;
  const lastMessagePreview = lastMessage?.flagged
    ? 'Message signale par securite'
    : (lastMessage?.text || (lastMessage?.location ? 'Localisation partagee' : lastMessage?.attachments?.length ? 'Photo jointe' : trip ? 'Conversation liee a un trajet' : operation ? 'Conversation liee a une operation' : 'Nouvelle conversation'));
  const lastMessagePreviewKey = lastMessage?.flagged
    ? 'messages.preview.flagged'
    : (lastMessage?.text ? null : lastMessage?.location ? 'messages.preview.location' : lastMessage?.attachments?.length ? 'messages.preview.photo' : trip ? 'messages.preview.trip' : operation ? 'messages.preview.operation' : 'messages.preview.new');
  const participants = conversationParticipants(conversation, viewerId);
  const other = participants.find((user) => user.id !== viewerId) || null;
  return {
    ...conversation,
    participants,
    other,
    otherOnline: !!other && realtimeClients.has(other.id),
    otherLastSeenAt: other ? (lastSeenByUser.get(other.id) || null) : null,
    lastMessage,
    lastMessageAt,
    lastMessagePreview,
    lastMessagePreviewKey,
    unread,
    unreadCount: unread,
    status,
    archived: (conversation.archivedBy || []).includes(viewerId),
    pinned: (conversation.pinnedBy || []).includes(viewerId),
    blocked: (conversation.blockedBy || []).includes(viewerId),
    blockedByOther: !!other && blockedUserIds(findUser(other.id)).has(viewerId),
    actionRequired: action.actionRequired,
    actionKey: action.actionKey,
    actionLabel: action.actionLabel,
    actionHref: action.actionHref,
    contextType: operation ? 'operation' : trip ? 'trip' : 'direct',
    context: conversationContextSummary({ trip: tripUi, operation: operationUi }),
    updatedAt: lastMessageAt,
    trip: tripUi,
    operation: operationUi,
  };
}

function adminConversationModerationView(conversation) {
  if (!conversation) return null;
  const trip = conversation.tripId ? db.trips.find((t) => t.id === conversation.tripId) : null;
  const operation = conversation.operationId ? db.transactions.find((t) => t.id === conversation.operationId) : null;
  const operationUi = operation ? operationView(operation, findUser(conversation.participantIds[0])) : null;
  const tripUi = trip ? tripPostView(trip) : null;
  const reports = (conversation.reports || [])
    .slice()
    .sort((a, b) => b.at - a.at)
    .map((report) => ({
      ...report,
      reporter: publicUser(findUser(report.reporterId)),
    }));
  const messages = conversationMessages(conversation)
    .slice(-8)
    .map((message) => ({
      ...message,
      fromUser: message.from ? publicUser(findUser(message.from)) : null,
    }));
  return {
    id: conversation.id,
    createdAt: conversation.createdAt,
    updatedAt: conversation.lastMessageAt || conversation.createdAt,
    contextType: operation ? 'operation' : trip ? 'trip' : 'direct',
    context: conversationContextSummary({ trip: tripUi, operation: operationUi }),
    participants: conversation.participantIds.map((id) => publicUser(findUser(id))).filter(Boolean),
    reportCount: reports.length,
    reports,
    safetyIncidents: (conversation.safetyIncidents || []).slice().sort((a, b) => b.at - a.at).slice(0, 12).map((incident) => ({
      ...incident,
      user: publicUser(findUser(incident.userId)),
    })),
    messages,
    lastMessagePreview: messages[messages.length - 1]?.text || null,
    moderationStatus: conversation.moderationStatus || 'pending',
  };
}

function findOrCreateConversation({ participantIds, tripId = null, operationId = null }) {
  const ids = [...new Set(participantIds)].sort();
  let conversation = db.conversations.find((c) =>
    c.participantIds.slice().sort().join('|') === ids.join('|')
    && (c.tripId || null) === (tripId || null)
    && (c.operationId || null) === (operationId || null)
  );
  if (!conversation) {
    conversation = { id: newId('conv'), participantIds: ids, tripId, operationId, lastMessageAt: Date.now(), createdAt: Date.now() };
    db.conversations.push(conversation);
  }
  return conversation;
}

const SYSTEM_EVENT_TEXT = {
  trip_accepted: 'Discussion ouverte pour ce trajet.',
  traveler_confirmed: 'Trajet confirme par le voyageur.',
  operation_paid: 'Paiement recu. La remise peut etre organisee.',
  rendezvous_confirmed: 'Rendez-vous de remise planifie.',
  pickup_confirmed: 'Colis remis au voyageur.',
  delivery_confirmed: 'Livraison confirmee.',
  traveler_rejected: 'Operation refusee par le voyageur.',
  sender_cancelled: 'Operation annulee.',
  dispute_opened: 'Litige ouvert.',
  evidence_added: 'Element ajoute au litige.',
};

function conversationMessages(conversation) {
  const userMessages = db.messages
    .filter((m) => m.conversationId === conversation.id)
    .map((m) => ({
      ...m,
      type: m.type || (m.flagged ? 'warning' : 'text'),
      deliveryStatus: m.deliveryStatus || 'sent',
      createdAt: m.createdAt || m.at,
      updatedAt: m.updatedAt || m.at,
    }));
  const operation = conversation.operationId ? db.transactions.find((t) => t.id === conversation.operationId) : null;
  const systemMessages = (operation?.events || [])
    .filter((event) => SYSTEM_EVENT_TEXT[event.type])
    .map((event) => ({
      id: `sys-${event.id}`,
      conversationId: conversation.id,
      txId: operation.id,
      from: null,
      text: SYSTEM_EVENT_TEXT[event.type],
      textKey: `messages.system.${event.type}`,
      type: 'system',
      systemEvent: { type: event.type, meta: event.meta || {} },
      readBy: conversation.participantIds,
      at: event.at,
      createdAt: event.at,
      updatedAt: event.at,
      deliveryStatus: 'sent',
    }));
  return [...systemMessages, ...userMessages].sort((a, b) => a.at - b.at);
}

function conversationMessagesPage(conversation, query = {}) {
  let messages = conversationMessages(conversation);
  const q = String(query.q || '').trim().toLowerCase();
  if (q) {
    messages = messages.filter((message) =>
      `${message.text || ''} ${message.location?.label || ''} ${message.location?.city || ''} ${message.systemEvent?.type || ''} ${(message.attachments || []).map((a) => a.name).join(' ')}`.toLowerCase().includes(q)
    );
  }
  const before = Number(query.before || 0);
  if (before > 0) messages = messages.filter((message) => message.at < before);
  const requestedLimit = Number(query.limit || 0);
  const limit = requestedLimit > 0 ? Math.max(1, Math.min(100, requestedLimit)) : 0;
  const total = messages.length;
  if (limit > 0 && messages.length > limit) messages = messages.slice(-limit);
  const nextBefore = limit > 0 && total > messages.length ? messages[0]?.at || null : null;
  return {
    messages,
    page: {
      limit: limit || null,
      total,
      hasMore: !!nextBefore,
      nextBefore,
      q,
    },
  };
}

const MESSAGE_SAFETY_ATTEMPT_WINDOW_MS = 24 * 60 * 60 * 1000;
const MESSAGE_SAFETY_COOLDOWN_MS = 30 * 60 * 1000;
const MESSAGE_SAFETY_STRIKE_LIMIT = 3;

function blockedUserIds(user) {
  return new Set(Array.isArray(user?.blockedUserIds) ? user.blockedUserIds : []);
}

function areConversationParticipantsBlocked(conversation, userId) {
  const otherId = conversation.participantIds.find((id) => id !== userId);
  const other = otherId ? findUser(otherId) : null;
  return !!(other && (blockedUserIds(findUser(userId)).has(otherId) || blockedUserIds(other).has(userId)));
}

function registerMessageSafetyAttempt({ user, conversation, analysis }) {
  const now = Date.now();
  const prior = (user.messageSafetyAttempts || []).filter((item) => item.at > now - MESSAGE_SAFETY_ATTEMPT_WINDOW_MS);
  const attempt = { id: newId('msa'), at: now, conversationId: conversation?.id || null, categories: analysis.categories, severity: analysis.severity };
  prior.push(attempt);
  user.messageSafetyAttempts = prior;
  const highCount = prior.filter((item) => item.severity === 'high').length;
  if (highCount >= MESSAGE_SAFETY_STRIKE_LIMIT) user.messageSafetyBlockedUntil = Math.max(user.messageSafetyBlockedUntil || 0, now + MESSAGE_SAFETY_COOLDOWN_MS);
  if (conversation) {
    conversation.safetyIncidents = [...(conversation.safetyIncidents || []), { ...attempt, userId: user.id }].slice(-50);
    const hasQueueItem = repositories.reviewQueue.open().some((item) => item.type === 'conversation' && item.refId === conversation.id);
    if (!hasQueueItem && (analysis.severity === 'high' || highCount >= MESSAGE_SAFETY_STRIKE_LIMIT)) repositories.reviewQueue.append({ type: 'conversation', refId: conversation.id });
  }
  return { cooldownUntil: user.messageSafetyBlockedUntil || null, highCount };
}

function messageSafetyError({ analysis, cooldownUntil = null }) {
  return {
    code: cooldownUntil ? 'message_safety_cooldown' : 'message_safety_blocked',
    categories: analysis.categories,
    cooldownUntil,
    error: cooldownUntil
      ? 'Pour votre securite, l envoi est temporairement limite. Gardez les echanges et le paiement dans Wigofly.'
      : 'Pour votre securite, les coordonnees, liens, reseaux sociaux et paiements externes ne peuvent pas etre partages. Gardez vos echanges dans Wigofly.',
  };
}

function operationView(tx, user) {
  const listing = db.listings.find((l) => l.id === tx.listingId) || null;
  const trip = db.trips.find((t) => t.id === tx.tripId) || null;
  const dispute = db.disputes.find((d) => d.txId === tx.id && d.status === 'open') || db.disputes.find((d) => d.txId === tx.id) || null;
  const statusMap = {
    accepted: 'paiement_requis',
    sealed: 'collecte_prevue',
    in_transit: 'en_transport',
    disputed: 'litige',
    released: 'termine',
    refunded: 'termine',
    cancelled: 'termine',
  };
  const view = {
    ...txView(user)(tx),
    operationStatus: tx.operationStatus || statusMap[tx.status] || 'attente_confirmation',
    title: trip ? `${trip.from} -> ${trip.to}` : listing?.title || tx.id,
    trip: trip ? tripPostView(trip, user) : null,
    price: tx.price || tx.escrow?.travelerPay || listing?.travelerPay || trip?.price || 0,
    dispute: dispute ? disputeView(dispute, tx) : null,
  };
  // Never send raw code values, hashes or attempt counters in an operation view.
  // The holder receives a fresh code only through the protected issue endpoints.
  delete view.pickupCode;
  delete view.deliveryCode;
  delete view.securityCodes;
  const status = view.operationStatus;
  const isTraveler = user?.id === tx.travelerId;
  const isSender = user?.id === tx.senderId;
  view.security = {
    pickup: {
      ...operationCodePublicState(tx.securityCodes?.pickup),
      canReveal: status === 'paye' && isTraveler,
      canEnter: status === 'paye' && isSender,
    },
    delivery: {
      ...operationCodePublicState(tx.securityCodes?.delivery),
      canReveal: status === 'en_transport' && isSender,
      canEnter: status === 'en_transport' && isTraveler,
    },
  };
  return view;
}

function operationNeedsAction(tx, userId) {
  const status = tx.operationStatus || (tx.status === 'accepted' ? 'paiement_requis' : tx.status);
  if (status === 'attente_confirmation') return tx.travelerId === userId;
  if (status === 'paiement_requis') return tx.senderId === userId;
  if (status === 'paye') return tx.securityCodes?.pickup?.issuedAt ? tx.senderId === userId : tx.travelerId === userId;
  if (status === 'en_transport') return tx.securityCodes?.delivery?.issuedAt ? tx.travelerId === userId : tx.senderId === userId;
  if (status === 'litige') return isPartyToTx(tx, userId);
  return false;
}

function unreadConversationCount(userId) {
  return db.conversations
    .filter((conversation) => conversation.participantIds.includes(userId))
    .reduce((sum, conversation) => {
      const unread = db.messages.filter((m) =>
        m.conversationId === conversation.id
        && m.from !== userId
        && !(m.readBy || []).includes(userId)
      ).length;
      return sum + unread;
    }, 0);
}

function markConversationRead(conversationId, userId) {
  let changed = false;
  for (const message of db.messages) {
    if (message.conversationId !== conversationId || message.from === userId) continue;
    const readBy = new Set(message.readBy || []);
    if (!readBy.has(userId)) {
      readBy.add(userId);
      message.readBy = [...readBy];
      changed = true;
    }
  }
  return changed;
}

// ---------- Nouvelle experience simple : trajets voyageurs ----------
app.get('/api/navigation-summary', auth, (req, res) => {
  const operationsActionRequired = db.transactions
    .filter((tx) => isPartyToTx(tx, req.user.id))
    .filter((tx) => !CLOSED_STATUSES.includes(tx.status))
    .filter((tx) => operationNeedsAction(tx, req.user.id))
    .length;
  res.json({
    messagesUnread: unreadConversationCount(req.user.id),
    operationsActionRequired,
  });
});

app.get('/api/trips', auth, (req, res) => {
  const trips = availableTripPosts(req.user, req.query);
  res.json({ trips });
});

app.get('/api/trips/overview', auth, (req, res) => {
  const myTrips = db.trips
    .filter((t) => t.travelerId === req.user.id)
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((t) => {
      const view = tripPostView(t, req.user);
      const operations = db.transactions.filter((tx) => tx.tripId === t.id && !CLOSED_STATUSES.includes(tx.status));
      return { ...view, activeOperations: operations.length };
    });
  const trips = availableTripPosts(req.user, { ...req.query, excludeMine: '1' });
  res.json({ trips, myTrips });
});

app.get('/api/trips/:id', auth, (req, res, next) => {
  if (['mine', 'mission'].includes(req.params.id)) return next();
  const trip = db.trips.find((t) => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
  const view = tripPostView(trip, req.user);
  if (view.status !== 'published' || view.departureDate < TODAY_ISO())
    return res.status(404).json({ error: 'Trajet expiré ou indisponible' });
  if (trip.travelerId === req.user.id)
    view.activeOperations = db.transactions.filter((tx) => tx.tripId === trip.id && !CLOSED_STATUSES.includes(tx.status)).length;
  res.json({ trip: view });
});

app.post('/api/trips/:id/accept', auth, async (req, res) => {
  const trip = db.trips.find((t) => t.id === req.params.id);
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
  const view = tripPostView(trip, req.user);
  if (view.status !== 'published' || view.departureDate < TODAY_ISO())
    return res.status(400).json({ error: 'Trajet expiré ou indisponible' });
  if (trip.travelerId === req.user.id)
    return res.status(400).json({ error: 'Vous ne pouvez pas accepter votre propre trajet' });
  if (req.user.kycStatus !== 'verified')
    return res.status(403).json({ error: 'Vérification d\'identité requise', needsKyc: true });

  const shipmentType = req.body?.shipmentType === 'document' ? 'document' : 'parcel';
  const documentCount = shipmentType === 'document' ? Number(req.body?.documentCount) : 0;
  const weightKg = shipmentType === 'parcel' ? positiveNumber(req.body?.weightKg ?? view.capacityKg) : 0;
  if (shipmentType === 'document' && (!Number.isInteger(documentCount) || documentCount < 1 || documentCount > 20))
    return res.status(400).json({ error: 'Indiquez entre 1 et 20 documents.' });
  if (shipmentType === 'parcel' && (weightKg === null || weightKg > view.capacityKg))
    return res.status(400).json({ error: `Le colis doit peser entre 0 et ${view.capacityKg} kg.` });
  const price = shipmentType === 'document'
    ? documentCount * 3
    : Math.round((view.price / view.capacityKg) * weightKg * 100) / 100;
  const descriptionParcel = String(req.body?.descriptionParcel || '').trim().slice(0, 500);
  const commission = Math.round(price * 0.18 * 100) / 100;
  const tx = {
    id: newId('tx'),
    tripId: trip.id,
    listingId: null,
    senderId: req.user.id,
    travelerId: trip.travelerId,
    recipientId: req.user.id,
    status: 'accepted',
    operationStatus: 'attente_confirmation',
    price,
    currency: view.currency,
    shipmentType,
    documentCount: shipmentType === 'document' ? documentCount : null,
    weightKg: shipmentType === 'parcel' ? weightKg : 0,
    descriptionParcel,
    paymentStatus: 'pending',
    escrow: createEscrow({ travelerPay: price, commission }),
    securityCodes: {},
    sealingVideo: null,
    events: [],
    createdAt: Date.now(),
  };
  tx.escrow.state = 'pending';
  delete tx.escrow.heldAt;
  addEvent(tx, 'trip_accepted', req.user.id, { tripId: trip.id, price, shipmentType, documentCount: tx.documentCount, weightKg: tx.weightKg });
  db.transactions.push(tx);
  const conversation = findOrCreateConversation({ participantIds: [req.user.id, trip.travelerId], tripId: trip.id, operationId: tx.id });
  await notify([trip.travelerId], { key: 'offer.received', params: { name: req.user.name, title: `${trip.from} -> ${trip.to}` } }, tx.id, 'messages', 'messages');
  save();
  res.json({ operation: operationView(tx, req.user), conversation: conversationView(conversation, req.user.id) });
});

app.get('/api/saved-trips', auth, (req, res) => {
  const changed = cleanupSavedTrips();
  if (changed) save();
  const trips = db.savedTrips
    .filter((s) => s.userId === req.user.id)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((s) => db.trips.find((t) => t.id === s.tripId))
    .filter(Boolean)
    .map((t) => tripPostView(t, req.user));
  res.json({ trips });
});

app.post('/api/saved-trips/:tripId', auth, (req, res) => {
  cleanupSavedTrips();
  const trip = db.trips.find((t) => t.id === req.params.tripId);
  if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
  const view = tripPostView(trip, req.user);
  if (view.status !== 'published' || view.departureDate < TODAY_ISO())
    return res.status(400).json({ error: 'Trajet expiré ou indisponible' });
  let saved = db.savedTrips.find((s) => s.userId === req.user.id && s.tripId === trip.id);
  if (!saved) {
    saved = { id: newId('saved'), userId: req.user.id, tripId: trip.id, createdAt: Date.now() };
    db.savedTrips.push(saved);
  }
  save();
  res.json({ trip: tripPostView(trip, req.user) });
});

app.delete('/api/saved-trips/:tripId', auth, (req, res) => {
  const before = db.savedTrips.length;
  db.savedTrips = db.savedTrips.filter((s) => !(s.userId === req.user.id && s.tripId === req.params.tripId));
  if (before !== db.savedTrips.length) save();
  res.json({ ok: true });
});

app.get('/api/operations', auth, (req, res) => {
  const history = req.query.history === '1';
  const operations = db.transactions
    .filter((t) => [t.senderId, t.travelerId, t.recipientId].includes(req.user.id))
    .filter((t) => history ? CLOSED_STATUSES.includes(t.status) : !CLOSED_STATUSES.includes(t.status))
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((t) => operationView(t, req.user));
  res.json({ operations });
});

app.get('/api/operations/:id', auth, (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx) return res.status(404).json({ error: 'Operation introuvable' });
  if (!isPartyToTx(tx, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/pay', auth, (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Paiement réservé à l expéditeur' });
  if (tx.operationStatus !== 'paiement_requis')
    return res.status(400).json({ error: 'Le paiement attend la confirmation du voyageur' });
  tx.operationStatus = 'paye';
  tx.paymentStatus = 'paid';
  transitionEscrow(tx.escrow, 'held');
  addEvent(tx, 'operation_paid', req.user.id);
  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/pickup-code', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'Ce code est reserve au voyageur' });
  if (tx.operationStatus !== 'paye') return res.status(400).json({ error: 'Le code de remise est disponible apres le paiement.' });
  const code = issueOperationCode(tx, 'pickup', req.user.id);
  addEvent(tx, 'pickup_code_issued', req.user.id, { recipientRole: 'traveler' });
  await audit(req.user.id, 'operation_pickup_code_issued', 'transaction', tx.id, { recipientRole: 'traveler' });
  save();
  res.json({ code, expiresAt: tx.securityCodes.pickup.expiresAt, operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/delivery-code', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Ce code est reserve a l expediteur' });
  if (tx.operationStatus !== 'en_transport') return res.status(400).json({ error: 'Le code de livraison est disponible apres la prise en charge.' });
  const code = issueOperationCode(tx, 'delivery', req.user.id);
  addEvent(tx, 'delivery_code_issued', req.user.id, { recipientRole: 'sender' });
  await audit(req.user.id, 'operation_delivery_code_issued', 'transaction', tx.id, { recipientRole: 'sender' });
  save();
  res.json({ code, expiresAt: tx.securityCodes.delivery.expiresAt, operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/confirm-pickup', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'La remise doit etre confirmee par l expediteur' });
  if (tx.operationStatus !== 'paye') return res.status(400).json({ error: 'La remise ne peut pas etre confirmee a cette etape.' });
  const verification = verifyOperationCode(tx, 'pickup', req.body?.code);
  if (!verification.ok) {
    addEvent(tx, 'pickup_code_failed', req.user.id, { locked: verification.status === 429 });
    await audit(req.user.id, 'operation_pickup_code_failed', 'transaction', tx.id, { locked: verification.status === 429 });
    save();
    return res.status(verification.status).json({ error: verification.error });
  }
  tx.securityCodes.pickup.verifiedAt = Date.now();
  tx.securityCodes.pickup.verifiedBy = req.user.id;
  tx.operationStatus = 'en_transport';
  tx.status = 'in_transit';
  addEvent(tx, 'pickup_code_verified', req.user.id, { proof: 'traveler_code' });
  await audit(req.user.id, 'operation_pickup_code_verified', 'transaction', tx.id, { proof: 'traveler_code' });
  await notify([tx.travelerId], { key: 'tx.pickedUp' }, tx.id, 'shipments', 'suivi');
  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/confirm-delivery', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'La livraison doit etre confirmee par le voyageur' });
  if (tx.operationStatus !== 'en_transport') return res.status(400).json({ error: 'La livraison ne peut pas etre confirmee a cette etape.' });
  const verification = verifyOperationCode(tx, 'delivery', req.body?.code);
  if (!verification.ok) {
    addEvent(tx, 'delivery_code_failed', req.user.id, { locked: verification.status === 429 });
    await audit(req.user.id, 'operation_delivery_code_failed', 'transaction', tx.id, { locked: verification.status === 429 });
    save();
    return res.status(verification.status).json({ error: verification.error });
  }
  tx.securityCodes.delivery.verifiedAt = Date.now();
  tx.securityCodes.delivery.verifiedBy = req.user.id;
  tx.operationStatus = 'termine';
  tx.status = 'released';
  transitionEscrow(tx.escrow, 'released');
  for (const uid of new Set([tx.senderId, tx.travelerId])) {
    const member = findUser(uid);
    if (!member) continue;
    member.completed = (member.completed || 0) + 1;
    member.badges = member.badges || [];
    if (member.completed >= 5 && !member.badges.includes('voyageur-confirme')) member.badges.push('voyageur-confirme');
  }
  addEvent(tx, 'delivery_code_verified', req.user.id, { proof: 'sender_code', escrowReleased: true });
  await audit(req.user.id, 'operation_delivery_code_verified', 'transaction', tx.id, { proof: 'sender_code', escrowReleased: true });
  await notify([tx.senderId, tx.travelerId], { key: 'tx.delivered.sender' }, tx.id, 'shipments', 'suivi');
  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/confirm', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  const current = tx.operationStatus || (tx.status === 'accepted' ? 'paiement_requis' : null);
  const transitions = {
    attente_confirmation: { next: 'paiement_requis', event: 'traveler_confirmed', role: 'traveler' },
  };
  const transition = transitions[current];
  if (!transition) return res.status(400).json({ error: 'Aucune confirmation disponible a cette etape' });
  if (transition.role === 'traveler' && tx.travelerId !== req.user.id)
    return res.status(403).json({ error: 'Confirmation reservee au voyageur' });

  tx.operationStatus = transition.next;
  if (transition.txStatus) tx.status = transition.txStatus;
  if (transition.escrow) transitionEscrow(tx.escrow, transition.escrow);
  addEvent(tx, transition.event, req.user.id);

  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/reject', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.travelerId !== req.user.id) return res.status(403).json({ error: 'Refus reserve au voyageur' });
  if (tx.operationStatus !== 'attente_confirmation')
    return res.status(400).json({ error: 'Cette operation ne peut plus etre refusee' });
  tx.status = 'cancelled';
  tx.operationStatus = 'termine';
  tx.paymentStatus = 'cancelled';
  transitionEscrow(tx.escrow, 'refunded');
  addEvent(tx, 'traveler_rejected', req.user.id, {
    reason: String(req.body?.reason || '').trim().slice(0, 300),
  });
  await notify([tx.senderId], { key: 'offer.refused' }, tx.id, 'transactions', 'suivi');
  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/cancel', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.senderId !== req.user.id) return res.status(403).json({ error: 'Annulation reservee a l expediteur' });
  if (!['attente_confirmation', 'paiement_requis'].includes(tx.operationStatus))
    return res.status(400).json({ error: 'Cette operation ne peut plus etre annulee' });
  tx.status = 'cancelled';
  tx.operationStatus = 'termine';
  tx.paymentStatus = 'cancelled';
  transitionEscrow(tx.escrow, 'refunded');
  addEvent(tx, 'sender_cancelled', req.user.id, {
    reason: String(req.body?.reason || '').trim().slice(0, 300),
  });
  await notify([tx.travelerId], { key: 'offer.withdrawn', params: { name: req.user.name } }, tx.id, 'transactions', 'suivi');
  save();
  res.json({ operation: operationView(tx, req.user) });
});

app.post('/api/operations/:id/dispute', auth, async (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  if (tx.operationStatus === 'termine') return res.status(400).json({ error: 'Operation deja terminee' });
  const existing = db.disputes.find((d) => d.txId === tx.id && d.status === 'open');
  if (existing) return res.json({ operation: operationView(tx, req.user), dispute: disputeView(existing, tx) });

  tx.status = 'disputed';
  tx.operationStatus = 'litige';
  transitionEscrow(tx.escrow, 'frozen');
  const dispute = {
    id: newId('d'),
    txId: tx.id,
    openedBy: req.user.id,
    reason: String(req.body?.reason || 'Probleme signale depuis En cours').trim().slice(0, 500),
    evidence: [],
    status: 'open',
    createdAt: Date.now(),
  };
  db.disputes.push(dispute);
  repositories.reviewQueue.append({ type: 'dispute', refId: dispute.id });
  addEvent(tx, 'dispute_opened', req.user.id, { reason: dispute.reason });
  await notify([tx.senderId, tx.travelerId].filter((id) => id !== req.user.id), { key: 'dispute.opened' }, tx.id, 'security', 'litige');
  save();
  res.json({ operation: operationView(tx, req.user), dispute: disputeView(dispute, tx) });
});

app.post('/api/operations/:id/evidence', auth, (req, res) => {
  const tx = db.transactions.find((t) => t.id === req.params.id);
  if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
  const dispute = db.disputes.find((d) => d.txId === tx.id && d.status === 'open');
  if (!dispute) return res.status(400).json({ error: 'Aucun litige ouvert sur cette operation' });
  const text = String(req.body?.text || '').trim().slice(0, 2000);
  const { photo } = req.body || {};
  if (!text && !photo) return res.status(400).json({ error: 'Ajoutez un commentaire ou une photo' });
  if (photo && !validPhotos([photo])) return res.status(400).json({ error: 'Photo invalide' });
  dispute.evidence.push({ by: req.user.id, text: text || null, photo: photo || null, at: Date.now() });
  addEvent(tx, 'evidence_added', req.user.id);
  save();
  res.json({ operation: operationView(tx, req.user), dispute: disputeView(dispute, tx) });
});

app.post('/api/conversations', auth, (req, res) => {
  const { tripId = null, operationId = null, userId = null } = req.body || {};
  let otherId = userId;
  if (tripId) {
    const trip = db.trips.find((t) => t.id === tripId);
    if (!trip) return res.status(404).json({ error: 'Trajet introuvable' });
    otherId = trip.travelerId;
  }
  if (operationId) {
    const tx = db.transactions.find((t) => t.id === operationId);
    if (!tx || !isPartyToTx(tx, req.user.id)) return res.status(404).json({ error: 'Operation introuvable' });
    otherId = tx.senderId === req.user.id ? tx.travelerId : tx.senderId;
  }
  if (!otherId || !findUser(otherId)) return res.status(400).json({ error: 'Destinataire invalide' });
  if (otherId === req.user.id) return res.status(400).json({ error: 'Conversation invalide' });
  const conversation = findOrCreateConversation({ participantIds: [req.user.id, otherId], tripId, operationId });
  save();
  res.json({ conversation: conversationView(conversation, req.user.id) });
});

app.get('/api/conversations', auth, (req, res) => {
  const filter = String(req.query.filter || 'all');
  const q = String(req.query.q || '').trim().toLowerCase();
  const conversations = db.conversations
    .filter((c) => c.participantIds.includes(req.user.id))
    .filter((c) => !(c.deletedBy || []).includes(req.user.id))
    .map((c) => conversationView(c, req.user.id))
    .filter((c) => req.query.includeArchived === '1' || filter === 'archived' || !c.archived)
    .filter((c) => {
      if (filter === 'unread') return c.unreadCount > 0;
      if (filter === 'action') return c.actionRequired;
      if (filter === 'pinned') return c.pinned;
      if (filter === 'active') return ['active', 'waiting_user', 'waiting_other'].includes(c.status);
      if (filter === 'done') return c.status === 'completed' || c.status === 'archived';
      if (filter === 'archived') return c.archived;
      return true;
    })
    .filter((c) => !q || `${c.other?.name || ''} ${c.lastMessagePreview || ''} ${c.context?.label || ''} ${c.context?.detail || ''}`.toLowerCase().includes(q))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastMessageAt || b.createdAt) - (a.lastMessageAt || a.createdAt));
  res.json({ conversations });
});

app.get('/api/conversations/:id', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id) && !(c.deletedBy || []).includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  res.json({ conversation: conversationView(conversation, req.user.id) });
});

app.get('/api/conversations/:id/messages', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id) && !(c.deletedBy || []).includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const { messages, page } = conversationMessagesPage(conversation, req.query);
  if (markConversationRead(conversation.id, req.user.id)) save();
  res.json({ conversation: conversationView(conversation, req.user.id), messages, page });
});

app.post('/api/conversations/:id/read', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const changed = markConversationRead(conversation.id, req.user.id);
  if (changed) {
    save();
    broadcastConversation(conversation, { type: 'read', userId: req.user.id });
  }
  res.json({
    ok: true,
    message: 'Si un compte correspond a cette adresse, un email vient d etre envoye.',
    conversation: conversationView(conversation, req.user.id),
    messagesUnread: unreadConversationCount(req.user.id),
  });
});

app.post('/api/conversations/:id/typing', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  broadcastConversation(conversation, { type: 'typing', userId: req.user.id, active: req.body?.active === true }, req.user.id);
  res.json({ ok: true });
});

app.post('/api/conversations/:id/unread', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const lastOther = db.messages
    .filter((m) => m.conversationId === conversation.id && m.from !== req.user.id)
    .sort((a, b) => b.at - a.at)[0];
  if (lastOther) {
    lastOther.readBy = (lastOther.readBy || []).filter((id) => id !== req.user.id);
    save();
  }
  res.json({
    ok: true,
    conversation: conversationView(conversation, req.user.id),
    messagesUnread: unreadConversationCount(req.user.id),
  });
});

app.post('/api/conversations/:id/archive', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const archived = req.body?.archived !== false;
  const archivedBy = new Set(conversation.archivedBy || []);
  if (archived) archivedBy.add(req.user.id);
  else archivedBy.delete(req.user.id);
  conversation.archivedBy = [...archivedBy];
  save();
  res.json({ ok: true, conversation: conversationView(conversation, req.user.id) });
});

app.post('/api/conversations/:id/pin', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const pinned = req.body?.pinned !== false;
  const pinnedBy = new Set(conversation.pinnedBy || []);
  if (pinned) pinnedBy.add(req.user.id);
  else pinnedBy.delete(req.user.id);
  conversation.pinnedBy = [...pinnedBy];
  save();
  res.json({ ok: true, conversation: conversationView(conversation, req.user.id) });
});

app.post('/api/conversations/:id/report', auth, async (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const allowedReasonCodes = new Set(['external_payment', 'abuse', 'suspicious', 'off_platform', 'other']);
  const reasonCode = String(req.body?.reasonCode || 'other').trim();
  const safeReasonCode = allowedReasonCodes.has(reasonCode) ? reasonCode : 'other';
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  const comment = String(req.body?.comment || '').trim().slice(0, 500);
  if (!reason) return res.status(400).json({ error: 'Motif requis' });
  const report = {
    id: newId('cr'),
    conversationId: conversation.id,
    reporterId: req.user.id,
    reasonCode: safeReasonCode,
    reason,
    comment,
    at: Date.now(),
  };
  conversation.reports = conversation.reports || [];
  conversation.reports.push(report);
  conversation.reportedBy = [...new Set([...(conversation.reportedBy || []), req.user.id])];
  const alreadyQueued = repositories.reviewQueue.open()
    .some((item) => item.type === 'conversation' && item.refId === conversation.id);
  if (!alreadyQueued) repositories.reviewQueue.append({ type: 'conversation', refId: conversation.id });
  await audit(req.user.id, 'conversation.report', 'conversation', conversation.id, { reason, reasonCode: safeReasonCode });
  save();
  res.json({ ok: true, report, conversation: conversationView(conversation, req.user.id) });
});

app.post('/api/conversations/:id/block', auth, async (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const otherId = conversation.participantIds.find((id) => id !== req.user.id);
  if (!otherId) return res.status(400).json({ error: 'Participant introuvable' });
  const blocked = req.body?.blocked !== false;
  const ids = blockedUserIds(req.user);
  if (blocked) ids.add(otherId); else ids.delete(otherId);
  req.user.blockedUserIds = [...ids];
  conversation.blockedBy = blocked
    ? [...new Set([...(conversation.blockedBy || []), req.user.id])]
    : (conversation.blockedBy || []).filter((id) => id !== req.user.id);
  await audit(req.user.id, blocked ? 'conversation.block' : 'conversation.unblock', 'conversation', conversation.id, { otherId });
  save();
  res.json({ ok: true, blocked, conversation: conversationView(conversation, req.user.id) });
});

app.get('/api/blocked-users', auth, (req, res) => {
  const users = [...blockedUserIds(req.user)]
    .map((id) => publicUser(findUser(id)))
    .filter(Boolean);
  res.json({ users });
});

app.post('/api/blocked-users/:id/unblock', auth, async (req, res) => {
  const otherId = req.params.id;
  const ids = blockedUserIds(req.user);
  if (!ids.has(otherId)) return res.status(404).json({ error: 'Compte bloque introuvable' });
  ids.delete(otherId);
  req.user.blockedUserIds = [...ids];
  for (const conversation of db.conversations) {
    if (conversation.participantIds?.includes(req.user.id) && conversation.participantIds?.includes(otherId)) {
      conversation.blockedBy = (conversation.blockedBy || []).filter((id) => id !== req.user.id);
    }
  }
  await audit(req.user.id, 'user.unblock', 'user', otherId, {});
  save();
  res.json({ ok: true });
});

app.post('/api/conversations/:id/messages', auth, async (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  if (areConversationParticipantsBlocked(conversation, req.user.id)) {
    return res.status(403).json({ code: 'conversation_blocked', error: 'Cette conversation est bloquee. Aucun nouveau message ne peut etre envoye.' });
  }
  if (req.user.messageSafetyBlockedUntil && req.user.messageSafetyBlockedUntil > Date.now()) {
    return res.status(429).json(messageSafetyError({ analysis: { categories: ['repeated_attempts'], severity: 'high' }, cooldownUntil: req.user.messageSafetyBlockedUntil }));
  }
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  const attachments = Array.isArray(req.body?.attachments) ? req.body.attachments.slice(0, 1) : [];
  const now = Date.now();
  const location = normalizeMessageLocation(req.body?.location, conversation, now);
  if (req.body?.location && !location) return res.status(400).json({ error: 'Localisation invalide' });
  if (!text && attachments.length === 0 && !location) return res.status(400).json({ error: 'Message vide' });
  if (attachments.length > 0 && !validPhotos(attachments.map((a) => a?.dataUrl || a)))
    return res.status(400).json({ error: 'Piece jointe invalide' });
  const normalizedAttachments = attachments.map((attachment, index) => {
    const dataUrl = typeof attachment === 'string' ? attachment : attachment.dataUrl;
    const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    return {
      id: newId('att'),
      type: 'image',
      name: String(attachment?.name || `image-${index + 1}`).slice(0, 80),
      mime,
      dataUrl,
      size: dataUrl.length,
    };
  });
  const clientId = String(req.body?.clientId || '').trim().slice(0, 80) || null;
  if (clientId) {
    const existing = db.messages.find((m) =>
      m.conversationId === conversation.id && m.from === req.user.id && m.clientId === clientId
    );
    if (existing) {
      return res.json({
        message: existing,
        conversation: conversationView(conversation, req.user.id),
        warningKey: existing.flagged ? 'messages.safety.keepInside' : null,
        warning: existing.flagged ? "Gardez les echanges et le paiement dans Wigofly pour rester protege." : null,
      });
    }
  }
  // Join a short, recent sequence from the same sender. This catches a number or
  // payment handle deliberately split across several chat bubbles, while limiting
  // the inspection to the conversation and a ten-minute coordination window.
  const recentOutboundText = db.messages
    .filter((message) => message.conversationId === conversation.id && message.from === req.user.id && message.at > Date.now() - 10 * 60 * 1000)
    .slice(-4)
    .map((message) => message.text || '')
    .join(' ');
  const safety = analyzeMessageSafety(`${recentOutboundText} ${text} ${location?.label || ''} ${location?.city || ''}`);
  if (safety.blocked) {
    const attempt = registerMessageSafetyAttempt({ user: req.user, conversation, analysis: safety });
    await audit(req.user.id, 'message.safety_blocked', 'conversation', conversation.id, { categories: safety.categories, severity: safety.severity, highCount: attempt.highCount });
    save();
    return res.status(attempt.cooldownUntil ? 429 : 422).json(messageSafetyError({ analysis: safety, cooldownUntil: attempt.cooldownUntil }));
  }
  const flagged = false;
  const msg = {
    id: newId('m'),
    clientId,
    conversationId: conversation.id,
    txId: conversation.operationId || null,
    from: req.user.id,
    text,
    flagged,
    flagReason: flagged ? 'contact_outside_app' : null,
    type: location ? 'location' : normalizedAttachments.length ? 'attachment' : flagged ? 'warning' : 'text',
    attachments: normalizedAttachments,
    location,
    deliveryStatus: 'sent',
    readBy: [req.user.id],
    at: now,
    createdAt: now,
    updatedAt: now,
  };
  db.messages.push(msg);
  conversation.lastMessageAt = msg.at;
  conversation.archivedBy = (conversation.archivedBy || []).filter((id) => id !== req.user.id);
  await notify(conversation.participantIds.filter((id) => id !== req.user.id), { key: 'chat.message', params: { name: req.user.name } }, conversation.operationId || null, 'messages', 'messages');
  save();
  broadcastConversation(conversation, { type: 'message', messageId: msg.id, from: req.user.id });
  res.json({
    message: msg,
    conversation: conversationView(conversation, req.user.id),
    warningKey: flagged ? 'messages.safety.keepInside' : null,
    warning: flagged ? "Gardez les echanges et le paiement dans Wigofly pour rester protege." : null,
  });
});

// La suppression retire une discussion de la boite du demandeur uniquement. Les
// messages restent disponibles pour l'autre participant et pour la moderation.
app.delete('/api/conversations/:id', auth, async (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  conversation.deletedBy = [...new Set([...(conversation.deletedBy || []), req.user.id])];
  await audit(req.user.id, 'conversation.delete', 'conversation', conversation.id, {
    subjectUserId: req.user.id,
    scope: 'inbox_only',
    retainedForAdmin: true,
    participantIds: conversation.participantIds,
    messageCount: db.messages.filter((message) => message.conversationId === conversation.id).length,
  });
  save();
  res.json({ ok: true });
});

app.delete('/api/conversations/:id/messages/:messageId', auth, (req, res) => {
  const conversation = db.conversations.find((c) => c.id === req.params.id && c.participantIds.includes(req.user.id));
  if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
  const index = db.messages.findIndex((message) => message.id === req.params.messageId && message.conversationId === conversation.id);
  if (index < 0) return res.status(404).json({ error: 'Message introuvable' });
  if (db.messages[index].from !== req.user.id) return res.status(403).json({ error: 'Vous pouvez supprimer uniquement vos messages' });
  db.messages.splice(index, 1);
  const last = conversationMessages(conversation).at(-1);
  conversation.lastMessageAt = last?.at || conversation.createdAt;
  save();
  broadcastConversation(conversation, { type: 'message_deleted', messageId: req.params.messageId, from: req.user.id });
  res.json({ ok: true, conversation: conversationView(conversation, req.user.id) });
});

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

  const myTrips = db.trips.filter((t) =>
    t.travelerId === req.user.id
    && (t.status || 'published') === 'published'
    && t.date >= new Date().toISOString().slice(0, 10));
  const showAll = req.query.all === '1' || myTrips.length === 0;
  const listings = (showAll ? open : open.filter((l) => myTrips.some((t) => matchesTrip(l, t))))
    .map((l) => ({
      ...localizedListingView(l, req.lang),
      sender: publicUser(findUser(l.senderId)),
      matched: myTrips.some((t) => matchesTrip(l, t)),
    }));
  res.json({ listings, filteredByTrip: !showAll, tripCount: myTrips.length, totalOpen: open.length });
});

app.get('/api/listings/mine', auth, (req, res) => {
  const listings = db.listings
    .filter((l) => l.senderId === req.user.id)
    .map((listing) => localizedListingView(listing, req.lang));
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

app.put('/api/listings/:id', auth, async (req, res) => {
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
  if (listing.senderId !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
  if (!['published', 'pending_review'].includes(listing.status))
    return res.status(400).json({ error: 'Cette annonce ne peut plus être modifiée (déjà acceptée)' });

  const before = { ...listing };
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
  await auditChange({
    actorId: req.user.id, action: 'listing.update', targetType: 'listing', targetId: listing.id,
    subjectUserId: req.user.id, before, after: listing,
    fields: ['title', 'description', 'weightKg', 'valueEur', 'dateFrom', 'dateTo', 'travelerPay'],
    meta: { photosChanged: photos !== undefined },
  });
  save();
  res.json({ listing: localizedListingView(listing, req.lang) });
});

// Retrait d'une annonce par l'expéditeur, tant qu'aucun voyageur ne l'a acceptée.
app.post('/api/listings/:id/cancel', auth, async (req, res) => {
  const listing = db.listings.find((l) => l.id === req.params.id);
  if (!listing) return res.status(404).json({ error: 'Annonce introuvable' });
  if (listing.senderId !== req.user.id) return res.status(403).json({ error: 'Non autorisé' });
  if (!['published', 'pending_review'].includes(listing.status))
    return res.status(400).json({ error: 'Cette annonce ne peut plus être retirée (déjà acceptée)' });
  const before = { ...listing };
  listing.status = 'cancelled';
  await auditChange({
    actorId: req.user.id, action: 'listing.cancel', targetType: 'listing', targetId: listing.id,
    subjectUserId: req.user.id, before, after: listing, fields: ['status'],
  });
  save();
  res.json({ listing: localizedListingView(listing, req.lang) });
});

function listingPreflight(user, body, lang = 'fr') {
  const {
    title, categoryId: rawCategoryId, categoryLabel: rawCategoryLabel, description,
    weightKg, valueEur, from, to, dateFrom, dateTo, travelerPay, customsAccepted,
    recipientPhone, photos,
  } = body;
  const checks = [];
  const warnings = [];
  const blockers = [];
  const addCheck = (id, ok, label, severity = 'blocker', detail = null, {
    labelKey = `preflight.check.${id}`,
    labelVars = null,
    detailKey = null,
    detailVars = null,
  } = {}) => {
    checks.push({ id, ok, label, labelKey, labelVars, severity, detail, detailKey, detailVars });
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
  addCheck('limit', valueNum !== null && valueNum <= user.maxValue, `Plafond compte : ${user.maxValue} €`, 'blocker', null, { labelVars: { max: user.maxValue } });
  addCheck('route', !!from && !!to && from !== to, 'Trajet cohérent');
  addCheck('dates', !!dateFrom && !!dateTo && dateFrom <= dateTo, 'Fenêtre de dates cohérente');

  const categoryId = rawCategoryId === 'autre' && rawCategoryLabel ? slugify(rawCategoryLabel) : rawCategoryId;
  const evalRes = categoryId ? evaluateCategoryDynamic(categoryId) : { verdict: 'gray' };
  const cat = combinedWhitelist().find((c) => c.id === categoryId);
  const localizedCat = cat ? localizeCategory(cat, lang) : null;
  const localizedEvaluatedCategory = evalRes.category ? localizeCategory(evalRes.category, lang) : null;
  addCheck('category', evalRes.verdict !== 'blacklisted', 'Catégorie autorisée',
    evalRes.verdict === 'blacklisted' ? 'blocker' : 'warning',
    localizedEvaluatedCategory?.reason || null);
  if (evalRes.verdict === 'gray') {
    addCheck('review', false, 'Revue humaine nécessaire', 'warning', 'Publication après validation admin.', {
      labelKey: 'preflight.check.review.required',
      detailKey: 'preflight.check.review.required.detail',
    });
  } else {
    addCheck('review', true, 'Publication directe possible', 'warning', null, { labelKey: 'preflight.check.review.direct' });
  }

  const localizedCustoms = localizeCustoms(CUSTOMS, lang);
  const corridor = from === 'Casablanca' ? localizedCustoms['MA-EU'] : localizedCustoms['EU-MA'];
  const customsLimit = from === 'Casablanca' ? 430 : 185;
  if (valueNum !== null && valueNum > customsLimit) {
    addCheck('customs-value', false, `Valeur au-dessus de la franchise indicative (${customsLimit} €)`, 'warning', null, {
      labelKey: 'preflight.check.customsValue.over',
      labelVars: { limit: customsLimit },
    });
  } else {
    addCheck('customs-value', true, 'Valeur dans la franchise indicative', 'warning', null, { labelKey: 'preflight.check.customsValue.within' });
  }

  const recipient = recipientPhone ? db.users.find((u) => u.phone === recipientPhone) : null;
  if (recipientPhone && !recipient) {
    addCheck('recipient', false, 'Destinataire non reconnu dans Wigofly', 'warning', null, { labelKey: 'preflight.check.recipient.unknown' });
  } else {
    addCheck('recipient', true, recipient ? 'Destinataire reconnu' : 'Destinataire optionnel', 'warning', null, {
      labelKey: recipient ? 'preflight.check.recipient.known' : 'preflight.check.recipient.optional',
    });
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
      label: localizedCat?.label || rawCategoryLabel || categoryId || '',
      verdict: evalRes.verdict,
      maxQty: localizedCat?.maxQty || null,
      reason: localizedEvaluatedCategory?.reason || null,
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
  res.json({ preflight: listingPreflight(req.user, req.body || {}, req.lang) });
});

app.post('/api/listings', auth, async (req, res) => {
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
  await auditChange({
    actorId: req.user.id, action: 'listing.create', targetType: 'listing', targetId: listing.id,
    subjectUserId: req.user.id, before: {}, after: listing,
    fields: ['title', 'categoryLabel', 'from', 'to', 'weightKg', 'valueEur', 'dateFrom', 'dateTo', 'travelerPay', 'status'],
    meta: { photoCount: listing.photos.length },
  });
  save();
  res.json({ listing: localizedListingView(listing, req.lang) });
});

// ---------- Transactions (machine à états) ----------
// accepted → sealed → in_transit → delivered → released | disputed
const CLOSED_STATUSES = ['released', 'refunded', 'cancelled'];

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

async function trustCenterFor(user) {
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
  const flaggedMessages = await repositories.messages.flaggedFromUser(user.id);
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

app.get('/api/trust-center', auth, async (req, res) => {
  res.json({ trust: await trustCenterFor(req.user) });
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
    // New operation-code hashes are internal server state, never API data.
    delete v.securityCodes;
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
  if (!req.body?.dataUrl && !(DEMO && req.body?.simulated)) return res.status(400).json({ error: 'Video de scellage requise' });
  t.sealingVideo = {
    dataUrl: req.body.dataUrl || null, simulated: DEMO && !!req.body.simulated,
    recordedAt: Date.now(), geo: req.body.geo || null, txCode: t.id,
  };
  t.status = 'sealed';
  addEvent(t, 'sealed', req.user.id, { simulated: DEMO && !!req.body.simulated });
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

app.get('/api/users/:id', auth, (req, res) => {
  const target = findUser(req.params.id);
  if (!target) return res.status(404).json({ error: 'Introuvable' });
  const trips = db.trips
    .filter((trip) => trip.travelerId === target.id && (trip.status || 'published') === 'published')
    .sort((a, b) => String(a.departureDate || a.date).localeCompare(String(b.departureDate || b.date)))
    .slice(0, 4)
    .map((trip) => ({
      id: trip.id,
      from: trip.from,
      to: trip.to,
      departureDate: trip.departureDate || trip.date,
      transportMode: tripTransportMode(trip.transportMode),
      price: trip.price,
      currency: trip.currency || 'EUR',
      capacityKg: trip.capacityKg,
    }));
  res.json({
    user: publicUser(target),
    trips,
    stats: {
      completed: target.completed || 0,
      rating: target.rating,
      ratingCount: target.ratingCount || 0,
      cancelRate: target.cancelRate || 0,
    },
  });
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
app.get('/api/transactions/:id/messages', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  res.json({ messages: await repositories.messages.listForTransaction(req.params.id) });
});

app.post('/api/transactions/:id/messages', auth, async (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id))
    return res.status(403).json({ error: 'Non autorisé' });
  const text = String(req.body.text || '').slice(0, 2000);
  const safety = analyzeMessageSafety(text);
  if (safety.blocked) {
    const pseudoConversation = db.conversations.find((conversation) => conversation.operationId === t.id && conversation.participantIds.includes(req.user.id));
    const attempt = registerMessageSafetyAttempt({ user: req.user, conversation: pseudoConversation, analysis: safety });
    await audit(req.user.id, 'message.safety_blocked', 'transaction', t.id, { categories: safety.categories, severity: safety.severity, highCount: attempt.highCount });
    save();
    return res.status(attempt.cooldownUntil ? 429 : 422).json(messageSafetyError({ analysis: safety, cooldownUntil: attempt.cooldownUntil }));
  }
  const flagged = false;
  const msg = await repositories.messages.append({ txId: t.id, from: req.user.id, text, flagged });
  await notify([t.senderId, t.travelerId, t.recipientId].filter((id) => id !== req.user.id), { key: 'chat.message', params: { name: req.user.name } }, t.id, 'messages', 'messages');
  save();
  res.json({
    message: msg,
    warningKey: flagged ? 'messages.safety.keepInside' : null,
    warning: flagged ? "⚠️ Le partage de coordonnées est contraire aux CGU. L'escrow et l'assistance ne couvrent que les échanges dans l'app." : null,
  });
});

// ---------- Récapitulatif douane (PRD §4.1 Phase 4) ----------
app.get('/api/transactions/:id/customs-recap', auth, (req, res) => {
  const t = db.transactions.find((x) => x.id === req.params.id);
  if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
  if (!isPartyToTx(t, req.user.id) && !req.user.isAdmin)
    return res.status(403).json({ error: 'Non autorisé' });
  const listing = db.listings.find((l) => l.id === t.listingId);
  const customs = localizeCustoms(CUSTOMS, req.lang);
  const corridor = listing.from === 'Casablanca' ? customs['MA-EU'] : customs['EU-MA'];
  const category = combinedWhitelist().find((item) => item.id === listing.categoryId)
    || BLACKLIST.find((item) => item.id === listing.categoryId);
  res.json({
    recap: {
      txId: t.id, product: listing.title, category: category ? localizeCategory(category, req.lang).label : listing.categoryLabel,
      description: listing.description, valueEur: listing.valueEur, weightKg: listing.weightKg,
      sender: publicUser(findUser(t.senderId)), traveler: publicUser(findUser(t.travelerId)),
      sealedAt: t.sealingVideo?.recordedAt || null, corridor,
    },
  });
});

// ---------- Back-office (PRD §4.7) ----------

const KYC_SLA_MS = 24 * 3600e3;
const OFFER_WATCH_MS = 24 * 3600e3;

async function adminRiskSignals() {
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
    flaggedMessaging: await repositories.messages.flaggedSenderCount(),
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
  const reviewConversations = reviewOpen.filter((r) => r.type === 'conversation');
  const pendingKyc = repositories.kyc.pending();
  const overdueKyc = pendingKyc.filter((s) => (Date.now() - s.submittedAt) > KYC_SLA_MS);
  const openDisputes = db.disputes.filter((d) => d.status === 'open');
  const flaggedMessages = await repositories.messages.flagged();
  const escrowHeld = db.transactions
    .filter((t) => t.escrow?.state === 'held' || t.escrow?.state === 'frozen')
    .reduce((s, t) => s + t.escrow.amount, 0);
  const risk = await adminRiskSignals();
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
      id: 'review-conversations',
      severity: reviewConversations.length ? 'warning' : 'ok',
      count: reviewConversations.length,
      tab: 'review',
      title: 'Conversations signalees',
      body: 'Messages, participants et contexte a verifier avant decision.',
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
      conversationReports: reviewConversations.length,
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
            : r.type === 'dispute'
              ? db.disputes.find((d) => d.id === r.refId)?.reason
              : adminConversationModerationView(db.conversations.find((c) => c.id === r.refId))?.reports?.[0]?.reason,
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

app.get('/api/admin/overview', auth, adminOnly, async (req, res) => {
  res.json({
    reviewQueue: repositories.reviewQueue.open().map((r) => ({
      ...r,
      listing: r.type === 'listing' ? db.listings.find((l) => l.id === r.refId) : null,
      dispute: r.type === 'dispute'
        ? (() => { const d = db.disputes.find((x) => x.id === r.refId); return d ? disputeView(d) : null; })()
        : null,
      conversation: r.type === 'conversation'
        ? adminConversationModerationView(db.conversations.find((c) => c.id === r.refId))
        : null,
    })),
    stats: {
      users: db.users.length,
      listings: db.listings.length,
      transactions: db.transactions.length,
      released: db.transactions.filter((t) => t.status === 'released').length,
      disputed: db.transactions.filter((t) => t.status === 'disputed').length,
      flaggedMessages: (await repositories.messages.flagged()).length,
      escrowHeld: db.transactions.filter((t) => t.escrow?.state === 'held' || t.escrow?.state === 'frozen')
        .reduce((s, t) => s + t.escrow.amount, 0),
    },
    disputes: db.disputes,
    customWhitelist: repositories.customWhitelist.all(),
  });
});

// Retire une catégorie promue (repasse en zone grise pour les prochains envois).
function adminUserView(user) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    city: user.city,
    isAdmin: !!user.isAdmin,
    emailVerified: !!user.emailVerified,
    kycStatus: user.kycStatus,
    createdAt: user.createdAt,
    deletedAt: user.deletedAt || null,
    suspendedUntil: user.suspendedUntil || null,
    suspensionReason: user.suspensionReason || null,
    messageSafetyAttempts: (user.messageSafetyAttempts || []).filter((item) => item.at > Date.now() - MESSAGE_SAFETY_ATTEMPT_WINDOW_MS).length,
  };
}

app.get('/api/admin/users', auth, adminOnly, (req, res) => {
  const query = String(req.query.q || '').trim().toLowerCase();
  const users = db.users
    .filter((user) => !query || `${user.name} ${user.email} ${user.city}`.toLowerCase().includes(query))
    .sort((a, b) => Number(!!b.isAdmin) - Number(!!a.isAdmin) || (b.createdAt || 0) - (a.createdAt || 0))
    .slice(0, 100)
    .map(adminUserView);
  res.json({ users, adminCount: db.users.filter((user) => user.isAdmin && !user.deletedAt).length });
});

function adminCaseParticipant(user) {
  if (!user) return null;
  return {
    id: user.id, name: user.name, email: user.email, phone: user.phone || null, city: user.city || null,
    photoUrl: user.photoUrl || null, provider: user.provider || 'email', emailVerified: !!user.emailVerified,
    kycStatus: user.kycStatus || 'none', createdAt: user.createdAt || null, deletedAt: user.deletedAt || null,
  };
}

async function adminCaseFile(user, { messageOffset = 0, messageLimit = 50 } = {}) {
  const conversations = db.conversations
    .filter((conversation) => conversation.participantIds.includes(user.id))
    .sort((a, b) => (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0));
  const conversationIds = new Set(conversations.map((conversation) => conversation.id));
  const conversationsById = new Map(conversations.map((conversation) => [conversation.id, conversation]));
  const allMessages = db.messages
    .filter((message) => conversationIds.has(message.conversationId))
    .sort((a, b) => b.at - a.at);
  const transactions = db.transactions
    .filter((transaction) => [transaction.senderId, transaction.travelerId, transaction.recipientId].includes(user.id))
    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  const transactionIds = new Set(transactions.map((transaction) => transaction.id));
  const kyc = repositories.kyc.listForUser(user.id)
    .sort((a, b) => b.submittedAt - a.submittedAt)
    .map((submission) => ({
      id: submission.id, status: submission.status, legalName: submission.legalName, birthDate: submission.birthDate,
      documentType: submission.documentType, submittedAt: submission.submittedAt, reviewedAt: submission.reviewedAt || null,
      reviewedBy: submission.reviewedBy || null, decisionReason: submission.decisionReason || null,
      selfiePhoto: submission.selfiePhoto || null, idFrontPhoto: submission.idFrontPhoto || null, idBackPhoto: submission.idBackPhoto || null,
      documentsPurged: !submission.selfiePhoto && !submission.idFrontPhoto && !submission.idBackPhoto,
    }));
  const auditLogs = await repositories.auditLogs.listForMember(user.id, { limit: 500 });
  const messages = allMessages.slice(messageOffset, messageOffset + messageLimit).map((message) => {
    const conversation = conversationsById.get(message.conversationId);
    const recipientIds = (conversation?.participantIds || []).filter((id) => id !== message.from);
    return {
      id: message.id, conversationId: message.conversationId, from: adminCaseParticipant(findUser(message.from)),
      to: recipientIds.map((id) => adminCaseParticipant(findUser(id))).filter(Boolean),
      text: message.text || '', type: message.type || 'text', flagged: !!message.flagged, flagReason: message.flagReason || null,
      attachments: (message.attachments || []).map((attachment) => ({ id: attachment.id, name: attachment.name, type: attachment.type, size: attachment.size })),
      location: message.location ? { kind: message.location.kind, labelKey: message.location.labelKey, label: message.location.label, city: message.location.city, precision: message.location.precision, expiresAt: message.location.expiresAt } : null,
      at: message.at, deletedAt: message.deletedAt || null,
    };
  });
  return {
    member: { ...adminCaseParticipant(user), suspensionReason: user.suspensionReason || null, suspendedUntil: user.suspendedUntil || null },
    kyc,
    trips: db.trips.filter((trip) => trip.travelerId === user.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    listings: db.listings.filter((listing) => listing.senderId === user.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    transactions,
    disputes: db.disputes.filter((dispute) => transactionIds.has(dispute.txId)).sort((a, b) => b.createdAt - a.createdAt),
    conversations: conversations.map((conversation) => ({
      id: conversation.id, createdAt: conversation.createdAt, lastMessageAt: conversation.lastMessageAt || null,
      tripId: conversation.tripId || null, operationId: conversation.operationId || null,
      participants: conversation.participantIds.map((id) => adminCaseParticipant(findUser(id))),
      reports: conversation.reports || [], messageCount: allMessages.filter((message) => message.conversationId === conversation.id).length,
    })),
    messages,
    messagePage: { offset: messageOffset, limit: messageLimit, total: allMessages.length, hasMore: messageOffset + messages.length < allMessages.length },
    notifications: (db.notifications || []).filter((notification) => notification.userId === user.id).sort((a, b) => b.at - a.at).slice(0, 100),
    safetyAppeals: (db.safetyAppeals || []).filter((appeal) => appeal.userId === user.id).sort((a, b) => b.createdAt - a.createdAt),
    auditLogs,
    retention: { kycImagesAvailable: kyc.some((submission) => !submission.documentsPurged), note: 'Les documents KYC peuvent etre purges a l issue de la duree de conservation applicable. La trace de decision reste auditable.' },
  };
}

app.get('/api/admin/users/:id/case-file', auth, adminOnly, async (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Membre introuvable' });
  const offset = Math.max(0, Number(req.query.offset || 0) || 0);
  const limit = Math.max(10, Math.min(100, Number(req.query.limit || 50) || 50));
  res.json({ caseFile: await adminCaseFile(user, { messageOffset: offset, messageLimit: limit }) });
});

app.post('/api/admin/users/:id/case-file/access', auth, adminOnly, async (req, res) => {
  const user = findUser(req.params.id);
  if (!user) return res.status(404).json({ error: 'Membre introuvable' });
  await audit(req.user.id, 'admin.member_case.view', 'user', user.id, { section: String(req.body?.section || 'overview').slice(0, 40) });
  save();
  res.json({ ok: true });
});

app.post('/api/admin/users/:id/role', auth, adminOnly, async (req, res) => {
  const target = findUser(req.params.id);
  if (!target || target.deletedAt) return res.status(404).json({ error: 'Compte introuvable' });
  const role = String(req.body?.role || '').toLowerCase();
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'Role invalide' });

  const becomesAdmin = role === 'admin';
  if (!becomesAdmin && target.id === req.user.id) {
    return res.status(400).json({ error: 'Vous ne pouvez pas retirer votre propre acces administrateur.' });
  }
  const activeAdmins = db.users.filter((user) => user.isAdmin && !user.deletedAt);
  if (!becomesAdmin && target.isAdmin && activeAdmins.length <= 1) {
    return res.status(400).json({ error: 'Au moins un administrateur doit rester actif.' });
  }
  if (!!target.isAdmin === becomesAdmin) return res.json({ user: adminUserView(target), unchanged: true });

  target.isAdmin = becomesAdmin;
  target.roleChangedAt = Date.now();
  target.roleChangedBy = req.user.id;
  await audit(req.user.id, becomesAdmin ? 'role.admin.grant' : 'role.admin.revoke', 'user', target.id, {
    email: target.email,
  });
  save();
  res.json({ user: adminUserView(target) });
});

app.post('/api/admin/users/:id/safety', auth, adminOnly, async (req, res) => {
  const target = findUser(req.params.id);
  if (!target || target.deletedAt) return res.status(404).json({ error: 'Compte introuvable' });
  if (target.isAdmin) return res.status(400).json({ error: 'Un administrateur ne peut pas etre sanctionne depuis cet ecran.' });
  const action = String(req.body?.action || '').trim();
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (!['warn', 'suspend', 'restore'].includes(action)) return res.status(400).json({ error: 'Action invalide' });
  if (action !== 'restore' && reason.length < 5) return res.status(400).json({ error: 'Motif obligatoire (5 caracteres minimum)' });
  if (action === 'suspend') {
    const durationHours = Math.max(1, Math.min(24 * 30, Number(req.body?.durationHours || 24)));
    target.suspendedUntil = Date.now() + durationHours * 3600e3;
    target.suspensionReason = reason;
    target.suspendedAt = Date.now();
    target.suspendedBy = req.user.id;
  } else if (action === 'restore') {
    target.suspendedUntil = null;
    target.suspensionReason = null;
    target.restoredAt = Date.now();
    target.restoredBy = req.user.id;
  } else {
    target.lastSafetyWarningAt = Date.now();
    target.lastSafetyWarningReason = reason;
  }
  await audit(req.user.id, `user.safety.${action}`, 'user', target.id, { reason, durationHours: req.body?.durationHours || null });
  save();
  res.json({ ok: true, user: adminUserView(target) });
});

// A suspended user may still submit an appeal with their existing session token.
app.post('/api/safety/appeals', async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  const session = await activeSession(token);
  const user = session ? findUser(session.userId) : null;
  if (!user) return res.status(401).json({ error: 'Non authentifie' });
  const reason = String(req.body?.reason || '').trim().slice(0, 1000);
  if (reason.length < 10) return res.status(400).json({ error: 'Expliquez votre recours en au moins 10 caracteres.' });
  db.safetyAppeals = db.safetyAppeals || [];
  const existing = db.safetyAppeals.find((appeal) => appeal.userId === user.id && appeal.status === 'open');
  if (existing) return res.status(409).json({ error: 'Un recours est deja en cours de traitement.' });
  const appeal = { id: newId('appeal'), userId: user.id, reason, status: 'open', createdAt: Date.now() };
  db.safetyAppeals.push(appeal);
  repositories.reviewQueue.append({ type: 'safety_appeal', refId: appeal.id });
  await audit(user.id, 'user.safety.appeal', 'safety_appeal', appeal.id, {});
  save();
  res.json({ ok: true, appeal });
});

app.get('/api/admin/safety', auth, adminOnly, (req, res) => {
  const now = Date.now();
  const riskyUsers = db.users
    .filter((user) => !user.isAdmin && ((user.suspendedUntil && user.suspendedUntil > now) || (user.messageSafetyAttempts || []).some((item) => item.at > now - MESSAGE_SAFETY_ATTEMPT_WINDOW_MS)))
    .map(adminUserView)
    .sort((a, b) => Number(!!b.suspendedUntil) - Number(!!a.suspendedUntil) || b.messageSafetyAttempts - a.messageSafetyAttempts);
  const appeals = (db.safetyAppeals || []).slice().sort((a, b) => b.createdAt - a.createdAt).map((appeal) => ({ ...appeal, user: adminUserView(findUser(appeal.userId)) }));
  res.json({ riskyUsers, appeals });
});

app.post('/api/admin/safety/appeals/:id', auth, adminOnly, async (req, res) => {
  const appeal = (db.safetyAppeals || []).find((item) => item.id === req.params.id);
  if (!appeal || appeal.status !== 'open') return res.status(404).json({ error: 'Recours introuvable' });
  const decision = String(req.body?.decision || 'reject');
  if (!['approve', 'reject'].includes(decision)) return res.status(400).json({ error: 'Decision invalide' });
  appeal.status = decision === 'approve' ? 'accepted' : 'rejected';
  appeal.reviewedAt = Date.now();
  appeal.reviewedBy = req.user.id;
  appeal.decisionReason = String(req.body?.reason || '').trim().slice(0, 500) || null;
  const user = findUser(appeal.userId);
  if (decision === 'approve' && user) {
    user.suspendedUntil = null;
    user.suspensionReason = null;
    user.messageSafetyBlockedUntil = null;
  }
  const queueItem = repositories.reviewQueue.open().find((item) => item.type === 'safety_appeal' && item.refId === appeal.id);
  if (queueItem) repositories.reviewQueue.close(queueItem, decision);
  await audit(req.user.id, `user.safety.appeal.${decision}`, 'safety_appeal', appeal.id, { userId: appeal.userId });
  save();
  res.json({ ok: true, appeal });
});

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
app.get('/api/admin/kpis', auth, adminOnly, async (req, res) => {
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
    const label = start.toLocaleDateString(localeForLang(req.lang), { month: 'short' });
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
  const messageCount = await repositories.messages.count();
  const flaggedMessageCount = (await repositories.messages.flagged()).length;
  const desintermediationRate = messageCount ? flaggedMessageCount / messageCount : 0;

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
app.get('/api/admin/fraud', auth, adminOnly, async (req, res) => {
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
  for (const m of await repositories.messages.all()) {
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
  if (item.type === 'conversation') {
    const conversation = db.conversations.find((x) => x.id === item.refId);
    if (!conversation) return res.status(404).json({ error: 'Conversation introuvable' });
    conversation.moderationStatus = decision || 'reviewed';
    conversation.moderatedAt = Date.now();
    conversation.moderatedBy = req.user.id;
    conversation.reports = (conversation.reports || []).map((report) => ({
      ...report,
      reviewedAt: conversation.moderatedAt,
      reviewedBy: req.user.id,
      decision: conversation.moderationStatus,
    }));
    await audit(req.user.id, `review.conversation.${conversation.moderationStatus}`, 'conversation', conversation.id, {
      reviewId: item.id,
      reportCount: conversation.reports.length,
    });
  }
  save();
  res.json({ ok: true });
});

// ---------- Mode démo/test (à retirer en production) ----------
if (DEMO) {
  // Connexion directe à un compte de démo, sans mot de passe.
  app.post('/api/dev/impersonate', async (req, res) => {
    const user = findByEmail(req.body.email);
    if (!user) return res.status(404).json({ error: 'Compte inconnu' });
    await openSession(res, user);
  });

  // Crée un utilisateur de test aléatoire, vérifié et KYC ok, connecté.
  app.post('/api/dev/random-user', async (req, res) => {
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
    await openSession(res, user);
  });

  // Révèle les codes de validation d'une transaction (impossible en prod).
  app.get('/api/dev/tx-codes/:id', auth, (req, res) => {
    const t = db.transactions.find((x) => x.id === req.params.id);
    if (!t) return res.status(404).json({ error: 'Transaction introuvable' });
    res.json({ pickupCode: t.pickupCode, deliveryCode: t.deliveryCode });
  });
}

const PORT = process.env.PORT || 4517;
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`API Wigofly sur http://localhost:${PORT}`));
export default app;
