import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { Stars } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';
import { STATUS_LABELS } from './OperationsSimple.jsx';

export default function OperationDetailSimple() {
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
        body: { reason: issue || 'Demande refusee par le voyageur' },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info('Demande refusée');
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
        body: { reason: issue || 'Demande annulee par l expediteur' },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info('Demande annulee');
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
        body: { reason: issue || 'Problème signalé depuis En cours' },
      });
      setOperation(data.operation);
      setIssue('');
      toast.info('Problème signalé');
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
      toast.success('Avis enregistré');
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
      toast.success('Preuve ajoutee');
    } catch (e) {
      toast.error(e.message);
    } finally {
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
          <div><span>Paiement</span><b>{paymentLabel(operation)}</b></div>
          <div><span>Escrow</span><b>{escrowLabel(operation.escrow?.state)}</b></div>
        </div>

        {operation.operationStatus === 'attente_confirmation' && (
          <div className="alert alert-warn">
            <Icon name="clock" size={17} />
            <span>
              {operation.myRole === 'traveler'
                ? 'L’expéditeur attend votre accord avant de payer.'
                : 'Le voyageur doit confirmer avant le paiement.'}
            </span>
          </div>
        )}

        {operation.descriptionParcel && (
          <div className="trip-detail-copy">
            <h2>Colis</h2>
            <p>{operation.descriptionParcel}</p>
          </div>
        )}

        <div className="operation-checklist">
          <h2><Icon name="check" size={17} />Checklist</h2>
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
          {nextAction(operation) && (
            <button className="btn btn-primary" onClick={confirmNext} disabled={!!busy}>
              {busy === 'confirm' ? <span className="spinner" /> : <Icon name="check" size={17} />}
              {nextAction(operation)}
            </button>
          )}
          {operation.myRole === 'traveler' && operation.operationStatus === 'attente_confirmation' && (
            <button className="btn btn-ghost" onClick={reject} disabled={!!busy}>
              {busy === 'reject' ? <span className="spinner" /> : <Icon name="x" size={17} />}
              Refuser
            </button>
          )}
          {operation.myRole === 'sender' && ['attente_confirmation', 'paiement_requis'].includes(operation.operationStatus) && (
            <button className="btn btn-ghost" onClick={cancel} disabled={!!busy}>
              {busy === 'cancel' ? <span className="spinner" /> : <Icon name="x" size={17} />}
              Annuler
            </button>
          )}
          <button className="btn btn-ghost" onClick={message} disabled={!!busy}>
            {busy === 'message' ? <span className="spinner" /> : <Icon name="chat" size={17} />}
            Message
          </button>
        </div>

        {!['litige', 'termine'].includes(operation.operationStatus) && (
          <div className="operation-issue">
            <label className="field">
              <span>Problème</span>
              <textarea rows={2} value={issue} onChange={(e) => setIssue(e.target.value)} placeholder="Expliquez rapidement le problème si vous devez ouvrir un litige." />
            </label>
            <button className="btn btn-ghost" onClick={openDispute} disabled={!!busy}>
              {busy === 'dispute' ? <span className="spinner" /> : <Icon name="alert" size={17} />}
              Signaler un problème
            </button>
          </div>
        )}

        {operation.operationStatus === 'litige' && (
          <div className="operation-evidence">
            <h2><Icon name="alert" size={17} />Preuves</h2>
            {operation.dispute?.evidence?.length ? (
              <div className="evidence-list">
                {operation.dispute.evidence.map((evidence, index) => (
                  <div className="evidence-item" key={`${evidence.at}-${index}`}>
                    <p>{evidence.text || 'Photo ajoutee'}</p>
                    <span className="evidence-time">{new Date(evidence.at).toLocaleString('fr-FR')}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Aucune preuve ajoutee pour le moment.</p>
            )}
            <label className="field">
              <span>Ajouter une preuve</span>
              <textarea rows={2} value={evidenceText} onChange={(e) => setEvidenceText(e.target.value)} placeholder="Ajoutez un fait, une reference ou une explication utile au support." />
            </label>
            <button className="btn btn-primary btn-sm" onClick={submitEvidence} disabled={!!busy || !evidenceText.trim()}>
              {busy === 'evidence' ? <span className="spinner" /> : <Icon name="check" size={15} />}
              Ajouter
            </button>
          </div>
        )}

        {operation.status === 'released' && (
          <div className="operation-rating">
            <h2><Icon name="star" size={17} />Noter {other?.name || 'ce membre'}</h2>
            {alreadyRated(operation, user?.id, other?.id) ? (
              <span className="pill pill-teal"><Icon name="check" size={13} />Avis envoyé</span>
            ) : (
              <>
                <Stars value={rating} onChange={setRating} />
                {rating > 0 && (
                  <>
                    <textarea rows={2} value={review} onChange={(e) => setReview(e.target.value)} maxLength={400} placeholder="Commentaire public optionnel" />
                    <button className="btn btn-primary btn-sm" onClick={submitRating} disabled={busy === 'rating'}>
                      {busy === 'rating' ? <span className="spinner" /> : <Icon name="star" size={15} />}
                      Envoyer l’avis
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
    { label: 'Demande creee', done: reached.request },
    { label: 'Accord du voyageur', done: reached.traveler },
    { label: 'Paiement securise', done: reached.payment },
    { label: 'Colis pris en charge', done: reached.pickup },
    { label: 'Livraison confirmee', done: reached.delivery },
  ];
}

function nextAction(operation) {
  if (operation.operationStatus === 'attente_confirmation' && operation.myRole === 'traveler') return 'Accepter la demande';
  if (operation.operationStatus === 'paye') return 'Confirmer le rendez-vous';
  if (operation.operationStatus === 'collecte_prevue') return 'Confirmer la prise en charge';
  if (operation.operationStatus === 'en_transport') return 'Confirmer la livraison';
  return null;
}

function confirmToast(status) {
  if (status === 'paiement_requis') return 'Demande acceptée';
  if (status === 'collecte_prevue') return 'Rendez-vous confirmé';
  if (status === 'en_transport') return 'Colis en transport';
  if (status === 'termine') return 'Opération terminée';
  return 'Opération mise à jour';
}

function paymentLabel(operation) {
  if (operation.paymentStatus === 'paid') return 'Payé';
  if (operation.paymentStatus === 'cancelled') return 'Annulé';
  if (operation.operationStatus === 'attente_confirmation') return 'En attente';
  return 'À faire';
}

function escrowLabel(state) {
  const labels = {
    pending: 'Prévu',
    held: 'Sécurisé',
    frozen: 'Gelé',
    released: 'Libéré',
    refunded: 'Remboursé',
  };
  return labels[state] || 'Prévu';
}
