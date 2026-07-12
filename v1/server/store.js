// Persistance JSON simple (V1 démo). Remplacer par une vraie DB avant prod.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'data.json');

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
        id: 'u-admin', name: 'Équipe CloudKilo', phone: '+32470000000', city: '—',
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
        dateFrom: new Date(now + 3 * 864e5).toISOString().slice(0, 10),
        dateTo: new Date(now + 25 * 864e5).toISOString().slice(0, 10),
        travelerPay: 12, commissionRate: 0.18, status: 'published',
        whitelistVerdict: 'whitelisted', recipientId: 'u-mehdi', createdAt: now - 864e5,
      },
    ],
    transactions: [],
    messages: [],
    disputes: [],
    reviewQueue: [],
    otps: {},
    sessions: {},
    nextId: 100,
  };
}

let db = fs.existsSync(DATA_FILE) ? JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) : seed();

// Migration : comptes existants sans email/mot de passe (démo : demo1234).
import { hashPassword } from './auth.js';
const DEMO_EMAILS = {
  'u-fatima': 'fatima@demo.cloudkilo.app',
  'u-karim': 'karim@demo.cloudkilo.app',
  'u-mehdi': 'mehdi@demo.cloudkilo.app',
  'u-admin': 'admin@demo.cloudkilo.app',
};
let migrated = false;
for (const u of db.users) {
  if (!u.email) {
    u.email = DEMO_EMAILS[u.id] || `${u.id}@demo.cloudkilo.app`;
    u.passwordHash = hashPassword('demo1234');
    u.emailVerified = true;
    u.provider = 'email';
    migrated = true;
  }
}
if (!db.resets) { db.resets = {}; migrated = true; }
if (!db.pendingVerifications) { db.pendingVerifications = {}; migrated = true; }

export function save() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function getDb() {
  return db;
}

export function newId(prefix) {
  db.nextId += 1;
  return `${prefix}-${db.nextId}`;
}

if (migrated || !fs.existsSync(DATA_FILE)) save();
