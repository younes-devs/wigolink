import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { SkeletonCard } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import {
  adminStatus, auditAction, auditField, auditValue, formatAdminDate,
} from './adminPanelUtils.js';
import { AdminKycDocument } from './AdminKycDocument.jsx';

export function MembersPanel({ data, reload }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => {
      void reload({ q: query });
    }, 250);
    return () => clearTimeout(timer);
  }, [query, reload]);
  const users = data?.users || [];
  const deletedCount = users.filter((user) => user.deletedAt).length;
  if (selectedId) return <MemberCaseFile userId={selectedId} onBack={() => setSelectedId(null)} />;
  return <section className="card">
    <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
      <div><h2 style={{ margin: 0 }}>{t('admin.members.files')}</h2><p className="muted" style={{ marginBottom: 0 }}>{t('admin.members.filesHelp')}</p></div>
      <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.members.search')} style={{ maxWidth: 260 }} />
    </div>
    {data && deletedCount > 0 && <p className="muted" style={{ margin: '12px 0 0' }}>{t(deletedCount > 1 ? 'admin.members.deletedCount.plural' : 'admin.members.deletedCount', { count: deletedCount })}</p>}
    <div className="list-stack" style={{ marginTop: 16 }}>
      {users.map((user) => <button type="button" className="list-row admin-member-row" key={user.id} onClick={() => setSelectedId(user.id)}>
        <div className="cat-icon"><Icon name="user" size={20} /></div>
        {user.deletedAt && <span className="pill pill-gray">{t('admin.member.deleted')}</span>}
        <div className="grow"><b>{user.name}</b><div className="muted">{user.email} {user.city ? `· ${user.city}` : ''}</div></div>
        <div className="row"><span className={`pill ${user.kycStatus === 'verified' ? 'pill-teal' : 'pill-gray'}`}>{adminStatus(user.kycStatus || 'none')}</span><Icon name="arrowRight" size={17} /></div>
      </button>)}
      {data && users.length === 0 && <p className="muted center">{t('admin.members.none')}</p>}
    </div>
    {data?.page?.hasMore && <button
      type="button"
      className="btn btn-ghost btn-sm mt"
      disabled={loadingMore}
      onClick={async () => {
        setLoadingMore(true);
        try {
          await reload({
            q: query,
            cursor: data.page.nextCursor,
            append: true,
          });
        } finally {
          setLoadingMore(false);
        }
      }}
    >{loadingMore ? t('common.loading') : t('common.loadMore')}</button>}
  </section>;
}

function MemberCaseFile({ userId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const load = useCallback((cursor = '') => {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    api(`/admin/users/${userId}/case-file?${params}`)
      .then((response) => setData((current) => cursor && current ? {
        ...response.caseFile,
        messages: [...current.messages, ...response.caseFile.messages],
        messagePage: {
          ...response.caseFile.messagePage,
          total: current.messagePage.total,
          conversationTotal: current.messagePage.conversationTotal,
        },
      } : response.caseFile))
      .catch((reason) => setError(reason.message || t('common.load.error')));
  }, [userId]);
  useEffect(() => {
    void api(`/admin/users/${userId}/case-file/access`, { method: 'POST', body: { section: 'overview' } }).catch(() => {});
    load();
  }, [userId, load]);
  if (error) return <div><button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.members.back')}</button><div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div></div>;
  if (!data) return <SkeletonCard lines={5} />;
  const { member } = data;
  return <div className="admin-case-file">
    <button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.members.back')}</button>
    <div className="alert alert-warn"><Icon name="shieldCheck" size={17} /><span>{t('admin.member.auditNotice')}</span></div>
    <section className="card">
      <div className="list-row"><div className="cat-icon"><Icon name="user" size={22} /></div><div className="grow"><h2 style={{ marginBottom: 2 }}>{member.name}</h2><div className="muted">{member.email} · {member.phone || t('admin.member.phoneMissing')}</div></div><span className={`pill ${member.deletedAt ? 'pill-gray' : member.kycStatus === 'verified' ? 'pill-teal' : 'pill-saffron'}`}>{member.deletedAt ? t('admin.member.anonymized') : adminStatus(member.kycStatus)}</span></div>
      <div className="kyc-recap mt"><div><span className="muted">{t('admin.member.city')}</span><b>{member.city || '—'}</b></div><div><span className="muted">{t('admin.member.joined')}</span><b>{formatAdminDate(member.createdAt)}</b></div><div><span className="muted">{t('admin.member.email')}</span><b>{member.emailVerified ? t('common.verified') : t('common.notVerified')}</b></div><div><span className="muted">{t('admin.member.login')}</span><b>{member.provider || 'email'}</b></div></div>
      {member.suspendedUntil && <div className="alert alert-danger mt"><Icon name="alert" size={16} /><span>{t('admin.member.suspendedUntil', { date: formatAdminDate(member.suspendedUntil) })} {member.suspensionReason || ''}</span></div>}
    </section>
    <section className="card"><h2><Icon name="shieldCheck" size={18} />{t('admin.member.kycFile')}</h2>{data.kyc.length === 0 ? <p className="muted mt">{t('admin.member.noKyc')}</p> : data.kyc.map((submission) => <div className="admin-case-kyc" key={submission.id}><div className="list-row"><div className="grow"><b>{submission.legalName || t('admin.member.identityHidden')}</b><div className="muted">{submission.documentType || t('admin.document')} · {formatAdminDate(submission.submittedAt)} · {adminStatus(submission.status)}</div></div></div>{submission.documentsPurged ? <div className="alert alert-warn mt"><Icon name="lock" size={15} /><span>{t('admin.member.kycPurged')}</span></div> : <div className="kyc-review-grid mt"><AdminKycDocument label={t('admin.kyc.selfie')} photo={submission.selfiePhoto} onZoom={setZoom} selfie /><AdminKycDocument label={t('admin.kyc.front')} photo={submission.idFrontPhoto} onZoom={setZoom} />{submission.idBackPhoto && <AdminKycDocument label={t('admin.kyc.back')} photo={submission.idBackPhoto} onZoom={setZoom} />}</div>}</div>)}</section>
    <section className="card"><h2><Icon name="repeat" size={18} />{t('admin.member.activity')}</h2><div className="kyc-recap mt"><div><span className="muted">{t('admin.member.trips')}</span><b>{data.trips.length}</b></div><div><span className="muted">{t('admin.member.listings')}</span><b>{data.listings.length}</b></div><div><span className="muted">{t('admin.member.operations')}</span><b>{data.transactions.length}</b></div><div><span className="muted">{t('admin.member.disputes')}</span><b>{data.disputes.length}</b></div></div><div className="list-stack mt">{data.transactions.map((transaction) => <div className="list-row" key={transaction.id}><div className="grow"><b>{transaction.id}</b><div className="muted">{adminStatus(transaction.status)} · {formatAdminDate(transaction.createdAt)}</div></div><span className="pill pill-gray">{adminStatus(transaction.escrow?.state || 'pending')}</span></div>)}</div></section>
    <section className="card"><h2><Icon name="chat" size={18} />{t('admin.member.conversations')}</h2><p className="muted mt">{t('admin.member.messageSummary', { conversations: data.messagePage.conversationTotal ?? data.conversations.length, messages: data.messagePage.total ?? data.messages.length })}</p><div className="list-stack mt">{data.messages.map((message) => <div className="admin-message-log" key={message.id}><div><b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b><span>{formatAdminDate(message.at)} · {adminStatus(message.type)}</span></div><div className="admin-message-route"><span>{t('admin.member.from')}: <b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b></span><span>{t('admin.member.to')}: <b>{message.to?.map((recipient) => recipient.name || recipient.id).join(', ') || t('admin.member.recipientMissing')}</b></span></div>{message.text && <p>{message.text}</p>}{message.location && <small><Icon name="mapPin" size={13} />{message.location.labelKey ? t(message.location.labelKey) : message.location.label || t('messages.location')} {message.location.city ? `· ${message.location.city}` : ''} · {t(message.location.precision === 'approximate' ? 'messages.location.approximate' : 'messages.location.precise')}</small>}{message.attachments?.length > 0 && <small><Icon name="image" size={13} />{message.attachments.map((attachment) => attachment.name || t('admin.image')).join(', ')}</small>}{message.flagged && <span className="pill pill-danger">{t('admin.member.flagged')}: {message.flagReason || t('admin.member.security')}</span>}</div>)}</div>{data.messagePage.hasMore && <button className="btn btn-sm mt" onClick={() => load(data.messagePage.nextCursor)}>{t('admin.member.loadPrevious')}</button>}</section>
    <AuditHistory logs={data.auditLogs} />
    {zoom && <div className="modal-backdrop" onClick={() => setZoom(null)}><img src={zoom} alt={t('admin.kyc.document')} className="kyc-zoom" onClick={(event) => event.stopPropagation()} /></div>}
  </div>;
}

function AuditHistory({ logs }) {
  return <section className="card">
    <h2><Icon name="clock" size={18} />{t('admin.member.changeHistory')}</h2>
    <div className="list-stack mt">
      {logs.length === 0 ? <p className="muted">{t('admin.member.noAudit')}</p> : logs.map((log) => {
        const changes = log.meta?.changes || [];
        return <div className="admin-audit-log" key={log.id}>
          <div className="admin-audit-head">
            <div><b>{auditAction(log.action)}</b><span>{formatAdminDate(log.at)} · {log.actor?.name || log.actorId || t('admin.system')}</span></div>
            <span className="pill pill-gray">{log.targetType || 'system'}</span>
          </div>
          {changes.length > 0 ? <div className="admin-audit-changes">
            {changes.map((change, index) => <div className="admin-audit-change" key={`${change.field}-${index}`}>
              <b>{auditField(change.field)}</b>
              <span><small>{t('admin.audit.before')}</small>{auditValue(change.before)}</span>
              <Icon name="arrowRight" size={14} />
              <span><small>{t('admin.audit.after')}</small>{auditValue(change.after)}</span>
            </div>)}
          </div> : <p className="muted admin-audit-empty">{t('admin.member.noChanges')}</p>}
        </div>;
      })}
    </div>
  </section>;
}
