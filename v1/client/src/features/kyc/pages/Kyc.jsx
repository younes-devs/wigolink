import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { PhotoCapture, requestCameraStream } from '../../../components.jsx';
import { Icon } from '../../../Icons.jsx';
import { SkeletonCard } from '../../../Skeleton.jsx';
import { useToast } from '../../../Toast.jsx';
import { t, useLang } from '../../../i18n.js';
import { warmKycFaceGuidance } from '../services/faceGuidance.js';
import { dataUrlBlob, uploadSignedBlob } from '../../../core/directUpload.js';

// Page de vérification d'identité (KYC manuel — PRD KYC).
// Le flux est volontairement immersif pour laisser toute la place aux documents.
export default function Kyc() {
  useLang();
  const nav = useNavigate();
  const { refreshUser } = useAuth();
  const toast = useToast();
  const [me, setMe] = useState(null);

  const load = () => api('/me').then(setMe);
  useEffect(() => {
    load();
    // Charge la détection en parallèle des données du compte pour que le selfie
    // démarre immédiatement lorsque l'utilisateur atteint cette étape.
    void warmKycFaceGuidance();
  }, []);

  if (!me) return <div className="kyc-page"><SkeletonCard lines={3} /></div>;
  const status = me.kyc?.status || 'none';

  return (
    <div className="kyc-page">
      <button className="link-btn back-btn" onClick={() => nav(-1)}><Icon name="arrowLeft" size={14} />{t('common.back')}</button>
      <h1 className="page-title">{t('kyc.title')}</h1>
      <p className="page-sub">{t('kyc.sub')}</p>

      {status === 'verified' && (
        <div className="card center" style={{ padding: '28px 18px' }}>
          <div className="kyc-status-icon kyc-ok"><Icon name="shieldCheck" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12 }}>{t('kyc.verified.title')}</h2>
          <p className="muted mt">{t('kyc.verified.text')}</p>
        </div>
      )}

      {status === 'pending' && (
        <div className="card center" style={{ padding: '28px 18px' }}>
          <div className="kyc-status-icon kyc-pending"><Icon name="clock" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12 }}>{t('kyc.pending.title')}</h2>
          <p className="muted mt">{t('kyc.pending.text')}</p>
        </div>
      )}

      {status === 'refused' && (
        <div className="card" style={{ padding: '24px 18px' }}>
          <div className="kyc-status-icon kyc-refused" style={{ margin: '0 auto' }}><Icon name="x" size={30} /></div>
          <h2 style={{ justifyContent: 'center', marginTop: 12, textAlign: 'center' }}>{t('kyc.refused.title')}</h2>
          {me.kyc?.latestDecisionReason && (
            <div className="alert alert-danger mt"><Icon name="alert" size={17} />{me.kyc.latestDecisionReason}</div>
          )}
          <p className="muted mt center">
            {t('kyc.refused.text')}
            <a href="mailto:support@wigolink.com" style={{ color: 'var(--accent)', fontWeight: 600 }}> support@wigolink.com</a>.
          </p>
        </div>
      )}

      {(status === 'none' || status === 'rejected') && (
        <KycFlow
          rejected={status === 'rejected'}
          rejectReason={me.kyc?.latestDecisionReason}
          canResubmit={status === 'none' || me.kyc?.canResubmit}
          onDone={async () => { await load(); await refreshUser(); toast.success(t('kyc.toast.sent')); }}
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
    selfie: { facing: 'user', key: 'selfiePhoto', guide: t('kyc.guide.selfie'), maxPx: 700 },
    front: { facing: 'environment', key: 'idFrontPhoto', guide: t('kyc.guide.front'), maxPx: 1100 },
    back: { facing: 'environment', key: 'idBackPhoto', guide: t('kyc.guide.back'), maxPx: 1100 },
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
      setCaptureError(t('kyc.camera.denied'));
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
      let body = { ...form, ...photos };
      try {
        body = await prepareDirectKycSubmission(form, photos);
      } catch (uploadError) {
        if (!import.meta.env.DEV) throw uploadError;
      }
      await api('/kyc/submit', { method: 'POST', body });
      onDone();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (!canResubmit) {
    return (
      <div className="card">
        <div className="alert alert-danger" style={{ marginBottom: 0 }}>
          <Icon name="alert" size={17} />
          {t('kyc.maxattempts')} <a href="mailto:support@wigolink.com">support@wigolink.com</a>.
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      {rejected && (
        <div className="alert alert-warn">
          <Icon name="alert" size={17} />
          <span><b>{t('kyc.rejected.banner')}</b>{rejectReason ? ` ${rejectReason}` : ''} {t('kyc.rejected.retry')}</span>
        </div>
      )}

      <div className="step-dots">{activeSteps.map((_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
      {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}

      {stepName === 'infos' && (
        <>
          <h2 style={{ marginBottom: 12 }}><Icon name="user" size={17} />{t('kyc.infos.title')}</h2>
          <div className="field">
            <label>{t('kyc.legalname')}</label>
            <input value={form.legalName} onChange={(e) => set('legalName', e.target.value)}
              placeholder={t('kyc.legalname.ph')} />
          </div>
          <div className="field">
            <label>{t('kyc.birthdate')}</label>
            <input type="date" value={form.birthDate} onChange={(e) => set('birthDate', e.target.value)} />
            {age !== null && age < 18 && (
              <div className="hint" style={{ color: 'var(--danger)' }}>{t('kyc.age.min')}</div>
            )}
          </div>
          <div className="field">
            <label>{t('kyc.doctype')}</label>
            <select value={form.documentType} onChange={(e) => { set('documentType', e.target.value); setPhotos((p) => ({ ...p, idBackPhoto: null })); }}>
              <option value="id_card">{t('kyc.doc.idcard')}</option>
              <option value="passport">{t('kyc.doc.passport')}</option>
            </select>
            <div className="hint">{needsBack ? t('kyc.hint.both') : t('kyc.hint.passport')}</div>
          </div>
          <button
            className="btn btn-primary"
            disabled={!infosValid}
            onClick={() => {
              next();
              void openCapture('selfie');
            }}
          >
            {t('common.continue')}
          </button>
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
          <h2 style={{ marginBottom: 12 }}><Icon name="shieldCheck" size={17} />{t('kyc.review.title')}</h2>
          <div className="kyc-review-grid">
            <ReviewThumb label={t('kyc.review.selfie')} photo={photos.selfiePhoto} onRetake={() => openCapture('selfie')} />
            <ReviewThumb label={t('kyc.review.front')} photo={photos.idFrontPhoto} onRetake={() => openCapture('front')} />
            {needsBack && <ReviewThumb label={t('kyc.review.back')} photo={photos.idBackPhoto} onRetake={() => openCapture('back')} />}
          </div>
          <div className="kyc-recap">
            <div><span className="muted">{t('kyc.review.name')}</span><b>{form.legalName}</b></div>
            <div><span className="muted">{t('kyc.review.birth')}</span><b>{form.birthDate}</b></div>
            <div><span className="muted">{t('kyc.review.doc')}</span><b>{needsBack ? t('kyc.doc.idcard.short') : t('kyc.doc.passport')}</b></div>
          </div>
          <div className="alert alert-teal" style={{ fontSize: 12.5 }}>
            <Icon name="lock" size={16} />
            <span>{t('kyc.privacy')}</span>
          </div>
          <button className="btn btn-teal" onClick={submit} disabled={busy}>
            {busy ? t('kyc.submitting') : t('kyc.submit')}
          </button>
          <button className="btn btn-ghost mt" onClick={prev}>{t('common.back')}</button>
        </>
      )}

      {capturing && (
        <PhotoCapture
          facing={captureConfig[capturing].facing}
          maxPx={captureConfig[capturing].maxPx}
          guide={captureConfig[capturing].guide}
          stream={captureStream}
          streamError={captureError}
          faceAssist={capturing === 'selfie'}
          onClose={closeCapture}
          onCapture={(dataUrl) => {
            const capturedStep = capturing;
            setPhotos((p) => ({ ...p, [captureConfig[capturedStep].key]: dataUrl }));
            setCapturing(null);
            setCaptureStream(null);
            if (capturedStep === 'selfie') next();
          }}
        />
      )}
    </div>
  );
}

async function prepareDirectKycSubmission(form, photos) {
  const fields = ['selfiePhoto', 'idFrontPhoto', 'idBackPhoto']
    .filter((field) => !!photos[field]);
  const blobs = Object.fromEntries(await Promise.all(fields.map(async (field) => (
    [field, await dataUrlBlob(photos[field])]
  ))));
  const reservation = await api('/kyc/uploads', {
    method: 'POST',
    body: {
      photos: Object.fromEntries(fields.map((field) => [field, {
        mime: blobs[field].type || 'image/jpeg',
        size: blobs[field].size,
      }])),
    },
  });
  await Promise.all((reservation.uploads || []).map((upload) => (
    uploadSignedBlob(upload.signedUrl, blobs[upload.field], '300')
  )));
  return {
    ...form,
    uploadId: reservation.uploadId,
    ...Object.fromEntries(fields.map((field) => [field, {
      uploadId: reservation.uploadId,
      field,
    }])),
  };
}

function PhotoStep({ cfg, photo, onRetake, onNext, onPrev }) {
  return (
    <>
      <h2 style={{ marginBottom: 6 }}><Icon name="camera" size={17} />{cfg.guide}</h2>
      <p className="muted mb" style={{ fontSize: 12.5 }}>
        {cfg.facing === 'user' ? t('kyc.photo.selfie.help') : t('kyc.photo.doc.help')}
      </p>
      {photo ? (
        <div className={`kyc-preview ${cfg.facing === 'user' ? 'kyc-preview-selfie' : ''}`}>
          <img src={photo} alt={cfg.guide} />
        </div>
      ) : (
        <div className="kyc-placeholder"><Icon name="camera" size={28} /><span>{t('kyc.photo.none')}</span></div>
      )}
      <button className="btn btn-ghost mt" onClick={onRetake}>
        <Icon name="camera" size={17} />{photo ? t('kyc.photo.retake') : t('kyc.photo.take')}
      </button>
      <div className="row mt">
        <button className="btn btn-ghost btn-sm" onClick={onPrev}>{t('common.back')}</button>
        <button className="btn btn-primary btn-sm" onClick={onNext} disabled={!photo}>{t('common.continue')}</button>
      </div>
    </>
  );
}

function ReviewThumb({ label, photo, onRetake }) {
  return (
    <div className="kyc-review-thumb">
      <img src={photo} alt={label} />
      <span>{label}</span>
      <button className="kyc-retake" onClick={onRetake} aria-label={t('kyc.photo.retake')}><Icon name="camera" size={13} /></button>
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
