import { useEffect, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import { adminStatus, formatPercent } from './adminPanelUtils.js';

export function KpiPanel() {
  const [d, setD] = useState(null);

  useEffect(() => { api('/admin/kpis').then(setD); }, []);

  if (!d) return <SkeletonList count={4} avatar={false} lines={1} />;
  const { kpis, totals } = d;

  return (
    <div>
      <div className="alert alert-teal">
        <Icon name="fileText" size={17} />
        <span>
          {t('admin.kpi.help', { transactions: totals.transactions, users: totals.users })}
        </span>
      </div>

      <KpiCard
        title={t('admin.kpi.transactionsMonth')} icon="repeat"
        value={`${kpis.transactionsPerMonth.value}`} targetLabel={t('admin.kpi.targetMonthly')}
        status={kpiStatus(kpis.transactionsPerMonth)}
      >
        <div className="kpi-bars">
          {kpis.transactionsPerMonth.monthly.map((m, i) => {
            const max = Math.max(1, ...kpis.transactionsPerMonth.monthly.map((x) => x.count));
            return (
              <div className="kpi-bar-col" key={i}>
                <div className="kpi-bar" style={{ height: `${Math.max(4, (m.count / max) * 56)}px` }} title={`${m.count}`} />
                <span>{m.label}</span>
              </div>
            );
          })}
        </div>
      </KpiCard>

      <KpiCard
        title={t('admin.kpi.disputeRate')} icon="alert"
        value={formatPercent(kpis.disputeRate.value)} targetLabel={t('admin.kpi.targetDispute')}
        status={kpiStatus(kpis.disputeRate)}
      />

      <KpiCard
        title={t('admin.kpi.resolution')} icon="clock"
        value={kpis.resolutionRate.value === null ? '—' : formatPercent(kpis.resolutionRate.value)}
        targetLabel={t('admin.kpi.targetResolution', { count: kpis.resolutionRate.sampleSize })}
        status={kpiStatus(kpis.resolutionRate)}
      />

      <KpiCard
        title={t('admin.kpi.recurring')} icon="star"
        value={formatPercent(kpis.recurringTravelers.value)}
        targetLabel={t('admin.kpi.targetRecurring', { count: kpis.recurringTravelers.sampleSize })}
        status={kpiStatus(kpis.recurringTravelers)}
      />

      <KpiCard
        title={t('admin.kpi.desintermediation')} icon="chat"
        value={formatPercent(kpis.desintermediationRate.value)}
        targetLabel={t('admin.kpi.targetDesintermediation', { count: kpis.desintermediationRate.sampleSize })}
        status={kpiStatus(kpis.desintermediationRate)}
      />

      <KpiCard
        title={t('admin.kpi.matchTime')} icon="clock"
        value={kpis.avgMatchHours.value === null ? '—' : `${Math.round(kpis.avgMatchHours.value)} h`}
        targetLabel={t('admin.kpi.targetMatch')}
        status={kpiStatus(kpis.avgMatchHours)}
      />

      <KpiCard title="NPS" icon="star" value="—" targetLabel={t('admin.kpi.targetNps')} status="nodata">
        <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>{kpis.nps.note}</p>
      </KpiCard>
    </div>
  );
}

function kpiStatus(k) {
  if (k.value === null || k.value === undefined) return 'nodata';
  if (k.sampleSize !== undefined && k.sampleSize < 5) return 'nodata';
  const onTarget = k.direction === 'above' ? k.value >= k.target : k.value <= k.target;
  return onTarget ? 'good' : 'bad';
}

function KpiCard({ title, icon, value, targetLabel, status, children }) {
  const dot = { good: 'kpi-dot-good', bad: 'kpi-dot-bad', nodata: 'kpi-dot-nodata' }[status];
  return (
    <div className="card kpi-card">
      <div className="list-row">
        <span className={`kpi-dot ${dot}`} />
        <div className="grow">
          <div className="kpi-title"><Icon name={icon} size={14} />{title}</div>
          <div className="kpi-target">{targetLabel}</div>
        </div>
        <div className="kpi-value">{value}</div>
      </div>
      {children}
    </div>
  );
}

// ---------- Dashboard fraude (PRD §4.7) ----------
function FraudSection({ icon, title, help, empty, children, count }) {
  return (
    <div className="card">
      <div className="list-row mb" style={{ alignItems: 'flex-start' }}>
        <div className="grow">
          <h2 style={{ marginBottom: 2 }}><Icon name={icon} size={17} />{title}</h2>
          <p className="muted" style={{ fontSize: 12.5 }}>{help}</p>
        </div>
        {count > 0 && <span className="pill pill-saffron">{count}</span>}
      </div>
      {count === 0 ? <p className="muted" style={{ fontSize: 13 }}>{empty}</p> : children}
    </div>
  );
}

export function FraudPanel({ data: d, error, reload }) {
  if (error) {
    return (
      <div className="alert alert-danger">
        <Icon name="alert" size={17} />{error}
        <button className="link-btn" style={{ marginLeft: 8 }} onClick={reload}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!d) return <SkeletonList count={4} avatar={false} lines={2} />;

  return (
    <div>
      <div className="alert alert-warn">
        <Icon name="alert" size={17} />
        <span>
          {t('admin.fraud.notice')}
        </span>
      </div>

      <FraudSection icon="user" title={t('admin.fraud.linkedTitle')} count={d.linkedAccounts.length}
        help={t('admin.fraud.linkedHelp')}
        empty={t('admin.fraud.linkedEmpty')}>
        {d.linkedAccounts.map((g, i) => (
          <div className="list-row" key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
            <div className="grow">
              <span className="pill pill-gray mb" style={{ fontSize: 11 }}>{g.signal === 'phone' ? t('admin.phone') : 'IP'} : {g.value}</span>
              <div style={{ fontSize: 13 }}>
                {g.users.map((u) => <div key={u.id}>{u.name} — {u.email}</div>)}
              </div>
            </div>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="repeat" title={t('admin.fraud.pairsTitle')} count={d.repeatPairs.length}
        help={t('admin.fraud.pairsHelp')}
        empty={t('admin.fraud.pairsEmpty')}>
        {d.repeatPairs.map((p, i) => (
          <div className="list-row" key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
            <div className="grow" style={{ fontSize: 13 }}>
              <b>{p.users.map((u) => u.name).join(' ↔ ')}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {t('admin.fraud.transactionTotal', { count: p.transactionCount, value: p.totalValueEur })}
                {p.disputedCount > 0 ? ` · ${t('admin.fraud.disputeCount', { count: p.disputedCount })}` : ''}
              </div>
            </div>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="chat" title={t('admin.fraud.offPlatformTitle')} count={d.flaggedMessaging.length}
        help={t('admin.fraud.offPlatformHelp')}
        empty={t('admin.fraud.offPlatformEmpty')}>
        {d.flaggedMessaging.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name}</div>
            <span className="pill pill-danger">{t('admin.fraud.messageCount', { count: u.count })}</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="alert" title={t('admin.fraud.cancelTitle')} count={d.abnormalCancel.length}
        help={t('admin.fraud.cancelHelp')}
        empty={t('admin.fraud.cancelEmpty')}>
        {d.abnormalCancel.map((u) => (
          <div className="list-row" key={u.id}>
            <div className="grow">{u.name} <span className="muted" style={{ fontSize: 12 }}>({t('admin.fraud.transactionCount', { count: u.completed })})</span></div>
            <span className="pill pill-danger">{formatPercent(u.cancelRate)}</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="fileText" title={t('admin.fraud.disputesTitle')} count={d.disputeProne.length}
        help={t('admin.fraud.disputesHelp')}
        empty={t('admin.fraud.disputesEmpty')}>
        {d.disputeProne.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name}</div>
            <span className="pill pill-saffron">{t('admin.fraud.disputeCount', { count: u.disputeCount })}</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="shieldCheck" title={t('admin.fraud.kycTitle')} count={d.kycRepeatRejections.length}
        help={t('admin.fraud.kycHelp')}
        empty={t('admin.fraud.kycEmpty')}>
        {d.kycRepeatRejections.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name} <span className="muted" style={{ fontSize: 12 }}>({t('admin.fraud.currentStatus', { status: adminStatus(u.currentStatus) })})</span></div>
            <span className="pill pill-danger">{t('admin.fraud.rejectCount', { count: u.rejectionCount })}</span>
          </div>
        ))}
      </FraudSection>
    </div>
  );
}
