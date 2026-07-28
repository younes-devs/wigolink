import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const certDir = path.join(rootDir, '..', '.cert');
const hasCert = fs.existsSync(path.join(certDir, 'key.pem')) && fs.existsSync(path.join(certDir, 'cert.pem'));

// Sert public/<dossier>/index.html pour les requêtes en /<dossier>/ (site public SEO —
// docs/prd-seo.md) : le middleware statique de Vite ne résout pas l'index de dossier
// automatiquement en dev, contrairement à la plupart des hébergeurs statiques en
// production. Ce plugin rend le comportement identique dans les deux environnements.
function publicDirIndexFallback() {
  return {
    name: 'public-dir-index-fallback',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== 'GET' || !req.url || !req.url.endsWith('/') || req.url === '/') return next();
        const urlPath = req.url.split('?')[0];
        const candidate = path.join(rootDir, 'public', urlPath, 'index.html');
        if (fs.existsSync(candidate)) req.url = urlPath + 'index.html' + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
        next();
      });
    },
  };
}

// HTTPS local requis pour tester la caméra KYC depuis un
// téléphone sur le réseau local : getUserMedia est bloqué par les navigateurs sur
// les origines non sécurisées, sauf localhost. Certificat auto-signé (accepter
// l'avertissement du navigateur au premier accès) — seulement pour le dev.
export default defineConfig({
  plugins: [react(), publicDirIndexFallback()],
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
