import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { PhotoCapture, requestCameraStream } from '../components.jsx';
import { Icon } from '../Icons.jsx';
import { SkeletonCard } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

// Page de vérification d'identité (KYC manuel — PRD KYC).
// Accès complet à la navigation ; cette page n'est requise que pour transacter.
export default function Kyc() {
  const nav = useNavigate();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [me, setMe] = useState(null);

  const load = () => api('/me').then(setMe);
  useEffect(() => { load(); }, []);

  if (!me) return <SkeletonCard lines={3} />;
  const status = me.kyc?.status || 'none';

  return (
    <div>
      <button className="link-btn mb" onClick={() => nav(-1)}><Icon name="arrowLeft" size={14} />Retour</button>
      <h1 className="page-title">Vérification d'identité</h1>
      <p className="page-sub">
        Obligatoire uniquement pour publier un envoi, déclarer un trajet ou accepter un transport.
        La navigation reste libre.
      </p>

      {status === 'verified' && (
        <div className="card center" style={{ padding: '28px 18px' }}>
          <div className="kyc-status-icon kyc-ok"><Icon name="shieldCheck" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12 }}>Identité vérifiée</h2>
          <p className="muted mt">Vous avez accès à toutes les fonctionnalités de CloudKilo.</p>
        </div>
      )}

      {status === 'pending' && (
        <div className="card center" style={{ padding: '28px 18px' }}>
          <div className="kyc-status-icon kyc-pending"><Icon name="clock" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12 }}>Vérification en cours</h2>
          <p className="muted mt">
            Notre équipe examine vos documents. Délai habituel : sous 24 h. Vous recevrez une notification
            dès qu'une décision est prise.
          </p>
        </div>
      )}

      {status === 'refused' && (
        <div className="card" style={{ padding: '24px 18px' }}>
          <div className="kyc-status-icon kyc-refused" style={{ margin: '0 auto' }}><Icon name="x" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12, textAlign: 'center' }}>Vérification refusée</h2>
          {me.kyc?.latestDecisionReason && (
            <div className="alert alert-danger mt"><Icon name="alert" size={17} />{me.kyc.latestDecisionReason}</div>
          )}
          <p className="muted mt center">
            Cette décision est définitive. Si vous pensez qu'il s'agit d'une erreur, contactez
            <a href="mailto:support@cloudkilo.app" style={{ color: 'var(--accent)', fontWeight: 600 }}> support@cloudkilo.app</a>.
          </p>
        </div>
      )}

      {(status === 'none' || status === 'rejected') && (
        <KycFlow
          rejected={status === 'rejected'}
          rejectReason={me.kyc?.latestDecisionReason}
          canResubmit={status === 'none' || me.kyc?.canResubmit}
          onDone={async () => { await load(); await refreshUser(); toast.success('Vérification envoyée — réponse sous 24h'); }}
        />
      )}
    </div>
  );
}

const STEPS = ['infos', 'selfie', 'front', 'back', 'review'];

function KycFlow({ rejected, rejectReason, canResubmit, onDone }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ legalName: '', birthDate: '', documentType: 'id_card' });
  const [photos, setPhotos] = useState({ selfiePhoto: null, idFrontPhoto: null, idBackPhoto: null });
  const [capturing, setCapturing] = useState(null); // 'selfie' | 'front' | 'back'
  const [captureStream, setCaptureStream] = useState(null);
  const [captureError, setCaptureError] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const needsBack = form.documentType === 'id_card';
  const activeSteps = needsBack ? STEPS : STEPS.filter((s) => s !== 'back');
  const stepName = activeSteps[step];

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const captureConfig = {
    selfie: { facing: 'user', key: 'selfiePhoto', guide: 'Selfie — visage bien visible', maxPx: 700 },
    front: { facing: 'environment', key: 'idFrontPhoto', guide: "Pièce d'identité — recto", maxPx: 1100 },
    back: { facing: 'environment', key: 'idBackPhoto', guide: "Pièce d'identité — verso", maxPx: 1100 },
  };

  // Demande la caméra dès le clic (synchrone dans le geste utilisateur) : c'est ce qui
  // déclenche la boîte de dialogue native du téléphone, pas un texte demandant à
  // l'utilisateur d'autoriser manuellement l'accès dans ses réglages.
  const openCapture = async (name) => {
    setCapturing(name);
    setCaptureStream(null);
    setCaptureError('');
    try {
      const stream = await requestCameraStream(captureConfig[name].facing);
      setCaptureStream(stream);
    } catch {
      setCaptureError("Accès à la caméra refusé ou indisponible. Vérifiez l'autorisation caméra de CloudKilo dans les réglages de votre téléphone.");
    }
  };
  const closeCapture = () => {
    captureStream?.getTracks().forEach((t) => t.stop());
    setCapturing(null); setCaptureStream(null); setCaptureError('');
  };

  const age = form.birthDate ? computeAge(form.birthDate) : null;
  const infosValid = form.legalName.trim().length >= 3 && form.birthDate && age !== null && age >= 18;

  const next = () => setStep((s) => Math.min(s + 1, activeSteps.length - 1));
  const prev = () => setStep((s) => Math.max(s - 1, 0));

  const submit = async () => {
    setBusy(true); setError('');
    try {
      await api('/kyc/submit', { method: 'POST', body: { ...form, ...photos } });
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!canResubmit) {
    return (
      <div className="card">
        <div className="alert alert-danger" style={{ marginBottom: 0 }}>
          <Icon name="alert" size={17} />
          Nombre maximum de tentatives atteint. Contactez <a href="mailto:support@cloudkilo.app">support@cloudkilo.app</a>.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {rejected && (
        <div className="alert alert-warn">
          <Icon name="alert" size={17} />
          <span><b>Demande précédente rejetée.</b>{rejectReason ? ` ${rejectReason}` : ''} Vous pouvez soumettre à nouveau.</span>
        </div>
      )}

      <div className="step-dots">{activeSteps.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}

      {stepName === 'infos' && (
        <>
          <h2 style={{ marginBottom: 12 }}><Icon name="user" size={17} />Vos informations</h2>
          <div className="field">
            <label>Nom légal complet</label>
            <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)}
              placeholder="Tel qu'il figure sur votre pièce d'identité" />
          </div>
          <div className="field">
            <label>Date de naissance</label>
            <input type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
            {age !== null && age < 18 && (
              <div className="hint" style={{ color: 'var(--danger)' }}>Vous devez avoir 18 ans ou plus.</div>
            )}
          </div>
          <div className="field">
            <label>Type de document</label>
            <select value={form.documentType} onChange={(e) => { set('documentType', e.target.value); setPhotos((p) => ({ ...p, idBackPhoto: null })); }}>
              <option value="id_card">Carte d'identité nationale</option>
              <option value="passport">Passeport</option>
            </select>
            <div className="hint">{needsBack ? 'Recto et verso seront demandés.' : 'Seule la page principale du passeport est demandée.'}</div>
          </div>
          <button className="btn btn-primary" disabled={!infosValid} onClick={next}>Continuer</button>
        </>
      )}

      {['selfie', 'front', 'back'].includes(stepName) && (
        <PhotoStep
          cfg={captureConfig[stepName]}
          photo={photos[captureConfig[stepName].key]}
          onRetake={() => openCapture(stepName)}
          onNext={next} onPrev={prev}
        />
      )}

      {stepName === 'review' && (
        <>
          <h2 style={{ marginBottom: 12 }}><Icon name="shieldCheck" size={17} />Vérifiez avant d'envoyer</h2>
          <div className="kyc-review-grid">
            <ReviewThumb label="Selfie" photo={photos.selfiePhoto} onRetake={() => openCapture('selfie')} />
            <ReviewThumb label="Recto" photo={photos.idFrontPhoto} onRetake={() => openCapture('front')} />
            {needsBack && <ReviewThumb label="Verso" photo={photos.idBackPhoto} onRetake={() => openCapture('back')} />}
          </div>
          <div className="kyc-recap">
            <div><span className="muted">Nom légal</span><b>{form.legalName}</b></div>
            <div><span className="muted">Naissance</span><b>{form.birthDate}</b></div>
            <div><span className="muted">Document</span><b>{needsBack ? "Carte d'identité" : 'Passeport'}</b></div>
          </div>
          <div className="alert alert-teal" style={{ fontSize: 12.5 }}>
            <Icon name="lock" size={16} />
            <span>Vos documents ne sont visibles que par notre équipe de vérification. Ils ne sont jamais montrés aux autres membres.</span>
          </div>
          <button className="btn btn-teal" onClick={submit} disabled={busy}>
            {busy ? 'Envoi…' : 'Envoyer pour vérification'}
          </button>
          <button className="btn btn-ghost mt" onClick={prev}>Retour</button>
        </>
      )}

      {capturing && (
        <PhotoCapture
          facing={captureConfig[capturing].facing}
          maxPx={captureConfig[capturing].maxPx}
          guide={captureConfig[capturing].guide}
          stream={captureStream}
          streamError={captureError}
          onClose={closeCapture}
          onCapture={(dataUrl) => { setPhotos((p) => ({ ...p, [captureConfig[capturing].key]: dataUrl })); setCapturing(null); setCaptureStream(null); }}
        />
      )}
    </div>
  );
}

function PhotoStep({ cfg, photo, onRetake, onNext, onPrev }) {
  return (
    <>
      <h2 style={{ marginBottom: 6 }}><Icon name="camera" size={17} />{cfg.guide}</h2>
      <p className="muted mb" style={{ fontSize: 12.5 }}>
        {cfg.facing === 'user'
          ? 'Visage dégagé, sans lunettes de soleil, bon éclairage. Caméra in-app uniquement.'
          : 'Document à plat, bien cadré, texte lisible. Caméra in-app uniquement.'}
      </p>
      {photo ? (
        <div className={`kyc-preview ${cfg.facing === 'user' ? 'kyc-preview-selfie' : ''}`}>
          <img src={photo} alt={cfg.guide} />
        </div>
      ) : (
        <div className="kyc-placeholder"><Icon name="camera" size={28} /><span>Aucune photo</span></div>
      )}
      <button className="btn btn-ghost mt" onClick={onRetake}>
        <Icon name="camera" size={17} />{photo ? 'Reprendre' : 'Prendre la photo'}
      </button>
      <div className="row mt">
        <button className="btn btn-ghost btn-sm" onClick={onPrev}>Retour</button>
        <button className="btn btn-primary btn-sm" onClick={onNext} disabled={!photo}>Continuer</button>
      </div>
    </>
  );
}

function ReviewThumb({ label, photo, onRetake }) {
  return (
    <div className="kyc-review-thumb">
      <img src={photo} alt={label} />
      <span>{label}</span>
      <button className="kyc-retake" onClick={onRetake} aria-label="Reprendre"><Icon name="camera" size={13} /></button>
    </div>
  );
}

function computeAge(birthDate) {
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age -= 1;
  return age;
}
