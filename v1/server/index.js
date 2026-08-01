import express from 'express';
import cors from 'cors';
import {
  acquireDatabaseState, createPersistentSession, databasePool, deletePersistentSession, deletePersistentSessionsForUser,
  databaseHealth, getDb, getPersistentSession, refreshDatabaseState, releaseDatabaseState, save, newId, usesDatabase,
} from './store.js';
import { WHITELIST, BLACKLIST, CUSTOMS, detectLeak, analyzeMessageSafety, localizeCategory, localizeCustoms } from './rules.js';
import {
  createDistributedRateLimit,
  hashPassword,
  verifyPassword,
  newToken,
  sixDigitCode,
  validRegistration,
  EMAIL_RE,
  rateLimit as localRateLimit,
} from './auth.js';
import { langMiddleware } from './middleware/language.js';
import { renderNotification } from './notify-i18n.js';
import { createEscrow, transitionEscrow } from './escrow.js';
import { createPersistence } from './persistence.js';
import { emailConfig, sendVerificationEmail } from './email.js';
import {
  listRelationalSavedTrips, listRelationalTrips, relationalTrip,
  relationalTripReadsEnabled, relationalUserFromSession,
  snapshotRelationalTripState, syncRelationalTripState,
} from './relational-trip-feed.js';
import {
  listRelationalConversations, relationalAdminMessageArchive,
  relationalConversation, relationalMessageReadsEnabled,
} from './relational-messaging.js';
import {
  createRelationalMessageWriter,
  relationalMessageWritesEnabled,
} from './relational-message-writes.js';
import {
  relationalConversationMembersEnabled,
} from './relational-conversation-members.js';
import {
  listRelationalOperations,
  relationalOperation,
  relationalOperationReadsEnabled,
} from './relational-operations.js';
import {
  createRelationalTripWriter,
  relationalTripMutationsEnabled,
  relationalTripWritesEnabled,
} from './relational-trip-writes.js';
import {
  createRelationalOperationWriter,
  relationalOperationWritesEnabled,
} from './relational-operation-writes.js';
import {
  relationalNavigationEnabled,
  relationalNavigationSummary,
} from './relational-navigation.js';
import {
  relationalActiveOperationCount,
  relationalMemberRecords,
} from './relational-member-records.js';
import {
  relationalAdminKpis,
  relationalAdminOperationState,
} from './relational-admin-operations.js';
import { relationalAuditLogs } from './relational-audit-logs.js';
import { relationalCustomWhitelist } from './relational-rules.js';
import { createRelationalAdminReview } from './relational-admin-review.js';
import {
  rateRelationalOperation,
  relationalPublicProfile,
  relationalPublicProfileReadsEnabled,
  relationalPublicReviews,
} from './relational-public-profiles.js';
import {
  createRelationalAuthRepositories,
  relationalAuthEnabled,
} from './relational-auth-repositories.js';
import {
  createRelationalKycRepository,
  relationalKycEnabled,
} from './relational-kyc.js';
import {
  relationalAdminMembersEnabled,
  relationalAdminUsers,
  relationalAdminUsersByIds,
} from './relational-admin-members.js';
import {
  createRelationalAdminMemberMutations,
  relationalAdminActionsEnabled,
} from './relational-admin-actions.js';
import {
  createRelationalSafetyAppeals,
  relationalSafetyAppealsEnabled,
} from './relational-safety-appeals.js';
import { relationalId } from './relational-id.js';
import { adminOnly } from './middleware/admin-only.js';
import { createSecurityHeaders } from './middleware/security-headers.js';
import { createDatabaseAvailability } from './middleware/database-availability.js';
import { createPersistenceState } from './middleware/persistence-state.js';
import { createSessionAuth } from './middleware/session-auth.js';
import { createRelationalReadAuth } from './middleware/relational-read-auth.js';
import {
  lazyGlobalStateEnabled,
  loadRuntimeConfig,
} from './config/runtime.js';
import { createCorsOptions } from './config/cors-options.js';
import { createObservability } from './observability.js';
import { createSystemRouter } from './routes/system.js';
import { createObservabilityRouter } from './routes/observability.js';
import { createMaintenanceRouter } from './routes/maintenance.js';
import { createCronRouter } from './routes/cron.js';
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
import { createRelationalMessageWriteRouter } from './routes/relational-message-writes.js';
import { createRelationalTripWriteRouter } from './routes/relational-trip-writes.js';
import { createRelationalOperationWriteRouter } from './routes/relational-operation-writes.js';
import { createRelationalNavigationRouter } from './routes/relational-navigation.js';
import { createRelationalPublicProfilesRouter } from './routes/relational-public-profiles.js';
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
import { createAdminOperationsRouter } from './routes/admin-operations.js';
import { createAdminReviewRouter } from './routes/admin-review.js';
import { createLocationsRouter } from './routes/locations.js';
import { createAuditService } from './services/audit.js';
import { createNotificationService } from './services/notifications.js';
import { createAccountEmailService } from './services/account-email.js';
import { createAccountPrivacyService } from './services/account-privacy.js';
import {
  createRelationalAccountDeletion,
  relationalAccountMessages,
} from './relational-account-privacy.js';
import { createRealtimeService } from './services/realtime.js';
import { createConversationInboxService } from './services/conversation-inbox.js';
import { createConversationMessageService } from './services/conversation-messages.js';
import { createMessageMediaService } from './services/message-media.js';
import { createKycMediaService } from './services/kyc-media.js';
import { createProfileMediaService } from './services/profile-media.js';
import { createMemberMediaUploadService } from './services/member-media-uploads.js';
import { createRetentionService } from './services/retention.js';
import { createCapacityService } from './services/capacity.js';
import { createTripService } from './services/trips.js';
import { createOperationReadService } from './services/operation-reads.js';
import { createAdminRecordService } from './services/admin-records.js';
import { createPublicProfileService } from './services/public-profiles.js';
import { createMemberOverviewService } from './services/member-overview.js';
import { createAdminActionService } from './services/admin-actions.js';
import { createAdminFraudService } from './services/admin-fraud.js';
import { relationalAdminFraudState } from './relational-admin-fraud.js';
import { createAdminOperationsService } from './services/admin-operations.js';
import { createAdminReviewService } from './services/admin-review.js';
import {
  createConversationDomain,
  MESSAGE_SAFETY_ATTEMPT_WINDOW_MS,
} from './services/conversation-domain.js';
import { createOperationCodeService } from './services/operation-codes.js';
import { createOperationProjections } from './services/operation-projections.js';
import { createTripProjections } from './services/trip-projections.js';
import { migrateInlineMessageMedia } from './migrate-message-media.js';
import { migrateInlineKycMedia } from './migrate-kyc-media.js';
import { migrateInlineProfileMedia } from './migrate-profile-media.js';
import {
  canonicalizeLocation,
  findLocationById,
  locationCatalogStats,
  locationMatches,
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
const SUPABASE_SECRET_KEY = String(
  process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
).trim();
const STORAGE_READY = !!(SUPABASE_URL && SUPABASE_SECRET_KEY);
// The database URL is server-only and already mandatory in production. A dedicated
// OPERATION_CODE_SECRET can supersede it without making deployments brittle.
const OPERATION_CODE_SECRET = process.env.OPERATION_CODE_SECRET || process.env.DATABASE_URL || 'wigofly-local-operation-code-secret';
app.set('trust proxy', 1);
app.use(cors(createCorsOptions({
  isProduction: IS_PRODUCTION,
  appOrigins: APP_ORIGINS,
})));
app.use(createSecurityHeaders({
  newRequestId: () => relationalId('req'),
  supabaseUrl: SUPABASE_URL,
  supabaseRealtimeOrigin: SUPABASE_REALTIME_ORIGIN,
}));
app.use(observability.middleware);
// KYC may contain three compressed captures. All other JSON endpoints stay
// deliberately small so unauthenticated oversized bodies cannot exhaust a
// serverless instance before authentication runs.
app.use('/api/kyc/submit', express.json({ limit: '3mb' }));
app.use(express.json({ limit: '1mb' }));
// i18n des erreurs API : traduit body.error à la sortie selon Accept-Language (fr/ar/nl).
app.use(langMiddleware);

// Production never falls back to the packaged JSON data when Supabase is missing.
// Health remains public so Vercel can show the configuration problem clearly.
app.use(createDatabaseAvailability({
  isProduction: IS_PRODUCTION,
  databaseHealth,
}));

const db = getDb();
const rateLimit = createDistributedRateLimit({
  pool: usesDatabase() ? databasePool() : null,
  fallback: localRateLimit,
});

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
  relationalMessageWritesEnabled,
  relationalOperationReadsEnabled,
  relationalTripWritesEnabled,
  relationalTripMutationsEnabled,
  relationalOperationWritesEnabled,
  relationalNavigationEnabled,
  relationalPublicProfileReadsEnabled,
  relationalAuthEnabled,
  relationalKycEnabled,
  relationalAdminMembersEnabled,
  relationalAdminActionsEnabled,
  relationalAdminDashboardEnabled: () => (
    usesDatabase() && relationalAuthEnabled()
  ),
  relationalSafetyAppealsEnabled,
  lazyGlobalStateEnabled,
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
  storageReady: STORAGE_READY,
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
const relationalAuthRepositories = createRelationalAuthRepositories({
  getPool: databasePool,
});
const relationalKycRepository = createRelationalKycRepository({
  getPool: databasePool,
});
const relationalAdminMemberMutations = createRelationalAdminMemberMutations({
  getPool: databasePool,
});
const relationalSafetyAppeals = createRelationalSafetyAppeals({
  getPool: databasePool,
});
const authRepositories = relationalAuthEnabled()
  ? relationalAuthRepositories
  : {
      users: repositories.users,
      verifications: repositories.authVerifications,
      resets: repositories.authResets,
      confirmations: repositories.accountConfirmations,
    };
const kycRepository = relationalKycEnabled()
  ? relationalKycRepository
  : repositories.kyc;
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
  findUser: relationalAuthEnabled()
    ? authRepositories.users.findById
    : findUser,
  persistUser: relationalAuthEnabled()
    ? authRepositories.users.updateChanged
    : null,
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
  findUser: relationalAuthEnabled()
    ? authRepositories.users.findById
    : findUser,
});
const messageMedia = createMessageMediaService({
  url: SUPABASE_URL,
  secretKey: SUPABASE_SECRET_KEY,
  bucket: String(process.env.SUPABASE_MESSAGE_MEDIA_BUCKET || 'wigofly-message-media').trim(),
});
const kycMedia = createKycMediaService({
  url: SUPABASE_URL,
  secretKey: SUPABASE_SECRET_KEY,
  bucket: String(process.env.SUPABASE_KYC_MEDIA_BUCKET || 'wigofly-kyc-media').trim(),
});
const profileMedia = createProfileMediaService({
  url: SUPABASE_URL,
  secretKey: SUPABASE_SECRET_KEY,
  bucket: String(process.env.SUPABASE_PROFILE_MEDIA_BUCKET || 'wigofly-profile-media').trim(),
});
const memberMediaUploads = createMemberMediaUploadService({
  getPool: databasePool,
  kycMedia,
  profileMedia,
});
const retention = createRetentionService({
  getPool: databasePool,
  messageMedia,
  memberMediaUploads,
});
const capacity = createCapacityService({
  getPool: databasePool,
});

app.use('/api', createCronRouter({
  secret: process.env.CRON_SECRET,
  retention,
  capacity,
}));

// Vercel serverless ne conserve pas suffisamment longtemps une connexion SSE.
// Les clients utilisent donc le WebSocket gere par Supabase Realtime.
app.use('/api/realtime', createRealtimeRouter({
  auth,
  realtime,
}));

const relationalReadsEnabled = () =>
  relationalTripReadsEnabled()
  || relationalMessageReadsEnabled()
  || relationalOperationReadsEnabled();
const relationalConversationReader = (args) => relationalConversation({
  ...args,
  memberStateEnabled: relationalConversationMembersEnabled(),
});
const relationalConversationList = (args) => listRelationalConversations({
  ...args,
  memberStateEnabled: relationalConversationMembersEnabled(),
});
const relationalNavigationReader = (args) => relationalNavigationSummary({
  ...args,
  memberStateEnabled: relationalConversationMembersEnabled(),
});
const relationalReadAuth = createRelationalReadAuth({
  enabled: relationalReadsEnabled,
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});
const relationalMessageWriteAuth = createRelationalReadAuth({
  enabled: relationalMessageWritesEnabled,
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});
const relationalTripWriteAuth = createRelationalReadAuth({
  enabled: () => (
    relationalTripWritesEnabled()
    || relationalTripMutationsEnabled()
  ),
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});
const relationalOperationWriteAuth = createRelationalReadAuth({
  enabled: relationalOperationWritesEnabled,
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});
const relationalNavigationAuth = createRelationalReadAuth({
  enabled: relationalNavigationEnabled,
  getPool: databasePool,
  findUserFromSession: relationalUserFromSession,
  getSession: activeSession,
  canAccessApp,
});
const relationalPublicProfileAuth = createRelationalReadAuth({
  enabled: () => (
    relationalPublicProfileReadsEnabled()
    || relationalOperationWritesEnabled()
  ),
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
  getTrip: relationalTrip,
  listSavedTrips: listRelationalSavedTrips,
  listConversations: relationalConversationList,
  getConversation: relationalConversationReader,
  operationReadsEnabled: relationalOperationReadsEnabled,
  listOperations: listRelationalOperations,
  getOperation: relationalOperation,
  operationCodePublicState: (value) => operationCodePublicState(value),
  disputeView: (value, transaction) => disputeView(value, transaction),
  today: TODAY_ISO,
}));

app.use('/api', createRelationalNavigationRouter({
  auth: relationalNavigationAuth,
  enabled: relationalNavigationEnabled,
  getPool: databasePool,
  summary: relationalNavigationReader,
}));

function addEvent(tx, type, actorId, meta = {}) {
  tx.events.push({ id: newId('e'), type, actorId, meta, at: Date.now() });
}

const operationCodes = createOperationCodeService({ secret: OPERATION_CODE_SECRET });
const {
  issue: issueOperationCode,
  publicState: operationCodePublicState,
  verify: verifyOperationCode,
} = operationCodes;

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

const relationalTripWriter = createRelationalTripWriter({
  getPool: databasePool,
  getTrip: relationalTrip,
  today: TODAY_ISO,
  canonicalizeLocation,
  auditChange,
});

app.use('/api', createRelationalTripWriteRouter({
  auth: relationalTripWriteAuth,
  enabled: relationalTripWritesEnabled,
  mutationsEnabled: relationalTripMutationsEnabled,
  writer: relationalTripWriter,
}));

const IMG_RE = /^data:image\/(jpeg|png|webp);base64,/;
function validPhotos(photos) {
  if (!Array.isArray(photos)) return false;
  return photos.every((photo) => (
    (typeof photo === 'string' && IMG_RE.test(photo) && photo.length <= 700 * 1024)
    || (
      photo
      && typeof photo === 'object'
      && /^media-[a-f0-9-]{36}$/.test(String(photo.uploadId || ''))
      && ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto'].includes(photo.field)
    )
  ));
}

// Liste blanche effective = base statique + catégories promues depuis la zone grise
// après validation admin (évite de rejuger indéfiniment le même produit — §4.2).
const combinedWhitelist = () => repositories.customWhitelist.combinedWith(WHITELIST);

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
    id: relationalAuthEnabled() ? relationalId('u') : newId('u'),
    name: name.trim(), email: normEmail(email), phone: phone || '',
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
  if (req) {
    user.lastIp = clientIp(req);
    user.lastLoginAt = Date.now();
  }
  if (typeof authRepositories.users.update === 'function') {
    await authRepositories.users.update(user);
  }
  await createPersistentSession({ token, userId: user.id, expiresAt: sessionExpiresAt });
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
  users: authRepositories.users,
  verifications: authRepositories.verifications,
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
  users: authRepositories.users,
  verifications: authRepositories.verifications,
  resets: authRepositories.resets,
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
async function kycUserView(user) {
  const mine = await kycRepository.listForUser(user.id);
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
  kycRepository,
  kycMedia,
  memberMediaUploads,
  save: relationalKycEnabled() ? async () => {} : save,
  persistUser: relationalKycEnabled()
    ? (user, before) => authRepositories.users.updateChanged(user, before)
    : null,
  kycUserView,
  validPhotos,
  maxAttempts: MAX_KYC_ATTEMPTS,
}));

// ---------- Profil ----------
const accountEmailService = createAccountEmailService({
  confirmations: authRepositories.confirmations,
  normalizeEmail: normEmail,
  emailPattern: EMAIL_RE,
  findByEmail: relationalAuthEnabled()
    ? authRepositories.users.findByEmail
    : findByEmail,
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
  profileMedia,
  memberMediaUploads,
  allowInlineMediaFallback: !IS_PRODUCTION,
}));

// ---------- RGPD : export et suppression de compte (PRD §6) ----------
const accountPrivacyService = createAccountPrivacyService({
  db,
  confirmations: relationalAuthEnabled()
    ? authRepositories.confirmations
    : repositories.accountConfirmations,
  messages: repositories.messages,
  kyc: kycRepository,
  rateLimit,
  newCode: sixDigitCode,
  deliverCode: deliverAuthCode,
  demoHint: demoHintFor,
  isClosedStatus: (status) => CLOSED_STATUSES.includes(status),
  clearUserSessions,
  auditChange,
  save,
  loadRelationalRecords: usesDatabase()
    ? (userId) => relationalMemberRecords({
      pool: databasePool(),
      userId,
    })
    : null,
  loadRelationalMessages: usesDatabase()
    ? (userId) => relationalAccountMessages({
      pool: databasePool(),
      userId,
    })
    : null,
  loadSafetyState: relationalSafetyAppealsEnabled()
    ? (query) => relationalSafetyAppeals.safetyState(query)
    : null,
  countRelationalActiveOperations: usesDatabase()
    ? (userId) => relationalActiveOperationCount({
      pool: databasePool(),
      userId,
    })
    : null,
  deleteRelationalAccount: relationalAuthEnabled()
    ? createRelationalAccountDeletion({ getPool: databasePool })
    : null,
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
  getWhitelist: usesDatabase()
    ? async () => [
      ...WHITELIST,
      ...await relationalCustomWhitelist({
        pool: databasePool(),
      }),
    ]
    : combinedWhitelist,
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

const {
  tripPostView,
  availableTripPosts,
  cleanupSavedTrips,
} = createTripProjections({
  db,
  findUser,
  publicUser,
  todayIso: TODAY_ISO,
  transportMode: tripTransportMode,
  locationMatches,
  normalizeLocationText,
});

const { operationView } = createOperationProjections({
  db,
  txView,
  tripPostView,
  disputeView,
  operationCodePublicState,
});

const {
  adminConversationModerationView,
  areConversationParticipantsBlocked,
  blockedUserIds,
  broadcastConversation,
  conversationMessages,
  conversationMessagesPage,
  conversationView,
  findOrCreateConversation,
  markConversationRead,
  messageSafetyError,
  normalizeMessageLocation,
  registerMessageSafetyAttempt,
  unreadConversationCount,
} = createConversationDomain({
  db,
  repositories,
  realtime,
  findUser,
  publicUser,
  tripPostView,
  operationView,
  todayIso: TODAY_ISO,
  newId,
});

const relationalMessageWriter = createRelationalMessageWriter({
  getPool: databasePool,
  getConversation: relationalConversationReader,
  validPhotos,
  analyzeSafety: analyzeMessageSafety,
  safetyError: messageSafetyError,
  messageMedia,
  allowInlineMediaFallback: !IS_PRODUCTION,
  async notificationFor(userId, senderName, client) {
    const result = await client.query(
      'select data from public.wigofly_users where id = $1',
      [userId],
    );
    const recipient = result.rows[0]?.data;
    const enabled = recipient?.settings?.notifications?.messages
      ?? DEFAULT_NOTIFICATION_SETTINGS.messages;
    if (!enabled) return null;
    const keyed = {
      key: 'chat.message',
      params: { name: senderName },
    };
    return {
      ...keyed,
      text: renderNotification('fr', keyed),
    };
  },
  broadcastConversation,
  memberStateEnabled: relationalConversationMembersEnabled,
});

app.use('/api', createRelationalMessageWriteRouter({
  auth: relationalMessageWriteAuth,
  enabled: relationalMessageWritesEnabled,
  writer: relationalMessageWriter,
  today: TODAY_ISO,
}));

const relationalOperationWriter = createRelationalOperationWriter({
  getPool: databasePool,
  getOperation: relationalOperation,
  getConversation: relationalConversationReader,
  operationCodePublicState,
  disputeView,
  createEscrow,
  transitionEscrow,
  issueOperationCode,
  verifyOperationCode,
  notify,
  audit,
  validPhotos,
  today: TODAY_ISO,
  memberStateEnabled: relationalConversationMembersEnabled,
});

app.use('/api', createRelationalOperationWriteRouter({
  auth: relationalOperationWriteAuth,
  enabled: relationalOperationWritesEnabled,
  writer: relationalOperationWriter,
}));

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
  allowInlineMediaFallback: !IS_PRODUCTION,
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
  kycMedia,
  profileMedia,
  migrateMessageMedia: migrateInlineMessageMedia,
  migrateKycMedia: migrateInlineKycMedia,
  migrateProfileMedia: migrateInlineProfileMedia,
  capacity,
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

app.use('/api', createRelationalPublicProfilesRouter({
  auth: relationalPublicProfileAuth,
  readsEnabled: relationalPublicProfileReadsEnabled,
  writesEnabled: relationalOperationWritesEnabled,
  getPool: databasePool,
  profile: relationalPublicProfile,
  reviews: relationalPublicReviews,
  rate: rateRelationalOperation,
  normalizeTransportMode: tripTransportMode,
  detectLeak,
}));

app.use('/api', createPublicProfilesRouter({
  auth,
  publicProfiles: publicProfileService,
}));

// ---------- Litiges (PRD §3 Phase 6, §4.6) ----------
const EVIDENCE_WINDOW_MS = 72 * 3600e3; // 72h pour soumettre des preuves (PRD §3 Phase 6)
const RESOLUTION_TARGET_MS = 7 * 864e5; // cible 7 jours (PRD §4.6)

function disputeView(d) {
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
  kycRepository,
  loadRelationalFraudState: usesDatabase()
    ? () => relationalAdminFraudState({
      pool: databasePool(),
    })
    : null,
});

app.use('/api', createAdminFraudRouter({
  auth,
  adminOnly,
  adminFraud: adminFraudService,
}));

const adminOperationsService = createAdminOperationsService({
  db,
  repositories,
  adminFraud: adminFraudService,
  findUser,
  adminConversationModerationView,
  disputeView,
  localeForLang,
  kycSlaMs: KYC_SLA_MS,
  loadRelationalOperationState: usesDatabase()
    ? () => relationalAdminOperationState({
      pool: databasePool(),
    })
    : null,
  loadRelationalKpis: usesDatabase()
    ? (lang) => relationalAdminKpis({
      pool: databasePool(),
      locale: localeForLang(lang),
    })
    : null,
});

app.use('/api', createAdminOperationsRouter({
  auth,
  adminOnly,
  adminOperations: adminOperationsService,
}));

const adminRecordService = createAdminRecordService({
  db,
  findUser,
  loadUsers: relationalAdminMembersEnabled()
    ? (query) => relationalAdminUsers({
      pool: databasePool(),
      q: query.q,
      limit: query.limit,
      cursor: query.cursor,
    })
    : null,
  loadUser: relationalAdminMembersEnabled()
    ? authRepositories.users.findById
    : null,
  loadUsersByIds: relationalAdminMembersEnabled()
    ? (ids) => relationalAdminUsersByIds({
      pool: databasePool(),
      ids,
    })
    : null,
  findKycUser: relationalKycEnabled()
    ? authRepositories.users.findById
    : findUser,
  kycRepository,
  countVerifiedUsers: relationalKycEnabled()
    ? () => kycRepository.verifiedUserCount()
    : null,
  kycMedia,
  auditLogsRepository: repositories.auditLogs,
  loadAuditLogs: usesDatabase()
    ? ({ limit, cursor }) => relationalAuditLogs({
      pool: databasePool(),
      limit,
      cursor,
    })
    : null,
  messageSafetyWindowMs: MESSAGE_SAFETY_ATTEMPT_WINDOW_MS,
  kycSlaMs: KYC_SLA_MS,
  loadMessageArchive: relationalMessageWritesEnabled()
    ? ({ userId, offset, limit }) => relationalAdminMessageArchive({
      pool: databasePool(),
      userId,
      offset,
      limit,
    })
    : null,
  loadRelationalRecords: usesDatabase()
    ? (userId) => relationalMemberRecords({
      pool: databasePool(),
      userId,
    })
    : null,
});

app.use('/api', createAdminRecordsRouter({
  auth,
  adminOnly,
  adminRecords: adminRecordService,
}));

const adminActionService = createAdminActionService({
  db,
  findUser: relationalSafetyAppealsEnabled()
    ? authRepositories.users.findById
    : findUser,
  findKycUser: relationalKycEnabled()
    ? authRepositories.users.findById
    : findUser,
  activeSession,
  userView: adminRecordService.userView,
  reviewQueue: repositories.reviewQueue,
  customWhitelist: repositories.customWhitelist,
  kycRepository,
  maxKycAttempts: MAX_KYC_ATTEMPTS,
  notify,
  audit,
  save,
  saveKyc: relationalKycEnabled() ? async () => {} : save,
  newId,
  persistUser: relationalKycEnabled()
    ? (user) => authRepositories.users.update(user)
    : null,
  persistKyc: relationalKycEnabled()
    ? (submission) => kycRepository.updateSubmission(submission)
    : null,
  persistKycDecision: relationalKycEnabled()
    ? (record) => kycRepository.commitDecision(record)
    : null,
  adminMemberMutations: relationalAdminActionsEnabled()
    ? relationalAdminMemberMutations
    : null,
  safetyAppealRepository: relationalSafetyAppealsEnabled()
    ? relationalSafetyAppeals
    : null,
});

app.use('/api', createAdminActionsRouter({
  auth,
  adminOnly,
  adminActions: adminActionService,
}));

const relationalAdminReview = usesDatabase()
  ? createRelationalAdminReview({
    getPool: databasePool,
    whitelist: WHITELIST,
    transitionEscrow,
    notify,
    audit,
  })
  : null;

const adminReviewService = createAdminReviewService({
  db,
  repositories,
  whitelist: WHITELIST,
  transitionEscrow,
  addEvent,
  audit,
  notify,
  save,
  relationalReview: relationalAdminReview,
});

app.use('/api', createAdminReviewRouter({
  auth,
  adminOnly,
  adminReview: adminReviewService,
}));

// ---------- Mode demo/test ----------
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
