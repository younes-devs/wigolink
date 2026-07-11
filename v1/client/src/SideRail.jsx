import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from './api';
import { Icon } from './Icons.jsx';

// Panneau contextuel affiché à droite sur grand écran (≥1200px).
// Le contenu s'adapte à la page consultée.
export default function SideRail({ user }) {
  const { pathname } = useLocation();
  const [rules, setRules] = useState(null);
  const [listingsCount, setListingsCount] = useState(null);
  const [txs, setTxs] = useState([]);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!user) return;
    api('/rules').then(setRules).catch(() => {});
    api('/me').then(setMe).catch(() => {});
  }, [user]);

  useEffect(() => {
    if (!user) return;
    api('/listings').then((d) => setListingsCount(d.listings.length)).catch(() => {});
    api('/transactions').then((d) => setTxs(d.transactions)).catch(() => {});
  }, [user, pathname]);

  if (!user) return null;

  const escrowHeld = txs
    .filter((t) => ['held', 'frozen'].includes(t.escrow?.state))
    .reduce((s, t) => s + t.escrow.amount, 0);
  const active = txs.filter((t) => !['released', 'refunded', 'cancelled'].includes(t.status)).length;
  const franchise = rules?.customs?.['MA-EU']?.franchise;

  const isFeed = pathname === '/' || pathname.startsWith('/annonce');
  const isTx = pathname.startsWith('/transactions');
  const isShip = pathname.startsWith('/envois');
  const isProfile = pathname.startsWith('/profil');
  const isAdmin = pathname.startsWith('/admin');

  return (
    <aside className="side-rail">
      {/* Corridor : toujours utile en tête */}
      <div className="rail-card rail-corridor">
        <div className="rail-route">
          <span>Casablanca</span>
          <Icon name="plane" size={16} />
          <span>Bruxelles</span>
        </div>
        <div className="rail-corridor-stats">
          <div><b>{listingsCount ?? '—'}</b><span>annonces ouvertes</span></div>
          <div><b>{active}</b><span>en cours pour vous</span></div>
        </div>
        {franchise && (
          <div className="rail-note">
            <Icon name="fileText" size={13} />
            Franchise douanière : {franchise}
          </div>
        )}
      </div>

      {isFeed && (
        <div className="rail-card">
          <h3>Comment ça marche</h3>
          {[
            ['Accord', "Vous acceptez une annonce, le paiement est immédiatement séquestré."],
            ['Remise', 'Vidéo de scellage, inspection du contenu, validation par QR croisé.'],
            ['Transport', 'Récapitulatif douane à présenter en cas de contrôle.'],
            ['Paiement', 'Le destinataire valide, votre rémunération est versée en quelques minutes.'],
          ].map(([t, d], i) => (
            <div className="rail-step" key={t}>
              <span className="rail-step-num">{i + 1}</span>
              <div><b>{t}</b><p>{d}</p></div>
            </div>
          ))}
        </div>
      )}

      {isTx && (
        <>
          {escrowHeld > 0 && (
            <div className="rail-card">
              <h3>Escrow en cours</h3>
              <div className="rail-big">{escrowHeld.toFixed(2).replace('.', ',')} €</div>
              <p className="rail-muted">séquestrés chez notre prestataire de paiement, libérés à la double validation finale.</p>
            </div>
          )}
          <div className="rail-card">
            <h3>Règles d'or</h3>
            <ul className="rail-list">
              <li>Ne transportez jamais ce que vous n'avez pas vu ouvert.</li>
              <li>Rendez-vous en lieu public, de jour.</li>
              <li>Comparez toujours le colis à la vidéo de scellage.</li>
              <li>Tout se passe dans l'app : hors app, aucune protection.</li>
            </ul>
          </div>
        </>
      )}

      {isShip && rules && (
        <div className="rail-card">
          <h3>Produits autorisés</h3>
          <ul className="rail-list">
            {rules.whitelist.slice(0, 6).map((c) => (
              <li key={c.id}>{c.label} <span className="rail-muted">· max {c.maxQty}</span></li>
            ))}
          </ul>
          <div className="rail-note" style={{ marginTop: 10 }}>
            <Icon name="alert" size={13} />
            Compléments alimentaires, médicaments, liquides non scellés : refusés.
          </div>
        </div>
      )}

      {isProfile && (
        <div className="rail-card">
          <h3>Badge voyageur confirmé</h3>
          <div className="rail-progress">
            <div className="rail-progress-bar" style={{ width: `${Math.min(100, (user.completed / 5) * 100)}%` }} />
          </div>
          <p className="rail-muted">
            {user.completed >= 5
              ? 'Obtenu — votre profil inspire confiance.'
              : `${user.completed}/5 livraisons réussies. Encore ${5 - user.completed} pour débloquer le badge.`}
          </p>
          {me && (
            <p className="rail-muted" style={{ marginTop: 8 }}>
              Plafond actuel : <b>{me.maxValue} €</b> par envoi, <b>{me.maxActive}</b> transaction(s) simultanée(s).
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="rail-card">
          <h3>Grille d'arbitrage</h3>
          <ul className="rail-list">
            <li>État ≠ vidéo de scellage → responsabilité <b>voyageur</b>.</li>
            <li>Conforme vidéo mais ≠ annonce → responsabilité <b>expéditeur</b>.</li>
            <li>SLA : première réponse &lt; 24 h, résolution &lt; 7 jours.</li>
          </ul>
        </div>
      )}

      {isFeed && (
        <div className="rail-cta">
          <p>Quelque chose à envoyer ?</p>
          <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm">Créer une demande</button></Link>
        </div>
      )}
    </aside>
  );
}
