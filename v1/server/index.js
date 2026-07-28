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
import { createRelationalReadAuth } from './middleware/relational-read-auth.js';
import { loadRuntimeConfig } from './config/runtime.js';
import { createCorsOptions } from './config/cors-options.js';
import { createObservability } from './observability.js';
import { createSystemRouter } from './routes/system.js';
import { createObservabilityRouter } from './routes/observability.js';
import { createMaintenanceRouter } from './routes/maintenance.js';
import { createNotificationsRouter } from './routes/notifications.js';
import { createAccountRouter } from './routes/account.js';
import { createAccountPrivacyRouter } from './routes/account-privacy.js';
import { createAuthAccessRouter } from './routes/auth-access.js';
import { createAuthRegistrationRouter } from './routes/auth-registration.js';
import { createAccountSettingsRouter } from './routes/account-settings.js';
import { createKycRouter } from './routes/kyc.js';
import { createProfileRouter } from './routes/profile.js';
import { createTrainingRouter } from './routes/training.js';
import { createRulesRouter } from './routes/rules.js';
import { createRealtimeRouter } from './routes/realtime.js';
import { createRelationalReadsRouter } from './routes/relational-reads.js';
import { createConversationInboxRouter } from './routes/conversation-inbox.js';
import { createConversationMessageRouter } from './routes/conversation-messages.js';
import { createTripsRouter } from './routes/trips.js';
import { createTripOperationsRouter } from './routes/trip-operations.js';
import { createOperationReadsRouter } from './routes/operation-reads.js';
import { createAdminRecordsRouter } from './routes/admin-records.js';
import { createPublicProfilesRouter } from './routes/public-profiles.js';
import { createMemberOverviewRouter } from './routes/member-overview.js';
import { createAdminActionsRouter } from './routes/admin-actions.js';
import { createAdminFraudRouter } from './routes/admin-fraud.js';
import { createLocationsRouter } from './routes/locations.js';
import { createAuditService } from './services/audit.js';
import { createNotificationService } from './services/notifications.js';
import { createAccountEmailService } from './services/account-email.js';
import { createAccountPrivacyService } from './services/account-privacy.js';
import { createRealtimeService } from './services/realtime.js';
import { createConversationInboxService } from './services/conversation-inbox.js';
import { createConversationMessageService } from './services/conversation-messages.js';
import { createMessageMediaService } from './services/message-media.js';
import { createTripService } from './services/trips.js';
import { createOperationReadService } from './services/operation-reads.js';
import { createAdminRecordService } from './services/admin-records.js';
import { createPublicProfileService } from './services/public-profiles.js';
import { createMemberOverviewService } from './services/member-overview.js';
import { createAdminActionService } from './services/admin-actions.js';
import { createAdminFraudService } from './services/admin-fraud.js';
import { migrateInlineMessageMedia } from './migrate-message-media.js';
import {
  canonicalizeLocation,
  findLocationById,
  locationCatalogStats,
  normalizeLocationText,
  suggestLocations,
} from './location-search.js';

const app = express();
const {
  isProduction: IS_PRODUCTION,
  appOrigins: APP_ORIGINS,
  supabaseUrl: SUPABASE_URL,
  supabaseRealtimeOrigin: SUPABASE_REALTIME_ORIGIN,
} = loadRuntimeConfig();
const observability = createObservability({
  enabled: process.env.NODE_ENV !== 'test',
  release: process.env.VERCEL_GIT_COMMIT_SHA || process.env.RELEASE_SHA || 'local',
  environment: process.env.VERCEL_ENV || process.env.NODE_ENV || 'development',
  slowRequestMs: Number(process.env.SLOW_REQUEST_MS) || 1_000,
});
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
app.use(observability.middleware);
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

app.use('/api', createObservabilityRouter({
  auth,
  adminOnly,
  snapshot: observability.snapshot,
}));

const realtime = createRealtimeService({
  url: SUPABASE_URL,
  publishableKey: String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim(),
  secretKey: String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  newToken,
  findUser,
});
const messageMedia = createMessageMediaService({
  url: SUPABASE_URL,
  secretKey: String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  bucket: String(process.env.SUPABASE_MESSAGE_MEDIA_BUCKET || 'wigofly-message-media').trim(),
});

// Vercel serverless ne conserve pas suffisamment longtemps une connexion SSE.
// Les clients utilisent donc le WebSocket gere par Supabase Realtime.
app.use('/api/realtime', createRealtimeRouter({
  auth,
  realtime,
}));

const relationalReadAuth = createRelationalReadAuth({
  enabled: relationalTripReadsEnabled,
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});

app.use('/api', createRelationalReadsRouter({
  auth: relationalReadAuth,
  tripReadsEnabled: relationalTripReadsEnabled,
  messageReadsEnabled: relationalMessageReadsEnabled,
  getPool: databasePool,
  listTrips: listRelationalTrips,
  listConversations: listRelationalConversations,
  getConversation: relationalConversation,
  today: TODAY_ISO,
}));

function broadcastConversation(conversation, payload, exceptUserId = null) {
  for (const userId of conversation.participantIds || []) {
    if (userId !== exceptUserId) {
      const update = { conversationId: conversation.id, ...payload, at: Date.now() };
      realtime.broadcast(userId, update);
    }
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

// Journal immuable des changements importants. Le service filtre les secrets et
// le contenu binaire avant de deleguer l'ecriture au repository.
const { audit, auditChange } = createAuditService({
  auditLogs: repositories.auditLogs,
});

// Les cles i18n sont persistees une fois puis rendues dans la langue du lecteur.
const notify = createNotificationService({
  notifications: repositories.notifications,
  findUser,
  getUserSettings: userSettings,
  defaultSettings: DEFAULT_NOTIFICATION_SETTINGS,
  renderNotification,
});

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


// Nombre positif (ou nul si allowZero) — rejette NaN, chaînes non numériques et valeurs négatives.
function positiveNumber(v, { allowZero = false } = {}) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || (!allowZero && n === 0)) return null;
  return n;
}

// ---------- Auth : email + mot de passe, Google (simulé), reset ----------
const normEmail = (e) => String(e || '').trim().toLowerCase();
const findByEmail = (email) => repositories.users.findByEmail(email);

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

app.use('/api/auth', createAuthRegistrationRouter({
  users: repositories.users,
  verifications: repositories.authVerifications,
  validRegistration,
  makeUser,
  hashPassword,
  clientIp,
  newCode: sixDigitCode,
  deliverCode: deliverAuthCode,
  save,
  demoHint: demoHintFor,
  normalizeEmail: normEmail,
  rateLimit,
  openSession,
}));

app.use('/api/auth', createAuthAccessRouter({
  auth,
  users: repositories.users,
  verifications: repositories.authVerifications,
  resets: repositories.authResets,
  normalizeEmail: normEmail,
  rateLimit,
  verifyPassword,
  newToken,
  createSession: createPersistentSession,
  sessionDurationMs: SESSION_DURATION_MS,
  canAccessApp,
  newCode: sixDigitCode,
  deliverCode: deliverAuthCode,
  save,
  demoHint: demoHintFor,
  hashPassword,
  clearUserSessions,
  openSession,
  deleteSession: deletePersistentSession,
}));

app.use('/api', createAccountRouter({
  auth,
  publicUser,
  kycUserView,
}));

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

app.use('/api/kyc', createKycRouter({
  auth,
  kycRepository: repositories.kyc,
  save,
  kycUserView,
  validPhotos,
  maxAttempts: MAX_KYC_ATTEMPTS,
}));

// ---------- Profil ----------
const accountEmailService = createAccountEmailService({
  confirmations: repositories.accountConfirmations,
  normalizeEmail: normEmail,
  emailPattern: EMAIL_RE,
  findByEmail,
  verifyPassword,
  rateLimit,
  newCode: sixDigitCode,
  deliverCode: deliverAuthCode,
  demoHint: demoHintFor,
  clearUserSessions,
  auditChange,
  save,
});

app.use('/api/profile', createProfileRouter({
  auth,
  auditChange,
  save,
  publicUser,
  verifyPassword,
  hashPassword,
  clearUserSessions,
  accountEmail: accountEmailService,
}));

// ---------- RGPD : export et suppression de compte (PRD §6) ----------
const accountPrivacyService = createAccountPrivacyService({
  db,
  confirmations: repositories.accountConfirmations,
  messages: repositories.messages,
  kyc: repositories.kyc,
  rateLimit,
  newCode: sixDigitCode,
  deliverCode: deliverAuthCode,
  demoHint: demoHintFor,
  isClosedStatus: (status) => CLOSED_STATUSES.includes(status),
  clearUserSessions,
  auditChange,
  save,
});

app.use('/api/profile', createAccountPrivacyRouter({
  auth,
  accountPrivacy: accountPrivacyService,
}));

// ---------- Notifications ----------
app.use('/api/notifications', createNotificationsRouter({
  auth,
  notifications: repositories.notifications,
  renderNotification,
  save,
}));

// ---------- Formation voyageur (PRD §5.4) ----------
app.use('/api/training', createTrainingRouter({
  auth,
  save,
}));

// ---------- Référentiels ----------
app.use('/api/rules', createRulesRouter({
  getWhitelist: combinedWhitelist,
  blacklist: BLACKLIST,
  customs: CUSTOMS,
  localizeCategory,
  localizeCustoms,
}));

function localeForLang(lang) {
  return lang === 'nl' ? 'nl-BE' : lang === 'ar' ? 'ar-MA' : 'fr-BE';
}

// ---------- Trajets voyageur (PRD §2.1) ----------
const TRIP_TRANSPORT_MODES = new Set(['plane', 'car']);

function tripTransportMode(value) {
  return value === 'car' ? 'car' : 'plane';
}

const tripService = createTripService({
  db,
  isClosedStatus: (status) => CLOSED_STATUSES.includes(status),
  transportModes: TRIP_TRANSPORT_MODES,
  normalizeTransportMode: tripTransportMode,
  tripView: tripPostView,
  availableTrips: availableTripPosts,
  cleanupSavedTrips,
  positiveNumber,
  auditChange,
  save,
  newId,
  today: TODAY_ISO,
  canonicalizeLocation,
});

app.use('/api', createLocationsRouter({
  auth,
  suggest: suggestLocations,
  findById: findLocationById,
  stats: locationCatalogStats,
}));

app.use('/api', createTripsRouter({
  auth,
  trips: tripService,
}));

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
  if (query.from) trips = trips.filter((trip) => locationMatches(
    trip.from,
    query.from,
    { locationId: trip.fromLocationId, countryCode: trip.fromCountryCode || 'MA' },
  ));
  if (query.to) trips = trips.filter((trip) => locationMatches(
    trip.to,
    query.to,
    { locationId: trip.toLocationId, countryCode: trip.toCountryCode || 'MA' },
  ));
  if (query.date) trips = trips.filter((t) => (t.departureDate || t.date) >= String(query.date));
  const minCapacity = Number(query.capacityKg);
  if (Number.isFinite(minCapacity) && minCapacity >= 0 && String(query.capacityKg).trim() !== '')
    trips = trips.filter((t) => Number(t.capacityKg || 0) >= minCapacity);
  const maxPrice = Number(query.maxPrice);
  if (Number.isFinite(maxPrice) && maxPrice >= 0 && String(query.maxPrice).trim() !== '')
    trips = trips.filter((t) => Number(t.price ?? t.proposedPrice ?? 25) <= maxPrice);
  if (query.q) {
    const needle = normalizeLocationText(query.q);
    trips = trips.filter((trip) => (
      locationMatches(trip.from, query.q, {
        locationId: trip.fromLocationId,
        countryCode: trip.fromCountryCode || 'MA',
      })
      || locationMatches(trip.to, query.q, {
        locationId: trip.toLocationId,
        countryCode: trip.toCountryCode || 'MA',
      })
      || normalizeLocationText(
        `${trip.description || ''} ${findUser(trip.travelerId)?.name || ''}`,
      ).includes(needle)
    ));
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
  const lastMessage = clientMessageView(messages[messages.length - 1] || null);
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
    otherOnline: !!other && realtime.isOnline(other.id),
    otherLastSeenAt: other ? realtime.lastSeenAt(other.id) : null,
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
      ...clientMessageView(m),
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

function clientMessageView(message) {
  if (!message) return null;
  return {
    ...message,
    attachments: (message.attachments || []).map((attachment) => {
      const { dataUrl, storagePath, ...safe } = attachment;
      return {
        ...safe,
        url: safe.url || `/conversations/${message.conversationId}/messages/${message.id}/attachments/${attachment.id}`,
      };
    }),
  };
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
  const after = Number(query.after || 0);
  if (after > 0) messages = messages.filter((message) => message.at > after);
  const requestedLimit = Number(query.limit || 0);
  const limit = requestedLimit > 0 ? Math.max(1, Math.min(100, requestedLimit)) : 0;
  const total = messages.length;
  if (limit > 0 && messages.length > limit) {
    messages = after > 0 ? messages.slice(0, limit) : messages.slice(-limit);
  }
  const hasMore = limit > 0 && total > messages.length;
  const nextBefore = !after && hasMore ? messages[0]?.at || null : null;
  const nextAfter = after && hasMore ? messages.at(-1)?.at || null : null;
  return {
    messages,
    page: {
      limit: limit || null,
      total,
      hasMore,
      nextBefore,
      nextAfter,
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

app.use('/api', createTripOperationsRouter({
  auth,
  db,
  tripPostView,
  todayIso: TODAY_ISO,
  positiveNumber,
  newId,
  createEscrow,
  addEvent,
  findOrCreateConversation,
  notify,
  save,
  operationView,
  conversationView,
  isPartyToTx,
  transitionEscrow,
  issueOperationCode,
  audit,
  verifyOperationCode,
  findUser,
  repositories,
  disputeView,
  validPhotos,
}));

const conversationMessageService = createConversationMessageService({
  db,
  isPartyToTransaction: isPartyToTx,
  findUser,
  findOrCreateConversation,
  conversationView,
  conversationMessages,
  areParticipantsBlocked: areConversationParticipantsBlocked,
  normalizeLocation: normalizeMessageLocation,
  validPhotos,
  analyzeSafety: analyzeMessageSafety,
  registerSafetyAttempt: registerMessageSafetyAttempt,
  safetyError: messageSafetyError,
  reviewQueue: repositories.reviewQueue,
  notify,
  audit,
  save,
  broadcastConversation,
  messageMedia,
  newId,
});

app.use('/api', createConversationMessageRouter({
  auth,
  messages: conversationMessageService,
}));

app.use('/api', createMaintenanceRouter({
  auth,
  adminOnly,
  db,
  messageMedia,
  migrateMessageMedia: migrateInlineMessageMedia,
  audit,
  save,
}));

const conversationInbox = createConversationInboxService({
  db,
  conversationView,
  conversationMessagesPage,
  markConversationRead,
  unreadConversationCount,
  broadcastConversation,
  blockedUserIds,
  findUser,
  publicUser,
  audit,
  save,
});

app.use('/api', createConversationInboxRouter({
  auth,
  inbox: conversationInbox,
}));

// ---------- Operations ----------
const CLOSED_STATUSES = ['released', 'refunded', 'cancelled'];

const memberOverviewService = createMemberOverviewService({
  db,
  isParty: isPartyToTx,
  closedStatuses: CLOSED_STATUSES,
  unreadConversationCount,
});

app.use('/api', createMemberOverviewRouter({
  auth,
  memberOverview: memberOverviewService,
}));

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

const operationReadService = createOperationReadService({
  db,
  isClosedStatus: (status) => CLOSED_STATUSES.includes(status),
  isParty: isPartyToTx,
  operationView,
});

app.use('/api', createOperationReadsRouter({
  auth,
  operationReads: operationReadService,
}));

const publicProfileService = createPublicProfileService({
  db,
  findUser,
  publicUser,
  normalizeTransportMode: tripTransportMode,
  detectLeak,
  addEvent,
  save,
});

app.use('/api', createPublicProfilesRouter({
  auth,
  publicProfiles: publicProfileService,
}));

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

// ---------- Back-office ----------

const KYC_SLA_MS = 24 * 3600e3;
const adminFraudService = createAdminFraudService({
  db,
  findUser,
  messagesRepository: repositories.messages,
  kycRepository: repositories.kyc,
});

app.use('/api', createAdminFraudRouter({
  auth,
  adminOnly,
  adminFraud: adminFraudService,
}));

async function adminOpsSummary() {
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
  const risk = await adminFraudService.summary();
  const riskCount = Object.values(risk).reduce((s, n) => s + n, 0);
  const tasks = [
    {
      id: 'review-disputes',
      severity: reviewDisputes.length ? 'critical' : 'ok',
      count: reviewDisputes.length,
      tab: 'review',
      title: 'Litiges à arbitrer',
      body: 'Montant simulé gelé, preuves à lire et décision admin à prendre.',
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
  ];

  return {
    generatedAt: Date.now(),
    health: {
      status: reviewDisputes.length || overdueKyc.length ? 'critical' : reviewOpen.length || riskCount ? 'watch' : 'clear',
      reviewOpen: reviewOpen.length,
      conversationReports: reviewConversations.length,
      kycPending: pendingKyc.length,
      kycOverdue: overdueKyc.length,
      openDisputes: openDisputes.length,
      flaggedMessages: flaggedMessages.length,
      escrowHeld,
      riskSignals: riskCount,
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

const adminRecordService = createAdminRecordService({
  db,
  findUser,
  kycRepository: repositories.kyc,
  auditLogsRepository: repositories.auditLogs,
  messageSafetyWindowMs: MESSAGE_SAFETY_ATTEMPT_WINDOW_MS,
  kycSlaMs: KYC_SLA_MS,
});

app.use('/api', createAdminRecordsRouter({
  auth,
  adminOnly,
  adminRecords: adminRecordService,
}));

const adminActionService = createAdminActionService({
  db,
  findUser,
  activeSession,
  userView: adminRecordService.userView,
  reviewQueue: repositories.reviewQueue,
  customWhitelist: repositories.customWhitelist,
  kycRepository: repositories.kyc,
  maxKycAttempts: MAX_KYC_ATTEMPTS,
  notify,
  audit,
  save,
  newId,
});

app.use('/api', createAdminActionsRouter({
  auth,
  adminOnly,
  adminActions: adminActionService,
}));

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

app.use(observability.errorMiddleware);

const PORT = process.env.PORT || 4517;
if (!process.env.VERCEL) app.listen(PORT, () => console.log(`API Wigofly sur http://localhost:${PORT}`));
export default app;
