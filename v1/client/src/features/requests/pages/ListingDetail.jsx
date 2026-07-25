import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { KycRequiredNotice, TrustBadge } from '../../../components.jsx';
import { Avatar, CategoryIcon, Icon } from '../../../Icons.jsx';
import { SkeletonCard } from '../../../shared/ui/Skeleton.jsx';
import Training from '../../../Training.jsx';
import { t, useLang } from '../../../i18n.js';

export default function ListingDetail() {
  useLang();
  const { id } = useParams();
  const nav = useNavigate();
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);
  const [needsKyc, setNeedsKyc] = useState(false);

  useEffect(() => {
    api('/listings?all=1').then((d) => setListing(d.listings.find((l) => l.id === id) || 'gone'));
  }, [id]);

  const accept = async () => {
    setBusy(true);
    setError('');
    try {
      const d = await api(`/listings/${id}/accept`, { method: 'POST' });
      nav(`/transactions/${d.transaction.id}`);
    } catch (e) {
      if (e.data?.needsKyc) setNeedsKyc(true);
      else if (e.data?.needsTraining) setTraining(true);
      else setError(e.message);
      setBusy(false);
    }
  };

  if (!listing) return <SkeletonCard lines={4} />;
  if (listing === 'gone') return <div className="alert alert-warn"><Icon name="alert" size={17} />{t('listing.gone')}</div>;

  const commission = Math.round(listing.travelerPay * listing.commissionRate * 100) / 100;

  return (
    <div>
      {training && (
        <Training onClose={() => setTraining(false)} onDone={() => { setTraining(false); accept(); }} />
      )}
      {listing.photos?.length > 0 && (
        <div className="photo-strip">
          {listing.photos.map((p, i) => <img key={i} src={p} alt={t('common.photoNumber', { n: i + 1 })} />)}
        </div>
      )}
      <div className="card">
        <div className="list-row">
          <CategoryIcon categoryId={listing.categoryId} size={26} />
          <div className="grow">
            <h1 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.3px' }}>{listing.title}</h1>
            <div className="muted">{listing.categoryLabel}</div>
          </div>
        </div>
        <div className="divider" />
        <p style={{ fontSize: 14, lineHeight: 1.55 }}>{listing.description}</p>
        <div className="divider" />
        <div className="stat-grid">
          <div><div className="muted">{t('listing.route')}</div><b>{listing.from} → {listing.to}</b></div>
          <div><div className="muted">{t('listing.window')}</div><b>{listing.dateFrom} → {listing.dateTo}</b></div>
          <div><div className="muted">{t('listing.weight')}</div><b>{listing.weightKg} kg</b></div>
          <div><div className="muted">{t('listing.value')}</div><b>{listing.valueEur} €</b></div>
        </div>
      </div>

      {/* Décision remontée au-dessus de la ligne de flottaison (PRD UI/UX U4) :
          rémunération + action principale visibles sans scroll sur mobile. */}
      <div className="card decision-card">
        <div className="decision-earn">
          <span className="muted">{t('listing.earn')}</span>
          <span className="decision-amount">{listing.travelerPay} €</span>
        </div>
        {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
        {needsKyc && <KycRequiredNotice />}
        <button className="btn btn-primary" onClick={accept} disabled={busy}>
          {busy ? <span className="spinner" /> : t('listing.accept')}
        </button>
        <div className="decision-note">
          <Icon name="lock" size={14} />
          <span>{t('listing.note')}</span>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}><Icon name="user" size={17} />{t('listing.sender')}</h2>
        <div className="list-row">
          <Avatar name={listing.sender?.name} photo={listing.sender?.photoUrl} />
          <div className="grow">
            <b>{listing.sender?.name}</b> · {listing.sender?.city}
            <div style={{ marginTop: 6 }}><TrustBadge user={listing.sender} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}><Icon name="euro" size={17} />{t('listing.pay.detail')}</h2>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{t('listing.pay.traveler')}</span><b>{listing.travelerPay} €</b>
        </div>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{t('listing.pay.commission', { pct: Math.round(listing.commissionRate * 100) })}</span>
          <b>{commission} €</b>
        </div>
      </div>
    </div>
  );
}
