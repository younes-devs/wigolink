import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const certDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.cert');
const hasCert = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'));

// HTTPS local requis pour tester la caméra (KYC, vidéo de scellage) depuis un
// téléphone sur le réseau local : getUserMedia est bloqué par les navigateurs sur
// les origines non sécurisées, sauf localhost. Certificat auto-signé (accepter
// l'avertissement du navigateur au premier accès) — seulement pour le dev.
export default defineConfig({
  plugins: [react()],
  server: {
    https: hasCert ? {
      key: fs.readFileSync(path.join(certDir, 'key.pem')),
      cert: fs.readFileSync(path.join(certDir, 'cert.pem')),
    } : undefined,
    proxy: {
      // Le proxy Vite→API tourne côté serveur (pas dans le navigateur) : HTTP interne
      // suffit, seule la connexion navigateur→Vite doit être HTTPS pour la caméra.
      '/api': 'http://localhost:4517',
    },
  },
});
