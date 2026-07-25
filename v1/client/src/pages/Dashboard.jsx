import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CategoryIcon, Icon } from '../Icons.jsx';
import { StatusPill, TrustBadge } from '../components.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { TripTransportIcon } from '../TripTransport.jsx';
import { t, useLang, dateLocale } from '../i18n.js';

function txTarget(tx) {
  if (tx.status === 'disputed') return 'litige';
  if (tx.status === 'accepted' && tx.myRole === 'sender') return 'actions';
  if (tx.status === 'sealed' && tx.myRole === 'traveler') return 'actions';
  if (tx.status === 'in_transit' && tx.myRole === 'recipient') return 'actions';
  return 'suivi';
}

function actionKey(tx) {
  if (tx.status === 'accepted' && tx.myRole === 'sender') return 'dash.action.seal';
  if (tx.status === 'sealed' && tx.myRole === 'traveler') return 'dash.action.pickup';
  if (tx.status === 'in_transit' && tx.myRole === 'recipient') return 'dash.action.delivery';
  if (tx.status === 'disputed') return 'dash.action.dispute';
  return 'dash.action.follow';
}

const dateFmt = () => new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { day: 'numeric', month: 'short' });
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

function offerDeadline(offer) {
  if (!offer.expiresAt) return '';
  const diff = offer.expiresAt - Date.now();
  if (diff <= 0) return t('offers.time.expired');
  if (diff <= DAY_MS) return t('offers.time.hours', { n: Math.ceil(diff / HOUR_MS) });
  return t('offers.time.days', { n: Math.ceil(diff / DAY_MS) });
}

export default function Dashboard() {
  useLang();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/dashboard').then(setData).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>;
  if (!data) return <SkeletonList count={4} />;

  const trustItems = [
    { icon: 'shieldCheck', label: t('dash.trust.kyc'), value: t(`kycbanner.${data.trust.kycStatus}`) },
    { icon: 'star', label: t('dash.trust.rating'), value: data.trust.rating ?? t('dash.trust.new') },
    { icon: 'lock', label: t('dash.trust.limits'), value: t('dash.trust.limits.value', { value: data.trust.maxValue, active: data.trust.maxActive }) },
  ];

  return (
    <div className="dashboard-page">
      <div className="dash-hero">
        <div>
          <h1>{t('dash.title', { name: data.user.name })}</h1>
          <p>{t('dash.subtitle')}</p>
        </div>
        <Link to="/envois/nouveau" className="btn btn-primary btn-sm">
          <Icon name="plus" size={16} />{t('dash.cta.send')}
        </Link>
      </div>

      <div className="dash-metrics">
        <Metric icon="check" label={t('dash.metric.actions')} value={data.actions.length} />
        <Metric icon="repeat" label={t('dash.metric.active')} value={data.activeTx.length} />
        <Metric icon="bell" label={t('dash.metric.unread')} value={data.unread} />
        <Metric icon="package" label={t('dash.metric.shipments')} value={data.shipments.published + data.shipments.pendingReview} />
      </div>

      <section className="dash-section dash-section-primary">
        <div className="dash-section-head">
          <div><h2>{t('dash.actions.title')}</h2><p>{t('dash.actions.sub')}</p></div>
          <Link to="/transactions">{t('dash.view.all')}</Link>
        </div>
        {data.actions.length === 0 ? (
          <Empty icon="check" text={t('dash.actions.empty')} to="/transactions" label={t('nav.transactions')} />
        ) : (
          <div className="dash-list">
            {data.actions.map((tx) => (
              <Link key={tx.id} className="dash-row" to={`/transactions/${tx.id}#${txTarget(tx)}`}>
                <CategoryIcon categoryId={tx.listing?.categoryId} size={20} />
                <span className="grow">
                  <b>{t(actionKey(tx))}</b>
                  <small>{tx.listing?.title}</small>
                </span>
                <StatusPill status={tx.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="dash-grid">
        <section className="dash-section">
          <div className="dash-section-head">
            <div><h2>{t('dash.matches.title')}</h2><p>{t('dash.matches.sub')}</p></div>
            <Link to="/trajets">{t('dash.view.all')}</Link>
          </div>
          {data.matches.length === 0 ? (
            <Empty icon="plane" text={t('dash.matches.empty')} to="/trajets" label={t('dash.matches.cta')} />
          ) : (
            <div className="dash-list">
              {data.matches.map((l) => (
                <Link key={l.id} className="dash-row" to={`/annonce/${l.id}`}>
                  <CategoryIcon categoryId={l.categoryId} size={20} />
                  <span className="grow">
                    <b>{l.title}</b>
                    <small>{`${l.from} -> ${l.to} · +${l.travelerPay} €`}</small>
                  </span>
                  <TrustBadge user={l.sender} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dash-section">
          <div className="dash-section-head">
            <div><h2>{t('dash.trips.title')}</h2><p>{t('dash.trips.sub')}</p></div>
            <Link to="/trajets">{t('dash.view.all')}</Link>
          </div>
          {data.trips.length === 0 ? (
            <Empty icon="plane" text={t('dash.trips.empty')} to="/trajets" label={t('feed.declare')} />
          ) : (
            <div className="dash-chip-list">
              {data.trips.map((trip) => (
                <span key={trip.id} className="dash-trip-chip">
                  <TripTransportIcon mode={trip.transportMode} size={14} />
                  {`${trip.from} -> ${trip.to}`}
                  <small>{`${dateFmt().format(new Date(trip.date))} · ${trip.capacityKg} kg`}</small>
                </span>
              ))}
            </div>
          )}
        </section>

        <section className="dash-section">
          <div className="dash-section-head">
            <div><h2>{t('dash.trust.title')}</h2><p>{t('dash.trust.sub')}</p></div>
            <Link to="/confiance">{t('trust.title')}</Link>
          </div>
          <div className="dash-trust-grid">
            {trustItems.map((item) => (
              <div key={item.label}>
                <Icon name={item.icon} size={17} />
                <span>{item.label}</span>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
        </section>

        <section className="dash-section">
          <div className="dash-section-head">
            <div><h2>{t('offers.title')}</h2><p>{t('offers.profile.link')}</p></div>
            <Link to="/offres">{data.offers?.mineToAct || 0} {t('dash.metric.actions')}</Link>
          </div>
          {!data.offers?.latest?.length ? (
            <Empty icon="send" text={t('offers.empty')} to="/offres" label={t('offers.title')} />
          ) : (
            <div className="dash-list">
              {data.offers.latest.map((offer) => (
                <Link key={offer.id} className={`dash-row ${offer.waitingForMe ? 'unread' : ''}`} to="/offres">
                  <CategoryIcon categoryId={offer.listing?.categoryId} size={20} />
                  <span className="grow">
                    <b>{offer.waitingForMe ? t('offers.waiting.me') : t(`matching.offer.status.${offer.status}`)}</b>
                    <small>{offer.listing?.title} · {offer.other?.name} · +{offer.offeredPay} €</small>
                  </span>
                  <small className={offer.waitingForMe ? 'dash-deadline urgent' : 'dash-deadline'}>{offerDeadline(offer)}</small>
                  <Icon name="arrowRight" size={15} />
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="dash-section">
          <div className="dash-section-head">
            <div><h2>{t('dash.notifications.title')}</h2><p>{t('dash.notifications.sub')}</p></div>
            <Link to="/parametres">{t('settings.title')}</Link>
          </div>
          {data.notifications.length === 0 ? (
            <Empty icon="bell" text={t('notif.empty')} />
          ) : (
            <div className="dash-list">
              {data.notifications.map((n) => (
                <Link key={n.id} className={`dash-row ${n.read ? '' : 'unread'}`}
                  to={n.txId ? `/transactions/${n.txId}${n.section ? `#${n.section}` : ''}` : n.section === 'matching' ? '/offres' : '/parametres'}>
                  <Icon name={n.read ? 'bell' : 'alert'} size={17} />
                  <span className="grow">
                    <b>{n.text}</b>
                    <small>{new Date(n.at).toLocaleString(dateLocale())}</small>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }) {
  return (
    <div className="dash-metric">
      <Icon name={icon} size={18} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function Empty({ icon, text, to, label }) {
  const body = (
    <div className="dash-empty">
      <Icon name={icon} size={24} />
      <span>{text}</span>
      {label && <b>{label}</b>}
    </div>
  );
  return to ? <Link className="dash-empty-link" to={to}>{body}</Link> : body;
}
