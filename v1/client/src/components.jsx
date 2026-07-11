import { NavLink } from 'react-router-dom';

export function Header() {
  return (
    <header className="app-header">
      <div className="zellige" />
      <div className="brand">
        <span>🕊️ Salama</span>
      </div>
      <div className="tagline" style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
        Envoyez avec confiance, Bruxelles ↔ Casablanca
      </div>
    </header>
  );
}

export function BottomNav({ user }) {
  const tabs = [
    { to: '/', icon: '🧳', label: 'Trajets' },
    { to: '/envois', icon: '📦', label: 'Mes envois' },
    { to: '/transactions', icon: '🔄', label: 'En cours' },
    { to: '/profil', icon: '👤', label: 'Profil' },
  ];
  if (user?.isAdmin) tabs.push({ to: '/admin', icon: '🛡️', label: 'Admin' });
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <span className="icon">{t.icon}</span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

// Faux QR décoratif déterministe (démo — un vrai QR en prod)
export function QrBlock({ code, caption }) {
  const cells = [];
  let h = 0;
  for (const c of code) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  for (let y = 0; y < 15; y++)
    for (let x = 0; x < 15; x++) {
      h = (h * 1103515245 + 12345) >>> 0;
      const corner = (x < 4 && y < 4) || (x > 10 && y < 4) || (x < 4 && y > 10);
      if (corner || (h & 3) === 0) cells.push(<rect key={`${x}-${y}`} x={x * 10} y={y * 10} width="9" height="9" rx="1.5" />);
    }
  return (
    <div className="qr-frame">
      <svg width="150" height="150" viewBox="0 0 150 150" fill="#2b2118">{cells}</svg>
      <div className="qr-code-text">{code}</div>
      {caption && <div className="muted center">{caption}</div>}
    </div>
  );
}

export function TrustBadge({ user }) {
  if (!user) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {user.kycStatus === 'verified' && <span className="pill pill-teal">✓ Identité vérifiée</span>}
      {user.badges?.includes('voyageur-confirme') && <span className="pill pill-saffron">⭐ Voyageur confirmé</span>}
      {user.rating != null && (
        <span className="pill pill-gray">★ {user.rating} ({user.ratingCount})</span>
      )}
    </span>
  );
}

export function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>⭐</span>
      ))}
    </div>
  );
}

export const STATUS_LABELS = {
  accepted: { label: 'Accord conclu — paiement séquestré', pill: 'pill-saffron' },
  sealed: { label: 'Colis scellé et filmé', pill: 'pill-saffron' },
  in_transit: { label: 'En transit', pill: 'pill-teal' },
  released: { label: 'Livré — paiement versé', pill: 'pill-teal' },
  disputed: { label: 'Litige en cours', pill: 'pill-danger' },
  refunded: { label: 'Remboursé', pill: 'pill-gray' },
  cancelled: { label: 'Annulé', pill: 'pill-gray' },
};

export function StatusPill({ status }) {
  const s = STATUS_LABELS[status] || { label: status, pill: 'pill-gray' };
  return <span className={`pill ${s.pill}`}>{s.label}</span>;
}
