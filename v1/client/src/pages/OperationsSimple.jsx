import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';

const STATUS_LABELS = {
  attente_confirmation: 'Attente confirmation',
  paiement_requis: 'Paiement requis',
  paye: 'Paye',
  collecte_prevue: 'Collecte prevue',
  en_transport: 'En transport',
  livraison_prevue: 'Livraison prevue',
  litige: 'Litige',
  termine: 'Termine',
};

export default function OperationsSimple() {
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
      <h1 className="page-title">En cours</h1>
      <p className="page-sub">Toutes les operations actives, puis l'historique des demandes terminees ou annulees.</p>

      <div className="tabs operations-tabs" role="tablist" aria-label="Filtrer les operations">
        <button type="button" className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>Actives</button>
        <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>Historique</button>
      </div>

      {operations === null && <div className="card"><span className="spinner" /> Chargement...</div>}
      {operations?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="repeat" size={34} />
          <p className="muted">{view === 'history' ? 'Aucune operation archivee.' : 'Aucune operation en cours.'}</p>
          {view === 'active' && <Link to="/trajets" className="btn btn-primary btn-sm">Trouver un trajet</Link>}
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
                <span>{operation.trip ? formatDate(operation.trip.departureDate) : new Date(operation.createdAt).toLocaleDateString('fr-FR')}</span>
                <small>{operation.price} {operation.currency || 'EUR'} - {operation.myRole === 'traveler' ? 'Voyageur' : 'Expediteur'}</small>
                <small>{view === 'history' ? operationHistoryLabel(operation) : operationNextAction(operation)}</small>
              </div>
            </div>
            <div className="operation-side">
              <span className="pill pill-saffron">{STATUS_LABELS[operation.operationStatus] || operation.operationStatus}</span>
              <Link to={`/operations/${operation.id}`} className="btn btn-primary btn-sm">Ouvrir</Link>
              <button className="btn btn-ghost btn-sm" onClick={() => message(operation.id)} disabled={busy === operation.id}>
                {busy === operation.id ? <span className="spinner" /> : <Icon name="chat" size={15} />}
                Message
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
    return operation.myRole === 'traveler' ? 'Action : accepter ou refuser la demande' : 'En attente de la confirmation voyageur';
  if (operation.operationStatus === 'paiement_requis')
    return operation.myRole === 'sender' ? 'Action : payer' : 'En attente du paiement';
  if (operation.operationStatus === 'paye') return 'Action : confirmer le rendez-vous';
  if (operation.operationStatus === 'collecte_prevue') return 'Action : confirmer la prise en charge';
  if (operation.operationStatus === 'en_transport') return 'Action : confirmer la livraison';
  if (operation.operationStatus === 'litige') return 'Action : suivre le litige';
  return 'Aucune action requise';
}

function operationHistoryLabel(operation) {
  if (operation.status === 'released') return 'Operation livree et cloturee';
  if (operation.status === 'cancelled') return 'Operation annulee';
  if (operation.status === 'refunded') return 'Operation remboursee';
  return 'Operation archivee';
}

export { STATUS_LABELS };
