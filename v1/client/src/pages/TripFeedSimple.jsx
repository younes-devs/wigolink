import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

export default function TripFeedSimple() {
  const [trips, setTrips] = useState(null);
  const [myTrips, setMyTrips] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const emptyFilters = { q: '', from: '', to: '', date: '', maxPrice: '', capacityKg: '' };
  const [filters, setFilters] = useState(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [publishing, setPublishing] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!filtersOpen) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setFiltersOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [filtersOpen]);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [filters]);

  const load = () => {
    const params = new URLSearchParams(query);
    params.set('excludeMine', '1');
    return Promise.all([api(`/trips?${params.toString()}`), api('/trips/mine')])
      .then(([feed, mine]) => {
        setTrips(feed.trips);
        setMyTrips(mine.trips);
      })
      .catch(() => {
        setTrips([]);
        setMyTrips([]);
      });
  };

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

      <section className="trip-search-controls" aria-label="Recherche de trajets">
        <button className="trip-search-row" type="button" onClick={() => { setDraftFilters({ ...filters }); setFiltersOpen(true); }} aria-label="Rechercher et filtrer les trajets">
          <Icon name="search" size={19} />
          <span className={filters.q ? 'trip-search-value' : ''}>{filters.q || 'Rechercher un trajet'}</span>
          {advancedFilterCount(filters) > 0 && <span className="filter-count">{advancedFilterCount(filters)}</span>}
        </button>
      </section>

      <section className="simple-filters trip-desktop-filters">
        <input className="chat-input" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Rechercher ville, voyageur, description" />
        <input className="chat-input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} placeholder="Départ" />
        <input className="chat-input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} placeholder="Arrivée" />
        <input className="chat-input" type="date" min={today} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} aria-label="Date minimum" />
        <input className="chat-input" type="number" min="0" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} placeholder="Prix max" />
        <input className="chat-input" type="number" min="0" value={filters.capacityKg} onChange={(e) => setFilters({ ...filters, capacityKg: e.target.value })} placeholder="Kg min" />
      </section>

      {filtersOpen && createPortal(
        <div className="modal-backdrop trip-filter-backdrop" role="presentation" onClick={() => setFiltersOpen(false)}>
          <section className="modal trip-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="trip-filter-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head trip-filter-head">
              <div>
                <h2 id="trip-filter-title">Filtrer les trajets</h2>
                <p>Affinez les voyageurs qui correspondent a votre envoi.</p>
              </div>
              <button className="icon-btn" type="button" onClick={() => setFiltersOpen(false)} aria-label="Fermer les filtres" title="Fermer"><Icon name="x" size={18} /></button>
            </div>
            <div className="trip-filter-sheet-body">
              <input className="chat-input" autoFocus value={draftFilters.q} onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { setFilters({ ...draftFilters, q: draftFilters.q.trim() }); setFiltersOpen(false); } }} placeholder="Rechercher ville, voyageur, description" aria-label="Rechercher un trajet" />
              <input className="chat-input" value={draftFilters.from} onChange={(e) => setDraftFilters({ ...draftFilters, from: e.target.value })} placeholder="Depart" />
              <input className="chat-input" value={draftFilters.to} onChange={(e) => setDraftFilters({ ...draftFilters, to: e.target.value })} placeholder="Arrivee" />
              <input className="chat-input" type="date" min={today} value={draftFilters.date} onChange={(e) => setDraftFilters({ ...draftFilters, date: e.target.value })} aria-label="Date minimale" />
              <input className="chat-input" type="number" min="0" inputMode="decimal" value={draftFilters.maxPrice} onChange={(e) => setDraftFilters({ ...draftFilters, maxPrice: e.target.value })} placeholder="Prix maximum (EUR)" />
              <input className="chat-input" type="number" min="0" inputMode="decimal" value={draftFilters.capacityKg} onChange={(e) => setDraftFilters({ ...draftFilters, capacityKg: e.target.value })} placeholder="Capacite minimum (kg)" />
            </div>
            <div className="trip-filter-sheet-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setFilters(emptyFilters); setDraftFilters(emptyFilters); setFiltersOpen(false); }}>Reinitialiser</button>
              <button className="btn btn-primary" type="button" onClick={() => { setFilters({ ...draftFilters, q: draftFilters.q.trim() }); setFiltersOpen(false); }}>
                Voir les trajets{advancedFilterCount(draftFilters) > 0 ? ` (${advancedFilterCount(draftFilters)})` : ''}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      <section className="trip-section">
        <div className="section-head">
          <h2>Mes trajets</h2>
          {myTrips?.length > 0 && <span>{myTrips.length}</span>}
        </div>
        {myTrips === null && <SkeletonList count={1} />}
        {myTrips?.length === 0 && <p className="muted trip-section-empty">Vous n'avez pas encore publie de trajet.</p>}
        <div className="trip-post-list">
          {myTrips?.map((trip) => (
            <article className="card trip-post" key={trip.id}>
              <div className="trip-post-route">
                <div><b>{trip.from}</b><span>Depart</span></div>
                <Icon name="plane" size={20} />
                <div><b>{trip.to}</b><span>Arrivee</span></div>
              </div>
              <div className="trip-post-body">
                <Avatar name={trip.traveler?.name || 'Voyageur'} photo={trip.traveler?.photoUrl} size={42} />
                <div className="grow">
                  <div className="trip-post-title">
                    <b>Mon trajet</b>
                    {trip.activeOperations > 0 && <span className="pill pill-saffron">{trip.activeOperations} en cours</span>}
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
                <Link to={`/trajets/${trip.id}`} className="btn btn-primary btn-sm">Gerer <Icon name="arrowRight" size={15} /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="trip-section">
        <div className="section-head">
          <h2>Trajets des autres</h2>
          {trips?.length > 0 && <span>{trips.length}</span>}
        </div>
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
                  <b title={trip.traveler?.name || 'Voyageur'}>{trip.traveler?.name || 'Voyageur'}</b>
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
      </section>
    </div>
  );
}

function advancedFilterCount(filters) {
  return ['from', 'to', 'date', 'maxPrice', 'capacityKg'].filter((key) => !!filters[key]).length;
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
