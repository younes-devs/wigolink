import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';
import { STATUS_LABELS } from './OperationsSimple.jsx';

export default function OperationDetailSimple() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const [operation, setOperation] = useState(null);
  const [busy, setBusy] = useState('');

  const load = () => api(`/operations/${id}`).then((data) => setOperation(data.operation)).catch(() => setOperation(false));
  useEffect(() => { load(); }, [id]);

  const pay = async () => {
    setBusy('pay');
    try {
      const data = await api(`/operations/${id}/pay`, { method: 'POST' });
      setOperation(data.operation);
      toast.success('Paiement confirmé');
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

  if (operation === null) return <div className="card"><span className="spinner" /> Chargement...</div>;
  if (operation === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>Opération introuvable.</p></div>;

  const other = operation.myRole === 'traveler' ? operation.sender : operation.traveler;

  return (
    <div className="simple-page">
      <Link to="/en-cours" className="link-btn"><Icon name="arrowLeft" size={15} />Retour</Link>
      <section className="card operation-detail">
        <div className="operation-detail-head">
          <div>
            <h1>{operation.title}</h1>
            <p>{operation.trip ? formatDate(operation.trip.departureDate) : 'Date à confirmer'}</p>
          </div>
          <span className="pill pill-saffron">{STATUS_LABELS[operation.operationStatus] || operation.operationStatus}</span>
        </div>

        <div className="operation-person">
          <Avatar name={other?.name || 'Contact'} photo={other?.photoUrl} size={50} />
          <div>
            <b>{other?.name || 'Contact'}</b>
            <span>{operation.myRole === 'traveler' ? 'Expéditeur' : 'Voyageur'}</span>
          </div>
        </div>

        <div className="trip-detail-grid">
          <div><span>Montant</span><b>{operation.price} {operation.currency || 'EUR'}</b></div>
          <div><span>Paiement</span><b>{operation.paymentStatus === 'paid' ? 'Payé' : 'À faire'}</b></div>
          <div><span>Escrow</span><b>{operation.escrow?.state || 'prévu'}</b></div>
        </div>

        {operation.descriptionParcel && (
          <div className="trip-detail-copy">
            <h2>Colis</h2>
            <p>{operation.descriptionParcel}</p>
          </div>
        )}

        <div className="operation-timeline">
          {(operation.events || []).map((event) => (
            <div className="operation-event" key={event.id}>
              <span />
              <div>
                <b>{event.type.replaceAll('_', ' ')}</b>
                <small>{new Date(event.at).toLocaleString('fr-FR')}</small>
              </div>
            </div>
          ))}
        </div>

        <div className="trip-detail-actions">
          {operation.myRole === 'sender' && operation.operationStatus === 'paiement_requis' && (
            <button className="btn btn-primary" onClick={pay} disabled={!!busy}>
              {busy === 'pay' ? <span className="spinner" /> : <Icon name="euro" size={17} />}
              Payer
            </button>
          )}
          <button className="btn btn-ghost" onClick={message} disabled={!!busy}>
            {busy === 'message' ? <span className="spinner" /> : <Icon name="chat" size={17} />}
            Message
          </button>
          <Link to={`/transactions/${operation.id}`} className="btn btn-ghost">
            Options avancées
          </Link>
        </div>
      </section>
    </div>
  );
}
