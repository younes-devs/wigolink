import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { StatusPill } from '../../../components.jsx';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { t, useLang } from '../../../i18n.js';

export default function Transactions() {
  useLang();
  const [txs, setTxs] = useState(null);
  const [tab, setTab] = useState('current'); // current | history

  useEffect(() => {
    setTxs(null);
    api(`/transactions${tab === 'history' ? '?history=1' : ''}`).then((d) => setTxs(d.transactions));
  }, [tab]);

  return (
    <div>
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('txs.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('txs.sub')}</p>
        </div>
        <Link to="/finance" className="btn btn-ghost btn-sm"><Icon name="euro" size={15} />{t('finance.nav')}</Link>
      </div>

      <div className="tabs">
        <button className={tab === 'current' ? 'active' : ''} onClick={() => setTab('current')}>{t('txs.tab.current')}</button>
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>{t('txs.tab.history')}</button>
      </div>

      {txs === null && <SkeletonList count={3} />}
      {txs?.length === 0 && (
        <div className="card center empty-state">
          <Icon name={tab === 'history' ? 'clock' : 'repeat'} size={36} />
          <p className="muted">
            {tab === 'history' ? t('txs.empty.history') : t('txs.empty.current')}
          </p>
          {/* État vide actionnable (PRD UI/UX U12) */}
          <div className="row" style={{ justifyContent: 'center', gap: 8 }}>
            <Link to="/"><button className="btn btn-primary btn-sm">{t('txs.empty.browse')}</button></Link>
            <Link to="/envois/nouveau"><button className="btn btn-ghost btn-sm">{t('feed.empty.publish')}</button></Link>
          </div>
        </div>
      )}

      <div className="card-grid">
      {txs?.map((tx) => (
        <Link key={tx.id} to={`/transactions/${tx.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card clickable">
            <div className="list-row">
              <CategoryIcon categoryId={tx.listing?.categoryId} />
              <div className="grow">
                <b>{tx.listing?.title}</b>
                <div className="muted">
                  {t(`txs.role.${tx.myRole}`)}
                  {' · '}{tx.listing?.from} → {tx.listing?.to}
                </div>
                <div className="mt"><StatusPill status={tx.status} /></div>
              </div>
            </div>
          </div>
        </Link>
      ))}
      </div>
    </div>
  );
}
