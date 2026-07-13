import { useEffect, useState } from 'react';
import { api, getToken, setToken } from './api';
import { Icon } from './Icons.jsx';

// Barre de test (mode démo) : bascule de compte en un clic et création
// d'utilisateurs jetables — à retirer en production.
const ACCOUNTS = [
  { email: 'fatima@demo.cloudkilo.app', label: 'Fatima', role: 'Expéditrice' },
  { email: 'karim@demo.cloudkilo.app', label: 'Karim', role: 'Voyageur' },
  { email: 'mehdi@demo.cloudkilo.app', label: 'Mehdi', role: 'Destinataire' },
  { email: 'admin@demo.cloudkilo.app', label: 'Admin', role: 'Back-office' },
];

export default function DevBar() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [currentEmail, setCurrentEmail] = useState(null);
  const [demoEnabled, setDemoEnabled] = useState(false);

  // Le serveur seul décide si le mode démo est actif (DEMO=true) — masqué par défaut,
  // pas de bascule de compte ni d'endpoints /dev/* exposés en production.
  useEffect(() => { api('/config').then((d) => setDemoEnabled(!!d.demo)).catch(() => {}); }, []);

  useEffect(() => {
    if (open && getToken()) api('/me').then((d) => setCurrentEmail(d.email)).catch(() => {});
  }, [open]);

  if (!demoEnabled) return null;

  const impersonate = async (email) => {
    setBusy(true);
    try {
      const d = await api('/dev/impersonate', { method: 'POST', body: { email } });
      setToken(d.token);
      location.href = '/';
    } finally { setBusy(false); }
  };

  const randomUser = async () => {
    setBusy(true);
    try {
      const d = await api('/dev/random-user', { method: 'POST' });
      setToken(d.token);
      location.href = '/';
    } finally { setBusy(false); }
  };

  return (
    <>
      <button className="devbar-fab" onClick={() => setOpen(!open)} aria-label="Mode test" title="Mode test">
        <Icon name="sparkles" size={19} />
      </button>
      {open && (
        <div className="devbar-panel">
          <div className="devbar-title">
            Mode test
            <span className="pill pill-saffron" style={{ marginLeft: 'auto' }}>démo</span>
          </div>
          <div className="devbar-hint">Basculez de compte instantanément pour jouer chaque rôle.</div>
          {ACCOUNTS.map((a) => (
            <button key={a.email} className="devbar-account" disabled={busy || a.email === currentEmail}
              onClick={() => impersonate(a.email)}>
              <b>{a.label}</b>
              <span>{a.role}</span>
              {a.email === currentEmail && <span className="pill pill-teal">actif</span>}
            </button>
          ))}
          <button className="devbar-account" disabled={busy} onClick={randomUser}>
            <b>+ Utilisateur jetable</b>
            <span>compte neuf, KYC ok</span>
          </button>
        </div>
      )}
    </>
  );
}
