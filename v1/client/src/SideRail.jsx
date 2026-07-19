import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from './api';
import { Icon } from './Icons.jsx';
import { t, useLang } from './i18n.js';

// Panneau contextuel affiché à droite sur grand écran (≥1200px).
// Le contenu s'adapte à la page consultée.
export default function SideRail({ user }) {
  const lang = useLang();
  const { pathname } = useLocation();
  const [rules, setRules] = useState(null);
  const [listingsCount, setListingsCount] = useState(null);
  const [txs, setTxs] = useState([]);
  const [me, setMe] = useState(null);

  useEffect(() => {
    if (!user) return;
    api('/rules').then(setRules).catch(() => {});
    api('/me').then(setMe).catch(() => {});
  }, [user, lang]);

  useEffect(() => {
    if (!user) return;
    api('/listings').then((d) => setListingsCount(d.listings.length)).catch(() => {});
    api('/transactions').then((d) => setTxs(d.transactions)).catch(() => {});
  }, [user, pathname]);

  if (!user) return null;

  const isSimpleRoute = pathname === '/trajets'
    || pathname.startsWith('/trajets/')
    || pathname.startsWith('/en-cours')
    || pathname.startsWith('/operations')
    || pathname.startsWith('/enregistres')
    || pathname.startsWith('/messages');
  if (isSimpleRoute) return null;

  const escrowHeld = txs
    .filter((t) => ['held', 'frozen'].includes(t.escrow?.state))
    .reduce((s, t) => s + t.escrow.amount, 0);
  const active = txs.filter((t) => !['released', 'refunded', 'cancelled'].includes(t.status)).length;
  const franchise = rules?.customs?.['MA-EU']?.franchise;

  const isFeed = pathname === '/trajets' || pathname.startsWith('/annonce');
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
          <div><b>{listingsCount ?? '—'}</b><span>{t('rail.open.listings')}</span></div>
          <div><b>{active}</b><span>{t('rail.active.foryou')}</span></div>
        </div>
        {franchise && (
          <div className="rail-note">
            <Icon name="fileText" size={13} />
            {t('rail.franchise', { f: franchise })}
          </div>
        )}
      </div>

      {isFeed && (
        <div className="rail-card">
          <h3>{t('rail.how.title')}</h3>
          {[1, 2, 3, 4].map((n) => (
            <div className="rail-step" key={n}>
              <span className="rail-step-num">{n}</span>
              <div><b>{t(`rail.how.${n}.t`)}</b><p>{t(`rail.how.${n}.d`)}</p></div>
            </div>
          ))}
        </div>
      )}

      {isTx && (
        <>
          {escrowHeld > 0 && (
            <div className="rail-card">
              <h3>{t('rail.escrow.title')}</h3>
              <div className="rail-big">{escrowHeld.toFixed(2).replace('.', ',')} €</div>
              <p className="rail-muted">{t('rail.escrow.text')}</p>
            </div>
          )}
          <div className="rail-card">
            <h3>{t('rail.golden.title')}</h3>
            <ul className="rail-list">
              <li>{t('rail.golden.1')}</li>
              <li>{t('rail.golden.2')}</li>
              <li>{t('rail.golden.3')}</li>
              <li>{t('rail.golden.4')}</li>
            </ul>
          </div>
        </>
      )}

      {isShip && rules && (
        <div className="rail-card">
          <h3>{t('rail.allowed.title')}</h3>
          <ul className="rail-list">
            {rules.whitelist.slice(0, 6).map((c) => (
              <li key={c.id}>{c.label} <span className="rail-muted">{t('rail.allowed.max', { q: c.maxQty })}</span></li>
            ))}
          </ul>
          <div className="rail-note" style={{ marginTop: 10 }}>
            <Icon name="alert" size={13} />
            {t('rail.allowed.note')}
          </div>
        </div>
      )}

      {isProfile && (
        <div className="rail-card">
          <h3>{t('rail.badge.title')}</h3>
          <div className="rail-progress">
            <div className="rail-progress-bar" style={{ width: `${Math.min(100, (user.completed / 5) * 100)}%` }} />
          </div>
          <p className="rail-muted">
            {user.completed >= 5
              ? t('rail.badge.earned')
              : t('rail.badge.progress', { n: user.completed, left: 5 - user.completed })}
          </p>
          {me && (
            <p className="rail-muted" style={{ marginTop: 8 }}>
              {t('rail.caps', { value: me.maxValue, active: me.maxActive })}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="rail-card">
          <h3>{t('rail.arbitration.title')}</h3>
          <ul className="rail-list">
            <li>{t('rail.arbitration.1')}</li>
            <li>{t('rail.arbitration.2')}</li>
            <li>{t('rail.arbitration.3')}</li>
          </ul>
        </div>
      )}

      {isFeed && (
        <div className="rail-cta">
          <p>{t('rail.cta.text')}</p>
          <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm">{t('rail.cta.btn')}</button></Link>
        </div>
      )}
    </aside>
  );
}
