import { useState } from 'react';
import { Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import { formatAdminShortDate, opsTaskCopy } from './adminPanelUtils.js';

export function OpsPanel({ ops, error, setTab, reload, onRefund }) {
  const [refundTarget, setRefundTarget] = useState(null);
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

      <section className="ops-section ops-payments">
        <div className="ops-section-head">
          <h2><Icon name="euro" size={17} />{t('admin.payments.title')}</h2>
          <span className="pill pill-gray">{t('admin.payments.count', { count: ops.latest.payments.count })}</span>
        </div>
        <div className="ops-payment-metrics">
          <OpsMetric label={t('admin.payments.charged')} value={formatMoney(ops.latest.payments.chargedCents)} icon="lock" />
          <OpsMetric label={t('admin.payments.gross')} value={formatMoney(ops.latest.payments.grossCents)} icon="euro" />
          <OpsMetric label={t('admin.payments.stripeFees')} value={formatMoney(ops.latest.payments.stripeFeeCents)} icon="fileText" />
          <OpsMetric label={t('admin.payments.net')} value={formatMoney(ops.latest.payments.netCents)} icon="repeat" />
        </div>
        {ops.latest.payments.recent.length === 0 ? (
          <p className="muted ops-payment-empty">{t('admin.payments.empty')}</p>
        ) : (
          <div className="ops-payment-list">
            {ops.latest.payments.recent.map((payment) => (
              <article className="ops-payment-row" key={payment.operationId}>
                <div className="ops-payment-main">
                  <b>{payment.title || t('admin.payments.operation')}</b>
                  <span>{t(`admin.payments.status.${payment.paymentStatus}`)}</span>
                </div>
                <div className="ops-payment-amounts">
                  <span>{t('admin.payments.chargedShort')} <b>{formatMoney(payment.chargedAmountCents, payment.currency)}</b></span>
                  <span>{t('admin.payments.travelerShort')} <b>{formatMoney(payment.travelerTransferCents, payment.currency)}</b></span>
                  <span>{t('admin.payments.netShort')} <b>{formatMoney(payment.platformNetCents, payment.currency)}</b></span>
                </div>
                <div className="ops-payment-meta">
                  {payment.paymentIntentRef && <code>{payment.paymentIntentRef}</code>}
                  <span>{t(`admin.payments.transfer.${payment.transferStatus}`)}</span>
                  {payment.refundable && (
                    <button className="btn btn-danger-ghost btn-sm" type="button" onClick={() => setRefundTarget(payment)}>
                      <Icon name="repeat" size={14} />{t('admin.payments.refund')}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
        {ops.latest.payments.webhooks.length > 0 && (
          <details className="ops-webhooks">
            <summary>{t('admin.payments.webhooks')}</summary>
            <div>
              {ops.latest.payments.webhooks.map((event) => (
                <div className={`ops-webhook-row ${event.status === 'failed' ? 'is-danger' : ''}`} key={`${event.eventRef}-${event.createdAt}`}>
                  <span><b>{event.type}</b><code>{event.eventRef}</code></span>
                  <span>{t(`admin.payments.webhook.${event.status}`)} · {t('admin.payments.attempts', { count: event.attempts })}</span>
                  {event.error && <small>{event.error}</small>}
                </div>
              ))}
            </div>
          </details>
        )}
      </section>

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

      {refundTarget && (
        <RefundDialog
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onConfirm={async (reason) => {
            await onRefund(refundTarget.operationId, reason);
            setRefundTarget(null);
          }}
        />
      )}
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

function RefundDialog({ payment, onClose, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (reason.trim().length < 5) return;
    setBusy(true);
    try {
      await onConfirm(reason.trim());
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal admin-refund-modal" role="dialog" aria-modal="true" aria-labelledby="admin-refund-title" onClick={(event) => event.stopPropagation()}>
        <div className="confirm-icon confirm-icon-danger"><Icon name="repeat" size={22} /></div>
        <h2 id="admin-refund-title" className="confirm-title">{t('admin.payments.refundTitle')}</h2>
        <p className="confirm-message">{t('admin.payments.refundMessage', { amount: formatMoney(payment.chargedAmountCents, payment.currency) })}</p>
        <label className="field">
          <span>{t('admin.payments.refundReason')}</span>
          <textarea rows={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('admin.payments.refundReasonPlaceholder')} />
        </label>
        <div className="confirm-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>{t('common.cancel')}</button>
          <button className="btn btn-danger" type="button" onClick={submit} disabled={busy || reason.trim().length < 5}>
            {busy ? <span className="spinner" /> : <Icon name="repeat" size={15} />}{t('admin.payments.refundConfirm')}
          </button>
        </div>
      </div>
    </div>
  );
}

function formatMoney(cents, currency = 'EUR') {
  return new Intl.NumberFormat(document.documentElement.lang || 'fr', {
    style: 'currency',
    currency,
  }).format(Number(cents || 0) / 100);
}
