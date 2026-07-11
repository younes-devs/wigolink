import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { TrustBadge } from '../components.jsx';
import { CategoryIcon, Icon } from '../Icons.jsx';

export default function Feed() {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    api('/listings').then((d) => setListings(d.listings)).catch(() => setListings([]));
  }, []);

  return (
    <div>
      <h1 className="page-title">Annonces sur votre trajet</h1>
      <p className="page-sub">Casablanca → Bruxelles · Transportez, gagnez, en toute sécurité.</p>

      {listings === null && <div className="muted center">Chargement…</div>}
      {listings?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="moon" size={36} />
          <p className="muted">Aucune annonce disponible pour l'instant sur ce corridor.</p>
        </div>
      )}

      {listings?.map((l) => (
        <Link key={l.id} to={`/annonce/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card clickable">
            <div className="list-row">
              <CategoryIcon categoryId={l.categoryId} />
              <div className="grow">
                <div style={{ fontWeight: 650, fontSize: 15, letterSpacing: '-0.2px' }}>{l.title}</div>
                <div className="muted">{l.from} → {l.to} · {l.weightKg} kg · valeur {l.valueEur} €</div>
                <div style={{ marginTop: 7 }}>
                  <TrustBadge user={l.sender} />
                </div>
              </div>
              <div className="center price">
                +{l.travelerPay} €
                <small>pour vous</small>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
