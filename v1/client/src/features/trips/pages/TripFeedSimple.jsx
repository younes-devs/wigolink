import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { Avatar, Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { useToast } from '../../../Toast.jsx';
import { TripTransportIcon } from '../components/TripTransport.jsx';
import { LocationInput } from '../components/LocationInput.jsx';
import { dateLocale, t, useLang } from '../../../i18n.js';

const tripOverviewCache = new Map();
const TRIP_OVERVIEW_CACHE_MS = 30_000;
const TRIP_SESSION_PREFIX = 'wigofly:trips:';

function readTripCache(query) {
  const memory = tripOverviewCache.get(query);
  if (memory) return memory;
  try {
    const stored = JSON.parse(sessionStorage.getItem(`${TRIP_SESSION_PREFIX}${query}`));
    if (stored) tripOverviewCache.set(query, stored);
    return stored;
  } catch {
    return null;
  }
}

function writeTripCache(query, value) {
  tripOverviewCache.set(query, value);
  try {
    sessionStorage.setItem(`${TRIP_SESSION_PREFIX}${query}`, JSON.stringify(value));
  } catch {
    // The in-memory cache remains available when browser storage is full.
  }
}

export default function TripFeedSimple() {
  useLang();
  const [trips, setTrips] = useState(() => readTripCache('')?.trips || null);
  const [myTrips, setMyTrips] = useState(() => readTripCache('')?.myTrips || null);
  const [pages, setPages] = useState(() => readTripCache('')?.pages || {});
  const [loadingMore, setLoadingMore] = useState('');
  const today = new Date().toISOString().slice(0, 10);
  const emptyFilters = { q: '', from: '', to: '', date: '', maxPrice: '', capacityKg: '' };
  const [filters, setFilters] = useState(emptyFilters);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState(emptyFilters);
  const [mobileTab, setMobileTab] = useState('others');
  const toast = useToast();
  const requestRef = useRef(0);
  const deferredFilters = useDeferredValue(filters);

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
    for (const [key, value] of Object.entries(deferredFilters)) {
      if (value) params.set(key, value);
    }
    return params.toString();
  }, [deferredFilters]);

  const load = async ({ force = false } = {}) => {
    const params = new URLSearchParams(query);
    const requestId = ++requestRef.current;
    const cached = readTripCache(query);
    if (cached) {
      setTrips(cached.trips);
      setMyTrips(cached.myTrips);
      setPages(cached.pages || {});
      if (!force && Date.now() - cached.at < TRIP_OVERVIEW_CACHE_MS) return;
    }
    try {
      const data = await api(`/trips/overview?${params.toString()}`);
      if (requestId !== requestRef.current) return;
      const next = {
        trips: data.trips,
        myTrips: data.myTrips,
        pages: data.pages || {},
        at: Date.now(),
      };
      writeTripCache(query, next);
      setTrips(next.trips);
      setMyTrips(next.myTrips);
      setPages(next.pages);
    } catch {
      if (!cached) {
        setTrips([]);
        setMyTrips([]);
      }
    }
  };

  useEffect(() => { load(); }, [query]);

  const loadMore = async (kind) => {
    const page = pages[kind];
    if (!page?.hasMore || loadingMore) return;
    setLoadingMore(kind);
    try {
      const params = new URLSearchParams(query);
      if (page.nextCursor) params.set('cursor', page.nextCursor);
      else params.set('offset', String(page.nextOffset));
      params.set('limit', String(page.limit));
      if (kind === 'trips') params.set('excludeMine', '1');
      const endpoint = kind === 'myTrips' ? '/trips/mine' : '/trips';
      const data = await api(`${endpoint}?${params.toString()}`);
      const setItems = kind === 'myTrips' ? setMyTrips : setTrips;
      const nextPage = data.page || {};
      setItems((current) => {
        const merged = mergeById(current || [], data.trips || []);
        const cached = readTripCache(query) || {};
        writeTripCache(query, {
          ...cached,
          [kind]: merged,
          pages: { ...(cached.pages || pages), [kind]: nextPage },
          at: Date.now(),
        });
        return merged;
      });
      setPages((current) => ({ ...current, [kind]: nextPage }));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoadingMore('');
    }
  };

  const toggleSaved = async (trip) => {
    try {
      if (trip.saved) await api(`/saved-trips/${trip.id}`, { method: 'DELETE' });
      else await api(`/saved-trips/${trip.id}`, { method: 'POST' });
      toast.success(trip.saved ? t('trips.toast.unsaved') : t('trips.toast.saved'));
      tripOverviewCache.clear();
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (key?.startsWith(TRIP_SESSION_PREFIX)) sessionStorage.removeItem(key);
      }
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
        <Link className="btn btn-primary btn-sm" to="/trajets/nouveau">
          <Icon name="plus" size={15} />{t('trips.publish.open')}
        </Link>
      </div>

      <section className="trip-search-controls" aria-label={t('trips.search.aria')}>
        <button className="trip-search-row" type="button" onClick={() => { setDraftFilters({ ...filters }); setFiltersOpen(true); }} aria-label={t('trips.search.filter.aria')}>
          <Icon name="search" size={19} />
          <span className={filters.q ? 'trip-search-value' : ''}>{filters.q || t('trips.search.short')}</span>
          {advancedFilterCount(filters) > 0 && <span className="filter-count">{advancedFilterCount(filters)}</span>}
        </button>
        <Link
          className="trip-mobile-publish"
          to="/trajets/nouveau"
          aria-label={t('trips.publish.open')}
          title={t('trips.publish.open')}
        >
          <Icon name="plus" size={21} />
        </Link>
      </section>

      <section className="simple-filters trip-desktop-filters">
        <input className="chat-input" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('trips.search.placeholder')} />
        <LocationInput inputClassName="chat-input" value={filters.from} onChange={({ value }) => setFilters({ ...filters, from: value })} placeholder={t('trips.from')} />
        <LocationInput inputClassName="chat-input" value={filters.to} onChange={({ value }) => setFilters({ ...filters, to: value })} placeholder={t('trips.to')} />
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
              <input className="chat-input" value={draftFilters.q} onChange={(e) => setDraftFilters({ ...draftFilters, q: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { setFilters({ ...draftFilters, q: draftFilters.q.trim() }); setFiltersOpen(false); } }} placeholder={t('trips.search.placeholder')} aria-label={t('trips.search.short')} />
              <LocationInput inputClassName="chat-input" value={draftFilters.from} onChange={({ value }) => setDraftFilters({ ...draftFilters, from: value })} placeholder={t('trips.from')} />
              <LocationInput inputClassName="chat-input" value={draftFilters.to} onChange={({ value }) => setDraftFilters({ ...draftFilters, to: value })} placeholder={t('trips.to')} />
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

      <div className="trip-mobile-tabs" role="tablist" aria-label={t('trips.mobile.tabs.aria')}>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'others'}
          aria-controls="available-trips-panel"
          className={mobileTab === 'others' ? 'active' : ''}
          onClick={() => setMobileTab('others')}
        >
          {t('trips.available')}
          {trips?.length > 0 && <span>{trips.length}</span>}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mobileTab === 'mine'}
          aria-controls="my-trips-panel"
          className={mobileTab === 'mine' ? 'active' : ''}
          onClick={() => setMobileTab('mine')}
        >
          {t('trips.mine')}
          {myTrips?.length > 0 && <span>{myTrips.length}</span>}
        </button>
      </div>

      <section
        id="my-trips-panel"
        className={`trip-section trip-section-mine${mobileTab !== 'mine' ? ' mobile-tab-hidden' : ''}`}
      >
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
        {pages.myTrips?.hasMore && (
          <div className="center">
            <button className="btn btn-ghost btn-sm" type="button" disabled={!!loadingMore} onClick={() => loadMore('myTrips')}>
              {loadingMore === 'myTrips' ? t('common.loading') : t('common.loadMore')}
            </button>
          </div>
        )}
      </section>

      <section
        id="available-trips-panel"
        className={`trip-section trip-section-available${mobileTab !== 'others' ? ' mobile-tab-hidden' : ''}`}
      >
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
      {pages.trips?.hasMore && (
        <div className="center">
          <button className="btn btn-ghost btn-sm" type="button" disabled={!!loadingMore} onClick={() => loadMore('trips')}>
            {loadingMore === 'trips' ? t('common.loading') : t('common.loadMore')}
          </button>
        </div>
      )}
      </section>
    </div>
  );
}

function mergeById(current, incoming) {
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...incoming.filter((item) => !seen.has(item.id))];
}

function advancedFilterCount(filters) {
  return ['from', 'to', 'date', 'maxPrice', 'capacityKg'].filter((key) => !!filters[key]).length;
}

export function formatDate(value) {
  if (!value) return t('trips.date.pending');
  return new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
