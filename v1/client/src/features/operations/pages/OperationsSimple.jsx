import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { Avatar, Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { formatDate } from '../../trips/index.js';
import { dateLocale, t, useLang } from '../../../i18n.js';

const STATUS_LABELS = {
  attente_confirmation: 'operations.status.awaitingConfirmation',
  paiement_requis: 'operations.status.paymentRequired',
  paye: 'operations.status.paid',
  collecte_prevue: 'operations.status.pickupPlanned',
  en_transport: 'operations.status.inTransit',
  livraison_prevue: 'operations.status.deliveryPlanned',
  litige: 'operations.status.dispute',
  termine: 'operations.status.completed',
};

export default function OperationsSimple() {
  useLang();
  const [operations, setOperations] = useState(null);
  const [view, setView] = useState('active');
  const [busy, setBusy] = useState('');
  const nav = useNavigate();
  const toast = useToast();

  useEffect(() => {
    setOperations(null);
    const suffix = view === 'history' ? '?history=1' : '';
    api(`/operations${suffix}`).then((data) => setOperations(data.operations)).catch(() => setOperations([]));
  }, [view]);

  const message = async (operationId) => {
    setBusy(operationId);
    try {
      const data = await api('/conversations', { method: 'POST', body: { operationId } });
      nav(`/messages/${data.conversation.id}`);
    } catch (e) {
      toast.error(e.message);
      setBusy('');
    }
  };

  return (
    <div className="simple-page">
      <h1 className="page-title">{t('operations.title')}</h1>
      <p className="page-sub">{t('operations.subtitle')}</p>

      <div className="tabs operations-tabs" role="tablist" aria-label={t('operations.filter.aria')}>
        <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>{t('operations.tab.active')}</button>
        <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>{t('operations.tab.history')}</button>
      </div>

      {operations === null && <div className="card"><span className="spinner" /> {t('common.loading')}</div>}
      {operations?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="repeat" size={34} />
          <p className="muted">{t(view === 'history' ? 'operations.empty.history' : 'operations.empty.active')}</p>
          {view === 'active' && <Link to="/trajets" className="btn btn-primary btn-sm">{t('operations.findTrip')}</Link>}
        </div>
      )}
      <div className="operation-list">
        {operations?.map((operation) => (
          <article className={`card operation-card ${view === 'history' ? 'operation-card-archived' : ''}`} key={operation.id}>
            <div className="operation-main">
              <Avatar
                name={operation.myRole === 'traveler' ? operation.sender?.name : operation.traveler?.name}
                photo={operation.myRole === 'traveler' ? operation.sender?.photoUrl : operation.traveler?.photoUrl}
                size={44}
              />
              <div className="grow">
                <b>{operation.title}</b>
                <span>{operation.trip ? formatDate(operation.trip.departureDate) : new Date(operation.createdAt).toLocaleDateString(dateLocale())}</span>
                <small>{operation.price} {operation.currency || 'EUR'} - {t(operation.myRole === 'traveler' ? 'operations.role.traveler' : 'operations.role.sender')}</small>
                <small>{view === 'history' ? operationHistoryLabel(operation) : operationNextAction(operation)}</small>
              </div>
            </div>
            <div className="operation-side">
              <span className="pill pill-saffron">{STATUS_LABELS[operation.operationStatus] ? t(STATUS_LABELS[operation.operationStatus]) : operation.operationStatus}</span>
              <Link to={`/operations/${operation.id}`} className="btn btn-primary btn-sm">{t('common.open')}</Link>
              <button className="btn btn-ghost btn-sm" onClick={() => message(operation.id)} disabled={busy === operation.id}>
                {busy === operation.id ? <span className="spinner" /> : <Icon name="chat" size={15} />}
                {t('messages.title')}
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function operationNextAction(operation) {
  if (operation.operationStatus === 'attente_confirmation')
    return t(operation.myRole === 'traveler' ? 'operations.next.acceptOrReject' : 'operations.next.travelerConfirmation');
  if (operation.operationStatus === 'paiement_requis')
    return t(operation.myRole === 'sender' ? 'operations.next.pay' : 'operations.next.waitPayment');
  if (operation.operationStatus === 'paye') return t(operation.myRole === 'traveler' ? 'operations.next.getPickupCode' : 'operations.next.enterPickupCode');
  if (operation.operationStatus === 'en_transport') return t(operation.myRole === 'sender' ? 'operations.next.getDeliveryCode' : 'operations.next.enterDeliveryCode');
  if (operation.operationStatus === 'litige') return t('operations.next.followDispute');
  return t('operations.next.none');
}

function operationHistoryLabel(operation) {
  if (operation.status === 'released') return t('operations.history.released');
  if (operation.status === 'cancelled') return t('operations.history.cancelled');
  if (operation.status === 'refunded') return t('operations.history.refunded');
  return t('operations.history.archived');
}

export { STATUS_LABELS };
