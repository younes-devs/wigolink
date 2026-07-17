import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { ConfirmDialog } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';

export default function TripDetailSimple() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [trip, setTrip] = useState(null);
  const [parcel, setParcel] = useState('');
  const [proposedPrice, setProposedPrice] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const reviewRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = () => api(`/trips/${id}`).then((data) => setTrip(data.trip)).catch(() => setTrip(false));
  useEffect(() => { load(); }, [id]);
  useEffect(() => { if (trip?.price) setProposedPrice(String(trip.price)); }, [trip?.price]);
  useEffect(() => {
    if (!trip) return;
    setEditForm({ from: trip.from, to: trip.to, date: trip.departureDate, capacityKg: trip.capacityKg, price: trip.price, description: trip.description, conditions: trip.conditions });
  }, [trip]);
  useEffect(() => { if (reviewOpen) requestAnimationFrame(() => reviewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })); }, [reviewOpen]);

  const saveTrip = async () => {
    setBusy('save');
    try {
      if (trip.saved) await api(`/saved-trips/${trip.id}`, { method: 'DELETE' });
      else await api(`/saved-trips/${trip.id}`, { method: 'POST' });
      toast.success(trip.saved ? 'Trajet retiré' : 'Trajet enregistré');
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const message = async () => {
    setBusy('message');
    try {
      const data = await api('/conversations', { method: 'POST', body: { tripId: trip.id } });
      nav(`/messages/${data.conversation.id}`);
    } catch (e) {
      toast.error(e.message);
      setBusy('');
    }
  };

  const accept = async () => {
    setBusy('accept');
    try {
      const data = await api(`/trips/${trip.id}/accept`, {
        method: 'POST',
        body: { descriptionParcel: parcel, price: proposedPrice || trip.price },
      });
      toast.success('Opération créée');
      nav(`/operations/${data.operation.id}`);
    } catch (e) {
      toast.error(e.message);
      if (e.data?.needsKyc) nav('/verification');
      setBusy('');
    }
  };

  const updateOwnTrip = async (event) => {
    event.preventDefault();
    setBusy('edit');
    try {
      await api(`/trips/${trip.id}`, { method: 'PATCH', body: editForm });
      toast.success('Trajet modifie');
      setEditing(false);
      load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  const removeOwnTrip = async () => {
    setBusy('remove');
    try {
      await api(`/trips/${trip.id}`, { method: 'DELETE' });
      toast.success('Trajet retire');
      nav('/trajets');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  if (trip === null) return <div className="card"><span className="spinner" /> Chargement...</div>;
  if (trip === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>Trajet introuvable.</p></div>;
  const isOwner = user?.id === trip.traveler?.id;
  const hasActiveOperations = Number(trip.activeOperations || 0) > 0;

  return (
    <div className="simple-page">
      <Link to="/trajets" className="link-btn"><Icon name="arrowLeft" size={15} />Retour aux trajets</Link>
      <section className="card trip-detail-card">
        <div className="trip-detail-route">
          <div><span>Départ</span><b>{trip.from}</b></div>
          <Icon name="plane" size={24} />
          <div><span>Arrivée</span><b>{trip.to}</b></div>
        </div>

        <div className="trip-detail-main">
          <Avatar name={trip.traveler?.name || 'Voyageur'} photo={trip.traveler?.photoUrl} size={56} />
          <div className="grow">
            <h1>{isOwner ? 'Mon trajet' : trip.traveler?.name || 'Voyageur'}</h1>
            <div className="trip-post-meta">
              {trip.traveler?.kycStatus === 'verified' && <span className="pill pill-teal">Identité vérifiée</span>}
              <span><Icon name="star" size={14} filled />{trip.traveler?.rating || 'Nouveau'}</span>
              <span>{trip.traveler?.completed || 0} opérations</span>
            </div>
          </div>
        </div>

        <div className="trip-detail-grid">
          <div><span>Date billet</span><b>{formatDate(trip.departureDate)}</b></div>
          <div><span>Prix proposé</span><b>{trip.price} {trip.currency}</b></div>
          <div><span>Capacité</span><b>{trip.capacityKg} kg</b></div>
        </div>

        <div className="trip-trust-strip">
          <span><Icon name="shieldCheck" size={16} />Paiement protege</span>
          <span><Icon name="check" size={16} />Voyageur verifie</span>
          <span><Icon name="chat" size={16} />Echanges dans Wigofly</span>
        </div>

        <div className="trip-detail-copy">
          <h2>Description</h2>
          <p>{trip.description}</p>
          <h2>Conditions</h2>
          <p>{trip.conditions}</p>
        </div>

        {isOwner && (
          <section className="trip-owner-tools">
            <div className="section-head"><h2>Gerer ce trajet</h2></div>
            {hasActiveOperations ? (
              <div className="trip-owner-notice">
                <Icon name="alert" size={17} />
                <span>Ce trajet ne peut plus etre modifie ou retire tant qu'une operation est en cours.</span>
                <Link to="/en-cours" className="btn btn-ghost btn-sm">Voir les operations</Link>
              </div>
            ) : editing ? (
              <form className="trip-owner-form" onSubmit={updateOwnTrip}>
                <div className="row">
                  <label className="field"><span>Depart</span><input value={editForm?.from || ''} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} /></label>
                  <label className="field"><span>Arrivee</span><input value={editForm?.to || ''} onChange={(e) => setEditForm({ ...editForm, to: e.target.value })} /></label>
                </div>
                <div className="row">
                  <label className="field"><span>Date</span><input type="date" value={editForm?.date || ''} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} /></label>
                  <label className="field"><span>Capacite (kg)</span><input type="number" min="1" max="30" value={editForm?.capacityKg || ''} onChange={(e) => setEditForm({ ...editForm, capacityKg: e.target.value })} /></label>
                  <label className="field"><span>Prix (EUR)</span><input type="number" min="1" value={editForm?.price || ''} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></label>
                </div>
                <label className="field"><span>Description</span><textarea rows={3} value={editForm?.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
                <label className="field"><span>Conditions</span><textarea rows={2} value={editForm?.conditions || ''} onChange={(e) => setEditForm({ ...editForm, conditions: e.target.value })} /></label>
                <div className="trip-detail-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>Annuler</button><button className="btn btn-primary" disabled={!!busy}>{busy === 'edit' ? <span className="spinner" /> : <Icon name="check" size={17} />}Enregistrer</button></div>
              </form>
            ) : (
              <div className="trip-detail-actions">
                <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="pencil" size={17} />Modifier</button>
                <button className="btn btn-danger-ghost" onClick={() => setConfirmRemove(true)} disabled={!!busy}><Icon name="trash" size={17} />Retirer</button>
              </div>
            )}
          </section>
        )}

        {!isOwner && <>
        <label className="field">
          <span>Ce que vous voulez envoyer</span>
          <textarea value={parcel} onChange={(e) => setParcel(e.target.value)} rows={3} placeholder="Ex: petit colis propre, 2 kg, contenu conforme..." />
        </label>

        <label className="field">
          <span>Votre proposition de prix</span>
          <div className="price-input">
            <input type="number" min="1" value={proposedPrice} onChange={(e) => setProposedPrice(e.target.value)} />
            <b>{trip.currency || 'EUR'}</b>
          </div>
          <small>Le voyageur devra accepter la demande avant tout paiement.</small>
        </label>

        <div className="trip-detail-actions">
          <button className="btn btn-ghost" onClick={saveTrip} disabled={!!busy}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name={trip.saved ? 'check' : 'star'} size={17} />}
            {trip.saved ? 'Enregistré' : 'Enregistrer'}
          </button>
          <button className="btn btn-ghost" onClick={message} disabled={!!busy}>
            {busy === 'message' ? <span className="spinner" /> : <Icon name="chat" size={17} />}
            Message
          </button>
          <button className="btn btn-primary" onClick={() => setReviewOpen(true)} disabled={!!busy || !parcel.trim() || !proposedPrice}>
            {busy === 'accept' ? <span className="spinner" /> : <Icon name="check" size={17} />}
            Faire une demande
          </button>
        </div>

        {reviewOpen && (
          <section className="trip-request-review" ref={reviewRef} aria-label="Verifier la demande">
            <div className="trip-request-review-head">
              <div><span>Avant de continuer</span><h2>Verifier votre demande</h2></div>
              <button type="button" className="icon-btn" onClick={() => setReviewOpen(false)} aria-label="Fermer"><Icon name="x" size={17} /></button>
            </div>
            <div className="trip-request-summary">
              <div><span>Trajet</span><b>{trip.from} <Icon name="arrowRight" size={14} /> {trip.to}</b></div>
              <div><span>Prix propose</span><b>{proposedPrice} {trip.currency || 'EUR'}</b></div>
              <div><span>Votre colis</span><b>{parcel}</b></div>
            </div>
            <label className="request-confirmation"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>Mon colis est conforme et je reglerai uniquement via Wigofly.</span></label>
            <div className="trip-detail-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setReviewOpen(false)}>Modifier</button>
              <button type="button" className="btn btn-primary" onClick={accept} disabled={!confirmed || !!busy}>{busy === 'accept' ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}Envoyer la demande</button>
            </div>
          </section>
        )}
        </>}
      </section>
      {confirmRemove && <ConfirmDialog title="Retirer ce trajet ?" message="Il ne sera plus visible par les autres utilisateurs." confirmLabel="Retirer" danger onConfirm={removeOwnTrip} onClose={() => setConfirmRemove(false)} />}
    </div>
  );
}
