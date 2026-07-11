import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusPill } from '../components.jsx';
import { CategoryIcon, Icon } from '../Icons.jsx';

export default function Transactions() {
  const [txs, setTxs] = useState(null);

  useEffect(() => {
    api('/transactions').then((d) => setTxs(d.transactions));
  }, []);

  return (
    <div>
      <h1 className="page-title">Transactions en cours</h1>
      <p className="page-sub">Chaque étape exige la validation des deux parties.</p>

      {txs === null && <div className="muted center">Chargement…</div>}
      {txs?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="repeat" size={36} />
          <p className="muted">Aucune transaction. Acceptez une annonce ou publiez un envoi.</p>
        </div>
      )}

      {txs?.map((t) => (
        <Link key={t.id} to={`/transactions/${t.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
          <div className="card clickable">
            <div className="list-row">
              <CategoryIcon categoryId={t.listing?.categoryId} />
              <div className="grow">
                <b>{t.listing?.title}</b>
                <div className="muted">
                  {t.myRole === 'sender' ? 'Vous expédiez' : t.myRole === 'traveler' ? 'Vous transportez' : 'Vous recevez'}
                  {' · '}{t.listing?.from} → {t.listing?.to}
                </div>
                <div className="mt"><StatusPill status={t.status} /></div>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
