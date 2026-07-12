import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import { TrustBadge } from '../components.jsx';
import { Avatar, CategoryIcon, Icon } from '../Icons.jsx';
import Training from '../Training.jsx';

export default function ListingDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [listing, setListing] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [training, setTraining] = useState(false);

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
      if (e.data?.needsKyc) nav('/verification');
      else if (e.data?.needsTraining) setTraining(true);
      else setError(e.message);
      setBusy(false);
    }
  };

  if (!listing) return <div className="muted center">Chargement…</div>;
  if (listing === 'gone') return <div className="alert alert-warn"><Icon name="alert" size={17} />Cette annonce n'est plus disponible.</div>;

  const commission = Math.round(listing.travelerPay * listing.commissionRate * 100) / 100;

  return (
    <div>
      {training && (
        <Training onClose={() => setTraining(false)} onDone={() => { setTraining(false); accept(); }} />
      )}
      {listing.photos?.length > 0 && (
        <div className="photo-strip">
          {listing.photos.map((p, i) => <img key={i} src={p} alt={`Photo ${i + 1}`} />)}
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
          <div><div className="muted">Trajet</div><b>{listing.from} → {listing.to}</b></div>
          <div><div className="muted">Fenêtre</div><b>{listing.dateFrom} → {listing.dateTo}</b></div>
          <div><div className="muted">Poids</div><b>{listing.weightKg} kg</b></div>
          <div><div className="muted">Valeur déclarée</div><b>{listing.valueEur} €</b></div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}><Icon name="user" size={17} />Expéditeur</h2>
        <div className="list-row">
          <Avatar name={listing.sender?.name} photo={listing.sender?.photoUrl} />
          <div className="grow">
            <b>{listing.sender?.name}</b> · {listing.sender?.city}
            <div style={{ marginTop: 6 }}><TrustBadge user={listing.sender} /></div>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 10 }}><Icon name="euro" size={17} />Votre rémunération</h2>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Rémunération voyageur</span><b>{listing.travelerPay} €</b>
        </div>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted">Commission plateforme ({Math.round(listing.commissionRate * 100)} %, payée par l'expéditeur)</span>
          <b>{commission} €</b>
        </div>
        <div className="divider" />
        <div className="alert alert-teal" style={{ marginBottom: 0 }}>
          <Icon name="lock" size={17} />
          <span>Le paiement est séquestré dès votre acceptation et versé automatiquement à la livraison validée.
          Vous pouvez refuser sans pénalité lors de la remise si le contenu ne correspond pas.</span>
        </div>
      </div>

      {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
      <button className="btn btn-primary" onClick={accept} disabled={busy}>
        {busy ? '…' : 'Accepter ce transport'}
      </button>
    </div>
  );
}
