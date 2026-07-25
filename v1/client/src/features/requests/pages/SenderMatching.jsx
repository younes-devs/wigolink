import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { TrustBadge } from '../../../components.jsx';
import { SkeletonList } from '../../../shared/ui/Skeleton.jsx';
import { useToast } from '../../../shared/ui/Toast.jsx';
import { TripTransportIcon } from '../../trips/components/TripTransport.jsx';
import { t, useLang, getLang } from '../../../i18n.js';

const dateFmt = () => new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { day: 'numeric', month: 'short' });

export default function SenderMatching() {
  useLang();
  const toast = useToast();
  const [data, setData] = useState(null);
  const [busyOffer, setBusyOffer] = useState('');
  const [offerDurations, setOfferDurations] = useState({});

  const load = () => {
    api('/sender-matching').then((d) => setData(d.matching));
  };

  useEffect(() => {
    load();
  }, []);

  const propose = async (listing, candidate) => {
    setBusyOffer(`${listing.id}:${candidate.trip.id}`);
    try {
      await api('/matching-offers', {
        method: 'POST',
        body: {
          listingId: listing.id,
          tripId: candidate.trip.id,
          offeredPay: listing.travelerPay,
          expiresInHours: Number(offerDurations[`${listing.id}:${candidate.trip.id}`] || 72),
          message: t('matching.offer.default', { title: listing.title }),
        },
      });
      toast.success(t('matching.offer.sent'));
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyOffer('');
    }
  };

  const decideOffer = async (offer, decision) => {
    setBusyOffer(`${offer.id}:${decision}`);
    try {
      const d = await api(`/matching-offers/${offer.id}/${decision}`, { method: 'POST' });
      toast.success(decision === 'accept' ? t('matching.offer.accepted') : decision === 'withdraw' ? t('offers.toast.withdrawn') : t('matching.offer.declined'));
      if (d.transaction) window.location.href = `/transactions/${d.transaction.id}`;
      else load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusyOffer('');
    }
  };

  return (
    <div className="matching-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('matching.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('matching.sub')}</p>
        </div>
        <Link to="/envois/nouveau" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('ship.new')}</Link>
      </div>

      {!data && <SkeletonList count={3} />}
      {data && (
        <>
          <section className="matching-metrics">
            <Metric icon="package" label={t('matching.metric.listings')} value={data.totals.listings} />
            <Metric icon="check" label={t('matching.metric.matched')} value={data.totals.matched} />
            <Metric icon="user" label={t('matching.metric.candidates')} value={data.totals.candidates} />
            <Metric icon="clock" label={t('matching.metric.review')} value={data.totals.pendingReview} danger={data.totals.pendingReview > 0} />
          </section>

          {data.actions.length > 0 && (
            <section className="matching-actions">
              <div className="section-head">
                <h2>{t('matching.actions.title')}</h2>
                <span>{data.actions.length}</span>
              </div>
              <div className="matching-action-list">
                {data.actions.map((a) => (
                  <Link to={a.action.href} key={a.id} className={`matching-action ${a.action.priority}`}>
                    <Icon name={a.action.id === 'contact_ready' ? 'user' : 'clock'} size={17} />
                    <div className="grow">
                      <b>{t(`matching.action.${a.action.id}`)}</b>
                      <span>{a.title} - {t('matching.candidates.count', { n: a.candidateCount })}</span>
                    </div>
                    <Icon name="arrowRight" size={15} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {data.items.length === 0 && (
            <div className="card center empty-state">
              <Icon name="package" size={36} />
              <p className="muted">{t('matching.empty')}</p>
              <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('ship.new')}</button></Link>
            </div>
          )}

          <div className="matching-board">
            {data.items.map((item) => (
              <ListingMatches
                key={item.listing.id}
                item={item}
                onPropose={propose}
                onDecide={decideOffer}
                busyOffer={busyOffer}
                offerDurations={offerDurations}
                setOfferDurations={setOfferDurations}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value, danger = false }) {
  return (
    <div className={`matching-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function ListingMatches({ item, onPropose, onDecide, busyOffer, offerDurations, setOfferDurations }) {
  const listing = item.listing;
  return (
    <article className={`matching-card ${item.candidateCount ? 'has-match' : ''}`}>
      <div className="matching-card-head">
        <CategoryIcon categoryId={listing.categoryId} />
        <div className="grow">
          <b>{listing.title}</b>
          <span>{listing.from} {'->'} {listing.to} - {listing.weightKg} kg - {listing.travelerPay} EUR</span>
        </div>
        <span className={`pill ${item.candidateCount ? 'pill-teal' : 'pill-gray'}`}>
          {t('matching.candidates.count', { n: item.candidateCount })}
        </span>
      </div>
      {item.candidates.length === 0 ? (
        <div className="matching-empty">
          <Icon name={item.action.id === 'wait_review' ? 'clock' : 'alert'} size={17} />
          <span>{t(`matching.action.${item.action.id}`)}</span>
          <Link to={item.action.href} className="btn btn-ghost btn-sm">{t('matching.open')}</Link>
        </div>
      ) : (
        <div className="matching-candidates">
          {item.candidates.map((c) => (
            <div className="matching-candidate" key={c.trip.id}>
              <div className="matching-candidate-main">
                <TripTransportIcon mode={c.trip.transportMode} size={17} />
                <div className="grow">
                  <b>{c.traveler?.name || t('matching.traveler')}</b>
                  <span>{dateFmt().format(new Date(c.trip.date))} - {c.trip.capacityKg} kg - {t('matching.fit', { n: c.capacityFit })}</span>
                </div>
                {c.traveler && <TrustBadge user={c.traveler} />}
              </div>
              {c.offer && <OfferMeta offer={c.offer} />}
              <div className="matching-candidate-actions">
                {c.offer?.status === 'pending_traveler' ? (
                  <>
                    <button className="btn btn-ghost btn-sm" disabled><Icon name="check" size={15} />{t('matching.offer.pending')}</button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => onDecide(c.offer, 'withdraw')} disabled={!!busyOffer}>
                      {busyOffer === `${c.offer.id}:withdraw` ? <span className="spinner" /> : <Icon name="x" size={15} />}
                      {t('offers.withdraw')}
                    </button>
                  </>
                ) : c.offer?.status === 'countered_sender' ? (
                  <>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => onDecide(c.offer, 'decline')} disabled={!!busyOffer}>
                      {busyOffer === `${c.offer.id}:decline` ? <span className="spinner" /> : <Icon name="x" size={15} />}
                      {t('matching.offer.decline')}
                    </button>
                    <button className="btn btn-teal btn-sm" onClick={() => onDecide(c.offer, 'accept')} disabled={!!busyOffer}>
                      {busyOffer === `${c.offer.id}:accept` ? <span className="spinner" /> : <Icon name="check" size={15} />}
                      {t('matching.offer.acceptCounter')}
                    </button>
                  </>
                ) : c.offer?.status === 'accepted' ? (
                  <Link to={`/transactions/${c.offer.txId}`} className="btn btn-teal btn-sm"><Icon name="arrowRight" size={15} />{t('matching.offer.accepted')}</Link>
                ) : (
                  <>
                    <label className="offer-ttl">
                      <Icon name="clock" size={14} />
                      <select
                        value={offerDurations[`${listing.id}:${c.trip.id}`] || 72}
                        onChange={(e) => setOfferDurations({ ...offerDurations, [`${listing.id}:${c.trip.id}`]: e.target.value })}
                      >
                        <option value={24}>{t('matching.offer.ttl.24')}</option>
                        <option value={72}>{t('matching.offer.ttl.72')}</option>
                        <option value={168}>{t('matching.offer.ttl.168')}</option>
                      </select>
                    </label>
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => onPropose(listing, c)}
                      disabled={busyOffer === `${listing.id}:${c.trip.id}`}
                    >
                      {busyOffer === `${listing.id}:${c.trip.id}` ? <span className="spinner" /> : <Icon name="send" size={15} />}
                      {t('matching.offer.send')}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          <Link to={`/annonce/${listing.id}`} className="btn btn-primary btn-sm matching-open"><Icon name="arrowRight" size={15} />{t('matching.open')}</Link>
        </div>
      )}
    </article>
  );
}

function OfferMeta({ offer }) {
  const last = offer.history?.[offer.history.length - 1];
  return (
    <div className="offer-meta">
      <span className="pill pill-teal">+{offer.offeredPay} EUR</span>
      <span>{t(`matching.offer.status.${offer.status}`)}</span>
      {last?.message && <small>{last.message}</small>}
    </div>
  );
}
