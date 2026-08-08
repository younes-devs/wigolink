import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';
import { useKycFaceGuidance } from './kycFaceGuidance.js';
import { t } from './i18n.js';

export { BottomNav, Header } from './app/components/AppNavigation.jsx';

// Fil d'étapes libellé (PRD UI/UX U2) — remplace les points anonymes : on voit ce qui vient
// et on peut revenir en arrière sur une étape déjà franchie.
export function Stepper({ labels, current, onGo }) {
  return (
    <nav className="stepper" aria-label={t('common.progress')}>
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

// Demande l'accès caméra — à appeler directement dans le gestionnaire de clic qui
// ouvre la capture (pas dans un useEffect différé) : Safari iOS et plusieurs
// navigateurs mobiles n'affichent la boîte de dialogue système d'autorisation que
// si l'appel a lieu de façon synchrone dans le geste utilisateur (le clic), sinon
// l'accès échoue silencieusement et l'utilisateur croit devoir l'activer lui-même
// dans les réglages du téléphone.
export async function requestCameraStream(facing) {
  return navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
}

// Capture photo via caméra in-app exclusivement: pas d'upload galerie pour le KYC.
// Renvoie un dataURL JPEG redimensionné.
// `stream` doit être obtenu via requestCameraStream() au moment du clic déclencheur —
// c'est ce qui fait apparaître automatiquement la demande d'autorisation du téléphone.
export function PhotoCapture({ facing = 'user', maxPx = 900, stream, streamError, onCapture, onClose, guide, faceAssist = false }) {
  const videoRef = useRef(null);
  const streamRef = useRef(stream || null);
  const captureLockRef = useRef(false);
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

  const shoot = useCallback(() => {
    if (captureLockRef.current) return;
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    captureLockRef.current = true;
    const scale = Math.min(1, maxPx / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCapture(canvas.toDataURL('image/jpeg', 0.82));
  }, [maxPx, onCapture]);

  const faceGuidance = useKycFaceGuidance({
    videoRef,
    active: faceAssist && ready && !error,
    onStable: shoot,
  });
  const faceStatus = faceAssist ? (ready ? faceGuidance.status : 'loading') : 'idle';
  const faceStatusReady = faceStatus === 'holdStill' || faceStatus === 'ready';

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
            <div
              className={`capture-frame ${facing === 'user' ? 'capture-frame-selfie' : 'capture-frame-doc'} ${faceAssist ? `capture-frame-assisted capture-face-${faceStatus}` : ''}`}
            >
              <video ref={videoRef} autoPlay muted playsInline />
              <div className="capture-guide" />
              {faceAssist && (
                <div className={`capture-face-status capture-face-status-${faceStatus}`} aria-live="polite">
                  <Icon name={faceStatusReady ? 'check' : faceStatus === 'loading' ? 'clock' : 'user'} size={17} />
                  <span>{t(`kyc.face.${faceStatus}`)}</span>
                </div>
              )}
              {faceAssist && (
                <div className="capture-stability" aria-hidden="true">
                  <span style={{ width: `${Math.round(faceGuidance.progress * 100)}%` }} />
                </div>
              )}
            </div>
            {(!faceAssist || faceStatus === 'unavailable') && (
              <div className="capture-actions">
                <button className="btn btn-primary" onClick={shoot} disabled={!ready}>
                  <Icon name="camera" size={18} />{t('kyc.photo.capture')}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
