import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { Stars } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';
import { STATUS_LABELS } from './OperationsSimple.jsx';
import { dateLocale, t, useLang } from '../i18n.js';

export default function OperationDetailSimple() {
  useLang();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [operation, setOperation] = useState(null);
  const [busy, setBusy] = useState('');
  const [issue, setIssue] = useState('');
  const [evidenceText, setEvidenceText] = useState('');
  const [rating, setRating] = useState(0);
  const [review, setReview] = useState('');

  const load = () => api(`/operations/${id}`).then((data) => setOperation(data.operation)).catch(() => setOperation(false));
  useEffect(() => { load(); }, [id]);

  const pay = async () => {
    setBusy('pay');
    try {
      const data = await api(`/operations/${id}/pay`, { method: 'POST' });
      setOperation(data.operation);
      toast.success(t('operations.toast.paymentConfirmed'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const message = async () => {
    setBusy('message');
    try {
      const data = await api('/conversations', { method: 'POST', body: { operationId: operation.id } });
      nav(`/messages/${data.conversation.id}`);
    } catch (e) {
      toast.error(e.message);
      setBusy('');
    }
  };

  const confirmNext = async () => {
    setBusy('confirm');
    try {
      const data = await api(`/operations/${id}/confirm`, { method: 'POST' });
      setOperation(data.operation);
      toast.success(confirmToast(data.operation.operationStatus));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const reject = async () => {
    setBusy('reject');
    try {
      const data = await api(`/operations/${id}/reject`, {
        method: 'POST',
        body: { reason: issue || t('operations.reason.rejected') },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info(t('operations.toast.rejected'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const cancel = async () => {
    setBusy('cancel');
    try {
      const data = await api(`/operations/${id}/cancel`, {
        method: 'POST',
        body: { reason: issue || t('operations.reason.cancelled') },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info(t('operations.toast.cancelled'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const openDispute = async () => {
    setBusy('dispute');
    try {
      const data = await api(`/operations/${id}/dispute`, {
        method: 'POST',
        body: { reason: issue || t('operations.reason.dispute') },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info(t('operations.toast.dispute'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const submitRating = async () => {
    if (!other?.id || rating < 1) return;
    setBusy('rating');
    try {
      await api(`/transactions/${operation.id}/rate`, {
        method: 'POST',
        body: { targetId: other.id, stars: rating, comment: review },
      });
      toast.success(t('operations.toast.rating'));
      setRating(0);
      setReview('');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const submitEvidence = async () => {
    if (!evidenceText.trim()) return;
    setBusy('evidence');
    try {
      const data = await api(`/operations/${id}/evidence`, {
        method: 'POST',
        body: { text: evidenceText },
      });
      setOperation(data.operation);
      setEvidenceText('');
      toast.success(t('operations.toast.evidence'));
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  if (operation === null) return <div className="card"><span className="spinner" /> {t('common.loading')}</div>;
  if (operation === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>{t('operations.notFound')}</p></div>;

  const other = operation.myRole === 'traveler' ? operation.sender : operation.traveler;

  return (
    <div className="simple-page">
      <Link to="/en-cours" className="link-btn"><Icon name="arrowLeft" size={15} />{t('common.back')}</Link>
      <section className="card operation-detail">
        <div className="operation-detail-head">
          <div>
            <h1>{operation.title}</h1>
            <p>{operation.trip ? formatDate(operation.trip.departureDate) : t('trips.date.pending')}</p>
          </div>
          <span className="pill pill-saffron">{STATUS_LABELS[operation.operationStatus] ? t(STATUS_LABELS[operation.operationStatus]) : operation.operationStatus}</span>
        </div>

        <div className="operation-person">
          <Avatar name={other?.name || t('messages.contact')} photo={other?.photoUrl} size={50} />
          <div>
            <b>{other?.name || t('messages.contact')}</b>
            <span>{t(operation.myRole === 'traveler' ? 'operations.role.sender' : 'operations.role.traveler')}</span>
          </div>
        </div>

        <div className="trip-detail-grid">
          <div><span>{t('operations.amount')}</span><b>{operation.price} {operation.currency || 'EUR'}</b></div>
          <div><span>{t('operations.payment')}</span><b>{paymentLabel(operation)}</b></div>
          <div><span>{t('operations.escrow')}</span><b>{escrowLabel(operation.escrow?.state)}</b></div>
        </div>

        <section className="operation-journey" aria-label={t('operations.progress.aria')}>
          <div className="operation-journey-head"><h2>{t('operations.progress')}</h2><span>{journeyStatus(operation)}</span></div>
          <div className="operation-journey-steps">
            {journeySteps(operation).map((step, index) => (
              <div className={`operation-journey-step ${step.state}`} key={step.id}>
                <span>{step.state === 'done' ? <Icon name="check" size={13} /> : index + 1}</span>
                <div><b>{step.label}</b><small>{step.detail}</small></div>
              </div>
            ))}
          </div>
        </section>

        {operation.operationStatus === 'attente_confirmation' && (
          <div className="alert alert-warn">
            <Icon name="clock" size={17} />
            <span>
              {operation.myRole === 'traveler'
                ? t('operations.awaiting.traveler')
                : t('operations.awaiting.sender')}
            </span>
          </div>
        )}

        {operation.shipmentType && (
          <div className="trip-detail-grid operation-shipment-summary">
            <div><span>{t('trips.request.type')}</span><b>{t(operation.shipmentType === 'document' ? 'trips.request.documentType' : 'trips.request.parcel')}</b></div>
            <div><span>{t('operations.quantity')}</span><b>{operation.shipmentType === 'document' ? t(Number(operation.documentCount) > 1 ? 'trips.request.documents' : 'trips.request.document', { count: operation.documentCount || 0 }) : t('trips.request.weight', { weight: operation.weightKg || 0 })}</b></div>
            <div><span>{t('trips.request.calculatedPrice')}</span><b>{operation.price} {operation.currency || 'EUR'}</b></div>
          </div>
        )}

        {operation.descriptionParcel && (
          <div className="trip-detail-copy">
            <h2>{t(operation.shipmentType === 'document' ? 'operations.documents' : 'trips.request.parcel')}</h2>
            <p>{operation.descriptionParcel}</p>
          </div>
        )}

        <div className="operation-checklist">
          <h2><Icon name="check" size={17} />{t('operations.checklist')}</h2>
          {operationChecklist(operation).map((item) => (
            <div className={`operation-check ${item.done ? 'done' : ''}`} key={item.label}>
              <Icon name={item.done ? 'check' : 'clock'} size={15} />
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <div className="operation-timeline">
          {(operation.events || []).map((event) => (
            <div className="operation-event" key={event.id}>
              <span />
              <div>
                <b>{event.type.replaceAll('_', ' ')}</b>
                <small>{new Date(event.at).toLocaleString(dateLocale())}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="trip-detail-actions">
          {operation.myRole === 'sender' && operation.operationStatus === 'paiement_requis' && (
            <button className="btn btn-primary" onClick={pay} disabled={!!busy}>
              {busy === 'pay' ? <span className="spinner" /> : <Icon name="euro" size={17} />}
              {t('operations.pay')}
            </button>
          )}
          {nextAction(operation) && (
            <button className="btn btn-primary" onClick={confirmNext} disabled={!!busy}>
              {busy === 'confirm' ? <span className="spinner" /> : <Icon name="check" size={17} />}
              {nextAction(operation)}
            </button>
          )}
          {operation.myRole === 'traveler' && operation.operationStatus === 'attente_confirmation' && (
            <button className="btn btn-ghost" onClick={reject} disabled={!!busy}>
              {busy === 'reject' ? <span className="spinner" /> : <Icon name="x" size={17} />}
              {t('operations.reject')}
            </button>
          )}
          {operation.myRole === 'sender' && ['attente_confirmation', 'paiement_requis'].includes(operation.operationStatus) && (
            <button className="btn btn-ghost" onClick={cancel} disabled={!!busy}>
              {busy === 'cancel' ? <span className="spinner" /> : <Icon name="x" size={17} />}
              {t('common.cancel')}
            </button>
          )}
          <button className="btn btn-ghost" onClick={message} disabled={!!busy}>
            {busy === 'message' ? <span className="spinner" /> : <Icon name="chat" size={17} />}
            {t('messages.title')}
          </button>
        </div>

        {!['litige', 'termine'].includes(operation.operationStatus) && (
          <div className="operation-issue">
            <label className="field">
              <span>{t('operations.issue')}</span>
              <textarea rows={2} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder={t('operations.issue.placeholder')} />
            </label>
            <button className="btn btn-ghost" onClick={openDispute} disabled={!!busy}>
              {busy === 'dispute' ? <span className="spinner" /> : <Icon name="alert" size={17} />}
              {t('operations.issue.report')}
            </button>
          </div>
        )}

        {operation.operationStatus === 'litige' && (
          <div className="operation-evidence">
            <h2><Icon name="alert" size={17} />{t('operations.evidence')}</h2>
            {operation.dispute?.evidence?.length ? (
              <div className="evidence-list">
                {operation.dispute.evidence.map((evidence, index) => (
                  <div className="evidence-item" key={`${evidence.at}-${index}`}>
                    <p>{evidence.text || t('operations.evidence.photo')}</p>
                    <span className="evidence-time">{new Date(evidence.at).toLocaleString(dateLocale())}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">{t('operations.evidence.empty')}</p>
            )}
            <label className="field">
              <span>{t('operations.evidence.add')}</span>
              <textarea rows={2} value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder={t('operations.evidence.placeholder')} />
            </label>
            <button className="btn btn-primary btn-sm" onClick={submitEvidence} disabled={!!busy || !evidenceText.trim()}>
              {busy === 'evidence' ? <span className="spinner" /> : <Icon name="check" size={15} />}
              {t('common.add')}
            </button>
          </div>
        )}

        {operation.status === 'released' && (
          <div className="operation-rating">
            <h2><Icon name="star" size={17} />{t('operations.rating.title', { name: other?.name || t('operations.rating.member') })}</h2>
            {alreadyRated(operation, user?.id, other?.id) ? (
              <span className="pill pill-teal"><Icon name="check" size={13} />{t('operations.rating.sent')}</span>
            ) : (
              <>
                <Stars value={rating} onChange={setRating} />
                {rating > 0 && (
                  <>
                    <textarea rows={2} value={review} onChange={(e) => setReview(e.target.value)} maxLength={400} placeholder={t('operations.rating.placeholder')} />
                    <button className="btn btn-primary btn-sm" onClick={submitRating} disabled={busy === 'rating'}>
                      {busy === 'rating' ? <span className="spinner" /> : <Icon name="star" size={15} />}
                      {t('operations.rating.send')}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function alreadyRated(operation, userId, targetId) {
  return !!userId && !!targetId && (operation.ratings || []).some((r) => r.by === userId && r.target === targetId);
}

function operationChecklist(operation) {
  const status = operation.operationStatus;
  const reached = {
    request: true,
    traveler: !['attente_confirmation'].includes(status),
    payment: ['paye', 'collecte_prevue', 'en_transport', 'litige', 'termine'].includes(status) || operation.paymentStatus === 'paid',
    pickup: ['en_transport', 'litige', 'termine'].includes(status),
    delivery: status === 'termine' && operation.status === 'released',
  };
  return [
    { label: t('operations.check.request'), done: reached.request },
    { label: t('operations.check.traveler'), done: reached.traveler },
    { label: t('operations.check.payment'), done: reached.payment },
    { label: t('operations.check.pickup'), done: reached.pickup },
    { label: t('operations.check.delivery'), done: reached.delivery },
  ];
}

function nextAction(operation) {
  if (operation.operationStatus === 'attente_confirmation' && operation.myRole === 'traveler') return t('operations.action.accept');
  if (operation.operationStatus === 'paye') return t('operations.action.meeting');
  if (operation.operationStatus === 'collecte_prevue') return t('operations.action.pickup');
  if (operation.operationStatus === 'en_transport') return t('operations.action.delivery');
  return null;
}

function confirmToast(status) {
  if (status === 'paiement_requis') return t('operations.toast.accepted');
  if (status === 'collecte_prevue') return t('operations.toast.meeting');
  if (status === 'en_transport') return t('operations.toast.inTransit');
  if (status === 'termine') return t('operations.toast.completed');
  return t('operations.toast.updated');
}

function paymentLabel(operation) {
  if (operation.paymentStatus === 'paid') return t('operations.payment.paid');
  if (operation.paymentStatus === 'cancelled') return t('operations.payment.cancelled');
  if (operation.operationStatus === 'attente_confirmation') return t('operations.payment.waiting');
  return t('operations.payment.todo');
}

function escrowLabel(state) {
  const labels = {
    pending: 'operations.escrow.pending',
    held: 'operations.escrow.held',
    frozen: 'operations.escrow.frozen',
    released: 'operations.escrow.released',
    refunded: 'operations.escrow.refunded',
  };
  return t(labels[state] || 'operations.escrow.pending');
}

function journeySteps(operation) {
  const status = operation.operationStatus;
  const rank = { attente_confirmation: 0, paiement_requis: 1, paye: 2, collecte_prevue: 3, en_transport: 4, termine: 5, litige: 4 }[status] ?? 0;
  const steps = [
    { id: 'request', label: t('operations.journey.request'), detail: t('operations.journey.request.sub') },
    { id: 'payment', label: t('operations.journey.payment'), detail: t('operations.journey.payment.sub') },
    { id: 'meeting', label: t('operations.journey.meeting'), detail: t('operations.journey.meeting.sub') },
    { id: 'pickup', label: t('operations.journey.pickup'), detail: t('operations.journey.pickup.sub') },
    { id: 'delivery', label: t('operations.journey.delivery'), detail: t('operations.journey.delivery.sub') },
  ];
  return steps.map((step, index) => ({ ...step, state: index < rank ? 'done' : index === rank && status !== 'termine' ? 'current' : status === 'termine' ? 'done' : 'next' }));
}

function journeyStatus(operation) {
  if (operation.operationStatus === 'litige') return t('operations.journey.dispute');
  if (operation.operationStatus === 'termine') return t('operations.journey.completed');
  return nextAction(operation) || t('operations.journey.waiting');
}
