import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';

export default function Profile() {
  const { user, logout } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/me').then(setMe);
  }, []);
  const caps = me && { maxValue: me.maxValue, maxActive: me.maxActive };

  return (
    <div>
      <div className="card center">
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 10 }}>
          <Avatar name={user.name} size={72} />
        </div>
        <h1 style={{ fontSize: 20, fontWeight: 700, letterSpacing: '-0.4px' }}>{user.name}</h1>
        <div className="muted">{me?.email}{me?.provider === 'google' ? ' · compte Google' : ''}</div>
        <div className="muted mb">{user.city || ''}</div>
        <TrustBadge user={user} />
      </div>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{user.completed}</div><div className="lbl">Transactions réussies</div></div>
        <div className="stat"><div className="num">{user.rating ?? '—'}</div><div className="lbl">Note moyenne</div></div>
        <div className="stat"><div className="num">{Math.round((user.cancelRate || 0) * 100)} %</div><div className="lbl">Taux d'annulation</div></div>
        <div className="stat"><div className="num">{caps ? `${caps.maxValue} €` : '…'}</div><div className="lbl">Plafond par envoi</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="lock" size={17} />Plafonds progressifs</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          Votre compte peut gérer <b>{caps?.maxActive ?? '…'} transaction(s) active(s)</b> et des envois
          jusqu'à <b>{caps?.maxValue ?? '…'} €</b>. Ces limites augmentent automatiquement avec votre
          historique de transactions réussies — c'est notre façon de construire la confiance.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="shieldCheck" size={17} />Vos garanties</h2>
        <ul className="checklist">
          <li>Paiement séquestré chez un prestataire agréé — jamais chez Salama.</li>
          <li>Identités vérifiées (KYC) pour tous les membres.</li>
          <li>Preuve vidéo du contenu à chaque envoi.</li>
          <li>Litiges arbitrés sous 7 jours selon une grille écrite.</li>
        </ul>
      </div>

      <button className="btn btn-ghost" onClick={logout}>
        <Icon name="logout" size={17} />Se déconnecter
      </button>
    </div>
  );
}
