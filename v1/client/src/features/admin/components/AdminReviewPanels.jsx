import { useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { ConfirmDialog } from '../../../components.jsx';
import { dateLocale, t } from '../../../i18n.js';
import { conversationContextLabel, safetyCategoryLabel } from './adminPanelUtils.js';

export function ListingReviewCard({ item, decide }) {
  const [maxQty, setMaxQty] = useState('');
  const [approving, setApproving] = useState(false);

  return (
    <>
      <span className="pill pill-saffron mb"><Icon name="alert" size={13} />{t('admin.review.grayZone')} — {item.listing.categoryLabel}</span>
      <div className="mt"><b>{item.listing.title}</b></div>
      <div className="muted mb" style={{ fontSize: 13 }}>{item.listing.description} · {item.listing.valueEur} €</div>

      {!approving ? (
        <div className="row">
          <button className="btn btn-teal btn-sm" onClick={() => setApproving(true)}>
            <Icon name="check" size={15} />{t('common.publish')}
          </button>
          <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'reject')}>
            <Icon name="x" size={15} />{t('common.reject')}
          </button>
        </div>
      ) : (
        <div className="mt">
          <div className="field">
            <label>{t('admin.review.maxQuantity', { category: item.listing.categoryLabel })}</label>
            <input value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder={t('admin.review.maxQuantityExample')} autoFocus />
            <div className="hint">
              {t('admin.review.whitelistHelp')}
            </div>
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => setApproving(false)}>{t('common.cancel')}</button>
            <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'approve', { maxQty })} disabled={!maxQty.trim()}>
              <Icon name="check" size={15} />{t('admin.review.approvePromote')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export function ConversationReviewCard({ item, decide }) {
  const c = item.conversation;
  const people = (c.participants || []).map((p) => p.name).filter(Boolean).join(' ↔ ');
  const latestReport = c.reports?.[0];
  return (
    <>
      <span className="pill pill-danger mb"><Icon name="alert" size={13} />{t('admin.review.flaggedConversation')}</span>
      <div className="mt"><b>{people || c.id}</b></div>
      <div className="muted mb" style={{ fontSize: 13 }}>
        {conversationContextLabel(c.context?.type, c.context?.label)}{c.context?.detail ? ` · ${c.context.detail}` : ''} · {t('admin.review.reportCount', { count: c.reportCount })}
      </div>

      {latestReport && (
        <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
          <Icon name="alert" size={16} />
          <span>
            <b>{t('admin.reason')}:</b> {reportReasonLabel(latestReport.reasonCode)} · {latestReport.reason}
            {latestReport.comment ? <><br /><b>{t('admin.comment')}:</b> {latestReport.comment}</> : null}
          </span>
        </div>
      )}

      {(c.safetyIncidents || []).length > 0 && (
        <div className="alert alert-danger" style={{ fontSize: 12.5 }}>
          <Icon name="shieldCheck" size={16} />
          <span><b>{t('admin.review.blockedAttempts', { count: c.safetyIncidents.length })}:</b> {c.safetyIncidents.slice(0, 3).map((incident) => `${incident.user?.name || t('admin.account')} (${incident.categories.map(safetyCategoryLabel).join(', ')})`).join(' · ')}</span>
        </div>
      )}

      <div className="admin-message-review">
        {(c.messages || []).length === 0 ? (
          <p className="muted">{t('admin.review.noRecentMessages')}</p>
        ) : c.messages.map((message) => (
          <div className={`admin-message-line ${message.flagged || message.type === 'warning' ? 'is-warning' : ''}`} key={message.id}>
            <small>{message.fromUser?.name || t('admin.system')} · {new Date(message.at).toLocaleString(dateLocale())}</small>
            <p>{message.text || (message.attachments?.length ? t('admin.attachment') : t('admin.review.messageWithoutText'))}</p>
          </div>
        ))}
      </div>

      <div className="row">
        <button className="btn btn-ghost btn-sm" onClick={() => decide(item.id, 'conversation_dismissed')}>
          <Icon name="check" size={15} />{t('admin.review.dismiss')}
        </button>
        <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'conversation_watch')}>
          <Icon name="alert" size={15} />{t('admin.review.watch')}
        </button>
      </div>
    </>
  );
}

function reportReasonLabel(code) {
  return {
    external_payment: t('admin.report.externalPayment'),
    abuse: t('admin.report.abuse'),
    suspicious: t('admin.report.suspicious'),
    off_platform: t('admin.report.offPlatform'),
    other: t('common.other'),
  }[code] || t('common.other');
}

export function CategoriesPanel({ customWhitelist, reload }) {
  const [confirming, setConfirming] = useState(null);
  const remove = async (id) => {
    await api(`/admin/whitelist/${id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <div>
      <div className="alert alert-teal">
        <Icon name="fileText" size={17} />
        <span>
          {t('admin.categories.help')}
        </span>
      </div>
      {customWhitelist.length === 0 && (
        <div className="card center empty-state">
          <Icon name="package" size={32} />
          <p className="muted">{t('admin.categories.none')}</p>
        </div>
      )}
      {customWhitelist.map((c) => (
        <div className="card" key={c.id}>
          <div className="list-row">
            <div className="grow">
              <b>{c.label}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {t('admin.categories.item', { max: c.maxQty, date: new Date(c.addedAt).toLocaleDateString(dateLocale()), listing: c.addedFrom })}
              </div>
            </div>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirming(c.id)}>{t('common.remove')}</button>
          </div>
        </div>
      ))}
      {confirming && (
        <ConfirmDialog
          title={t('admin.categories.removeTitle')}
          message={t('admin.categories.removeMessage')}
          confirmLabel={t('common.remove')} danger icon="trash"
          onConfirm={() => remove(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

// ---------- Vérification d'identité (KYC manuel) ----------
