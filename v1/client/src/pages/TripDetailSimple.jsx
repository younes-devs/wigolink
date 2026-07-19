import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { ConfirmDialog } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { t, useLang } from '../i18n.js';
import { formatDate } from './TripFeedSimple.jsx';

export default function TripDetailSimple() {
  useLang();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [trip, setTrip] = useState(null);
  const [parcel, setParcel] = useState('');
  const [shipmentType, setShipmentType] = useState('parcel');
  const [weightKg, setWeightKg] = useState('');
  const [documentCount, setDocumentCount] = useState('1');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const reviewRef = useRef(null);
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = () => api(`/trips/${id}`).then((data) => setTrip(data.trip)).catch(() => setTrip(false));
  useEffect(() => { load(); }, [id]);
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
      toast.success(trip.saved ? t('trips.toast.unsaved') : t('trips.toast.saved'));
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
        body: {
          descriptionParcel: parcel,
          shipmentType,
          weightKg: shipmentType === 'parcel' ? weightKg : undefined,
          documentCount: shipmentType === 'document' ? documentCount : undefined,
        },
      });
      toast.success(t('trips.toast.operationCreated'));
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
      toast.success(t('trips.toast.updated'));
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
      toast.success(t('trips.toast.removed'));
      nav('/trajets');
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy('');
    }
  };

  if (trip === null) return <div className="card"><span className="spinner" /> {t('common.loading')}</div>;
  if (trip === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>{t('trips.notFound')}</p></div>;
  const isOwner = user?.id === trip.traveler?.id;
  const hasActiveOperations = Number(trip.activeOperations || 0) > 0;
  const quantity = shipmentType === 'document' ? Number(documentCount) : Number(weightKg);
  const calculatedPrice = shipmentType === 'document'
    ? (Number.isInteger(quantity) && quantity > 0 ? quantity * 3 : 0)
    : (Number.isFinite(quantity) && quantity > 0
      ? Math.round((Number(trip.price || 0) / Math.max(1, Number(trip.capacityKg || 1))) * quantity * 100) / 100
      : 0);
  const requestIsValid = parcel.trim().length > 0 && (shipmentType === 'document'
    ? Number.isInteger(quantity) && quantity >= 1 && quantity <= 20
    : Number.isFinite(quantity) && quantity > 0 && quantity <= Number(trip.capacityKg));
  const shipmentLabel = shipmentType === 'document'
    ? t(quantity > 1 ? 'trips.request.documents' : 'trips.request.document', { count: documentCount })
    : t('trips.request.weight', { weight: weightKg });

  return (
    <div className="simple-page">
      <Link to="/trajets" className="link-btn"><Icon name="arrowLeft" size={15} />{t('trips.back')}</Link>
      <section className="card trip-detail-card">
        <div className="trip-detail-route">
          <div><span>{t('trips.from')}</span><b>{trip.from}</b></div>
          <Icon name="plane" size={24} />
          <div><span>{t('trips.to')}</span><b>{trip.to}</b></div>
        </div>

        <div className="trip-detail-main">
          <Avatar name={trip.traveler?.name || t('trips.traveler')} photo={trip.traveler?.photoUrl} size={56} />
          <div className="grow">
            <h1>{isOwner ? t('trips.mine.one') : trip.traveler?.name || t('trips.traveler')}</h1>
            <div className="trip-post-meta">
              {trip.traveler?.kycStatus === 'verified' && <span className="pill pill-teal">{t('badge.verified')}</span>}
              <span><Icon name="star" size={14} filled />{trip.traveler?.rating || t('trips.new')}</span>
              <span>{t('trips.operations', { count: trip.traveler?.completed || 0 })}</span>
            </div>
          </div>
        </div>

        <div className="trip-detail-grid">
          <div><span>{t('trips.ticketDate')}</span><b>{formatDate(trip.departureDate)}</b></div>
          <div><span>{t('trips.proposedPrice')}</span><b>{trip.price} {trip.currency}</b></div>
          <div><span>{t('trips.capacity')}</span><b>{trip.capacityKg} kg</b></div>
        </div>

        <div className="trip-trust-strip">
          <span><Icon name="shieldCheck" size={16} />{t('trips.trust.payment')}</span>
          <span><Icon name="check" size={16} />{t('trips.trust.verified')}</span>
          <span><Icon name="chat" size={16} />{t('trips.trust.chat')}</span>
        </div>

        <div className="trip-detail-copy">
          <h2>{t('common.description')}</h2>
          <p>{trip.description}</p>
          <h2>{t('trips.conditions')}</h2>
          <p>{trip.conditions}</p>
        </div>

        {isOwner && (
          <section className="trip-owner-tools">
            <div className="section-head"><h2>{t('trips.owner.title')}</h2></div>
            {hasActiveOperations ? (
              <div className="trip-owner-notice">
                <Icon name="alert" size={17} />
                <span>{t('trips.owner.locked')}</span>
                <Link to="/en-cours" className="btn btn-ghost btn-sm">{t('trips.owner.viewOperations')}</Link>
              </div>
            ) : editing ? (
              <form className="trip-owner-form" onSubmit={updateOwnTrip}>
                <div className="row trip-owner-route-row">
                  <label className="field"><span>{t('trips.from')}</span><input value={editForm?.from || ''} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} /></label>
                  <label className="field"><span>{t('trips.to')}</span><input value={editForm?.to || ''} onChange={(e) => setEditForm({ ...editForm, to: e.target.value })} /></label>
                </div>
                <div className="row trip-owner-details-row">
                  <label className="field"><span>{t('common.date')}</span><input type="date" value={editForm?.date || ''} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} /></label>
                  <label className="field"><span>{t('trips.capacityKg')}</span><input type="number" min="1" max="30" value={editForm?.capacityKg || ''} onChange={(e) => setEditForm({ ...editForm, capacityKg: e.target.value })} /></label>
                  <label className="field"><span>{t('trips.priceEur')}</span><input type="number" min="1" value={editForm?.price || ''} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} /></label>
                </div>
                <label className="field"><span>{t('common.description')}</span><textarea rows={3} value={editForm?.description || ''} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} /></label>
                <label className="field"><span>{t('trips.conditions')}</span><textarea rows={2} value={editForm?.conditions || ''} onChange={(e) => setEditForm({ ...editForm, conditions: e.target.value })} /></label>
                <div className="trip-detail-actions"><button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>{t('common.cancel')}</button><button className="btn btn-primary" disabled={!!busy}>{busy === 'edit' ? <span className="spinner" /> : <Icon name="check" size={17} />}{t('common.save')}</button></div>
              </form>
            ) : (
              <div className="trip-detail-actions">
                <button className="btn btn-ghost" onClick={() => setEditing(true)}><Icon name="pencil" size={17} />{t('common.edit')}</button>
                <button className="btn btn-danger-ghost" onClick={() => setConfirmRemove(true)} disabled={!!busy}><Icon name="trash" size={17} />{t('trips.remove')}</button>
              </div>
            )}
          </section>
        )}

        {!isOwner && <>
        <section className="trip-request-form" aria-label={t('trips.request.shipment')}>
          <div className="request-kind-switch" role="group" aria-label={t('trips.request.type')}>
            <button type="button" className={shipmentType === 'parcel' ? 'active' : ''} onClick={() => setShipmentType('parcel')}><Icon name="package" size={17} />{t('trips.request.parcel')}</button>
            <button type="button" className={shipmentType === 'document' ? 'active' : ''} onClick={() => setShipmentType('document')}><Icon name="fileText" size={17} />{t('trips.request.documentType')}</button>
          </div>

          {shipmentType === 'parcel' ? (
            <label className="field">
              <span>{t('trips.request.parcelWeight')}</span>
              <div className="price-input">
                <input type="number" min="0.1" max={trip.capacityKg} step="0.1" inputMode="decimal" value={weightKg} onChange={(e) => setWeightKg(e.target.value)} placeholder={t('trips.request.maximum', { value: trip.capacityKg })} />
                <b>kg</b>
              </div>
              <small>{t('trips.request.weightHint')}</small>
            </label>
          ) : (
            <label className="field">
              <span>{t('trips.request.documentCount')}</span>
              <div className="price-input">
                <input type="number" min="1" max="20" step="1" inputMode="numeric" value={documentCount} onChange={(e) => setDocumentCount(e.target.value)} />
                <b>{t('trips.request.docs')}</b>
              </div>
              <small>{t('trips.request.documentHint')}</small>
            </label>
          )}

          <label className="field">
            <span>{t('trips.request.contents')}</span>
            <textarea value={parcel} onChange={(e) => setParcel(e.target.value)} rows={3} placeholder={t(shipmentType === 'document' ? 'trips.request.documentPlaceholder' : 'trips.request.parcelPlaceholder')} />
          </label>

          <div className="request-price-preview"><span>{t('trips.request.calculatedPrice')}</span><b>{calculatedPrice.toFixed(2)} {trip.currency || 'EUR'}</b></div>
        </section>

        <div className="trip-detail-actions">
          <button className="btn btn-ghost" onClick={saveTrip} disabled={!!busy}>
            {busy === 'save' ? <span className="spinner" /> : <Icon name={trip.saved ? 'check' : 'star'} size={17} />}
            {trip.saved ? t('trips.saved') : t('trips.save')}
          </button>
          <button className="btn btn-ghost" onClick={message} disabled={!!busy}>
            {busy === 'message' ? <span className="spinner" /> : <Icon name="chat" size={17} />}
            {t('messages.title')}
          </button>
          <button className="btn btn-primary" onClick={() => setReviewOpen(true)} disabled={!!busy || !requestIsValid}>
            {busy === 'accept' ? <span className="spinner" /> : <Icon name="check" size={17} />}
            {t('trips.request.make')}
          </button>
        </div>

        {reviewOpen && (
          <section className="trip-request-review" ref={reviewRef} aria-label={t('trips.request.review')}>
            <div className="trip-request-review-head">
              <div><span>{t('trips.request.before')}</span><h2>{t('trips.request.review')}</h2></div>
              <button type="button" className="icon-btn" onClick={() => setReviewOpen(false)} aria-label={t('common.close')}><Icon name="x" size={17} /></button>
            </div>
            <div className="trip-request-summary">
              <div><span>{t('trips.trip')}</span><b>{trip.from} <Icon name="arrowRight" size={14} /> {trip.to}</b></div>
              <div><span>{t('trips.request.shipment')}</span><b>{shipmentLabel}</b></div>
              <div><span>{t('trips.request.calculatedPrice')}</span><b>{calculatedPrice.toFixed(2)} {trip.currency || 'EUR'}</b></div>
              <div><span>{t('common.description')}</span><b>{parcel}</b></div>
            </div>
            <label className="request-confirmation"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>{t('trips.request.confirm')}</span></label>
            <div className="trip-detail-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setReviewOpen(false)}>{t('common.edit')}</button>
              <button type="button" className="btn btn-primary" onClick={accept} disabled={!confirmed || !!busy}>{busy === 'accept' ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t('trips.request.send')}</button>
            </div>
          </section>
        )}
        </>}
      </section>
      {confirmRemove && <ConfirmDialog title={t('trips.remove.title')} message={t('trips.remove.message')} confirmLabel={t('trips.remove')} danger onConfirm={removeOwnTrip} onClose={() => setConfirmRemove(false)} />}
    </div>
  );
}
