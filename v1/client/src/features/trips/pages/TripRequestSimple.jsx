import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { TripTransportIcon } from '../components/TripTransport.jsx';
import { t, useLang } from '../../../i18n.js';
import { prepareParcelPhoto, uploadParcelPhotos } from '../services/parcelPhotos.js';

const DOCUMENT_PRICE_EUR = 3;

export default function TripRequestSimple() {
  useLang();
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const toast = useToast();
  const [trip, setTrip] = useState(null);
  const [step, setStep] = useState('type');
  const [shipmentType, setShipmentType] = useState('');
  const [weightKg, setWeightKg] = useState('');
  const [documentCount, setDocumentCount] = useState('1');
  const [description, setDescription] = useState('');
  const [parcelPhotos, setParcelPhotos] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const photoInputRef = useRef(null);
  const parcelPhotosRef = useRef([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/trips/${id}`).then(({ trip: loadedTrip }) => setTrip(loadedTrip)).catch(() => setTrip(false));
  }, [id]);

  useEffect(() => { parcelPhotosRef.current = parcelPhotos; }, [parcelPhotos]);
  useEffect(() => () => {
    parcelPhotosRef.current.forEach((photo) => URL.revokeObjectURL(photo.url));
  }, []);

  const quantity = shipmentType === 'document' ? Number(documentCount) : Number(weightKg);
  const calculatedPrice = useMemo(() => {
    if (!trip) return 0;
    if (shipmentType === 'document') return Number.isInteger(quantity) && quantity > 0 ? quantity * DOCUMENT_PRICE_EUR : 0;
    if (!Number.isFinite(quantity) || quantity <= 0) return 0;
    return Math.round((Number(trip.price || 0) / Math.max(1, Number(trip.capacityKg || 1))) * quantity * 100) / 100;
  }, [shipmentType, quantity, trip]);
  const isValid = description.trim().length > 0 && (shipmentType === 'document'
    ? Number.isInteger(quantity) && quantity >= 1 && quantity <= 20
    : Number.isFinite(quantity) && quantity > 0 && quantity <= Number(trip?.capacityKg));
  const shipmentLabel = shipmentType === 'document'
    ? t(quantity > 1 ? 'trips.request.documents' : 'trips.request.document', { count: documentCount })
    : t('trips.request.weight', { weight: weightKg });

  const chooseType = (type) => {
    if (type === 'document') {
      parcelPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));
      setParcelPhotos([]);
    }
    setShipmentType(type);
    setConfirmed(false);
    setStep('details');
  };

  const addPhotos = async (event) => {
    const files = [...(event.target.files || [])].slice(0, 5 - parcelPhotos.length);
    event.target.value = '';
    if (!files.length) return;
    setPhotoBusy(true);
    try {
      const blobs = await Promise.all(files.map(prepareParcelPhoto));
      setParcelPhotos((current) => [
        ...current,
        ...blobs.map((blob) => ({
          id: crypto.randomUUID(),
          blob,
          url: URL.createObjectURL(blob),
        })),
      ].slice(0, 5));
    } catch {
      toast.error(t('trips.request.photos.error'));
    } finally {
      setPhotoBusy(false);
    }
  };

  const removePhoto = (photoId) => {
    setParcelPhotos((current) => {
      const removed = current.find((photo) => photo.id === photoId);
      if (removed) URL.revokeObjectURL(removed.url);
      return current.filter((photo) => photo.id !== photoId);
    });
  };

  const submit = async () => {
    setBusy(true);
    try {
      const parcelPhotoUploadId = shipmentType === 'parcel'
        ? await uploadParcelPhotos(parcelPhotos)
        : undefined;
      const data = await api(`/trips/${trip.id}/accept`, {
        method: 'POST',
        body: {
          descriptionParcel: description.trim(),
          shipmentType,
          weightKg: shipmentType === 'parcel' ? weightKg : undefined,
          documentCount: shipmentType === 'document' ? documentCount : undefined,
          parcelPhotoUploadId,
        },
      });
      toast.success(t('trips.toast.operationCreated'));
      nav(`/operations/${data.operation.id}`);
    } catch (error) {
      toast.error(error.message);
      if (error.data?.needsKyc) nav('/verification');
    } finally {
      setBusy(false);
    }
  };

  if (trip === null) return <div className="card"><span className="spinner" /> {t('common.loading')}</div>;
  if (trip === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>{t('trips.notFound')}</p></div>;
  if (user?.id === trip.traveler?.id) return <div className="card center empty-state"><p>{t('trips.mine.one')}</p><Link to={`/trajets/${trip.id}`} className="btn btn-primary">{t('common.back')}</Link></div>;

  return (
    <div className="simple-page trip-request-page">
      <button type="button" className="link-btn back-btn" onClick={() => nav(`/trajets/${trip.id}`)}><Icon name="arrowLeft" size={15} />{t('common.back')}</button>
      <header className="trip-request-intro">
        <span>{trip.from} <TripTransportIcon mode={trip.transportMode} size={16} /> {trip.to}</span>
        <h1>{t('trips.request.make')}</h1>
      </header>

      {step === 'type' && (
        <section className="trip-request-flow card" aria-labelledby="request-type-title">
          <div className="trip-request-flow-head">
            <span>1</span>
            <div><h2 id="request-type-title">{t('trips.request.type')}</h2><p>{t('trips.request.shipment')}</p></div>
          </div>
          <div className="shipment-choice-grid">
            <button type="button" className="shipment-choice" onClick={() => chooseType('parcel')}>
              <span className="shipment-choice-icon"><Icon name="package" size={25} /></span>
              <span><b>{t('trips.request.parcel')}</b><small>{t('trips.request.weightHint')}</small></span>
              <Icon name="arrowRight" size={18} />
            </button>
            <button type="button" className="shipment-choice" onClick={() => chooseType('document')}>
              <span className="shipment-choice-icon"><Icon name="fileText" size={25} /></span>
              <span><b>{t('trips.request.documentType')}</b><small>{t('trips.request.documentHint')}</small></span>
              <Icon name="arrowRight" size={18} />
            </button>
          </div>
        </section>
      )}

      {step === 'details' && (
        <section className="trip-request-flow card" aria-labelledby="request-details-title">
          <div className="trip-request-flow-head">
            <span>2</span>
            <div><h2 id="request-details-title">{t('trips.request.shipment')}</h2><p>{t('trips.request.type')}: {shipmentType === 'document' ? t('trips.request.documentType') : t('trips.request.parcel')}</p></div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('type')}>{t('common.edit')}</button>
          </div>

          {shipmentType === 'parcel' ? (
            <label className="field">
              <span>{t('trips.request.parcelWeight')}</span>
              <div className="price-input">
                <input autoFocus type="number" min="0.1" max={trip.capacityKg} step="0.1" inputMode="decimal" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} placeholder={t('trips.request.maximum', { value: trip.capacityKg })} />
                <b>kg</b>
              </div>
              <small>{t('trips.request.weightHint')}</small>
            </label>
          ) : (
            <label className="field">
              <span>{t('trips.request.documentCount')}</span>
              <div className="price-input">
                <input autoFocus type="number" min="1" max="20" step="1" inputMode="numeric" value={documentCount} onChange={(event) => setDocumentCount(event.target.value)} />
                <b>{t('trips.request.docs')}</b>
              </div>
              <small>{t('trips.request.documentHint')}</small>
            </label>
          )}

          <label className="field">
            <span>{t('trips.request.contents')}</span>
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder={t(shipmentType === 'document' ? 'trips.request.documentPlaceholder' : 'trips.request.parcelPlaceholder')} />
          </label>

          <div className="request-price-preview" aria-live="polite"><span>{t('trips.request.calculatedPrice')}</span><b>{calculatedPrice.toFixed(2)} {trip.currency || 'EUR'}</b></div>
          <button type="button" className="btn btn-primary trip-request-next" disabled={!isValid} onClick={() => setStep(shipmentType === 'parcel' ? 'photos' : 'review')}><Icon name="arrowRight" size={17} />{t('common.continue')}</button>
        </section>
      )}

      {step === 'photos' && shipmentType === 'parcel' && (
        <section className="trip-request-flow card" aria-labelledby="request-photos-title">
          <div className="trip-request-flow-head">
            <span>3</span>
            <div><h2 id="request-photos-title">{t('trips.request.photos.title')}</h2><p>{t('trips.request.photos.help')}</p></div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setStep('details')}>{t('common.edit')}</button>
          </div>
          <input ref={photoInputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addPhotos} />
          <div className="parcel-photo-grid">
            {parcelPhotos.map((photo, index) => (
              <figure className="parcel-photo-preview" key={photo.id}>
                <img src={photo.url} alt={t('trips.request.photos.alt', { number: index + 1 })} />
                <button type="button" className="icon-btn" onClick={() => removePhoto(photo.id)} aria-label={t('common.remove')}><Icon name="trash" size={16} /></button>
              </figure>
            ))}
            {parcelPhotos.length < 5 && (
              <button type="button" className="parcel-photo-add" onClick={() => photoInputRef.current?.click()} disabled={photoBusy}>
                {photoBusy ? <span className="spinner" /> : <Icon name="camera" size={23} />}
                <span>{t('trips.request.photos.add')}</span>
              </button>
            )}
          </div>
          <p className="parcel-photo-count">{t('trips.request.photos.count', { count: parcelPhotos.length })}</p>
          <p className="parcel-photo-retention"><Icon name="shieldCheck" size={15} />{t('trips.request.photos.retention')}</p>
          <button type="button" className="btn btn-primary trip-request-next" disabled={parcelPhotos.length < 1 || photoBusy} onClick={() => setStep('review')}><Icon name="arrowRight" size={17} />{t('common.continue')}</button>
        </section>
      )}

      {step === 'review' && (
        <section className="trip-request-review trip-request-flow" aria-labelledby="request-review-title">
          <div className="trip-request-flow-head">
            <span>{shipmentType === 'parcel' ? 4 : 3}</span>
            <div><p>{t('trips.request.before')}</p><h2 id="request-review-title">{t('trips.request.review')}</h2></div>
          </div>
          <div className="trip-request-summary">
            <div><span>{t('trips.trip')}</span><b>{trip.from} <TripTransportIcon mode={trip.transportMode} size={14} /> {trip.to}</b></div>
            <div><span>{t('trips.request.shipment')}</span><b>{shipmentLabel}</b></div>
            <div><span>{t('trips.request.calculatedPrice')}</span><b>{calculatedPrice.toFixed(2)} {trip.currency || 'EUR'}</b></div>
            <div><span>{t('common.description')}</span><b>{description}</b></div>
          </div>
          {shipmentType === 'parcel' && <div className="parcel-photo-review" aria-label={t('trips.request.photos.title')}>{parcelPhotos.map((photo, index) => <img key={photo.id} src={photo.url} alt={t('trips.request.photos.alt', { number: index + 1 })} />)}</div>}
          <label className="request-confirmation"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>{t('trips.request.confirm')}</span></label>
          <div className="trip-detail-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setStep(shipmentType === 'parcel' ? 'photos' : 'details')}>{t('common.edit')}</button>
            <button type="button" className="btn btn-primary" onClick={submit} disabled={!confirmed || busy}>{busy ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t('trips.request.send')}</button>
          </div>
        </section>
      )}
    </div>
  );
}
