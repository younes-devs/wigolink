import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './app/App.jsx';
import { getLang, initializeI18n } from './i18n.js';
import { syncThemeColor } from './theme.js';
import { localeFromPath, localizePath } from '../../shared/locale-routing.js';
import './styles.css';

const requestedPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
const pathLocale = localeFromPath(window.location.pathname);
const canonicalPath = localizePath(requestedPath, pathLocale || getLang());

if (requestedPath !== canonicalPath) {
  window.location.replace(canonicalPath);
} else {
  syncThemeColor();
  await initializeI18n();

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );

// PWA (PRD UI/UX U8) : enregistre le service worker en prod uniquement. En dev, Vite sert
// les modules à la volée et un SW qui cache l'app-shell casserait le hot-reload.
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
  }
}
