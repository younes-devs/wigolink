let token = localStorage.getItem('wigofly_token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('wigofly_token', t);
  else localStorage.removeItem('wigofly_token');
}

export function getToken() {
  return token;
}

export function realtimeUrl() {
  const base = `${window.location.origin}/api/realtime`;
  return `${base}?token=${encodeURIComponent(token || '')}`;
}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
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
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Erreur ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}
