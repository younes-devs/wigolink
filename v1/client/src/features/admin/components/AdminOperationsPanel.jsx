import { useState } from 'react';
import { Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import { MANUAL_PAYOUT_COUNTRIES } from '../../../../../shared/manual-payout-countries.js';
import { opsTaskCopy } from './adminPanelUtils.js';

export function OpsPanel({
  ops, error, setTab, reload, manualPayouts, manualPayoutPage, manualPayoutsLoaded,
  manualPayoutCounts, payoutCountry, loadManualPayouts, loadPayments, onManualPayout,
  onRefund, section, onSectionChange, onPayoutCountryChange,
}) {
  const [refundTarget, setRefundTarget] = useState(null);
  const [loadingSection, setLoadingSection] = useState('');
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
  const openSection = async (nextSection) => {
    onSectionChange(nextSection);
    if (nextSection === 'overview') return;
    setLoadingSection(nextSection);
    try {
      if (nextSection === 'payments') await loadPayments();
    } finally {
      setLoadingSection('');
    }
  };

  return (
    <div className="ops-panel">
      <div className={`ops-hero ops-${ops.health.status}`}>
        <div>
          <h2>{statusCopy[0]}</h2>
          <p>{statusCopy[1]}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => reload(section)}><Icon name="repeat" size={15} />{t('common.refresh')}</button>
      </div>

      <div className="ops-metrics">
        <OpsMetric label={t('admin.ops.reviewOpen')} value={ops.health.reviewOpen} icon="fileText" />
        <OpsMetric label={t('admin.ops.kycOverdue')} value={ops.health.kycOverdue} icon="clock" danger={ops.health.kycOverdue > 0} />
        <OpsMetric label={t('admin.ops.openDisputes')} value={ops.health.openDisputes} icon="alert" danger={ops.health.openDisputes > 0} />
        <OpsMetric label={t('admin.ops.escrowHeld')} value={`${Math.round(ops.health.escrowHeld)} €`} icon="lock" />
      </div>

      <nav className="ops-area-grid" aria-label={t('admin.ops.sections')}>
        <OpsArea icon="repeat" label={t('admin.ops.overview')} active={section === 'overview'} onClick={() => openSection('overview')} />
        <OpsArea icon="bank" label={t('admin.payouts.title')} active={section === 'payouts'} loading={loadingSection === 'payouts'} onClick={() => openSection('payouts')} />
        <OpsArea icon="euro" label={t('admin.payments.title')} active={section === 'payments'} loading={loadingSection === 'payments'} onClick={() => openSection('payments')} />
      </nav>

      {section === 'payments' && <section className="ops-section ops-payments">
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
      </section>}

      {section === 'payouts' && (!manualPayoutsLoaded
        ? <SkeletonList count={3} avatar={false} lines={3} />
        : <ManualPayoutQueue
            requests={manualPayouts}
            counts={manualPayoutCounts}
            country={payoutCountry}
            page={manualPayoutPage}
            onCountryChange={onPayoutCountryChange}
            onLoadMore={() => loadManualPayouts({ country: payoutCountry, cursor: manualPayoutPage.nextCursor, append: true })}
            onConfirm={onManualPayout}
          />)}

      {section === 'overview' && <>
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

      </>}

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

function OpsArea({ icon, label, active, loading, onClick }) {
  return <button type="button" className={`ops-area ${active ? 'active' : ''}`} onClick={onClick}>
    <span>{loading ? <span className="spinner" /> : <Icon name={icon} size={19} />}</span>
    <b>{label}</b>
    <Icon name="arrowRight" size={16} />
  </button>;
}

function ManualPayoutQueue({ requests = [], counts = {}, country, page, onCountryChange, onLoadMore, onConfirm }) {
  const [references, setReferences] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const pending = requests.filter((request) => request.status !== 'sent');
  const submit = async (request) => {
    const reference = String(references[request.operationId] || '').trim();
    if (reference.length < 4) return;
    setBusyId(request.operationId);
    try {
      await onConfirm(request.operationId, reference);
    } finally {
      setBusyId(null);
    }
  };
  if (!country) return <section className="ops-section ops-manual-payouts">
    <div className="ops-section-head">
      <h2><Icon name="bank" size={17} />{t('admin.payouts.title')}</h2>
      <span className="pill pill-gray">{Object.values(counts).reduce((total, value) => total + Number(value || 0), 0)}</span>
    </div>
    <p className="muted ops-payout-intro">{t('admin.payouts.intro')}</p>
    <div className="ops-payout-countries">
      {MANUAL_PAYOUT_COUNTRIES.map((code) => <button type="button" className="ops-payout-country" key={code} onClick={() => onCountryChange(code)}>
        <span><Icon name="bank" size={20} /></span>
        <div><b>{t(`admin.payouts.country.${code}`)}</b><small>{t('admin.payouts.country.requests', { count: Number(counts[code] || 0) })}</small></div>
        <Icon name="arrowRight" size={18} />
      </button>)}
    </div>
  </section>;

  return <section className="ops-section ops-manual-payouts">
    <button type="button" className="ops-payout-back" onClick={() => onCountryChange('')}><Icon name="arrowLeft" size={17} />{t('admin.payouts.country.back')}</button>
    <div className="ops-section-head ops-payout-country-head">
      <h2><Icon name="bank" size={17} />{t(`admin.payouts.country.${country}`)}</h2>
      <span className="pill pill-gray">{Number(counts[country] || 0)}</span>
    </div>
    <p className="muted ops-payout-intro">{t('admin.payouts.country.intro', { country: t(`admin.payouts.country.${country}`) })}</p>
    {pending.length === 0 ? <div className="ops-payout-empty"><Icon name="check" size={18} />{t('admin.payouts.empty')}</div> : <div className="ops-payout-list">
      {pending.map((request) => <article className="ops-payout-row" key={request.operationId}>
        <div className="ops-payout-summary">
          <div><b>{request.traveler?.name || t('admin.payouts.traveler')}</b><span>{request.traveler?.email}</span></div>
          <strong>{formatMoney(request.amountCents, request.currency)}</strong>
        </div>
        <div className="ops-payout-context">
          <span><Icon name="plane" size={14} />{request.route || t('admin.payments.operation')}</span>
          <span className="pill pill-success">{t('admin.payouts.kycVerified')}</span>
        </div>
        <dl className="ops-bank-details">
          <div><dt>{t('admin.payouts.holder')}</dt><dd>{request.bank.holderName}</dd></div>
          <div><dt>{t('admin.payouts.bank')}</dt><dd>{request.bank.bankName} · {request.bank.country}</dd></div>
          <div><dt>{t(request.bank.country === 'MA' ? 'admin.payouts.rib' : 'admin.payouts.iban')}</dt><dd className="ops-bank-number">{request.bank.accountIdentifier}</dd></div>
          {request.bank.bic && <div><dt>{t('admin.payouts.bic')}</dt><dd>{request.bank.bic}</dd></div>}
          {request.bank.phone && <div><dt>{t('admin.payouts.phone')}</dt><dd>{request.bank.phone}</dd></div>}
        </dl>
        <div className="ops-payout-confirm">
          <label className="field"><span>{t('admin.payouts.reference')}</span><input value={references[request.operationId] || ''} maxLength={120} onChange={(event) => setReferences((current) => ({ ...current, [request.operationId]: event.target.value }))} placeholder={t('admin.payouts.referencePlaceholder')} /></label>
          <button className="btn btn-primary" type="button" disabled={busyId === request.operationId || String(references[request.operationId] || '').trim().length < 4} onClick={() => submit(request)}>{busyId === request.operationId ? <span className="spinner" /> : <Icon name="check" size={16} />}{t('admin.payouts.markSent')}</button>
        </div>
      </article>)}
    </div>}
    {page?.hasMore && <button className="btn btn-ghost ops-load-more" type="button" disabled={loadingMore} onClick={async () => {
      setLoadingMore(true);
      try { await onLoadMore(); } finally { setLoadingMore(false); }
    }}>{loadingMore ? <span className="spinner" /> : <Icon name="chevronDown" size={16} />}{t('common.loadMore')}</button>}
  </section>;
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
