import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { StatusPill } from '../components.jsx';
import { Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { t, useLang } from '../i18n.js';

const money = (n) => `${Math.round((Number(n) || 0) * 100) / 100} €`;

export default function FinanceCenter() {
  useLang();
  const [finance, setFinance] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api('/finance-center').then((d) => setFinance(d.finance));
  }, []);

  const rows = finance?.rows || [];
  const visibleRows = rows.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'risk') return r.dispute?.status === 'open' || r.transaction.escrow?.state === 'frozen';
    return r.transaction.escrow?.state === filter;
  });

  return (
    <div className="finance-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('finance.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('finance.sub')}</p>
        </div>
        <Link to="/transactions" className="btn btn-ghost btn-sm"><Icon name="repeat" size={15} />{t('finance.transactions')}</Link>
      </div>

      {!finance && <SkeletonList count={3} />}
      {finance && (
        <>
          <section className="finance-hero">
            <FinanceMetric icon="lock" label={t('finance.metric.held')} value={money(finance.totals.held)} />
            <FinanceMetric icon="alert" label={t('finance.metric.frozen')} value={money(finance.totals.frozen)} danger={finance.totals.frozen > 0} />
            <FinanceMetric icon="euro" label={t('finance.metric.released')} value={money(finance.totals.releasedToMe)} />
            <FinanceMetric icon="shield" label={t('finance.metric.refunded')} value={money(finance.totals.refundedToMe)} />
          </section>

          {finance.actions?.length > 0 && (
            <section className="finance-actions">
              <div className="section-head">
                <h2>{t('finance.actions.title')}</h2>
                <span>{finance.counts.openDisputes} {t('finance.actions.disputes')}</span>
              </div>
              <div className="finance-action-list">
                {finance.actions.map((a) => (
                  <Link to={a.action.href} className={`finance-action ${a.action.priority}`} key={a.id}>
                    <Icon name={a.action.priority === 'high' ? 'alert' : 'clock'} size={17} />
                    <div className="grow">
                      <b>{t(`finance.action.${a.action.id}`)}</b>
                      <span>{a.title}</span>
                    </div>
                    <Icon name="arrowRight" size={16} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <div className="tabs finance-tabs">
            {['all', 'held', 'frozen', 'released', 'risk'].map((id) => (
              <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
                {t(`finance.filter.${id}`)}
              </button>
            ))}
          </div>

          {visibleRows.length === 0 && (
            <div className="card center empty-state">
              <Icon name="euro" size={36} />
              <p className="muted">{t('finance.empty')}</p>
            </div>
          )}

          <div className="finance-ledger">
            {visibleRows.map((r) => <FinanceRow row={r} key={r.transaction.id} />)}
          </div>
        </>
      )}
    </div>
  );
}

function FinanceMetric({ icon, label, value, danger = false }) {
  return (
    <div className={`finance-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function FinanceRow({ row }) {
  const tx = row.transaction;
  const escrow = tx.escrow || {};
  return (
    <Link to={`/transactions/${tx.id}`} className={`finance-row ${escrow.state === 'frozen' ? 'frozen' : ''}`}>
      <div className="finance-row-main">
        <div>
          <b>{row.listing?.title || tx.id}</b>
          <span>{t(`finance.role.${row.role}`)} · {t(`finance.escrow.${escrow.state}`)}</span>
        </div>
        <StatusPill status={tx.status} />
      </div>
      <div className="finance-row-money">
        <span>{t('finance.row.amount')} <b>{money(escrow.amount)}</b></span>
        <span>{t('finance.row.traveler')} <b>{money(escrow.travelerPay)}</b></span>
        <span>{t('finance.row.commission')} <b>{money(escrow.commission)}</b></span>
      </div>
      {row.dispute && (
        <div className="finance-dispute">
          <Icon name="alert" size={15} />
          <span>{t('finance.dispute.open')} · {t('finance.dispute.deadline', { date: new Date(row.dispute.evidenceDeadline).toLocaleDateString() })}</span>
        </div>
      )}
    </Link>
  );
}
