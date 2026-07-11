import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

const LISTING_STATUS = {
  published: { label: 'Publiée — en attente de voyageur', pill: 'pill-saffron' },
  pending_review: { label: 'En revue par notre équipe', pill: 'pill-gray' },
  matched: { label: 'Voyageur trouvé', pill: 'pill-teal' },
  rejected: { label: 'Refusée', pill: 'pill-danger' },
};

export default function MyShipments() {
  const [listings, setListings] = useState(null);

  useEffect(() => {
    api('/listings/mine').then((d) => setListings(d.listings));
  }, []);

  return (
    <div>
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">Mes envois</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>Vos demandes d'envoi et leur statut.</p>
        </div>
        <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm">+ Nouvel envoi</button></Link>
      </div>

      {listings === null && <div className="muted center">Chargement…</div>}
      {listings?.length === 0 && (
        <div className="card center">
          <div style={{ fontSize: 40 }}>📦</div>
          <p className="muted mt">Aucun envoi pour l'instant. Créez votre première demande !</p>
        </div>
      )}

      {listings?.map((l) => {
        const s = LISTING_STATUS[l.status] || { label: l.status, pill: 'pill-gray' };
        return (
          <div className="card" key={l.id}>
            <div className="list-row">
              <div style={{ fontSize: 32 }}>{l.icon}</div>
              <div className="grow">
                <b>{l.title}</b>
                <div className="muted">{l.from} → {l.to} · {l.valueEur} €</div>
              </div>
            </div>
            <div className="mt"><span className={`pill ${s.pill}`}>{s.label}</span></div>
          </div>
        );
      })}
    </div>
  );
}
