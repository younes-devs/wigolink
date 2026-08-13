import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, apiBlob } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { SkeletonCard } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import {
  adminStatus, auditAction, auditField, auditValue, conversationContextLabel,
  formatAdminDate,
} from './adminPanelUtils.js';
import { AdminKycDocument } from './AdminKycDocument.jsx';

export function MembersPanel({ data, reload }) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const selectedId = searchParams.get('member');
  const requestedSection = searchParams.get('section') || 'overview';
  const caseSection = ['overview', 'kyc', 'messages', 'payments', 'history', 'security'].includes(requestedSection)
    ? requestedSection
    : 'overview';

  const selectMember = (userId) => {
    const next = new URLSearchParams({ tab: 'members', member: userId });
    setSearchParams(next);
  };

  const selectCaseSection = (section) => {
    const next = new URLSearchParams({ tab: 'members', member: selectedId });
    if (section !== 'overview') next.set('section', section);
    setSearchParams(next);
  };

  useEffect(() => {
    const timer = setTimeout(() => { void reload({ q: query }); }, 250);
    return () => clearTimeout(timer);
  }, [query, reload]);

  const users = data?.users || [];
  const deletedCount = users.filter((user) => user.deletedAt).length;
  if (selectedId) return <MemberCaseFile userId={selectedId} section={caseSection} onSectionChange={selectCaseSection} onBack={() => navigate(-1)} />;

  return <section className="card admin-members-card">
    <div className="admin-members-head">
      <div><h2>{t('admin.members.files')}</h2><p className="muted">{t('admin.members.filesHelp')}</p></div>
      <input className="chat-input admin-member-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.members.search')} aria-label={t('admin.members.search')} />
    </div>
    {data && deletedCount > 0 && <p className="muted" style={{ margin: '12px 0 0' }}>{t(deletedCount > 1 ? 'admin.members.deletedCount.plural' : 'admin.members.deletedCount', { count: deletedCount })}</p>}
    <div className="list-stack" style={{ marginTop: 16 }}>
      {users.map((user) => <button type="button" className="list-row admin-member-row" key={user.id} onClick={() => selectMember(user.id)}>
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

function MemberCaseFile({ userId, section, onSectionChange, onBack }) {
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
      <CaseSectionButton active={section === 'overview'} icon="user" label={t('admin.member.activity')} count={(data.recordTotals?.trips ?? data.trips.length) + (data.recordTotals?.listings ?? data.listings.length)} onClick={() => onSectionChange('overview')} />
      <CaseSectionButton active={section === 'kyc'} icon="shieldCheck" label={t('admin.member.kycFile')} count={data.kyc.length} onClick={() => onSectionChange('kyc')} />
      <CaseSectionButton active={section === 'messages'} icon="chat" label={t('admin.member.conversations')} count={data.messagePage.total ?? data.messages.length} onClick={() => onSectionChange('messages')} />
      <CaseSectionButton active={section === 'payments'} icon="euro" label={t('admin.member.operations')} count={data.recordTotals?.transactions ?? data.transactions.length} onClick={() => onSectionChange('payments')} />
      <CaseSectionButton active={section === 'history'} icon="clock" label={t('admin.member.changeHistory')} count={data.auditLogs.length} onClick={() => onSectionChange('history')} />
      <CaseSectionButton active={section === 'security'} icon="alert" label={t('admin.member.securityHistory')} count={data.recordTotals?.disputes ?? data.disputes.length} onClick={() => onSectionChange('security')} />
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
    <div className="list-stack mt">{data.messages.map((message) => <div className="admin-message-log" key={message.id}><div><b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b><span>{formatAdminDate(message.at)} - {adminStatus(message.type)}</span></div><div className="admin-message-context"><Icon name={message.context?.type === 'operation' ? 'repeat' : message.context?.type === 'trip' ? 'plane' : 'chat'} size={14} /><b>{message.context?.label || conversationContextLabel(message.context?.type)}</b></div><div className="admin-message-route"><span>{t('admin.member.from')}: <b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b></span><span>{t('admin.member.to')}: <b>{message.to?.map((recipient) => recipient.name || recipient.id).join(', ') || t('admin.member.recipientMissing')}</b></span></div>{message.text && <p>{message.text}</p>}{message.location && <small><Icon name="mapPin" size={13} />{message.location.labelKey ? t(message.location.labelKey) : message.location.label || t('messages.location')}</small>}{message.flagged && <span className="pill pill-danger">{t('admin.member.flagged')}: {message.flagReason || t('admin.member.security')}</span>}</div>)}</div>
    {data.messagePage.hasMore && <button className="btn btn-sm mt" onClick={() => load(data.messagePage.nextCursor)}>{t('admin.member.loadPrevious')}</button>}
  </section>;
}

function MemberPaymentsSection({ transactions }) {
  const [view, setView] = useState('active');
  const active = transactions.filter((transaction) => !isTerminalOperation(transaction));
  const history = transactions.filter(isTerminalOperation);
  const visible = view === 'active' ? active : history;
  return <section className="card admin-member-operations"><h2><Icon name="repeat" size={18} />{t('admin.member.operations')}</h2>
    <div className="admin-operation-tabs" role="tablist" aria-label={t('admin.member.operations')}>
      <button type="button" role="tab" aria-selected={view === 'active'} className={view === 'active' ? 'active' : ''} onClick={() => setView('active')}>{t('admin.member.operationsActive')}<small>{active.length}</small></button>
      <button type="button" role="tab" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} onClick={() => setView('history')}>{t('admin.member.operationsHistory')}<small>{history.length}</small></button>
    </div>
    <div className="list-stack mt">{visible.length === 0 ? <p className="muted admin-operation-empty">{t(view === 'active' ? 'admin.member.noActiveOperations' : 'admin.member.noPastOperations')}</p> : visible.map((transaction) => <MemberOperationCard transaction={transaction} key={transaction.id} />)}</div>
  </section>;
}

function MemberOperationCard({ transaction }) {
  const cancelled = ['cancelled', 'refused', 'rejected', 'refunded'].includes(transaction.status);
  const status = cancelled ? t('admin.member.operationCancelled') : operationStage(transaction.operationStatus, transaction.status);
  const shipment = transaction.shipmentType === 'document'
    ? t('admin.member.operationDocuments', { count: transaction.documentCount || 0 })
    : t('admin.member.operationParcel', { weight: transaction.weightKg || 0 });
  return <article className="admin-member-operation-card">
    <header><div><h3>{transaction.title || t('admin.member.operationUntitled')}</h3><p>{formatAdminDate(transaction.createdAt)}</p></div><span className={`pill ${isTerminalOperation(transaction) ? 'pill-gray' : 'pill-saffron'}`}>{status}</span></header>
    <div className="admin-operation-parties"><OperationParty label={t('admin.member.sender')} participant={transaction.sender} /><Icon name="arrowRight" size={18} /><OperationParty label={t('admin.member.traveler')} participant={transaction.traveler} /></div>
    <div className="admin-operation-summary"><span><Icon name={transaction.shipmentType === 'document' ? 'fileText' : 'package'} size={15} />{shipment}</span><span><Icon name="euro" size={15} />{new Intl.NumberFormat(undefined, { style: 'currency', currency: transaction.currency || 'EUR' }).format(transaction.price || 0)}</span><span><Icon name="clock" size={15} />{t('admin.member.currentStage')}: <b>{status}</b></span></div>
    {transaction.shipmentType === 'parcel' && <AdminParcelPhotos transaction={transaction} />}
  </article>;
}

function OperationParty({ label, participant }) {
  return <div><span>{label}</span><b title={participant?.name || participant?.email}>{participant?.name || t('admin.member.unknownAccount')}</b><small title={participant?.email}>{participant?.email || '—'}</small></div>;
}

function AdminParcelPhotos({ transaction }) {
  const photos = transaction.parcelPhotos || [];
  return <div className="admin-operation-photos"><b><Icon name="camera" size={15} />{t('admin.member.parcelPhotos')}</b>{photos.length > 0 ? <div className="admin-operation-photo-grid">{photos.map((photo, index) => <AdminPrivateParcelPhoto key={photo.id} photo={photo} index={index} />)}</div> : <p><Icon name="clock" size={15} />{t(isTerminalOperation(transaction) ? 'admin.member.parcelPhotosExpired' : 'admin.member.parcelPhotosMissing')}</p>}</div>;
}

function AdminPrivateParcelPhoto({ photo, index }) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    let objectUrl = '';
    apiBlob(String(photo.url || '').replace(/^\/api(?=\/)/, '')).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [photo.url]);
  if (failed) return <div className="admin-operation-photo-state"><Icon name="alert" size={17} /><span>{t('admin.member.photoUnavailable')}</span></div>;
  if (!source) return <div className="admin-operation-photo-state"><span className="spinner" /></div>;
  return <a href={source} target="_blank" rel="noreferrer"><img src={source} alt={t('admin.member.parcelPhotoAlt', { number: index + 1 })} loading="lazy" decoding="async" /></a>;
}

function isTerminalOperation(transaction) {
  return transaction.operationStatus === 'termine' || ['completed', 'released', 'refunded', 'cancelled', 'refused', 'rejected'].includes(transaction.status);
}

function operationStage(operationStatus, status) {
  const key = { attente_confirmation: 'operations.status.awaitingConfirmation', paiement_requis: 'operations.status.paymentRequired', paye: 'operations.status.paid', collecte_prevue: 'operations.status.pickupPlanned', en_transport: 'operations.status.inTransit', livraison_prevue: 'operations.status.deliveryPlanned', litige: 'operations.status.dispute', termine: 'operations.status.completed' }[operationStatus];
  return key ? t(key) : adminStatus(status);
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
          <div className="admin-audit-head"><div><b>{auditAction(log.action)}</b><span>{formatAdminDate(log.at)} - {log.actor?.name || log.actorId || t('admin.system')}</span></div></div>
          {changes.length > 0 ? <div className="admin-audit-changes">{changes.map((change, index) => <div className="admin-audit-change" key={`${change.field}-${index}`}><b>{auditField(change.field)}</b><span><small>{t('admin.audit.before')}</small>{auditValue(change.before)}</span><Icon name="arrowRight" size={14} /><span><small>{t('admin.audit.after')}</small>{auditValue(change.after)}</span></div>)}</div> : <p className="muted admin-audit-empty">{t('admin.member.noChanges')}</p>}
        </div>;
      })}
    </div>
  </section>;
}
