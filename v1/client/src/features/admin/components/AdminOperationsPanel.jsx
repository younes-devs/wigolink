import { Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import { formatAdminShortDate, opsTaskCopy } from './adminPanelUtils.js';

export function OpsPanel({ ops, error, setTab, reload }) {
  if (error) {
    return (
      <div className="alert alert-danger">
        <Icon name="alert" size={17} />{error}
        <button className="link-btn" style={{ marginLeft: 8 }} onClick={reload}>{t('common.retry')}</button>
      </div>
    );
  }
  if (!ops) return <SkeletonList count={4} avatar={false} lines={2} />;

  const statusCopy = {
    clear: [t('admin.ops.clear'), t('admin.ops.clearHelp')],
    watch: [t('admin.ops.watch'), t('admin.ops.watchHelp')],
    critical: [t('admin.ops.critical'), t('admin.ops.criticalHelp')],
  }[ops.health.status] || [t('admin.tab.operations'), t('admin.ops.currentState')];

  return (
    <div className="ops-panel">
      <div className={`ops-hero ops-${ops.health.status}`}>
        <div>
          <h2>{statusCopy[0]}</h2>
          <p>{statusCopy[1]}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={reload}><Icon name="repeat" size={15} />{t('common.refresh')}</button>
      </div>

      <div className="ops-metrics">
        <OpsMetric label={t('admin.ops.reviewOpen')} value={ops.health.reviewOpen} icon="fileText" />
        <OpsMetric label={t('admin.ops.kycOverdue')} value={ops.health.kycOverdue} icon="clock" danger={ops.health.kycOverdue > 0} />
        <OpsMetric label={t('admin.ops.openDisputes')} value={ops.health.openDisputes} icon="alert" danger={ops.health.openDisputes > 0} />
        <OpsMetric label={t('admin.ops.escrowHeld')} value={`${Math.round(ops.health.escrowHeld)} €`} icon="lock" />
      </div>

      <div className="ops-task-grid">
        {ops.tasks.map((task) => (
          <button key={task.id} className={`ops-task ops-${task.severity}`} onClick={() => setTab(task.tab)}>
            <span className="ops-task-count">{task.count}</span>
            <span className="grow">
              <b>{opsTaskCopy(task.id, 'title', task.title)}</b>
              <small>{opsTaskCopy(task.id, 'body', task.body)}</small>
            </span>
            <Icon name="arrowRight" size={16} />
          </button>
        ))}
      </div>

      <div className="ops-grid">
        <section className="ops-section">
          <div className="ops-section-head">
            <h2><Icon name="fileText" size={17} />{t('admin.ops.latestCases')}</h2>
            <button className="link-btn" onClick={() => setTab('review')}>{t('common.open')}</button>
          </div>
          {ops.latest.reviewQueue.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>{t('admin.ops.noReview')}</p>
          ) : ops.latest.reviewQueue.map((item) => (
            <button key={item.id} className="ops-row" onClick={() => setTab('review')}>
              <Icon name={item.type === 'dispute' ? 'alert' : item.type === 'conversation' ? 'chat' : 'package'} size={16} />
              <span className="grow">
                <b>{t(item.type === 'dispute' ? 'admin.review.dispute' : item.type === 'conversation' ? 'admin.review.flaggedConversation' : 'admin.review.grayListing')}</b>
                <small>{item.label || item.refId}</small>
              </span>
              <small>{formatAdminShortDate(item.createdAt)}</small>
            </button>
          ))}
        </section>

        <section className="ops-section">
          <div className="ops-section-head">
            <h2><Icon name="shieldCheck" size={17} />{t('admin.ops.identitiesToCheck')}</h2>
            <button className="link-btn" onClick={() => setTab('kyc')}>{t('common.open')}</button>
          </div>
          {ops.latest.kyc.length === 0 ? (
            <p className="muted" style={{ fontSize: 13 }}>{t('admin.ops.noPendingKyc')}</p>
          ) : ops.latest.kyc.map((item) => (
            <button key={item.id} className={`ops-row ${item.overdue ? 'is-danger' : ''}`} onClick={() => setTab('kyc')}>
              <Icon name={item.overdue ? 'alert' : 'user'} size={16} />
              <span className="grow">
                <b>{item.legalName}</b>
                <small>{item.user?.email || item.user?.name}</small>
              </span>
              <small>{formatAdminShortDate(item.submittedAt)}</small>
            </button>
          ))}
        </section>
      </div>

      <section className="ops-section">
        <div className="ops-section-head">
          <h2><Icon name="alert" size={17} />{t('admin.ops.riskSignals')}</h2>
          <button className="link-btn" onClick={() => setTab('fraud')}>{t('admin.ops.analyze')}</button>
        </div>
        <div className="ops-risk-list">
          <RiskPill label={t('admin.risk.linked')} value={ops.risk.linkedAccounts} />
          <RiskPill label={t('admin.risk.repeatedPairs')} value={ops.risk.repeatPairs} />
          <RiskPill label={t('admin.risk.offPlatform')} value={ops.risk.flaggedMessaging} />
          <RiskPill label={t('admin.risk.cancellations')} value={ops.risk.abnormalCancel} />
          <RiskPill label={t('admin.risk.repeatedDisputes')} value={ops.risk.disputeProne} />
          <RiskPill label={t('admin.risk.repeatedKyc')} value={ops.risk.kycRepeatRejections} />
        </div>
      </section>
    </div>
  );
}

function OpsMetric({ icon, value, label, danger = false }) {
  return (
    <div className={`ops-metric ${danger ? 'is-danger' : ''}`}>
      <Icon name={icon} size={17} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function RiskPill({ label, value }) {
  return <span className={`ops-risk-pill ${value > 0 ? 'on' : ''}`}><b>{value}</b>{label}</span>;
}
