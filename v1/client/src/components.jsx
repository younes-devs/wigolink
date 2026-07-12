import { useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router-dom';
import QRCode from 'qrcode';
import { Icon } from './Icons.jsx';
import Notifications from './Notifications.jsx';

export function Header({ user }) {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="brand-mark">CK</span>
        <span>CloudKilo</span>
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

// QR code réel encodant le code de transaction (préfixé pour le distinguer au scan).
export function QrBlock({ code, caption }) {
  const [dataUrl, setDataUrl] = useState(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(`cloudkilo:${code}`, { width: 220, margin: 1, color: { dark: '#16181d', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setDataUrl(url); });
    return () => { cancelled = true; };
  }, [code]);
  return (
    <div className="qr-frame">
      {dataUrl ? <img src={dataUrl} width={160} height={160} alt={`QR ${code}`} /> : <div style={{ width: 160, height: 160 }} />}
      <div className="qr-code-text">{code}</div>
      {caption && <div className="muted center">{caption}</div>}
    </div>
  );
}

// Scanner caméra (BarcodeDetector natif). Retombe silencieusement sur la saisie
// manuelle si l'API n'est pas supportée (Safari, contexte non sécurisé…).
export function QrScanner({ onDetected, onClose }) {
  const videoRef = useRef(null);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    if (!('BarcodeDetector' in window)) { setSupported(false); return; }
    let stream, raf, stopped = false;
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] });

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        if (stopped) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoRef.current.srcObject = stream;
        const tick = async () => {
          if (stopped) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const hit = codes.find((c) => c.rawValue?.startsWith('cloudkilo:'));
            if (hit) { onDetected(hit.rawValue.slice(7)); return; }
          } catch { /* frame illisible, on retente */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError("Caméra indisponible — utilisez la saisie manuelle.");
      }
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onDetected]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal scanner-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="qr" size={19} />
          <b>Scanner le QR</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {!supported && (
          <div className="alert alert-warn" style={{ margin: '0 16px 16px' }}>
            <Icon name="alert" size={17} />
            <span>Le scan caméra n'est pas pris en charge par ce navigateur. Utilisez la saisie manuelle du code.</span>
          </div>
        )}
        {supported && error && (
          <div className="alert alert-warn" style={{ margin: '0 16px 16px' }}><Icon name="alert" size={17} />{error}</div>
        )}
        {supported && !error && (
          <div className="scanner-frame">
            <video ref={videoRef} autoPlay muted playsInline />
            <div className="scanner-reticle" />
          </div>
        )}
      </div>
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
