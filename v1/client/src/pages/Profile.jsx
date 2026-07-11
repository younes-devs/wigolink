import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge } from '../components.jsx';

export default function Profile() {
  const { user, logout } = useAuth();
  const [caps, setCaps] = useState(null);

  useEffect(() => {
    api('/me').then((d) => setCaps({ maxValue: d.maxValue, maxActive: d.maxActive }));
  }, []);

  return (
    <div>
      <div className="card center">
        <div style={{ fontSize: 56 }}>{user.avatar}</div>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>{user.name}</h1>
        <div className="muted mb">{user.city || '—'}</div>
        <TrustBadge user={user} />
      </div>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{user.completed}</div><div className="lbl">Transactions réussies</div></div>
        <div className="stat"><div className="num">{user.rating ?? '—'}</div><div className="lbl">Note moyenne</div></div>
        <div className="stat"><div className="num">{Math.round((user.cancelRate || 0) * 100)} %</div><div className="lbl">Taux d'annulation</div></div>
        <div className="stat"><div className="num">{caps ? `${caps.maxValue} €` : '…'}</div><div className="lbl">Plafond par envoi</div></div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>🔓 Plafonds progressifs</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
          Votre compte peut gérer <b>{caps?.maxActive ?? '…'} transaction(s) active(s)</b> et des envois
          jusqu'à <b>{caps?.maxValue ?? '…'} €</b>. Ces limites augmentent automatiquement avec votre
          historique de transactions réussies — c'est notre façon de construire la confiance.
        </p>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 15, marginBottom: 8 }}>🛡️ Vos garanties</h2>
        <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.7 }}>
          <li>Paiement séquestré chez un prestataire agréé — jamais chez Salama.</li>
          <li>Identités vérifiées (KYC) pour tous les membres.</li>
          <li>Preuve vidéo du contenu à chaque envoi.</li>
          <li>Litiges arbitrés sous 7 jours selon une grille écrite.</li>
        </ul>
      </div>

      <button className="btn btn-ghost" onClick={logout}>Se déconnecter</button>
    </div>
  );
}
