import { useEffect, useRef, useState } from 'react';
import { NavLink, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { Icon } from './Icons.jsx';
import Notifications from './Notifications.jsx';
import { t, useLang } from './i18n.js';

// Fil d'étapes libellé (PRD UI/UX U2) — remplace les points anonymes : on voit ce qui vient
// et on peut revenir en arrière sur une étape déjà franchie.
export function Stepper({ labels, current, onGo }) {
  return (
    <nav className="stepper" aria-label="Progression">
      {labels.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const clickable = done && onGo;
        return (
          <button key={i} type="button" className={`stepper-step ${active ? 'active' : ''} ${done ? 'done' : ''}`}
            onClick={clickable ? () => onGo(i) : undefined} disabled={!clickable}
            aria-current={active ? 'step' : undefined}>
            <span className="stepper-dot">{done ? <Icon name="check" size={13} /> : i + 1}</span>
            <span className="stepper-label">{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

// Dialogue de confirmation du design system — remplace le confirm() natif (PRD UI/UX U5).
// Fermeture par Échap, clic sur le fond, ou bouton Annuler ; focus initial sur l'action.
export function ConfirmDialog({ title, message, confirmLabel, cancelLabel, danger = false, icon = 'alert', onConfirm, onClose }) {
  const confirmRef = useRef(null);
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal confirm-modal" role="alertdialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className={`confirm-icon ${danger ? 'confirm-icon-danger' : ''}`}><Icon name={icon} size={22} /></div>
        <h2 className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}
        <div className="confirm-actions">
          <button className="btn btn-ghost" onClick={onClose}>{cancelLabel || t('common.cancel')}</button>
          <button ref={confirmRef} className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={() => { onConfirm(); onClose(); }}>{confirmLabel || t('common.confirm')}</button>
        </div>
      </div>
    </div>
  );
}

export function Header({ user }) {
  useLang();
  return (
    <header className="app-header">
      <div className="brand">
        <Link to="/" className="brand-link">
          <img className="brand-mark" src="/assets/logo-mark-192.png" alt="Wigofly" />
          <span>Wigofly</span>
        </Link>
        {user && <span className="header-notif"><Notifications /></span>}
      </div>
      <div className="tagline">{t('header.tagline')}</div>
    </header>
  );
}

export function BottomNav({ user }) {
  useLang();
  const tabs = [
    { to: '/', icon: 'sparkles', label: t('nav.home') },
    { to: '/trajets', icon: 'luggage', label: t('nav.trips') },
    { to: '/envois', icon: 'package', label: t('nav.shipments') },
    { to: '/transactions', icon: 'repeat', label: t('nav.transactions') },
    { to: '/profil', icon: 'user', label: t('nav.profile') },
  ];
  if (user?.isAdmin) tabs.push({ to: '/admin', icon: 'shield', label: t('nav.admin') });
  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
          <Icon name={tab.icon} size={21} />
          {tab.label}
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
    QRCode.toDataURL(`wigofly:${code}`, { width: 220, margin: 1, color: { dark: '#16181d', light: '#ffffff' } })
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
            const hit = codes.find((c) => c.rawValue?.startsWith('wigofly:'));
            if (hit) { onDetected(hit.rawValue.slice(7)); return; }
          } catch { /* frame illisible, on retente */ }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError(t('scanner.no.camera'));
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
          <b>{t('scanner.title')}</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {!supported && (
          <div className="alert alert-warn" style={{ margin: '0 16px 16px' }}>
            <Icon name="alert" size={17} />
            <span>{t('scanner.unsupported')}</span>
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
        <span className="pill pill-teal"><Icon name="shieldCheck" size={13} />{t('badge.verified')}</span>
      )}
      {user.badges?.includes('voyageur-confirme') && (
        <span className="pill pill-saffron"><Icon name="star" size={13} filled />{t('badge.confirmed')}</span>
      )}
      {user.rating != null && (
        <span className="pill pill-gray"><Icon name="star" size={13} filled />{user.rating} ({user.ratingCount})</span>
      )}
    </span>
  );
}

export function Stars({ value, onChange, readOnly = false, size = 26 }) {
  return (
    <div className={`stars${readOnly ? ' stars-readonly' : ''}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= value ? 'on' : ''} onClick={readOnly ? undefined : () => onChange(n)}>
          <Icon name="star" size={size} filled className={n <= value ? 'on' : ''} />
        </span>
      ))}
    </div>
  );
}

export const STATUS_PILLS = {
  accepted: 'pill-saffron', sealed: 'pill-saffron', in_transit: 'pill-teal',
  released: 'pill-teal', disputed: 'pill-danger', refunded: 'pill-gray', cancelled: 'pill-gray',
};

// Message affiché quand une action exige une identité vérifiée — jamais de redirection
// silencieuse : l'utilisateur voit pourquoi il est bloqué et choisit d'y aller.
export function KycRequiredNotice() {
  return (
    <div className="alert alert-warn" style={{ alignItems: 'center' }}>
      <Icon name="shieldCheck" size={17} />
      <span className="grow">{t('kycnotice.text')}</span>
      <Link to="/verification">
        <button className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.06)', color: 'inherit' }}>
          {t('kycnotice.go')}
        </button>
      </Link>
    </div>
  );
}

export function StatusPill({ status }) {
  const pill = STATUS_PILLS[status] || 'pill-gray';
  return <span className={`pill ${pill}`}>{STATUS_PILLS[status] ? t(`txstatus.${status}`) : status}</span>;
}

// Demande l'accès caméra — à appeler directement dans le gestionnaire de clic qui
// ouvre la capture (pas dans un useEffect différé) : Safari iOS et plusieurs
// navigateurs mobiles n'affichent la boîte de dialogue système d'autorisation que
// si l'appel a lieu de façon synchrone dans le geste utilisateur (le clic), sinon
// l'accès échoue silencieusement et l'utilisateur croit devoir l'activer lui-même
// dans les réglages du téléphone.
export async function requestCameraStream(facing) {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
}

// Capture photo via caméra in-app exclusivement (PRD KYC §3 : pas d'upload galerie,
// même règle anti-fraude que la vidéo de scellage). Renvoie un dataURL JPEG redimensionné.
// `stream` doit être obtenu via requestCameraStream() au moment du clic déclencheur —
// c'est ce qui fait apparaître automatiquement la demande d'autorisation du téléphone.
export function PhotoCapture({ facing = 'user', maxPx = 900, stream, streamError, onCapture, onClose, guide }) {
  const videoRef = useRef(null);
  const streamRef = useRef(stream || null);
  const [error, setError] = useState(streamError || '');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (streamError) { setError(streamError); return; }
    if (stream && videoRef.current) {
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      setReady(true);
    }
    return () => { streamRef.current?.getTracks().forEach((t) => t.stop()); };
  }, [stream, streamError]);

  const shoot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(canvas.toDataURL('image/jpeg', 0.82));
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal capture-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="camera" size={19} />
          <b>{guide || t('kyc.photo.take')}</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        {error ? (
          <div className="alert alert-warn" style={{ margin: '0 16px 16px' }}><Icon name="alert" size={17} />{error}</div>
        ) : (
          <>
            <div className={`capture-frame ${facing === 'user' ? 'capture-frame-selfie' : 'capture-frame-doc'}`}>
              <video ref={videoRef} autoPlay muted playsInline />
              <div className="capture-guide" />
            </div>
            <div style={{ padding: '12px 16px 16px' }}>
              <button className="btn btn-primary" onClick={shoot} disabled={!ready}>
                <Icon name="camera" size={18} />Capturer
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
