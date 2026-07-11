import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { TrustBadge } from '../components.jsx';

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
        <div className="card center">
          <div style={{ fontSize: 40 }}>🌙</div>
          <p className="muted mt">Aucune annonce disponible pour l'instant sur ce corridor.</p>
        </div>
      )}

      {listings?.map((l) => (
        <Link key={l.id} to={`/annonce/${l.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card clickable">
            <div className="list-row">
              <div style={{ fontSize: 34 }}>{l.icon}</div>
              <div className="grow">
                <div style={{ fontWeight: 800, fontSize: 15 }}>{l.title}</div>
                <div className="muted">{l.from} → {l.to} · {l.weightKg} kg · valeur {l.valueEur} €</div>
                <div className="mt" style={{ marginTop: 6 }}>
                  <TrustBadge user={l.sender} />
                </div>
              </div>
              <div className="center">
                <div style={{ fontWeight: 900, color: 'var(--teal)', fontSize: 18 }}>+{l.travelerPay} €</div>
                <div className="muted" style={{ fontSize: 11 }}>pour vous</div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
