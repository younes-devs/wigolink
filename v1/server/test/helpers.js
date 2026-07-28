// Démarre une instance jetable de l'API sur un port et un fichier de données dédiés —
// jamais le data.json du dev/démo en cours, pour ne pas polluer les comptes/annonces
// affichés à l'écran pendant qu'on développe (voir DATA_FILE dans store.js).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 4599;
export const BASE_URL = `http://localhost:${PORT}`;

let child = null;
let dataFile = null;

export async function startServer({ env = {} } = {}) {
  dataFile = path.join(serverDir, `data.test-${process.pid}.json`);
  if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);

  child = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: String(PORT),
      DATA_FILE: dataFile,
      DEMO: 'true',
      DATABASE_URL: '',
      PERSISTENCE_DRIVER: 'json',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      ...env,
    },
    stdio: 'pipe',
  });

  let errOutput = '';
  child.stderr.on('data', (d) => { errOutput += d.toString(); });

  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE_URL}/api/config`);
      if (res.ok) return;
    } catch { /* pas encore prêt */ }
    if (child.exitCode !== null) throw new Error(`Le serveur de test s'est arrêté prématurément :\n${errOutput}`);
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`Le serveur de test n'a pas démarré à temps :\n${errOutput}`);
}

export async function stopServer() {
  if (child) {
    child.kill();
    child = null;
  }
  if (dataFile && fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
}

export async function api(pathname, { method = 'GET', token, body, lang } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (lang) headers['Accept-Language'] = lang;
  const res = await fetch(`${BASE_URL}/api${pathname}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { status: res.status, body: json };
}

export async function loginAs(email, password = 'demo1234') {
  const { status, body } = await api('/auth/login', { method: 'POST', body: { email, password } });
  if (status !== 200 || !body?.token) throw new Error(`Échec de connexion démo pour ${email} (${status}): ${JSON.stringify(body)}`);
  return body.token;
}

export const TINY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

// Formation obligatoire au premier transport (PRD §5.4) — un compte fraîchement seedé
// ne l'a pas encore complétée, contrairement au data.json de dev/démo où les comptes
// de test l'ont déjà validée à la main au fil des sessions précédentes.
export async function completeTraining(token) {
  const { status } = await api('/training/complete', { method: 'POST', token, body: { answers: { q1: 'b', q2: 'c', q3: 'a' } } });
  if (status !== 200) throw new Error(`Échec de la formation voyageur (${status})`);
}

// Crée un compte tout neuf, KYC vérifié via une vraie soumission + approbation admin
// (pas un raccourci qui court-circuiterait le flux) — utile aux tests qui doivent
// observer un compte depuis son tout premier état (plafonds par défaut, 0 transaction).
export async function registerKycVerifiedUser(adminToken, namePrefix = 'Testeur') {
  const n = Math.floor(Math.random() * 1e9);
  const email = `${namePrefix.toLowerCase()}${n}@exemple.com`;
  const reg = await api('/auth/register', { method: 'POST', body: { name: `${namePrefix} ${n}`, email, password: 'demo1234', cguAccepted: true } });
  if (reg.status !== 200) throw new Error(`Échec inscription (${reg.status}): ${JSON.stringify(reg.body)}`);
  const code = reg.body.demoHint.match(/\d{6}/)[0];
  const verify = await api('/auth/verify-email', { method: 'POST', body: { email, code } });
  if (verify.status !== 200) throw new Error(`Échec vérification email (${verify.status})`);
  const token = verify.body.token;

  const submit = await api('/kyc/submit', {
    method: 'POST', token,
    body: { legalName: `${namePrefix} ${n} Complet`, birthDate: '1990-01-01', documentType: 'passport', selfiePhoto: TINY_PNG, idFrontPhoto: TINY_PNG },
  });
  if (submit.status !== 200) throw new Error(`Échec soumission KYC (${submit.status}): ${JSON.stringify(submit.body)}`);

  const queue = await api('/admin/kyc?status=pending', { token: adminToken });
  const submission = queue.body.submissions.find((s) => s.user?.email === email);
  if (!submission) throw new Error('Soumission KYC introuvable dans la file admin');
  const decide = await api(`/admin/kyc/${submission.id}/decide`, { method: 'POST', token: adminToken, body: { decision: 'approve' } });
  if (decide.status !== 200) throw new Error(`Échec approbation KYC (${decide.status})`);

  return { token, email };
}
