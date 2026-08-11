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
    const timer = setTimeout(() => { void reload({ q: query }); }, 250);
    return () => clearTimeout(timer);
  }, [query, reload]);

  const users = data?.users || [];
  const deletedCount = users.filter((user) => user.deletedAt).length;
  if (selectedId) return <MemberCaseFile userId={selectedId} onBack={() => setSelectedId(null)} />;

  return <section className="card admin-members-card">
    <div className="admin-members-head">
      <div><h2>{t('admin.members.files')}</h2><p className="muted">{t('admin.members.filesHelp')}</p></div>
      <input className="chat-input admin-member-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.members.search')} aria-label={t('admin.members.search')} />
    </div>
    {data && deletedCount > 0 && <p className="muted" style={{ margin: '12px 0 0' }}>{t(deletedCount > 1 ? 'admin.members.deletedCount.plural' : 'admin.members.deletedCount', { count: deletedCount })}</p>}
    <div className="list-stack" style={{ marginTop: 16 }}>
      {users.map((user) => <button type="button" className="list-row admin-member-row" key={user.id} onClick={() => setSelectedId(user.id)}>
        <div className="cat-icon"><Icon name="user" size={20} /></div>
        <div className="admin-member-identity"><b title={user.name}>{user.name}</b><div className="muted" title={`${user.email}${user.city ? ` - ${user.city}` : ''}`}>{user.email} {user.city ? `- ${user.city}` : ''}</div></div>
        <div className="admin-member-status"><span className={`pill ${user.deletedAt ? 'pill-gray' : user.kycStatus === 'verified' ? 'pill-teal' : 'pill-gray'}`}>{user.deletedAt ? t('admin.member.deleted') : adminStatus(user.kycStatus || 'none')}</span><Icon name="arrowRight" size={17} /></div>
      </button>)}
      {data && users.length === 0 && <p className="muted center">{t('admin.members.none')}</p>}
    </div>
    {data?.page?.hasMore && <button type="button" className="btn btn-ghost btn-sm mt" disabled={loadingMore} onClick={async () => {
      setLoadingMore(true);
      try { await reload({ q: query, cursor: data.page.nextCursor, append: true }); } finally { setLoadingMore(false); }
    }}>{loadingMore ? t('common.loading') : t('common.loadMore')}</button>}
  </section>;
}

function MemberCaseFile({ userId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const [section, setSection] = useState('overview');

  const load = useCallback((cursor = '') => {
    const params = new URLSearchParams({ limit: '50' });
    if (cursor) params.set('cursor', cursor);
    api(`/admin/users/${userId}/case-file?${params}`)
      .then((response) => setData((current) => cursor && current ? {
        ...response.caseFile,
        messages: [...current.messages, ...response.caseFile.messages],
        messagePage: { ...response.caseFile.messagePage, total: current.messagePage.total, conversationTotal: current.messagePage.conversationTotal },
      } : response.caseFile))
      .catch((reason) => setError(reason.message || t('common.load.error')));
  }, [userId]);

  useEffect(() => { load(); }, [userId, load]);
  useEffect(() => {
    void api(`/admin/users/${userId}/case-file/access`, { method: 'POST', body: { section } }).catch(() => {});
  }, [userId, section]);

  if (error) return <div><button className="link-btn back-btn" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.members.back')}</button><div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div></div>;
  if (!data) return <SkeletonCard lines={5} />;
  const { member } = data;

  return <div className="admin-case-file">
    <button className="link-btn back-btn" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.members.back')}</button>
    <div className="alert alert-warn"><Icon name="shieldCheck" size={17} /><span>{t('admin.member.auditNotice')}</span></div>
    <section className="card admin-case-identity">
      <div className="list-row"><div className="cat-icon"><Icon name="user" size={22} /></div><div className="grow"><h2 style={{ marginBottom: 2 }}>{member.name}</h2><div className="muted">{member.email} - {member.phone || t('admin.member.phoneMissing')}</div></div><span className={`pill ${member.deletedAt ? 'pill-gray' : member.kycStatus === 'verified' ? 'pill-teal' : 'pill-saffron'}`}>{member.deletedAt ? t('admin.member.anonymized') : adminStatus(member.kycStatus)}</span></div>
      {member.suspendedUntil && <div className="alert alert-danger mt"><Icon name="alert" size={16} /><span>{t('admin.member.suspendedUntil', { date: formatAdminDate(member.suspendedUntil) })} {member.suspensionReason || ''}</span></div>}
    </section>
    <nav className="admin-case-nav" aria-label={t('admin.members.files')}>
      <CaseSectionButton active={section === 'overview'} icon="user" label={t('admin.member.activity')} count={(data.recordTotals?.trips ?? data.trips.length) + (data.recordTotals?.listings ?? data.listings.length)} onClick={() => setSection('overview')} />
      <CaseSectionButton active={section === 'kyc'} icon="shieldCheck" label={t('admin.member.kycFile')} count={data.kyc.length} onClick={() => setSection('kyc')} />
      <CaseSectionButton active={section === 'messages'} icon="chat" label={t('admin.member.conversations')} count={data.messagePage.total ?? data.messages.length} onClick={() => setSection('messages')} />
      <CaseSectionButton active={section === 'payments'} icon="euro" label={t('admin.member.operations')} count={data.recordTotals?.transactions ?? data.transactions.length} onClick={() => setSection('payments')} />
      <CaseSectionButton active={section === 'history'} icon="clock" label={t('admin.member.changeHistory')} count={data.auditLogs.length} onClick={() => setSection('history')} />
      <CaseSectionButton active={section === 'security'} icon="alert" label={t('admin.member.securityHistory')} count={data.recordTotals?.disputes ?? data.disputes.length} onClick={() => setSection('security')} />
    </nav>
    <div className="admin-case-section">
      {section === 'overview' && <MemberOverview data={data} member={member} />}
      {section === 'kyc' && <MemberKycSection submissions={data.kyc} onZoom={setZoom} />}
      {section === 'messages' && <MemberMessagesSection data={data} load={load} />}
      {section === 'payments' && <MemberPaymentsSection transactions={data.transactions} />}
      {section === 'history' && <AuditHistory logs={data.auditLogs} />}
      {section === 'security' && <MemberSecuritySection disputes={data.disputes} />}
    </div>
    {zoom && <div className="modal-backdrop" onClick={() => setZoom(null)}><img src={zoom} alt={t('admin.kyc.document')} className="kyc-zoom" onClick={(event) => event.stopPropagation()} /></div>}
  </div>;
}

function CaseSectionButton({ active, icon, label, count, onClick }) {
  return <button type="button" className={active ? 'active' : ''} onClick={onClick} aria-pressed={active}>
    <span><Icon name={icon} size={19} /></span><b>{label}</b><small>{count}</small><Icon name="arrowRight" size={16} />
  </button>;
}

function MemberOverview({ data, member }) {
  return <section className="card"><h2><Icon name="user" size={18} />{t('admin.member.activity')}</h2>
    <div className="admin-case-facts">
      <div><span>{t('admin.member.city')}</span><b>{member.city || '-'}</b></div>
      <div><span>{t('admin.member.joined')}</span><b>{formatAdminDate(member.createdAt)}</b></div>
      <div><span>{t('admin.member.email')}</span><b>{member.emailVerified ? t('common.verified') : t('common.notVerified')}</b></div>
      <div><span>{t('admin.member.login')}</span><b>{member.provider || 'email'}</b></div>
      <div><span>{t('admin.member.trips')}</span><b>{data.recordTotals?.trips ?? data.trips.length}</b></div>
      <div><span>{t('admin.member.listings')}</span><b>{data.recordTotals?.listings ?? data.listings.length}</b></div>
    </div>
  </section>;
}

function MemberKycSection({ submissions, onZoom }) {
  return <section className="card"><h2><Icon name="shieldCheck" size={18} />{t('admin.member.kycFile')}</h2>
    {submissions.length === 0 ? <p className="muted mt">{t('admin.member.noKyc')}</p> : submissions.map((submission) => <div className="admin-case-kyc" key={submission.id}>
      <div className="list-row"><div className="grow"><b>{submission.legalName || t('admin.member.identityHidden')}</b><div className="muted">{submission.documentType || t('admin.document')} - {formatAdminDate(submission.submittedAt)} - {adminStatus(submission.status)}</div></div></div>
      {submission.documentsPurged ? <div className="alert alert-warn mt"><Icon name="lock" size={15} /><span>{t('admin.member.kycPurged')}</span></div> : <div className="kyc-review-grid mt"><AdminKycDocument label={t('admin.kyc.selfie')} photo={submission.selfiePhoto} onZoom={onZoom} selfie /><AdminKycDocument label={t('admin.kyc.front')} photo={submission.idFrontPhoto} onZoom={onZoom} />{submission.idBackPhoto && <AdminKycDocument label={t('admin.kyc.back')} photo={submission.idBackPhoto} onZoom={onZoom} />}</div>}
    </div>)}
  </section>;
}

function MemberMessagesSection({ data, load }) {
  return <section className="card"><h2><Icon name="chat" size={18} />{t('admin.member.conversations')}</h2>
    <p className="muted mt">{t('admin.member.messageSummary', { conversations: data.messagePage.conversationTotal ?? data.conversations.length, messages: data.messagePage.total ?? data.messages.length })}</p>
    <div className="list-stack mt">{data.messages.map((message) => <div className="admin-message-log" key={message.id}><div><b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b><span>{formatAdminDate(message.at)} - {adminStatus(message.type)}</span></div><div className="admin-message-route"><span>{t('admin.member.from')}: <b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b></span><span>{t('admin.member.to')}: <b>{message.to?.map((recipient) => recipient.name || recipient.id).join(', ') || t('admin.member.recipientMissing')}</b></span></div>{message.text && <p>{message.text}</p>}{message.location && <small><Icon name="mapPin" size={13} />{message.location.labelKey ? t(message.location.labelKey) : message.location.label || t('messages.location')}</small>}{message.flagged && <span className="pill pill-danger">{t('admin.member.flagged')}: {message.flagReason || t('admin.member.security')}</span>}</div>)}</div>
    {data.messagePage.hasMore && <button className="btn btn-sm mt" onClick={() => load(data.messagePage.nextCursor)}>{t('admin.member.loadPrevious')}</button>}
  </section>;
}

function MemberPaymentsSection({ transactions }) {
  return <section className="card"><h2><Icon name="euro" size={18} />{t('admin.member.operations')}</h2>
    <div className="list-stack mt">{transactions.length === 0 ? <p className="muted">{t('admin.ops.noReview')}</p> : transactions.map((transaction) => <div className="admin-payment-history-row" key={transaction.id}>
      <div><span>{t('admin.member.operations')}</span><b>{formatAdminDate(transaction.createdAt)}</b></div>
      <div><span>{t('admin.status.pending')}</span><b>{adminStatus(transaction.status)}</b></div>
      <div><span>{t('admin.stat.escrow')}</span><b>{adminStatus(transaction.escrow?.state || 'pending')}</b></div>
    </div>)}</div>
  </section>;
}

function MemberSecuritySection({ disputes = [] }) {
  return <section className="card"><h2><Icon name="alert" size={18} />{t('admin.member.securityHistory')}</h2>
    <div className="list-stack mt">{disputes.length === 0 ? <p className="muted">{t('admin.safety.none')}</p> : disputes.map((dispute) => <div className="list-row" key={dispute.id}><div className="grow"><b>{t('admin.review.dispute')}</b><div className="muted">{dispute.reason || adminStatus(dispute.status)} - {formatAdminDate(dispute.createdAt)}</div></div><span className="pill pill-gray">{adminStatus(dispute.status)}</span></div>)}</div>
  </section>;
}

function AuditHistory({ logs }) {
  return <section className="card">
    <h2><Icon name="clock" size={18} />{t('admin.member.changeHistory')}</h2>
    <div className="list-stack mt">
      {logs.length === 0 ? <p className="muted">{t('admin.member.noAudit')}</p> : logs.map((log) => {
        const changes = log.meta?.changes || [];
        return <div className="admin-audit-log" key={log.id}>
          <div className="admin-audit-head"><div><b>{auditAction(log.action)}</b><span>{formatAdminDate(log.at)} - {log.actor?.name || log.actorId || t('admin.system')}</span></div><span className="pill pill-gray">{log.targetType || 'system'}</span></div>
          {changes.length > 0 ? <div className="admin-audit-changes">{changes.map((change, index) => <div className="admin-audit-change" key={`${change.field}-${index}`}><b>{auditField(change.field)}</b><span><small>{t('admin.audit.before')}</small>{auditValue(change.before)}</span><Icon name="arrowRight" size={14} /><span><small>{t('admin.audit.after')}</small>{auditValue(change.after)}</span></div>)}</div> : <p className="muted admin-audit-empty">{t('admin.member.noChanges')}</p>}
        </div>;
      })}
    </div>
  </section>;
}
