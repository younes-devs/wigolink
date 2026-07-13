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

export async function startServer() {
  dataFile = path.join(serverDir, `data.test-${process.pid}.json`);
  if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);

  child = spawn('node', ['index.js'], {
    cwd: serverDir,
    env: { ...process.env, PORT: String(PORT), DATA_FILE: dataFile, DEMO: 'true' },
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

export async function api(pathname, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
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
