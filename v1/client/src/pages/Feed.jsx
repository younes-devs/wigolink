import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { KycRequiredNotice, TrustBadge } from '../components.jsx';
import { CategoryIcon, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';
import { t, useLang, dateLocale } from '../i18n.js';

const EMPTY_FILTERS = { category: '', minPrice: '', maxPrice: '', q: '' };

export default function Feed() {
  useLang();
  const [data, setData] = useState(null);
  const [trips, setTrips] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const [addingTrip, setAddingTrip] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [rules, setRules] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (showAll) params.set('all', '1');
    if (filters.category) params.set('category', filters.category);
    if (filters.minPrice) params.set('minPrice', filters.minPrice);
    if (filters.maxPrice) params.set('maxPrice', filters.maxPrice);
    if (filters.q) params.set('q', filters.q);
    api(`/listings?${params}`).then(setData).catch(() => setData({ listings: [] }));
    api('/trips/mine').then((d) => setTrips(d.trips)).catch(() => setTrips([]));
  }, [showAll, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/rules').then(setRules).catch(() => {}); }, []);

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  const toast = useToast();

  const removeTrip = async (id) => {
    await api(`/trips/${id}`, { method: 'DELETE' });
    load();
    toast.info(t('feed.trip.removed'));
  };

  const listings = data?.listings;
  const futureTrips = (trips || []).filter((t) => t.date >= new Date().toISOString().slice(0, 10));

  return (
    <div>
      <h1 className="page-title">{t('feed.title')}</h1>
      <p className="page-sub">
        {data?.filteredByTrip
          ? t('feed.sub.filtered', { n: listings?.length ?? '…', total: data.totalOpen })
          : t('feed.sub.unfiltered')}
      </p>

      {/* Trajets déclarés (PRD §2.1) — la clé du matching */}
      <div className="card trip-card">
        <div className="list-row">
          <Icon name="plane" size={18} />
          <b className="grow">{t('feed.mytrips')}</b>
          <button className="btn btn-ghost btn-sm" onClick={() => setAddingTrip(!addingTrip)}>
            {addingTrip ? t('feed.declare.close') : t('feed.declare')}
          </button>
        </div>
        {futureTrips.length > 0 && (
          <div className="trip-chips">
            {futureTrips.map((trip) => (
              <span key={trip.id} className="trip-chip">
                {trip.from} → {trip.to} · {new Date(trip.date).toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' })} · {trip.capacityKg} kg
                <button onClick={() => removeTrip(trip.id)} aria-label={t('common.remove')}><Icon name="x" size={12} /></button>
              </span>
            ))}
          </div>
        )}
        {futureTrips.length === 0 && !addingTrip && (
          <p className="muted" style={{ fontSize: 12.5, marginTop: 8 }}>
            {t('feed.notrips')}
          </p>
        )}
        {addingTrip && <TripForm onSaved={() => { setAddingTrip(false); load(); toast.success(t('feed.trip.added')); }} />}
      </div>

      {data?.filteredByTrip !== undefined && futureTrips.length > 0 && (
        <label className="feed-toggle">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {t('feed.showall')}
        </label>
      )}

      <div className="list-row mb">
        <input className="chat-input grow" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })}
          placeholder={t('feed.search.ph')} />
        <button className="btn btn-ghost btn-sm" style={{ flex: '0 0 auto', position: 'relative' }} onClick={() => setFiltersOpen(!filtersOpen)}>
          <Icon name="fileText" size={15} />{t('feed.filters')}
          {activeFilterCount > 0 && <span className="filter-count">{activeFilterCount}</span>}
        </button>
      </div>

      {filtersOpen && (
        <div className="card">
          <div className="row">
            <div className="field">
              <label>{t('feed.filters.cat')}</label>
              <select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}>
                <option value="">{t('feed.filters.all')}</option>
                {rules?.whitelist.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>{t('feed.filters.min')}</label>
              <input type="number" min={0} value={filters.minPrice} onChange={(e) => setFilters({ ...filters, minPrice: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('feed.filters.max')}</label>
              <input type="number" min={0} value={filters.maxPrice} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value })} />
            </div>
          </div>
          {activeFilterCount > 0 && (
            <button className="link-btn" onClick={() => setFilters(EMPTY_FILTERS)}>{t('feed.filters.reset')}</button>
          )}
        </div>
      )}

      {/* Chips de catégories (PRD UI/UX U11) : filtrer en 1 tap */}
      {rules?.whitelist?.length > 0 && (
        <div className="cat-chips">
          <button className={`cat-chip ${!filters.category ? 'active' : ''}`}
            onClick={() => setFilters({ ...filters, category: '' })}>{t('feed.filters.all')}</button>
          {rules.whitelist.map((c) => (
            <button key={c.id} className={`cat-chip ${filters.category === c.id ? 'active' : ''}`}
              onClick={() => setFilters({ ...filters, category: filters.category === c.id ? '' : c.id })}>
              {c.label}
            </button>
          ))}
        </div>
      )}

      {listings === undefined && <SkeletonList count={3} avatar={false} />}
      {listings?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="moon" size={36} />
          <p className="muted">
            {data?.filteredByTrip ? t('feed.empty.trip') : t('feed.empty.all')}
          </p>
          {/* État vide actionnable (PRD UI/UX U12) : proposer le geste qui le résout. */}
          {activeFilterCount > 0 ? (
            <button className="btn btn-primary btn-sm" onClick={() => setFilters(EMPTY_FILTERS)}>{t('feed.filters.reset')}</button>
          ) : data?.filteredByTrip && !showAll ? (
            <button className="btn btn-primary btn-sm" onClick={() => setShowAll(true)}>{t('feed.empty.showall')}</button>
          ) : futureTrips.length === 0 ? (
            <button className="btn btn-primary btn-sm" onClick={() => setAddingTrip(true)}>{t('feed.empty.declare')}</button>
          ) : (
            <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm">{t('feed.empty.publish')}</button></Link>
          )}
        </div>
      )}

      <div className="card-grid">
      {listings?.map((l) => (
        <Link key={l.id} to={`/annonce/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card clickable listing-card">
            {l.photos?.length > 0
              ? <div className="listing-photo"><img src={l.photos[0]} alt={l.title} loading="lazy" /></div>
              : <div className="listing-photo listing-photo-empty"><CategoryIcon categoryId={l.categoryId} /></div>}
            <div className="list-row" style={{ alignItems: 'flex-start' }}>
              <div className="grow">
                <div style={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.2px' }}>
                  {l.matched && <span className="pill pill-teal" style={{ marginInlineEnd: 6, verticalAlign: 'middle' }}>{t('feed.match')}</span>}
                  {l.title}
                </div>
                <div className="muted">{l.from} → {l.to} · {l.weightKg} kg · {t('feed.value')} {l.valueEur} €</div>
                <div style={{ marginTop: 7 }}>
                  <TrustBadge user={l.sender} />
                </div>
              </div>
              <div className="center price">
                +{l.travelerPay} €
                <small>{t('feed.foryou')}</small>
              </div>
            </div>
          </div>
        </Link>
      ))}
      </div>
    </div>
  );
}

function TripForm({ onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ from: 'Casablanca', to: 'Bruxelles', date: '', capacityKg: 8 });
  const [err, setErr] = useState('');
  const [needsKyc, setNeedsKyc] = useState(false);

  const save = async () => {
    setErr(''); setNeedsKyc(false);
    try {
      await api('/trips', { method: 'POST', body: form });
      onSaved();
    } catch (e) {
      if (e.data?.needsKyc) setNeedsKyc(true);
      else setErr(e.message);
    }
  };

  return (
    <div className="mt">
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
      {needsKyc && <KycRequiredNotice />}
      <div className="row">
        <div className="field">
          <label>{t('trip.direction')}</label>
          <select value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value, to: e.target.value === 'Casablanca' ? 'Bruxelles' : 'Casablanca' })}>
            <option value="Casablanca">Casablanca → Bruxelles</option>
            <option value="Bruxelles">Bruxelles → Casablanca</option>
          </select>
        </div>
        <div className="field">
          <label>{t('trip.flightdate')}</label>
          <input type="date" min={today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        </div>
        <div className="field" style={{ maxWidth: 110 }}>
          <label>{t('trip.kgavail')}</label>
          <input type="number" min={1} max={30} value={form.capacityKg}
            onChange={(e) => setForm({ ...form, capacityKg: e.target.value })} />
        </div>
      </div>
      <button className="btn btn-primary btn-sm" onClick={save} disabled={!form.date}>{t('trip.save')}</button>
    </div>
  );
}
