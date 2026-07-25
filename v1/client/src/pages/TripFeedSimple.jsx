import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';
import { TripTransportIcon, TransportModePicker, transportIconName } from '../TripTransport.jsx';
import { dateLocale, t, useLang } from '../i18n.js';

const tripOverviewCache = new Map();
const TRIP_OVERVIEW_CACHE_MS = 30_000;

export default function TripFeedSimple() {
  useLang();
  const [trips, setTrips] = useState(() => tripOverviewCache.get('')?.trips || null);
  const [myTrips, setMyTrips] = useState(() => tripOverviewCache.get('')?.myTrips || null);
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

  const load = async ({ force = false } = {}) => {
    const params = new URLSearchParams(query);
    const cached = tripOverviewCache.get(query);
    if (cached) {
      setTrips(cached.trips);
      setMyTrips(cached.myTrips);
      if (!force && Date.now() - cached.at < TRIP_OVERVIEW_CACHE_MS) return;
    }
    try {
      const data = await api(`/trips/overview?${params.toString()}`);
      const next = { trips: data.trips, myTrips: data.myTrips, at: Date.now() };
      tripOverviewCache.set(query, next);
      setTrips(next.trips);
      setMyTrips(next.myTrips);
    } catch {
      if (!cached) {
        setTrips([]);
        setMyTrips([]);
      }
    }
  };

  useEffect(() => { load(); }, [query]);

  const toggleSaved = async (trip) => {
    try {
      if (trip.saved) await api(`/saved-trips/${trip.id}`, { method: 'DELETE' });
      else await api(`/saved-trips/${trip.id}`, { method: 'POST' });
      toast.success(trip.saved ? t('trips.toast.unsaved') : t('trips.toast.saved'));
      tripOverviewCache.clear();
      load({ force: true });
    } catch (e) {
      toast.error(e.message);
    }
  };

  return (
    <div className="simple-page">
      <div className="simple-hero">
        <div>
          <h1 className="page-title">{t('trips.title')}</h1>
          <p className="page-sub">{t('trips.subtitle')}</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setPublishing(!publishing)}>
          <Icon name={publishing ? 'x' : 'plus'} size={15} />{publishing ? t('common.close') : t('trips.publish.open')}
        </button>
      </div>

      {publishing && (
        <TripPublishForm onCreated={() => { setPublishing(false); toast.success(t('trips.toast.published')); tripOverviewCache.clear(); load({ force: true }); }} />
      )}

      <section className="trip-search-controls" aria-label={t('trips.search.aria')}>
        <button className="trip-search-row" type="button" onClick={() => { setDraftFilters({ ...filters }); setFiltersOpen(true); }} aria-label={t('trips.search.filter.aria')}>
          <Icon name="search" size={19} />
          <span className={filters.q ? 'trip-search-value' : ''}>{filters.q || t('trips.search.short')}</span>
          {advancedFilterCount(filters) > 0 && <span className="filter-count">{advancedFilterCount(filters)}</span>}
        </button>
      </section>

      <section className="simple-filters trip-desktop-filters">
        <input className="chat-input" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('trips.search.placeholder')} />
        <input className="chat-input" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} placeholder={t('trips.from')} />
        <input className="chat-input" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} placeholder={t('trips.to')} />
        <input className="chat-input" type="date" min={today} value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} aria-label={t('trips.filter.date')} />
        <input className="chat-input" type="number" min="0" value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} placeholder={t('trips.filter.price.short')} />
        <input className="chat-input" type="number" min="0" value={filters.capacityKg} onChange={(e) => setFilters({ ...filters, capacityKg: e.target.value })} placeholder={t('trips.filter.capacity.short')} />
      </section>

      {filtersOpen && createPortal(
        <div className="modal-backdrop trip-filter-backdrop" role="presentation" onClick={() => setFiltersOpen(false)}>
          <section className="modal trip-filter-sheet" role="dialog" aria-modal="true" aria-labelledby="trip-filter-title" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head trip-filter-head">
              <div>
                <h2 id="trip-filter-title">{t('trips.filter.title')}</h2>
                <p>{t('trips.filter.subtitle')}</p>
              </div>
              <button className="icon-btn" type="button" onClick={() => setFiltersOpen(false)} aria-label={t('trips.filter.close')} title={t('common.close')}><Icon name="x" size={18} /></button>
            </div>
            <div className="trip-filter-sheet-body">
              <input className="chat-input" autoFocus value={draftFilters.q} onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { setFilters({ ...draftFilters, q: draftFilters.q.trim() }); setFiltersOpen(false); } }} placeholder={t('trips.search.placeholder')} aria-label={t('trips.search.short')} />
              <input className="chat-input" value={draftFilters.from} onChange={(e) => setDraftFilters({ ...draftFilters, from: e.target.value })} placeholder={t('trips.from')} />
              <input className="chat-input" value={draftFilters.to} onChange={(e) => setDraftFilters({ ...draftFilters, to: e.target.value })} placeholder={t('trips.to')} />
              <input className="chat-input" type="date" min={today} value={draftFilters.date} onChange={(e) => setDraftFilters({ ...draftFilters, date: e.target.value })} aria-label={t('trips.filter.date')} />
              <input className="chat-input" type="number" min="0" inputMode="decimal" value={draftFilters.maxPrice} onChange={(e) => setDraftFilters({ ...draftFilters, maxPrice: e.target.value })} placeholder={t('trips.filter.price')} />
              <input className="chat-input" type="number" min="0" inputMode="decimal" value={draftFilters.capacityKg} onChange={(e) => setDraftFilters({ ...draftFilters, capacityKg: e.target.value })} placeholder={t('trips.filter.capacity')} />
            </div>
            <div className="trip-filter-sheet-actions">
              <button className="btn btn-ghost" type="button" onClick={() => { setFilters(emptyFilters); setDraftFilters(emptyFilters); setFiltersOpen(false); }}>{t('trips.filter.reset')}</button>
              <button className="btn btn-primary" type="button" onClick={() => { setFilters({ ...draftFilters, q: draftFilters.q.trim() }); setFiltersOpen(false); }}>
                {t('trips.filter.show')}{advancedFilterCount(draftFilters) > 0 ? ` (${advancedFilterCount(draftFilters)})` : ''}
              </button>
            </div>
          </section>
        </div>,
        document.body
      )}

      <section className="trip-section">
        <div className="section-head">
          <h2>{t('trips.mine')}</h2>
          {myTrips?.length > 0 && <span>{myTrips.length}</span>}
        </div>
        {myTrips === null && <SkeletonList count={1} />}
        {myTrips?.length === 0 && <p className="muted trip-section-empty">{t('trips.mine.empty')}</p>}
        <div className="trip-post-list">
          {myTrips?.map((trip) => (
            <article className="card trip-post" key={trip.id}>
              <div className="trip-post-route">
                <div><b>{trip.from}</b><span>{t('trips.from')}</span></div>
                <TripTransportIcon mode={trip.transportMode} size={20} />
                <div><b>{trip.to}</b><span>{t('trips.to')}</span></div>
              </div>
              <div className="trip-post-body">
                <Avatar name={trip.traveler?.name || t('trips.traveler')} photo={trip.traveler?.photoUrl} size={42} />
                <div className="grow">
                  <div className="trip-post-title">
                    <b>{t('trips.mine.one')}</b>
                    {trip.activeOperations > 0 && <span className="pill pill-saffron">{t('trips.active', { count: trip.activeOperations })}</span>}
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
                <Link to={`/trajets/${trip.id}`} className="btn btn-primary btn-sm">{t('trips.manage')} <Icon name="arrowRight" size={15} /></Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="trip-section">
        <div className="section-head">
          <h2>{t('trips.others')}</h2>
          {trips?.length > 0 && <span>{trips.length}</span>}
        </div>
      {trips === null && <SkeletonList count={4} />}
      {trips?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="repeat" size={34} />
          <p className="muted">{t('trips.empty')}</p>
        </div>
      )}
      <div className="trip-post-list">
        {trips?.map((trip) => (
          <article className="card trip-post" key={trip.id}>
            <div className="trip-post-route">
              <div>
                <b>{trip.from}</b>
                <span>{t('trips.from')}</span>
              </div>
              <TripTransportIcon mode={trip.transportMode} size={20} />
              <div>
                <b>{trip.to}</b>
                <span>{t('trips.to')}</span>
              </div>
            </div>
            <div className="trip-post-body">
              <Avatar name={trip.traveler?.name || t('trips.traveler')} photo={trip.traveler?.photoUrl} size={42} />
              <div className="grow">
                <div className="trip-post-title">
                  <b title={trip.traveler?.name || t('trips.traveler')}>{trip.traveler?.name || t('trips.traveler')}</b>
                  {trip.traveler?.kycStatus === 'verified' && <span className="pill pill-teal">{t('trips.verified')}</span>}
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
                <Icon name={trip.saved ? 'check' : 'star'} size={15} />{trip.saved ? t('trips.saved') : t('trips.save')}
              </button>
              <Link to={`/trajets/${trip.id}`} className="btn btn-primary btn-sm">
                {t('common.view')} <Icon name="arrowRight" size={15} />
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
  useLang();
  const today = new Date().toISOString().slice(0, 10);
  const toast = useToast();
  const [form, setForm] = useState({
    transportMode: 'plane',
    from: 'Oujda',
    to: 'Bruxelles',
    date: '',
    capacityKg: 6,
    price: 25,
    description: t('trips.publish.description.default'),
    conditions: t('trips.publish.conditions.default'),
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
      <TransportModePicker value={form.transportMode} onChange={(transportMode) => setForm({ ...form, transportMode })} />
      <div className="row trip-publish-route-row">
        <div className="field">
          <label>{t('trips.from')}</label>
          <input value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('trips.to')}</label>
          <input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} />
        </div>
      </div>
      <div className="row trip-publish-details-row">
        <div className="field">
          <label>{t('trips.ticketDate')}</label>
          <input type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('trips.capacityKg')}</label>
          <input type="number" min="1" max="30" value={form.capacityKg} onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('trips.proposedPrice')}</label>
          <input type="number" min="1" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>{t('common.description')}</label>
        <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('trips.conditions')}</label>
        <textarea rows={2} value={form.conditions} onChange={(e) => setForm({ ...form, conditions: e.target.value })} />
      </div>
      <button className="btn btn-primary" disabled={busy || !form.from || !form.to || !form.date}>
        {busy ? <span className="spinner" /> : <Icon name={transportIconName(form.transportMode)} size={17} />}
        {t('trips.publish.submit')}
      </button>
    </form>
  );
}

export function formatDate(value) {
  if (!value) return t('trips.date.pending');
  return new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
