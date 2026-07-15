import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

export default function TripFeedSimple() {
  const [trips, setTrips] = useState(null);
  const [filters, setFilters] = useState({ q: '', from: '', to: '', maxPrice: '', capacityKg: '' });
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [filters]);

  const load = () => api(`/trips${query ? `?${query}` : ''}`)
    .then((data) => setTrips(data.trips))
    .catch(() => setTrips([]));

  useEffect(() => { load(); }, [query]);

  const toggleSaved = async (trip) => {
    try {
      if (trip.saved) await api(`/saved-trips/${trip.id}`, { method: 'DELETE' });
      else await api(`/saved-trips/${trip.id}`, { method: 'POST' });
      toast.success(trip.saved ? 'Trajet retiré' : 'Trajet enregistré');
      load();
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="simple-page">
      <div className="simple-hero">
        <div>
          <h1 className="page-title">Trajets</h1>
          <p className="page-sub">Trouvez un voyageur, discutez, puis acceptez le trajet qui vous convient.</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setPublishing(!publishing)}>
          <Icon name={publishing ? 'x' : 'plus'} size={15} />{publishing ? 'Fermer' : 'Publier mon trajet'}
        </button>
      </div>

      {publishing && (
        <TripPublishForm onCreated={() => { setPublishing(false); toast.success('Trajet publié'); load(); }} />
      )}

      <section className="simple-filters">
        <input className="chat-input" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Rechercher ville, voyageur, description" />
        <input className="chat-input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} placeholder="Départ" />
        <input className="chat-input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} placeholder="Arrivée" />
        <input className="chat-input" type="number" min="0" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} placeholder="Prix max" />
        <input className="chat-input" type="number" min="0" value={filters.capacityKg} onChange={(e) => setFilters({ ...filters, capacityKg: e.target.value })} placeholder="Kg min" />
      </section>

      {trips === null && <SkeletonList count={4} />}
      {trips?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="plane" size={34} />
          <p className="muted">Aucun trajet disponible avec ces filtres.</p>
        </div>
      )}
      <div className="trip-post-list">
        {trips?.map((trip) => (
          <article className="card trip-post" key={trip.id}>
            <div className="trip-post-route">
              <div>
                <b>{trip.from}</b>
                <span>Départ</span>
              </div>
              <Icon name="plane" size={20} />
              <div>
                <b>{trip.to}</b>
                <span>Arrivée</span>
              </div>
            </div>
            <div className="trip-post-body">
              <Avatar name={trip.traveler?.name || 'Voyageur'} photo={trip.traveler?.photoUrl} size={42} />
              <div className="grow">
                <div className="trip-post-title">
                  <b>{trip.traveler?.name || 'Voyageur'}</b>
                  {trip.traveler?.kycStatus === 'verified' && <span className="pill pill-teal">Vérifié</span>}
                </div>
                <p>{trip.description}</p>
                <div className="trip-post-meta">
                  <span><Icon name="clock" size={14} />{formatDate(trip.departureDate)}</span>
                  <span><Icon name="luggage" size={14} />{trip.capacityKg} kg</span>
                  <span><Icon name="euro" size={14} />{trip.price} {trip.currency}</span>
                </div>
              </div>
            </div>
            <div className="trip-post-actions">
              <button className="btn btn-ghost btn-sm" onClick={() => toggleSaved(trip)}>
                <Icon name={trip.saved ? 'check' : 'star'} size={15} />{trip.saved ? 'Enregistré' : 'Enregistrer'}
              </button>
              <Link to={`/trajets/${trip.id}`} className="btn btn-primary btn-sm">
                Voir <Icon name="arrowRight" size={15} />
              </Link>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TripPublishForm({ onCreated }) {
  const today = new Date().toISOString().slice(0, 10);
  const toast = useToast();
  const [form, setForm] = useState({
    from: 'Oujda',
    to: 'Bruxelles',
    date: '',
    capacityKg: 6,
    price: 25,
    description: 'Je pars avec une valise soute, je peux prendre un petit colis propre.',
    conditions: 'Colis propre, fermé, conforme et pas trop fragile.',
  });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/trips', { method: 'POST', body: form });
      onCreated();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card trip-publish-form" onSubmit={submit}>
      <div className="row">
        <div className="field">
          <label>Départ</label>
          <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </div>
        <div className="field">
          <label>Arrivée</label>
          <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </div>
      </div>
      <div className="row">
        <div className="field">
          <label>Date du billet</label>
          <input type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="field">
          <label>Capacité kg</label>
          <input type="number" min="1" max="30" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} />
        </div>
        <div className="field">
          <label>Prix proposé</label>
          <input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>Description</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="field">
        <label>Conditions</label>
        <textarea rows={2} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
      </div>
      <button className="btn btn-primary" disabled={busy || !form.from || !form.to || !form.date}>
        {busy ? <span className="spinner" /> : <Icon name="plane" size={17} />}
        Publier le trajet
      </button>
    </form>
  );
}

export function formatDate(value) {
  if (!value) return 'Date à confirmer';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
