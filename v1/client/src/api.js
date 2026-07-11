let token = localStorage.getItem('salama_token') || null;

export function setToken(t) {
  token = t;
  if (t) localStorage.setItem('salama_token', t);
  else localStorage.removeItem('salama_token');
}

export function getToken() {
  return token;
}

export async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
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
