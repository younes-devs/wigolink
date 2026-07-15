import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { formatDate } from './TripFeedSimple.jsx';

const STATUS_LABELS = {
  attente_confirmation: 'Attente confirmation',
  paiement_requis: 'Paiement requis',
  paye: 'Payé',
  collecte_prevue: 'Collecte prévue',
  en_transport: 'En transport',
  livraison_prevue: 'Livraison prévue',
  litige: 'Litige',
  termine: 'Terminé',
};

export default function OperationsSimple() {
  const [operations, setOperations] = useState(null);
  useEffect(() => {
    api('/operations').then((data) => setOperations(data.operations)).catch(() => setOperations([]));
  }, []);

  return (
    <div className="simple-page">
      <h1 className="page-title">En cours</h1>
      <p className="page-sub">Toutes les opérations actives après acceptation ou paiement.</p>

      {operations === null && <div className="card"><span className="spinner" /> Chargement...</div>}
      {operations?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="repeat" size={34} />
          <p className="muted">Aucune opération en cours.</p>
          <Link to="/trajets" className="btn btn-primary btn-sm">Trouver un trajet</Link>
        </div>
      )}
      <div className="operation-list">
        {operations?.map((operation) => (
          <article className="card operation-card" key={operation.id}>
            <div className="operation-main">
              <Avatar name={operation.myRole === 'traveler' ? operation.sender?.name : operation.traveler?.name} photo={operation.myRole === 'traveler' ? operation.sender?.photoUrl : operation.traveler?.photoUrl} size={44} />
              <div className="grow">
                <b>{operation.title}</b>
                <span>{operation.trip ? formatDate(operation.trip.departureDate) : new Date(operation.createdAt).toLocaleDateString('fr-FR')}</span>
                <small>{operation.price} {operation.currency || 'EUR'} · {operation.myRole === 'traveler' ? 'Voyageur' : 'Expéditeur'}</small>
              </div>
            </div>
            <div className="operation-side">
              <span className="pill pill-saffron">{STATUS_LABELS[operation.operationStatus] || operation.operationStatus}</span>
              <Link to={`/operations/${operation.id}`} className="btn btn-primary btn-sm">Ouvrir</Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export { STATUS_LABELS };
