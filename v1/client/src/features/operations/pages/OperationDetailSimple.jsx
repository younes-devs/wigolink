import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { Stars } from '../../../components.jsx';
import { Avatar, Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { formatDate } from '../../trips/index.js';
import { STATUS_LABELS } from './OperationsSimple.jsx';
import { t, useLang } from '../../../i18n.js';

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

  const load = () => api(`/operations/${id}`).then((data) => setOperation(data.operation)).catch(() => setOperation(false));
  useEffect(() => { load(); }, [id]);

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

  const pay = () => run('pay', () => api(`/operations/${id}/pay`, { method: 'POST' }), 'operations.toast.paymentConfirmed');
  const accept = () => run('accept', () => api(`/operations/${id}/confirm`, { method: 'POST' }), 'operations.toast.accepted');
  const reject = () => run('reject', () => api(`/operations/${id}/reject`, { method: 'POST', body: { reason: issue || t('operations.reason.rejected') } }), 'operations.toast.rejected');
  const cancel = () => run('cancel', () => api(`/operations/${id}/cancel`, { method: 'POST', body: { reason: issue || t('operations.reason.cancelled') } }), 'operations.toast.cancelled');
  const openDispute = () => run('dispute', () => api(`/operations/${id}/dispute`, { method: 'POST', body: { reason: issue || t('operations.reason.dispute') } }), 'operations.toast.dispute');

  const message = async () => {
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

  const confirmCode = async (stage) => {
    const data = await run(`confirm-${stage}`, () => api(`/operations/${id}/confirm-${stage}`, { method: 'POST', body: { code } }), stage === 'pickup' ? 'operations.security.pickup.done' : 'operations.security.delivery.done');
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

  const other = operation.myRole === 'traveler' ? operation.sender : operation.traveler;
  const codeReady = code.length === 8;

  return (
    <div className="simple-page operation-simple-page">
      <Link to="/en-cours" className="link-btn back-btn"><Icon name="arrowLeft" size={15} />{t('common.back')}</Link>
      <section className="card operation-detail operation-detail-simple">
        <header className="operation-detail-head">
          <div><h1>{operation.title}</h1><p>{operation.trip ? formatDate(operation.trip.departureDate) : t('trips.date.pending')}</p></div>
          <span className="pill pill-saffron">{t(STATUS_LABELS[operation.operationStatus] || 'operations.status.completed')}</span>
        </header>

        <div className="operation-person">
          <Avatar name={other?.name || t('messages.contact')} photo={other?.photoUrl} size={48} />
          <div><b>{other?.name || t('messages.contact')}</b><span>{t(operation.myRole === 'traveler' ? 'operations.role.sender' : 'operations.role.traveler')}</span></div>
          <button className="icon-btn" type="button" onClick={message} disabled={!!busy} aria-label={t('messages.title')}><Icon name="chat" size={18} /></button>
        </div>

        <div className="operation-summary-line">
          <span>{operation.shipmentType === 'document' ? t('trips.request.documentType') : t('trips.request.parcel')} · {operation.shipmentType === 'document' ? t(Number(operation.documentCount) > 1 ? 'trips.request.documents' : 'trips.request.document', { count: operation.documentCount || 0 }) : t('trips.request.weight', { weight: operation.weightKg || 0 })}</span>
          <b>{operation.price} {operation.currency || 'EUR'}</b>
        </div>

        <OperationAction
          operation={operation}
          busy={busy}
          code={code}
          codeReady={codeReady}
          revealedCode={revealedCode}
          onCodeChange={(value) => setCode(value.replace(/\D/g, '').slice(0, 8))}
          onPay={pay}
          onAccept={accept}
          onReject={reject}
          onCancel={cancel}
          onReveal={revealCode}
          onConfirm={confirmCode}
        />

        {operation.descriptionParcel && <div className="operation-description"><span>{t('trips.request.contents')}</span><p>{operation.descriptionParcel}</p></div>}

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

        {operation.status === 'released' && (
          <section className="operation-rating">
            <h2><Icon name="star" size={17} />{t('operations.rating.title', { name: other?.name || t('operations.rating.member') })}</h2>
            {(operation.ratings || []).some((item) => item.by === user?.id && item.target === other?.id) ? <span className="pill pill-teal"><Icon name="check" size={13} />{t('operations.rating.sent')}</span> : <><Stars value={rating} onChange={setRating} />{rating > 0 && <><textarea rows={2} value={review} onChange={(event) => setReview(event.target.value)} maxLength={400} placeholder={t('operations.rating.placeholder')} /><button className="btn btn-primary btn-sm" onClick={submitRating} disabled={busy === 'rating'}>{t('operations.rating.send')}</button></>}</>}
          </section>
        )}
      </section>
    </div>
  );
}

function OperationAction({ operation, busy, code, codeReady, revealedCode, onCodeChange, onPay, onAccept, onReject, onCancel, onReveal, onConfirm }) {
  const status = operation.operationStatus;
  const role = operation.myRole;
  const stage = status === 'paye' ? 'pickup' : status === 'en_transport' ? 'delivery' : null;
  const security = stage ? operation.security?.[stage] : null;
  const title = stage ? t(`operations.security.${stage}.title`) : null;

  if (status === 'termine') return <section className="operation-action-card operation-complete"><Icon name="check" size={22} /><div><b>{t('operations.security.delivery.done')}</b><p>{t('operations.complete')}</p></div></section>;
  if (status === 'litige') return <section className="operation-action-card operation-locked"><Icon name="alert" size={22} /><div><b>{t('operations.status.dispute')}</b><p>{t('operations.issue.placeholder')}</p></div></section>;
  if (status === 'attente_confirmation') return <section className="operation-action-card"><div><span>{t('operations.status.awaitingConfirmation')}</span><h2>{role === 'traveler' ? t('operations.action.accept') : t('operations.awaiting.sender')}</h2></div>{role === 'traveler' && <div className="operation-action-buttons"><button className="btn btn-primary" onClick={onAccept} disabled={!!busy}>{busy === 'accept' ? <span className="spinner" /> : <Icon name="check" size={17} />}{t('operations.action.accept')}</button><button className="btn btn-ghost" onClick={onReject} disabled={!!busy}>{t('operations.reject')}</button></div>}{role === 'sender' && <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={!!busy}>{t('common.cancel')}</button>}</section>;
  if (status === 'paiement_requis') return <section className="operation-action-card"><div><span>{t('operations.payment')}</span><h2>{role === 'sender' ? t('operations.next.pay') : t('operations.next.waitPayment')}</h2></div>{role === 'sender' && <button className="btn btn-primary" onClick={onPay} disabled={!!busy}>{busy === 'pay' ? <span className="spinner" /> : <Icon name="euro" size={17} />}{t('operations.pay')}</button>}</section>;
  if (!stage) return null;
  if (security?.locked) return <section className="operation-action-card operation-locked"><Icon name="alert" size={22} /><div><b>{title}</b><p>{t('operations.security.locked')}</p></div></section>;
  if (security?.canReveal) return <section className="operation-action-card operation-code-card"><div><span>{t('operations.security.title')}</span><h2>{title}</h2>{revealedCode?.stage === stage ? <><output className="operation-code">{revealedCode.value}</output><p>{t(`operations.security.${stage}.share`)}</p></> : <p>{t('operations.security.issued')}</p>}</div><button className="btn btn-primary" onClick={() => onReveal(stage)} disabled={!!busy}>{busy === `reveal-${stage}` ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t(`operations.security.${stage}.get`)}</button></section>;
  if (security?.canEnter) return <section className="operation-action-card operation-code-card"><div><span>{t('operations.security.title')}</span><h2>{t(`operations.security.${stage}.enter`)}</h2><p>{t(`operations.security.${stage}.enterHint`)}</p></div>{security.issued ? <div className="operation-code-entry"><label className="field"><span>{t('operations.security.codeLabel')}</span><input value={code} onChange={(event) => onCodeChange(event.target.value)} inputMode="numeric" autoComplete="one-time-code" maxLength={8} /></label><button className="btn btn-primary" onClick={() => onConfirm(stage)} disabled={!codeReady || !!busy}>{busy === `confirm-${stage}` ? <span className="spinner" /> : <Icon name="check" size={17} />}{t('operations.security.confirm')}</button></div> : <p className="operation-waiting"><Icon name="clock" size={16} />{t('operations.security.waiting')}</p>}</section>;
  return null;
}
