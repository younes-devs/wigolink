import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { ConfirmDialog, Stars, Stepper } from '../../../components.jsx';
import { Avatar, Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import EmailCodeInput from '../../../shared/ui/EmailCodeInput.jsx';
import { formatDate } from '../../trips/index.js';
import { STATUS_LABELS } from './OperationsSimple.jsx';
import { t, useLang } from '../../../i18n.js';
import {
  operationGuideSteps, operationNeedsAction, operationStepIndex, resolveOperationRole,
} from '../utils/operationGuide.js';

export default function OperationDetailSimple() {
  useLang();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [operation, setOperation] = useState(null);
  const [busy, setBusy] = useState('');
  const [code, setCode] = useState('');
  const [revealedCode, setRevealedCode] = useState(null);
  const [issue, setIssue] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const paymentReturn = new URLSearchParams(window.location.search).get('paiement');

  const load = () => api(`/operations/${id}`).then((data) => setOperation(data.operation)).catch(() => setOperation(false));
  useEffect(() => { load(); }, [id]);
  useEffect(() => {
    if (paymentReturn !== 'succes') return undefined;
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts += 1;
      try {
        const data = await api(`/operations/${id}`);
        setOperation(data.operation);
        if (data.operation?.paymentStatus === 'paid' || attempts >= 10) {
          window.clearInterval(timer);
        }
      } catch {
        if (attempts >= 10) window.clearInterval(timer);
      }
    }, 1_500);
    return () => window.clearInterval(timer);
  }, [id, paymentReturn]);

  const run = async (key, request, successKey) => {
    setBusy(key);
    try {
      const data = await request();
      if (data.operation) setOperation(data.operation);
      if (successKey) toast.success(t(successKey));
      return data;
    } catch (error) {
      toast.error(error.message);
      return null;
    } finally {
      setBusy('');
    }
  };

  const pay = async () => {
    const data = await run('pay', () => api(`/operations/${id}/pay`, { method: 'POST' }));
    if (data?.checkoutUrl) window.location.assign(data.checkoutUrl);
  };
  const accept = () => run('accept', () => api(`/operations/${id}/confirm`, { method: 'POST' }), 'operations.toast.accepted');
  const reject = () => run('reject', () => api(`/operations/${id}/reject`, { method: 'POST', body: { reason: issue || t('operations.reason.rejected') } }), 'operations.toast.rejected');
  const cancel = () => run('cancel', () => api(`/operations/${id}/cancel`, { method: 'POST', body: { reason: issue || t('operations.reason.cancelled') } }), 'operations.toast.cancelled');
  const openDispute = () => run('dispute', () => api(`/operations/${id}/dispute`, { method: 'POST', body: { reason: issue || t('operations.reason.dispute') } }), 'operations.toast.dispute');

  const message = async () => {
    if (operation.conversationId) {
      nav(`/messages/${operation.conversationId}`);
      return;
    }
    const data = await run('message', () => api('/conversations', { method: 'POST', body: { operationId: operation.id } }));
    if (data?.conversation) nav(`/messages/${data.conversation.id}`);
  };

  const revealCode = async (stage) => {
    const data = await run(`reveal-${stage}`, () => api(`/operations/${id}/${stage}-code`, { method: 'POST' }));
    if (data?.code) {
      setCode('');
      setRevealedCode({ stage, value: data.code });
      toast.success(t('operations.security.issued'));
    }
  };

  const confirmCode = async (stage, completedCode = code) => {
    const data = await run(`confirm-${stage}`, () => api(`/operations/${id}/confirm-${stage}`, { method: 'POST', body: { code: completedCode } }), stage === 'pickup' ? 'operations.security.pickup.done' : 'operations.security.delivery.done');
    if (data) {
      setCode('');
      setRevealedCode(null);
    }
  };

  const submitEvidence = () => run('evidence', async () => {
    const data = await api(`/operations/${id}/evidence`, { method: 'POST', body: { text: evidenceText } });
    setEvidenceText('');
    return data;
  }, 'operations.toast.evidence');

  const submitRating = () => run('rating', async () => {
    await api(`/transactions/${operation.id}/rate`, { method: 'POST', body: { targetId: other.id, stars: rating, comment: review } });
    setRating(0);
    setReview('');
    await load();
    return {};
  }, 'operations.toast.rating');

  if (operation === null) return <div className="card"><span className="spinner" /> {t('common.loading')}</div>;
  if (operation === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>{t('operations.notFound')}</p></div>;

  const viewerRole = resolveOperationRole(operation, user?.id) || 'sender';
  const viewedOperation = operation.myRole === viewerRole ? operation : { ...operation, myRole: viewerRole };
  const other = viewerRole === 'traveler' ? operation.sender : operation.traveler;
  return (
    <div className="simple-page operation-simple-page">
      <Link to="/en-cours" className="link-btn back-btn"><Icon name="arrowLeft" size={15} />{t('common.back')}</Link>
      <OperationJourney operation={viewedOperation} />
      <section className="card operation-detail operation-detail-simple">
        <header className="operation-detail-head">
          <div><h1>{operation.title}</h1><p>{operation.trip ? formatDate(operation.trip.departureDate) : t('trips.date.pending')}</p></div>
          <span className="pill pill-saffron">{t(STATUS_LABELS[operation.operationStatus] || 'operations.status.completed')}</span>
        </header>

        <div className="operation-person">
          <Avatar name={other?.name || t('messages.contact')} photo={other?.photoUrl} size={48} />
          <div><b>{other?.name || t('messages.contact')}</b><span>{t(viewerRole === 'traveler' ? 'operations.role.sender' : 'operations.role.traveler')}</span></div>
          <button className="icon-btn" type="button" onClick={message} disabled={!!busy} aria-label={t('messages.title')}><Icon name="chat" size={18} /></button>
        </div>

        <div className="operation-summary-line">
          <span>{operation.shipmentType === 'document' ? t('trips.request.documentType') : t('trips.request.parcel')} · {operation.shipmentType === 'document' ? t(Number(operation.documentCount) > 1 ? 'trips.request.documents' : 'trips.request.document', { count: operation.documentCount || 0 }) : t('trips.request.weight', { weight: operation.weightKg || 0 })}</span>
          <b>{operation.price} {operation.currency || 'EUR'}</b>
        </div>

        {operation.operationStatus === 'attente_confirmation' && operation.myRole === 'traveler' && (
          <ParcelPhotoGallery operation={operation} decision />
        )}

        <OperationAction
          operation={viewedOperation}
          busy={busy}
          code={code}
          revealedCode={revealedCode}
          onCodeChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))}
          onPay={pay}
          onAccept={accept}
          onReject={reject}
          onCancel={() => setConfirmCancel(true)}
          onReveal={revealCode}
          onConfirm={confirmCode}
          onSetupPayout={() => nav(`/versements?retour=${encodeURIComponent(`/operations/${id}`)}`)}
        />

        {operation.operationStatus !== 'termine' && <PaymentBreakdown operation={viewedOperation} />}

        {operation.descriptionParcel && <div className="operation-description"><span>{t('trips.request.contents')}</span><p>{operation.descriptionParcel}</p></div>}

        {!(operation.operationStatus === 'attente_confirmation' && operation.myRole === 'traveler') && (
          <ParcelPhotoGallery operation={operation} />
        )}

        {!['litige', 'termine'].includes(operation.operationStatus) && (
          <details className="operation-help">
            <summary><Icon name="alert" size={16} />{t('operations.issue')}</summary>
            <label className="field"><span>{t('operations.issue')}</span><textarea rows={2} value={issue} onChange={(event) => setIssue(event.target.value)} placeholder={t('operations.issue.placeholder')} /></label>
            <button className="btn btn-ghost btn-sm" onClick={openDispute} disabled={!!busy}><Icon name="alert" size={15} />{t('operations.issue.report')}</button>
          </details>
        )}

        {operation.operationStatus === 'litige' && (
          <section className="operation-evidence">
            <h2><Icon name="alert" size={17} />{t('operations.evidence')}</h2>
            {operation.dispute?.evidence?.map((item, index) => <div className="evidence-item" key={`${item.at}-${index}`}><p>{item.text || t('operations.evidence.photo')}</p></div>)}
            <label className="field"><span>{t('operations.evidence.add')}</span><textarea rows={2} value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} placeholder={t('operations.evidence.placeholder')} /></label>
            <button className="btn btn-primary btn-sm" onClick={submitEvidence} disabled={!!busy || !evidenceText.trim()}>{busy === 'evidence' ? <span className="spinner" /> : <Icon name="check" size={15} />}{t('common.add')}</button>
          </section>
        )}

        {operation.operationStatus === 'termine' && (
          <section className="operation-rating">
            <h2><Icon name="star" size={17} />{t('operations.rating.title', { name: other?.name || t('operations.rating.member') })}</h2>
            {(operation.ratings || []).some((item) => item.by === user?.id && item.target === other?.id) ? <span className="pill pill-teal"><Icon name="check" size={13} />{t('operations.rating.sent')}</span> : <><Stars value={rating} onChange={setRating} />{rating > 0 && <><textarea rows={2} value={review} onChange={(event) => setReview(event.target.value)} maxLength={400} placeholder={t('operations.rating.placeholder')} /><button className="btn btn-primary btn-sm" onClick={submitRating} disabled={busy === 'rating'}>{t('operations.rating.send')}</button></>}</>}
          </section>
        )}
      </section>
      {confirmCancel && (
        <ConfirmDialog
          title={t('operations.cancel.title')}
          message={t('operations.cancel.message')}
          confirmLabel={t('operations.cancel.action')}
          cancelLabel={t('common.back')}
          danger
          icon="alert"
          onConfirm={cancel}
          onClose={() => setConfirmCancel(false)}
        />
      )}
    </div>
  );
}

function OperationJourney({ operation }) {
  const steps = operationGuideSteps(operation);
  const current = operationStepIndex(operation.operationStatus);
  const role = operation.myRole === 'traveler' ? 'traveler' : 'sender';
  const statusLabel = operation.operationStatus === 'litige'
    ? t('operations.status.dispute')
    : t('operations.guide.step', { current: Math.min(current + 1, steps.length), total: steps.length });

  return (
    <section className="operation-journey" aria-label={t('operations.progress.aria')}>
      <div className="operation-journey-head">
        <div>
          <span>{t(operationNeedsAction(operation) ? 'operations.guide.action' : 'operations.guide.waiting')}</span>
          <h2>{t(`operations.guide.${role}.title`)}</h2>
        </div>
        <b>{statusLabel}</b>
      </div>
      <Stepper labels={steps.map((step) => t(step.labelKey))} current={current} />
    </section>
  );
}

function ParcelPhotoGallery({ operation, decision = false }) {
  if (operation.shipmentType !== 'parcel' || !operation.parcelPhotos?.length) return null;
  return (
    <section className={`operation-parcel-photos${decision ? ' operation-parcel-photos-decision' : ''}`}>
      <div className="operation-parcel-photos-head">
        <h2><Icon name="camera" size={17} />{t(decision ? 'operations.parcelPhotos.decisionTitle' : 'trips.request.photos.title')}</h2>
        {decision && <p>{t('operations.parcelPhotos.decisionHelp')}</p>}
      </div>
      <div className="operation-parcel-photo-grid">
        {operation.parcelPhotos.map((photo, index) => (
          <a href={photo.url} target="_blank" rel="noreferrer" key={photo.id} aria-label={t('trips.request.photos.enlarge', { number: index + 1 })}>
            <img src={photo.url} alt={t('trips.request.photos.alt', { number: index + 1 })} loading="lazy" decoding="async" />
          </a>
        ))}
      </div>
    </section>
  );
}

function OperationAction({ operation, busy, code, revealedCode, onCodeChange, onPay, onAccept, onReject, onCancel, onReveal, onConfirm, onSetupPayout }) {
  const status = operation.operationStatus;
  const role = operation.myRole;
  const stage = status === 'paye' ? 'pickup' : status === 'en_transport' ? 'delivery' : null;
  const security = stage ? operation.security?.[stage] : null;
  const title = stage ? t(`operations.security.${stage}.title`) : null;

  if (status === 'termine') return <section className="operation-action-card operation-complete"><Icon name="check" size={22} /><div><b>{t('operations.security.delivery.done')}</b><p>{role === 'traveler' ? t('operations.payout.withinSevenDays') : t('operations.complete')}</p></div></section>;
  if (status === 'litige') return <section className="operation-action-card operation-locked"><Icon name="alert" size={22} /><div><b>{t('operations.status.dispute')}</b><p>{t('operations.issue.placeholder')}</p></div></section>;
  if (status === 'attente_confirmation') return <section className="operation-action-card"><div><span>{t(role === 'traveler' ? 'operations.guide.action' : 'operations.guide.waiting')}</span><h2>{role === 'traveler' ? t('operations.action.accept') : t('operations.awaiting.sender')}</h2><p>{t(role === 'traveler' ? 'operations.awaiting.traveler' : 'operations.next.travelerConfirmation')}</p></div><div className="operation-action-buttons">{role === 'traveler' && <><button className="btn btn-primary" onClick={onAccept} disabled={!!busy}>{busy === 'accept' ? <span className="spinner" /> : <Icon name="check" size={17} />}{t('operations.action.accept')}</button><button className="btn btn-danger-ghost" onClick={onReject} disabled={!!busy}>{busy === 'reject' ? <span className="spinner" /> : <Icon name="x" size={16} />}{t('operations.reject')}</button></>}{role !== 'traveler' && <button className="btn btn-danger-ghost" onClick={onCancel} disabled={!!busy}><Icon name="x" size={16} />{t('operations.cancel.action')}</button>}</div></section>;
  if (status === 'paiement_requis') {
    const payoutReady = operation.payout?.ready;
    if (role === 'traveler' && !payoutReady) return <section className="operation-action-card"><div><span>{t('operations.guide.action')}</span><h2>{t('payments.payout.title')}</h2><p>{t('payments.payout.required')}</p></div><div className="operation-action-buttons"><button className="btn btn-primary" onClick={onSetupPayout}><Icon name="euro" size={17} />{t('payments.payout.configure')}</button><button className="btn btn-danger-ghost" onClick={onCancel} disabled={!!busy}><Icon name="x" size={16} />{t('operations.cancel.action')}</button></div></section>;
    if (role === 'sender' && !payoutReady) return <section className="operation-action-card"><div><span>{t('operations.guide.waiting')}</span><h2>{t('payments.payout.waitingTitle')}</h2><p>{t('payments.payout.waiting')}</p></div><button className="btn btn-danger-ghost" onClick={onCancel} disabled={!!busy}><Icon name="x" size={16} />{t('operations.cancel.action')}</button></section>;
    return <section className="operation-action-card"><div><span>{t(role === 'sender' ? 'operations.guide.action' : 'operations.guide.waiting')}</span><h2>{role === 'sender' ? t('operations.next.pay') : t('operations.next.waitPayment')}</h2><p>{t(role === 'sender' ? 'operations.guide.sender.paymentHelp' : 'operations.guide.traveler.paymentHelp')}</p></div><div className="operation-action-buttons">{role === 'sender' && <button className="btn btn-primary" onClick={onPay} disabled={!!busy}>{busy === 'pay' ? <span className="spinner" /> : <Icon name="euro" size={17} />}{t('operations.pay')}</button>}<button className="btn btn-danger-ghost" onClick={onCancel} disabled={!!busy}><Icon name="x" size={16} />{t('operations.cancel.action')}</button></div></section>;
  }
  if (status === 'collecte_prevue' || status === 'livraison_prevue') return <section className="operation-action-card"><div><span>{t('operations.guide.waiting')}</span><h2>{t(STATUS_LABELS[status])}</h2><p>{t(status === 'collecte_prevue' ? 'operations.security.pickup.enterHint' : 'operations.security.delivery.enterHint')}</p></div></section>;
  if (!stage) return null;
  if (security?.locked) return <section className="operation-action-card operation-locked"><Icon name="alert" size={22} /><div><b>{title}</b><p>{t('operations.security.locked')}</p></div></section>;
  if (security?.canReveal) return <section className="operation-action-card operation-code-card"><div><span>{t('operations.security.title')}</span><h2>{title}</h2>{revealedCode?.stage === stage ? <><output className="operation-code">{revealedCode.value}</output><p>{t(`operations.security.${stage}.share`)}</p></> : <p>{t('operations.security.issued')}</p>}</div><button className="btn btn-primary" onClick={() => onReveal(stage)} disabled={!!busy}>{busy === `reveal-${stage}` ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t(`operations.security.${stage}.get`)}</button></section>;
  if (security?.canEnter) return <section className="operation-action-card operation-code-card operation-code-entry-card"><div><span>{t('operations.security.title')}</span><h2>{t(`operations.security.${stage}.enter`)}</h2><p>{t(`operations.security.${stage}.enterHint`)}</p></div>{security.issued ? <div className="operation-code-entry"><EmailCodeInput label={t('operations.security.codeLabel')} value={code} onChange={onCodeChange} onComplete={(completedCode) => onConfirm(stage, completedCode)} disabled={!!busy} length={8} autoFocus={false} />{busy === `confirm-${stage}` && <div className="email-code-checking"><span className="spinner" />{t('common.loading')}</div>}</div> : <p className="operation-waiting"><Icon name="clock" size={16} />{t('operations.security.waiting')}</p>}</section>;
  return null;
}

function PaymentBreakdown({ operation }) {
  const payment = operation.paymentDetails || operation.payment;
  if (!payment) return null;
  const currency = payment.currency || operation.currency || 'EUR';
  const rows = operation.myRole === 'sender'
    ? [
        [t('payments.breakdown.transport'), payment.travelerPriceCents],
        [t('payments.breakdown.service'), payment.senderFeeCents],
        [t('payments.breakdown.total'), payment.chargedAmountCents, true],
      ]
    : [
        [t('payments.breakdown.accepted'), payment.travelerPriceCents],
        [t('payments.breakdown.service'), payment.travelerFeeCents],
        [t('payments.breakdown.receive'), payment.travelerTransferCents, true],
      ];
  return <section className="payment-breakdown" aria-label={t('payments.breakdown.title')}><h2>{t('payments.breakdown.title')}</h2>{rows.map(([label, cents, strong]) => <div key={label}><span>{label}</span><b className={strong ? 'payment-total' : ''}>{formatCents(cents, currency)}</b></div>)}</section>;
}

function formatCents(cents, currency) {
  return new Intl.NumberFormat(document.documentElement.lang || 'fr', {
    style: 'currency',
    currency,
  }).format(Number(cents || 0) / 100);
}
