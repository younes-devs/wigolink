import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../api';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../shared/ui/Skeleton.jsx';
import { useToast } from '../../../shared/ui/Toast.jsx';
import { t, useLang, dateLocale } from '../../../i18n.js';

const ACTIVE = ['pending', 'pending_traveler', 'countered_sender'];
const DAY_MS = 24 * 60 * 60 * 1000;

function isWaitingForMe(offer) {
  return (offer.status === 'pending_traveler' && offer.myRole === 'traveler')
    || (offer.status === 'countered_sender' && offer.myRole === 'sender');
}

function timeState(offer) {
  if (!offer.expiresAt || !ACTIVE.includes(offer.status)) return { tone: 'neutral', label: '' };
  const diff = offer.expiresAt - Date.now();
  if (diff <= 0) return { tone: 'danger', label: t('offers.time.expired') };
  const hours = Math.ceil(diff / (60 * 60 * 1000));
  if (diff <= DAY_MS) return { tone: 'danger', label: t('offers.time.hours', { n: hours }) };
  if (diff <= 2 * DAY_MS) return { tone: 'warn', label: t('offers.time.days', { n: Math.ceil(diff / DAY_MS) }) };
  return { tone: 'neutral', label: t('offers.expires', { date: new Date(offer.expiresAt).toLocaleDateString(dateLocale()) }) };
}

export default function OffersCenter() {
  useLang();
  const nav = useNavigate();
  const toast = useToast();
  const [offers, setOffers] = useState(null);
  const [filter, setFilter] = useState('active');
  const [busy, setBusy] = useState('');
  const [drafts, setDrafts] = useState({});

  const load = () => api('/matching-offers').then((d) => setOffers(d.offers));
  useEffect(() => { load(); }, []);

  const rows = offers || [];
  const visible = rows.filter((o) => {
    if (filter === 'action') return isWaitingForMe(o);
    if (filter === 'active') return ACTIVE.includes(o.status);
    if (filter === 'received') return o.myRole === 'traveler';
    if (filter === 'sent') return o.myRole === 'sender';
    if (filter === 'closed') return !ACTIVE.includes(o.status);
    return true;
  });

  const stats = {
    action: rows.filter(isWaitingForMe).length,
    active: rows.filter((o) => ACTIVE.includes(o.status)).length,
    received: rows.filter((o) => o.myRole === 'traveler').length,
    sent: rows.filter((o) => o.myRole === 'sender').length,
    closed: rows.filter((o) => !ACTIVE.includes(o.status)).length,
  };

  const act = async (offer, action) => {
    setBusy(`${offer.id}:${action}`);
    try {
      const d = await api(`/matching-offers/${offer.id}/${action}`, { method: 'POST' });
      if (action === 'accept') {
        toast.success(t('offers.toast.accepted'));
        if (d.transaction) nav(`/transactions/${d.transaction.id}`);
      } else if (action === 'withdraw') {
        toast.info(t('offers.toast.withdrawn'));
        load();
      } else {
        toast.info(t('offers.toast.declined'));
        load();
      }
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  const counter = async (offer) => {
    const amount = drafts[offer.id] || offer.offeredPay || offer.listing?.travelerPay || 1;
    setBusy(`${offer.id}:counter`);
    try {
      await api(`/matching-offers/${offer.id}/counter`, {
        method: 'POST',
        body: {
          offeredPay: amount,
          message: t('offers.counter.message', { amount }),
        },
      });
      toast.success(t('offers.toast.countered'));
      load();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="offers-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('offers.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('offers.sub')}</p>
        </div>
        <Link to="/matching" className="btn btn-ghost btn-sm"><Icon name="user" size={15} />{t('matching.nav')}</Link>
      </div>

      {!offers && <SkeletonList count={3} />}
      {offers && (
        <>
          <section className="offers-metrics">
            <Metric icon="alert" label={t('offers.filter.action')} value={stats.action} danger={stats.action > 0} />
            <Metric icon="clock" label={t('offers.filter.active')} value={stats.active} />
            <Metric icon="send" label={t('offers.filter.sent')} value={stats.sent} />
            <Metric icon="package" label={t('offers.filter.received')} value={stats.received} />
            <Metric icon="check" label={t('offers.filter.closed')} value={stats.closed} />
          </section>

          <div className="tabs offers-tabs">
            {['action', 'active', 'received', 'sent', 'closed', 'all'].map((id) => (
              <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
                {t(`offers.filter.${id}`)}
              </button>
            ))}
          </div>

          {visible.length === 0 && (
            <div className="card center empty-state">
              <Icon name="send" size={36} />
              <p className="muted">{t('offers.empty')}</p>
            </div>
          )}

          <div className="offers-list">
            {visible.map((offer) => (
              <OfferRow
                key={offer.id}
                offer={offer}
                busy={busy}
                draft={drafts[offer.id]}
                onDraft={(value) => setDrafts({ ...drafts, [offer.id]: value })}
                onAct={act}
                onCounter={counter}
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
    <div className={`offers-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function OfferRow({ offer, busy, draft, onDraft, onAct, onCounter }) {
  const canTravelerRespond = offer.myRole === 'traveler' && ['pending', 'pending_traveler'].includes(offer.status);
  const canSenderRespond = offer.myRole === 'sender' && offer.status === 'countered_sender';
  const canSenderWithdraw = offer.myRole === 'sender' && ['pending', 'pending_traveler', 'countered_sender'].includes(offer.status);
  const canCounter = offer.myRole === 'traveler' && ['pending', 'pending_traveler'].includes(offer.status);
  const other = offer.myRole === 'sender' ? offer.traveler : offer.sender;
  const amount = offer.offeredPay || offer.listing?.travelerPay || 0;
  const waitMe = isWaitingForMe(offer);
  const deadline = timeState(offer);
  const urgent = waitMe && deadline.tone === 'danger';

  return (
    <article className={`offers-row ${ACTIVE.includes(offer.status) ? 'active' : 'closed'} ${urgent ? 'urgent' : ''}`}>
      <div className="offers-row-head">
        <CategoryIcon categoryId={offer.listing?.categoryId} size={20} />
        <div className="grow">
          <b>{offer.listing?.title || t('traveler.offers.missing')}</b>
          <span>{other?.name} · {offer.listing?.from} → {offer.listing?.to}</span>
        </div>
        <span className="pill pill-teal">+{amount} €</span>
      </div>

      <div className="offers-state">
        <span>
          {waitMe && <b className="offer-action-badge">{t('offers.waiting.me')}</b>}
          {t(`matching.offer.status.${offer.status}`)}
        </span>
        {deadline.label && <small className={`offer-deadline ${deadline.tone}`}>{deadline.label}</small>}
      </div>

      {offer.message && <p className="offers-message">{offer.message}</p>}

      {offer.history?.length > 0 && (
        <div className="offers-history">
          {offer.history.slice(-4).map((event, idx) => (
            <span key={`${event.at}-${idx}`}>+{event.pay} € · {t(`matching.offer.event.${event.type}`)}</span>
          ))}
        </div>
      )}

      {canCounter && (
        <div className="offers-counter">
          <label>{t('traveler.offers.counter.label')}</label>
          <input
            type="number"
            min="1"
            value={draft ?? Math.ceil(amount + 2)}
            onChange={(e) => onDraft(e.target.value)}
          />
          <button className="btn btn-ghost btn-sm" onClick={() => onCounter(offer)} disabled={!!busy}>
            {busy === `${offer.id}:counter` ? <span className="spinner" /> : <Icon name="repeat" size={15} />}
            {t('traveler.offers.counter')}
          </button>
        </div>
      )}

      <div className="offers-actions">
        {canSenderWithdraw && (
          <button className="btn btn-danger-ghost btn-sm" onClick={() => onAct(offer, 'withdraw')} disabled={!!busy}>
            {busy === `${offer.id}:withdraw` ? <span className="spinner" /> : <Icon name="x" size={15} />}
            {t('offers.withdraw')}
          </button>
        )}
        {(canTravelerRespond || canSenderRespond) && (
          <>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => onAct(offer, 'decline')} disabled={!!busy}>
              {busy === `${offer.id}:decline` ? <span className="spinner" /> : <Icon name="x" size={15} />}
              {t('traveler.offers.decline')}
            </button>
            <button className="btn btn-teal btn-sm" onClick={() => onAct(offer, 'accept')} disabled={!!busy}>
              {busy === `${offer.id}:accept` ? <span className="spinner" /> : <Icon name="check" size={15} />}
              {t('traveler.offers.accept')}
            </button>
          </>
        )}
        {offer.txId && (
          <Link to={`/transactions/${offer.txId}`} className="btn btn-primary btn-sm">
            <Icon name="arrowRight" size={15} />{t('offers.open.tx')}
          </Link>
        )}
        {offer.listing && !offer.txId && (
          <Link to={`/annonce/${offer.listing.id}`} className="btn btn-ghost btn-sm">
            <Icon name="arrowRight" size={15} />{t('matching.open')}
          </Link>
        )}
      </div>
    </article>
  );
}
