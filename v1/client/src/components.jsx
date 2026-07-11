import { NavLink } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import Notifications from './Notifications.jsx';

export function Header({ user }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">S</span>
        <span>Salama</span>
        {user && <span style={{ marginLeft: 'auto' }}><Notifications /></span>}
      </div>
      <div className="tagline">Envoyez avec confiance · Bruxelles ↔ Casablanca</div>
    </header>
  );
}

export function BottomNav({ user }) {
  const tabs = [
    { to: '/', icon: 'luggage', label: 'Trajets' },
    { to: '/envois', icon: 'package', label: 'Mes envois' },
    { to: '/transactions', icon: 'repeat', label: 'En cours' },
    { to: '/profil', icon: 'user', label: 'Profil' },
  ];
  if (user?.isAdmin) tabs.push({ to: '/admin', icon: 'shield', label: 'Admin' });
  return (
    <nav className="bottom-nav">
      {tabs.map((t) => (
        <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={t.icon} size={21} />
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
      <svg width="160" height="160" viewBox="0 0 150 150" fill="#16181d">{cells}</svg>
      <div className="qr-code-text">{code}</div>
      {caption && <div className="muted center">{caption}</div>}
    </div>
  );
}

export function TrustBadge({ user }) {
  if (!user) return null;
  return (
    <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {user.kycStatus === 'verified' && (
        <span className="pill pill-teal"><Icon name="shieldCheck" size={13} />Identité vérifiée</span>
      )}
      {user.badges?.includes('voyageur-confirme') && (
        <span className="pill pill-saffron"><Icon name="star" size={13} filled />Voyageur confirmé</span>
      )}
      {user.rating != null && (
        <span className="pill pill-gray"><Icon name="star" size={13} filled />{user.rating} ({user.ratingCount})</span>
      )}
    </span>
  );
}

export function Stars({ value, onChange }) {
  return (
    <div className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
          <Icon name="star" size={26} filled className={n <= value ? 'on' : ''} />
        </span>
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
