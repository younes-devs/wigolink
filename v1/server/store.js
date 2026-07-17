// Persistance JSON simple (V1 démo). Remplacer par une vraie DB avant prod.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import pg from 'pg';

// Configurable pour isoler les tests automatisés sur leur propre fichier (jamais le
// data.json du dev/démo en cours) — voir server/test/.
const DATA_FILE = process.env.DATA_FILE || path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');
const { Pool } = pg;

export function emptyState() {
  return {
    users: [], trips: [], listings: [], transactions: [], matchingOffers: [],
    savedTrips: [], conversations: [], messages: [], notifications: [], disputes: [],
    reviewQueue: [], otps: {}, sessions: {}, resets: {}, pendingVerifications: {},
    customWhitelist: [], kycSubmissions: [], kycDecisions: [], auditLogs: [], nextId: 100,
  };
}

function seed() {
  const now = Date.now();
  return {
    users: [
      {
        id: 'u-fatima', name: 'Fatima B.', phone: '+212600000001', city: 'Casablanca',
        kycStatus: 'verified', rating: 4.9, ratingCount: 12, completed: 12, cancelRate: 0,
        maxValue: 500, maxActive: 3, badges: [], avatar: '🧕', createdAt: now - 200 * 864e5,
      },
      {
        id: 'u-karim', name: 'Karim E.', phone: '+32470000002', city: 'Bruxelles',
        kycStatus: 'verified', rating: 4.8, ratingCount: 9, completed: 7, cancelRate: 0.05,
        maxValue: 500, maxActive: 3, badges: ['voyageur-confirme'], avatar: '🧑‍🎓', createdAt: now - 150 * 864e5,
      },
      {
        id: 'u-mehdi', name: 'Mehdi R.', phone: '+32470000003', city: 'Bruxelles',
        kycStatus: 'verified', rating: 5.0, ratingCount: 4, completed: 4, cancelRate: 0,
        maxValue: 500, maxActive: 3, badges: [], avatar: '🧔', createdAt: now - 90 * 864e5,
      },
      {
        id: 'u-admin', name: 'Équipe Wigofly', phone: '+32470000000', city: '—',
        kycStatus: 'verified', isAdmin: true, rating: null, ratingCount: 0, completed: 0,
        cancelRate: 0, maxValue: 99999, maxActive: 99, badges: [], avatar: '🛡️', createdAt: now - 300 * 864e5,
      },
    ],
    trips: [
      {
        id: 't-1', travelerId: 'u-karim', from: 'Casablanca', to: 'Bruxelles',
        date: new Date(now + 12 * 864e5).toISOString().slice(0, 10), capacityKg: 8,
      },
    ],
    listings: [
      {
        id: 'l-1', senderId: 'u-fatima', title: "Huile d'argan + amlou pour mes enfants",
        categoryId: 'argan', categoryLabel: "Huile d'argan scellée", icon: '🫒',
        description: "2 bouteilles d'huile d'argan alimentaire scellées (1 L) et un pot d'amlou artisanal emballé.",
        weightKg: 3, valueEur: 60, from: 'Casablanca', to: 'Bruxelles',
        photos: ['/assets/seed/argan.jpg', '/assets/seed/amlou.jpg'],
        dateFrom: new Date(now + 5 * 864e5).toISOString().slice(0, 10),
        dateTo: new Date(now + 20 * 864e5).toISOString().slice(0, 10),
        travelerPay: 15, commissionRate: 0.18, status: 'published',
        whitelistVerdict: 'whitelisted', recipientId: 'u-mehdi', createdAt: now - 2 * 864e5,
      },
      {
        id: 'l-2', senderId: 'u-fatima', title: 'Safran de Taliouine (30 g)',
        categoryId: 'safran', categoryLabel: 'Safran', icon: '🌸',
        description: 'Safran en filaments, boîtes scellées de 10 g, origine Taliouine.',
        weightKg: 0.2, valueEur: 90, from: 'Casablanca', to: 'Bruxelles',
        photos: ['/assets/seed/safran.jpg'],
        dateFrom: new Date(now + 3 * 864e5).toISOString().slice(0, 10),
        dateTo: new Date(now + 25 * 864e5).toISOString().slice(0, 10),
        travelerPay: 12, commissionRate: 0.18, status: 'published',
        whitelistVerdict: 'whitelisted', recipientId: 'u-mehdi', createdAt: now - 864e5,
      },
    ],
    transactions: [],
    matchingOffers: [],
    savedTrips: [],
    conversations: [],
    messages: [],
    disputes: [],
    reviewQueue: [],
    otps: {},
    sessions: {},
    // Catégories promues depuis la zone grise après validation admin (§4.2 : moteur de
    // règles éditable côté serveur sans release app).
    customWhitelist: [],
    // Demandes de vérification d'identité (PRD KYC manuel). Une entrée par soumission.
    kycSubmissions: [],
    // Journal des décisions KYC (imputabilité + détection de patterns).
    kycDecisions: [],
    auditLogs: [],
    nextId: 100,
  };
}

let db = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : seed();
let pool = null;
let databaseEnabled = false;
let persistentSessionsEnabled = false;
let databaseError = null;
let stateLoadedAt = 0;
const READ_CACHE_MS = Math.max(250, Math.min(10_000, Number(process.env.STATE_READ_CACHE_MS) || 1_500));

if (process.env.DATABASE_URL) {
  try {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Keep state writes and independent session operations from blocking each other.
    max: 2,
    idleTimeoutMillis: 5000,
  });
  const result = await pool.query('select state from wigofly_app_state where id = 1');
  if (result.rows[0]?.state) {
    db = result.rows[0].state;
    stateLoadedAt = Date.now();
  } else if (process.env.NODE_ENV === 'production') {
    throw new Error('La base Supabase est vide. Executez npm run migrate:supabase avant de demarrer l API.');
  }
  databaseEnabled = true;
  const sessionTable = await pool.query("select to_regclass('public.wigofly_sessions') as name");
  if (!sessionTable.rows[0]?.name) {
    // Les fonctions Vercel ne conservent pas leur memoire entre deux requetes :
    // une table de sessions est donc indispensable pour ne pas perdre la connexion au refresh.
    await pool.query(`create table if not exists public.wigofly_sessions (
      token_hash text primary key,
      user_id text not null,
      created_at timestamptz not null default now(),
      expires_at timestamptz not null
    )`);
    await pool.query('create index if not exists wigofly_sessions_user_id_idx on public.wigofly_sessions (user_id)');
    await pool.query('create index if not exists wigofly_sessions_expires_at_idx on public.wigofly_sessions (expires_at)');
  }
  persistentSessionsEnabled = true;
  } catch (error) {
    databaseError = error;
    console.error('Connexion Supabase indisponible', error.message);
    if (pool) await pool.end().catch(() => {});
    pool = null;
  }
} else if (process.env.NODE_ENV === 'production') {
  databaseError = new Error('DATABASE_URL est requis en production.');
}

// Migration : comptes existants sans email/mot de passe (démo : demo1234).
import { hashPassword } from './auth.js';
const DEMO_EMAILS = {
  'u-fatima': 'fatima@demo.wigofly.app',
  'u-karim': 'karim@demo.wigofly.app',
  'u-mehdi': 'mehdi@demo.wigofly.app',
  'u-admin': 'admin@demo.wigofly.app',
};
let migrated = false;
for (const u of db.users) {
  if (!u.email) {
    u.email = DEMO_EMAILS[u.id] || `${u.id}@demo.wigofly.app`;
    u.passwordHash = hashPassword('demo1234');
    u.emailVerified = true;
    u.provider = 'email';
    migrated = true;
  }
}
if (!db.resets) { db.resets = {}; migrated = true; }
if (!db.pendingVerifications) { db.pendingVerifications = {}; migrated = true; }
if (!db.customWhitelist) { db.customWhitelist = []; migrated = true; }
if (!db.kycSubmissions) { db.kycSubmissions = []; migrated = true; }
if (!db.kycDecisions) { db.kycDecisions = []; migrated = true; }
if (!db.matchingOffers) { db.matchingOffers = []; migrated = true; }
if (!db.savedTrips) { db.savedTrips = []; migrated = true; }
if (!db.conversations) { db.conversations = []; migrated = true; }
if (!db.auditLogs) { db.auditLogs = []; migrated = true; }

export function save() {
  if (databaseEnabled) return;
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function getDb() {
  return db;
}

export function newId(prefix) {
  db.nextId += 1;
  return `${prefix}-${db.nextId}`;
}

export function usesDatabase() {
  return databaseEnabled;
}

export function databaseHealth() {
  if (databaseEnabled) return 'connected';
  if (databaseError) return 'unavailable';
  return 'local';
}

// Shared by the relational repositories so production uses one bounded pool.
export function databasePool() {
  return pool;
}

export async function createPersistentSession({ token, userId, expiresAt, createdAt = Date.now() }) {
  if (!databaseEnabled || !persistentSessionsEnabled) {
    db.sessions[token] = { userId, createdAt, expiresAt };
    return;
  }
  await pool.query(
    `insert into wigofly_sessions (token_hash, user_id, created_at, expires_at)
     values ($1, $2, to_timestamp($3 / 1000.0), to_timestamp($4 / 1000.0))`,
    [hashToken(token), userId, createdAt, expiresAt]
  );
}

export async function getPersistentSession(token) {
  if (!token) return null;
  if (!databaseEnabled || !persistentSessionsEnabled) return db.sessions?.[token] || null;
  const result = await pool.query(
    `select user_id, extract(epoch from expires_at) * 1000 as expires_at
     from wigofly_sessions
     where token_hash = $1 and expires_at > now()`,
    [hashToken(token)]
  );
  const row = result.rows[0];
  return row ? { userId: row.user_id, expiresAt: Number(row.expires_at) } : null;
}

export async function deletePersistentSession(token) {
  if (!token) return;
  if (!databaseEnabled || !persistentSessionsEnabled) {
    delete db.sessions[token];
    return;
  }
  await pool.query('delete from wigofly_sessions where token_hash = $1', [hashToken(token)]);
}

export async function deletePersistentSessionsForUser(userId) {
  if (!databaseEnabled || !persistentSessionsEnabled) {
    for (const [token, session] of Object.entries(db.sessions || {})) {
      if (session?.userId === userId || session === userId) delete db.sessions[token];
    }
    return;
  }
  await pool.query('delete from wigofly_sessions where user_id = $1', [userId]);
}

function replaceState(next) {
  for (const key of Object.keys(db)) delete db[key];
  Object.assign(db, next || emptyState());
  stateLoadedAt = Date.now();
}

export async function refreshDatabaseState() {
  if (!databaseEnabled || Date.now() - stateLoadedAt < READ_CACHE_MS) return;
  const result = await pool.query('select state from wigofly_app_state where id = 1');
  if (!result.rows[0]?.state) throw new Error('Etat applicatif Supabase introuvable.');
  replaceState(result.rows[0].state);
}

export async function acquireDatabaseState({ write = false } = {}) {
  if (!databaseEnabled) return null;
  const client = await pool.connect();
  try {
    if (write) await client.query('begin');
    const result = await client.query(
      `select state from wigofly_app_state where id = 1${write ? ' for update' : ''}`
    );
    if (!result.rows[0]?.state) throw new Error('Etat applicatif Supabase introuvable.');
    replaceState(result.rows[0].state);
    return { client, write };
  } catch (error) {
    client.release();
    throw error;
  }
}

export async function releaseDatabaseState(lock, { commit = false } = {}) {
  if (!lock) return;
  try {
    if (lock.write) {
      if (commit) {
        await lock.client.query(
          'update wigofly_app_state set state = $1::jsonb, updated_at = now(), revision = revision + 1 where id = 1',
          [JSON.stringify(db)]
        );
        await lock.client.query('commit');
        stateLoadedAt = Date.now();
      } else {
        await lock.client.query('rollback');
      }
    }
  } finally {
    lock.client.release();
  }
}

if (migrated || !fs.existsSync(DATA_FILE)) save();

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
