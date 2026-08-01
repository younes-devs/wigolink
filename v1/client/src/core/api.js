import { t } from '../i18n.js';

let token = localStorage.getItem('wigolink_token') || null;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('wigolink_token', t);
  else localStorage.removeItem('wigolink_token');
}

export function getToken() {
  return token;
}

export async function api(path, opts = {}) {
  let res;
  try {
    res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: {
        'Content-Type': 'application/json',
        // i18n des erreurs API : le serveur traduit body.error selon cette langue.
        // documentElement.lang est posé avant le rendu (script inline d'index.html).
        'Accept-Language': document.documentElement.lang || 'fr',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...opts.headers,
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new Error(t('api.error.network'));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || t('api.error.status', { status: res.status }));
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export async function apiBlob(path) {
  let response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      headers: {
        'Accept-Language': document.documentElement.lang || 'fr',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch {
    throw new Error(t('api.error.network'));
  }
  if (!response.ok) {
    throw new Error(t('api.error.status', { status: response.status }));
  }
  return response.blob();
}
