import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { ConfirmDialog } from '../../../components.jsx';
import { SkeletonCard, SkeletonList } from '../../../Skeleton.jsx';
import { useToast } from '../../../Toast.jsx';
import { dateLocale, t } from '../../../i18n.js';

export function MembersPanel({ data }) {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const users = (data?.users || []).filter((user) => `${user.name} ${user.email} ${user.city}`.toLowerCase().includes(query.trim().toLowerCase()));
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
  </section>;
}

function MemberCaseFile({ userId, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const load = useCallback((offset = 0) => {
    api(`/admin/users/${userId}/case-file?offset=${offset}&limit=50`)
      .then((response) => setData((current) => offset > 0 && current ? { ...response.caseFile, messages: [...current.messages, ...response.caseFile.messages] } : response.caseFile))
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
    <section className="card"><h2><Icon name="shieldCheck" size={18} />{t('admin.member.kycFile')}</h2>{data.kyc.length === 0 ? <p className="muted mt">{t('admin.member.noKyc')}</p> : data.kyc.map((submission) => <div className="admin-case-kyc" key={submission.id}><div className="list-row"><div className="grow"><b>{submission.legalName || t('admin.member.identityHidden')}</b><div className="muted">{submission.documentType || t('admin.document')} · {formatAdminDate(submission.submittedAt)} · {adminStatus(submission.status)}</div></div></div>{submission.documentsPurged ? <div className="alert alert-warn mt"><Icon name="lock" size={15} /><span>{t('admin.member.kycPurged')}</span></div> : <div className="kyc-review-grid mt"><KycDoc label={t('admin.kyc.selfie')} photo={submission.selfiePhoto} onZoom={setZoom} selfie /><KycDoc label={t('admin.kyc.front')} photo={submission.idFrontPhoto} onZoom={setZoom} />{submission.idBackPhoto && <KycDoc label={t('admin.kyc.back')} photo={submission.idBackPhoto} onZoom={setZoom} />}</div>}</div>)}</section>
    <section className="card"><h2><Icon name="repeat" size={18} />{t('admin.member.activity')}</h2><div className="kyc-recap mt"><div><span className="muted">{t('admin.member.trips')}</span><b>{data.trips.length}</b></div><div><span className="muted">{t('admin.member.listings')}</span><b>{data.listings.length}</b></div><div><span className="muted">{t('admin.member.operations')}</span><b>{data.transactions.length}</b></div><div><span className="muted">{t('admin.member.disputes')}</span><b>{data.disputes.length}</b></div></div><div className="list-stack mt">{data.transactions.map((transaction) => <div className="list-row" key={transaction.id}><div className="grow"><b>{transaction.id}</b><div className="muted">{adminStatus(transaction.status)} · {formatAdminDate(transaction.createdAt)}</div></div><span className="pill pill-gray">{adminStatus(transaction.escrow?.state || 'pending')}</span></div>)}</div></section>
    <section className="card"><h2><Icon name="chat" size={18} />{t('admin.member.conversations')}</h2><p className="muted mt">{t('admin.member.messageSummary', { conversations: data.conversations.length, messages: data.messagePage.total })}</p><div className="list-stack mt">{data.messages.map((message) => <div className="admin-message-log" key={message.id}><div><b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b><span>{formatAdminDate(message.at)} · {adminStatus(message.type)}</span></div><div className="admin-message-route"><span>{t('admin.member.from')}: <b>{message.from?.name || message.from?.id || t('admin.member.unknownAccount')}</b></span><span>{t('admin.member.to')}: <b>{message.to?.map((recipient) => recipient.name || recipient.id).join(', ') || t('admin.member.recipientMissing')}</b></span></div>{message.text && <p>{message.text}</p>}{message.location && <small><Icon name="mapPin" size={13} />{message.location.labelKey ? t(message.location.labelKey) : message.location.label || t('messages.location')} {message.location.city ? `· ${message.location.city}` : ''} · {t(message.location.precision === 'approximate' ? 'messages.location.approximate' : 'messages.location.precise')}</small>}{message.attachments?.length > 0 && <small><Icon name="image" size={13} />{message.attachments.map((attachment) => attachment.name || t('admin.image')).join(', ')}</small>}{message.flagged && <span className="pill pill-danger">{t('admin.member.flagged')}: {message.flagReason || t('admin.member.security')}</span>}</div>)}</div>{data.messagePage.hasMore && <button className="btn btn-sm mt" onClick={() => load(data.messagePage.offset + data.messagePage.limit)}>{t('admin.member.loadPrevious')}</button>}</section>
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

function auditAction(action) {
  const keys = {
    'profile.update': 'admin.audit.profileUpdate',
    'profile.photo.update': 'admin.audit.profilePhotoUpdate',
    'profile.password.update': 'admin.audit.profilePasswordUpdate',
    'profile.email.update': 'admin.audit.profileEmailUpdate',
    'profile.delete': 'admin.audit.profileDelete',
    'settings.notifications.update': 'admin.audit.settingsNotificationsUpdate',
    'trip.create': 'admin.audit.tripCreate',
    'trip.update': 'admin.audit.tripUpdate',
    'trip.remove': 'admin.audit.tripRemove',
    'listing.create': 'admin.audit.listingCreate',
    'listing.update': 'admin.audit.listingUpdate',
    'listing.cancel': 'admin.audit.listingCancel',
    'conversation.delete': 'admin.audit.conversationDelete',
  };
  return keys[action] ? t(keys[action]) : adminStatus(action);
}

function auditField(field) {
  return {
    name: 'Nom', city: 'Ville', phone: 'Telephone', email: 'E-mail', hasPhoto: 'Photo de profil',
    transactions: 'Transactions', messages: 'Messages', shipments: 'Envois', reminders: 'Rappels',
    from: 'Depart', to: 'Arrivee', departureDate: 'Date de depart', transportMode: 'Type de transport', capacityKg: 'Capacite',
    price: 'Prix', description: 'Description', conditions: 'Conditions', status: 'Statut',
    title: 'Titre', categoryLabel: 'Categorie', weightKg: 'Poids', valueEur: 'Valeur declaree',
    dateFrom: 'Date de debut', dateTo: 'Date de fin', travelerPay: 'Remuneration voyageur',
    provider: 'Methode de connexion',
  }[field] || field;
}

function auditValue(value) {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  return String(value);
}

function formatAdminDate(value) {
  return value ? new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function formatAdminShortDate(value) {
  return value ? new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '—';
}

function formatPercent(value) {
  return new Intl.NumberFormat(dateLocale(), { style: 'percent', maximumFractionDigits: 1 }).format(value);
}

function adminStatus(status) {
  const key = {
    none: 'admin.status.none',
    pending: 'admin.status.pending',
    approved: 'admin.status.approved',
    verified: 'admin.status.verified',
    rejected: 'admin.status.rejected',
    refused: 'admin.status.refused',
    expired: 'admin.status.expired',
    accepted: 'admin.status.accepted',
    awaiting_payment: 'admin.status.awaitingPayment',
    paid: 'admin.status.paid',
    meetup: 'admin.status.meetup',
    sealed: 'admin.status.sealed',
    in_transit: 'admin.status.inTransit',
    delivered: 'admin.status.delivered',
    released: 'admin.status.released',
    disputed: 'admin.status.disputed',
    refunded: 'admin.status.refunded',
    cancelled: 'admin.status.cancelled',
    held: 'admin.status.held',
    release_pending: 'admin.status.releasePending',
    message: 'admin.status.message',
    photo: 'admin.status.photo',
    location: 'admin.status.location',
    warning: 'admin.status.warning',
    system: 'admin.system',
    'message.safety_blocked': 'admin.audit.messageBlocked',
    'kyc.approve': 'admin.audit.kycApproved',
    'kyc.reject': 'admin.audit.kycRejected',
    'kyc.refuse': 'admin.audit.kycRefused',
  }[status];
  return key ? t(key) : status || '—';
}

function opsTaskCopy(id, field, fallback) {
  const suffix = {
    'review-disputes': 'disputes',
    'kyc-overdue': 'kyc',
    'gray-listings': 'gray',
    'review-conversations': 'conversations',
    'fraud-signals': 'fraud',
    'offer-watch': 'offers',
  }[id];
  if (!suffix) return fallback;
  if (field === 'body' && id === 'kyc-overdue') {
    return t(fallback?.includes('SLA') ? 'admin.task.kyc.overdueBody' : 'admin.task.kyc.body');
  }
  if (field === 'body' && id === 'offer-watch') {
    return t(fallback?.includes('expire') ? 'admin.task.offers.riskBody' : 'admin.task.offers.body');
  }
  return t(`admin.task.${suffix}.${field}`);
}

function conversationContextLabel(type, fallback) {
  const key = {
    operation: 'admin.context.operation',
    trip: 'admin.context.trip',
    direct: 'admin.context.direct',
  }[type];
  return key ? t(key) : (fallback || t('admin.context.direct'));
}

function safetyCategoryLabel(category) {
  const key = {
    email: 'messages.safety.category.email',
    phone: 'messages.safety.category.phone',
    phone_words: 'messages.safety.category.phone',
    url: 'messages.safety.category.link',
    social_handle: 'messages.safety.category.social',
    off_platform_contact: 'messages.safety.category.outside',
    external_payment: 'admin.report.externalPayment',
    repeated_attempts: 'admin.safety.repeatedAttempts',
  }[category];
  return key ? t(key) : category;
}

// Revue d'une annonce en zone grise : l'approbation demande une quantité max, car
// approuver promeut la catégorie en liste blanche pour tous les envois suivants.
export function AccessPanel({ data, reload }) {
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(null);
  const toast = useToast();
  const users = (data?.users || []).filter((user) => `${user.name} ${user.email} ${user.city}`.toLowerCase().includes(query.trim().toLowerCase()));

  const apply = async () => {
    if (!pending) return;
    try {
      await api(`/admin/users/${pending.user.id}/role`, { method: 'POST', body: { role: pending.role } });
      toast.success(t(pending.role === 'admin' ? 'admin.access.granted' : 'admin.access.removed'));
      reload();
    } catch (error) {
      toast.error(error.message || t('admin.access.failed'));
    }
  };

  return (
    <section className="card">
      <div className="row" style={{ justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><h2 style={{ margin: 0 }}>{t('admin.access.title')}</h2><p className="muted" style={{ marginBottom: 0 }}>{t('admin.access.activeCount', { count: data?.adminCount ?? '...' })}</p></div>
        <input className="input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('admin.members.search')} style={{ maxWidth: 260 }} />
      </div>
      <div className="list-stack" style={{ marginTop: 16 }}>
        {users.map((user) => (
          <div className="list-row" key={user.id}>
            <div><b>{user.name}</b><div className="muted">{user.email} {user.city ? `· ${user.city}` : ''}</div></div>
            <div className="row" style={{ marginLeft: 'auto' }}>
              <span className={`pill ${user.isAdmin ? 'pill-teal' : 'pill-gray'}`}>{t(user.isAdmin ? 'admin.role.admin' : 'admin.role.member')}</span>
              <button className={`btn btn-sm ${user.isAdmin ? 'btn-danger-ghost' : 'btn-primary'}`} onClick={() => setPending({ user, role: user.isAdmin ? 'member' : 'admin' })}>
                {t(user.isAdmin ? 'admin.access.remove' : 'admin.access.promote')}
              </button>
            </div>
          </div>
        ))}
        {data && users.length === 0 && <p className="muted center">{t('admin.members.none')}</p>}
      </div>
      {pending && <ConfirmDialog
        title={t(pending.role === 'admin' ? 'admin.access.confirmGrant' : 'admin.access.confirmRemove')}
        message={t(pending.role === 'admin' ? 'admin.access.grantMessage' : 'admin.access.removeMessage', { name: pending.user.name })}
        confirmLabel={t(pending.role === 'admin' ? 'admin.access.promote' : 'admin.access.remove')}
        danger={pending.role === 'member'}
        onConfirm={apply}
        onClose={() => setPending(null)}
      />}
    </section>
  );
}

export function SafetyPanel({ data, reload }) {
  const toast = useToast();
  const [busy, setBusy] = useState('');
  const act = async (user, action) => {
    const reason = action === 'restore' ? '' : window.prompt(t(action === 'warn' ? 'admin.safety.warnReason' : 'admin.safety.suspendReason'));
    if (action !== 'restore' && (!reason || reason.trim().length < 5)) return;
    const durationHours = action === 'suspend' ? Number(window.prompt(t('admin.safety.duration'), '24')) : null;
    if (action === 'suspend' && (!Number.isFinite(durationHours) || durationHours < 1 || durationHours > 720)) return;
    setBusy(`${user.id}:${action}`);
    try {
      await api(`/admin/users/${user.id}/safety`, { method: 'POST', body: { action, reason, durationHours } });
      toast.success(t(action === 'suspend' ? 'admin.safety.suspended' : action === 'restore' ? 'admin.safety.restored' : 'admin.safety.warned'));
      reload();
    } catch (error) { toast.error(error.message || t('common.action.error')); } finally { setBusy(''); }
  };
  const decideAppeal = async (appeal, decision) => {
    const reason = window.prompt(t(decision === 'approve' ? 'admin.safety.appealApproveNote' : 'admin.safety.appealRejectReason')) || '';
    setBusy(`${appeal.id}:${decision}`);
    try {
      await api(`/admin/safety/appeals/${appeal.id}`, { method: 'POST', body: { decision, reason } });
      toast.success(t(decision === 'approve' ? 'admin.safety.appealAccepted' : 'admin.safety.appealRejected'));
      reload();
    } catch (error) { toast.error(error.message || t('admin.safety.decisionFailed')); } finally { setBusy(''); }
  };
  if (!data) return <SkeletonList count={3} avatar={false} />;
  const openAppeals = data.appeals.filter((appeal) => appeal.status === 'open');
  return (
    <section className="list-stack">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('admin.safety.openAppeals')}</h2>
        {openAppeals.length === 0 && <p className="muted">{t('admin.safety.noAppeals')}</p>}
        {openAppeals.map((appeal) => (
          <div className="list-row" key={appeal.id}>
            <div className="grow"><b>{appeal.user?.name || t('admin.member.deleted')}</b><div className="muted">{appeal.user?.email}</div><p style={{ margin: '6px 0 0' }}>{appeal.reason}</p></div>
            <div className="row" style={{ alignSelf: 'center' }}>
              <button className="btn btn-teal btn-sm" disabled={!!busy} onClick={() => decideAppeal(appeal, 'approve')}>{t('common.accept')}</button>
              <button className="btn btn-danger-ghost btn-sm" disabled={!!busy} onClick={() => decideAppeal(appeal, 'reject')}>{t('common.reject')}</button>
            </div>
          </div>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('admin.safety.watchAccounts')}</h2>
        <p className="muted">{t('admin.safety.signalNotice')}</p>
        {data.riskyUsers.length === 0 && <p className="muted">{t('admin.safety.none')}</p>}
        {data.riskyUsers.map((user) => (
          <div className="list-row" key={user.id}>
            <div className="grow"><b>{user.name}</b><div className="muted">{user.email} {user.city ? `· ${user.city}` : ''}</div><small>{user.suspendedUntil ? t('admin.member.suspendedUntil', { date: new Date(user.suspendedUntil).toLocaleString(dateLocale()) }) : t('admin.safety.blockedAttempts', { count: user.messageSafetyAttempts })}</small></div>
            <div className="row" style={{ alignSelf: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {user.suspendedUntil ? <button className="btn btn-teal btn-sm" disabled={!!busy} onClick={() => act(user, 'restore')}>{t('admin.safety.restore')}</button> : <><button className="btn btn-sm" disabled={!!busy} onClick={() => act(user, 'warn')}>{t('admin.safety.warn')}</button><button className="btn btn-danger-ghost btn-sm" disabled={!!busy} onClick={() => act(user, 'suspend')}>{t('admin.safety.suspend')}</button></>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

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
        <OpsMetric label={t('admin.ops.offersAtRisk')} value={ops.health.offersAtRisk || 0} icon="send" danger={(ops.health.offersAtRisk || 0) > 0} />
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
          <h2><Icon name="send" size={17} />{t('admin.ops.negotiations')}</h2>
          <button className="link-btn" onClick={() => setTab('ops')}>{t('admin.ops.activeCount', { count: ops.health.offersActive || 0 })}</button>
        </div>
        {!ops.latest.offers?.length ? (
          <p className="muted" style={{ fontSize: 13 }}>{t('admin.ops.noOffers')}</p>
        ) : (
          <div className="ops-offer-list">
            {ops.latest.offers.map((offer) => (
              <div key={offer.id} className={`ops-offer-row ops-${offer.severity}`}>
                <Icon name={offer.severity === 'critical' ? 'alert' : offer.severity === 'warning' ? 'clock' : 'send'} size={16} />
                <span className="grow">
                  <b>{offer.listing?.title || offer.id}</b>
                  <small>{offer.sender?.name} → {offer.traveler?.name} · +{offer.offeredPay} €</small>
                </span>
                <span className="ops-offer-meta">
                  <b>{t(offer.waitingFor === 'traveler' ? 'admin.role.traveler' : offer.waitingFor === 'sender' ? 'admin.role.sender' : 'admin.status.expired')}</b>
                  <small>{offerTimeLabel(offer)}</small>
                </span>
              </div>
            ))}
          </div>
        )}
      </section>

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

function offerTimeLabel(offer) {
  if (offer.status === 'expired' || offer.expiresIn <= 0) return t('admin.status.expired');
  const hours = Math.ceil(offer.expiresIn / 3600000);
  if (hours <= 48) return t('time.hours', { n: hours });
  return t('time.days', { n: Math.ceil(hours / 24) });
}

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
const KYC_FILTERS = [
  { id: 'pending', key: 'admin.status.pending' },
  { id: 'verified', key: 'admin.status.verifiedPlural' },
  { id: 'rejected', key: 'admin.status.rejectedPlural' },
  { id: 'refused', key: 'admin.status.refusedPlural' },
  { id: 'all', key: 'common.all' },
];

export function KycPanel() {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('pending');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState(null);

  const load = useCallback(() => {
    const params = new URLSearchParams({ status: filter });
    if (q) params.set('q', q);
    api(`/admin/kyc?${params}`).then(setData).catch(() => setData({ submissions: [], stats: {} }));
  }, [filter, q]);

  useEffect(() => { load(); }, [load]);

  if (selected) {
    return <KycDetail id={selected} onBack={() => setSelected(null)} onDecided={() => { setSelected(null); load(); }} />;
  }

  const s = data?.stats || {};
  return (
    <div>
      <div className="stat-grid mb">
        <div className="stat"><div className="num">{s.pending ?? '…'}</div><div className="lbl">{t('admin.status.pending')}</div></div>
        <div className="stat"><div className="num" style={s.overdue > 0 ? { color: 'var(--danger)' } : {}}>{s.overdue ?? 0}</div><div className="lbl">{t('admin.kyc.overdue24')}</div></div>
        <div className="stat"><div className="num">{s.verified ?? '…'}</div><div className="lbl">{t('admin.status.verifiedPlural')}</div></div>
        <div className="stat"><div className="num">{s.avgReviewHours != null ? `${s.avgReviewHours} h` : '—'}</div><div className="lbl">{t('admin.kyc.averageTime')}</div></div>
      </div>

      <input className="chat-input mb" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder={t('admin.kyc.search')} />

      <div className="kyc-filters">
        {KYC_FILTERS.map((f) => (
          <button key={f.id} className={`kyc-filter ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{t(f.key)}</button>
        ))}
      </div>

      {!data && <SkeletonList count={4} avatar={false} lines={1} />}
      {data?.submissions.length === 0 && (
        <div className="card center empty-state">
          <Icon name="shieldCheck" size={32} />
          <p className="muted">{t(filter === 'pending' ? 'admin.kyc.nonePending' : 'admin.kyc.noneCategory')}</p>
        </div>
      )}

      {data?.submissions.map((sub) => (
        <div className="card clickable" key={sub.id} onClick={() => setSelected(sub.id)}>
          <div className="list-row">
            <div className="cat-icon"><Icon name="user" size={20} /></div>
            <div className="grow">
              <b>{sub.legalName}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {sub.user?.email} · {t(sub.documentType === 'passport' ? 'admin.kyc.passport' : 'admin.kyc.idCard')} · {t('admin.kyc.age', { age: sub.age })}
              </div>
              <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <KycStatusPill status={sub.status} />
                {sub.overdue && <span className="pill pill-danger"><Icon name="clock" size={12} />{t('admin.kyc.overdue')}</span>}
                {sub.priorRejects > 0 && <span className="pill pill-saffron"><Icon name="alert" size={12} />{t('admin.kyc.previousRejects', { count: sub.priorRejects })}</span>}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, textAlign: 'right' }}>{formatAdminShortDate(sub.submittedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function KycStatusPill({ status }) {
  const map = {
    pending: { cls: 'pill-saffron', label: t('admin.status.pending') },
    approved: { cls: 'pill-teal', label: t('admin.status.verified') },
    rejected: { cls: 'pill-gray', label: t('admin.status.rejected') },
    refused: { cls: 'pill-danger', label: t('admin.status.refused') },
  }[status] || { cls: 'pill-gray', label: status };
  return <span className={`pill ${map.cls}`}>{map.label}</span>;
}

function KycDetail({ id, onBack, onDecided }) {
  const [data, setData] = useState(null);
  const [zoom, setZoom] = useState(null);
  const [action, setAction] = useState(null); // 'reject' | 'refuse'
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { api(`/admin/kyc/${id}`).then(setData).catch((e) => setError(e.message)); }, [id]);

  const decide = async (decision) => {
    setBusy(true); setError('');
    try {
      await api(`/admin/kyc/${id}/decide`, { method: 'POST', body: { decision, reason } });
      onDecided();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  if (error) return <div><button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('common.back')}</button><div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div></div>;
  if (!data) return <SkeletonCard lines={4} />;
  const s = data.submission;
  const done = s.status !== 'pending';

  return (
    <div>
      <button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.kyc.backToQueue')}</button>

      <div className="card">
        <div className="list-row mb">
          <div className="grow">
            <h2 style={{ marginBottom: 2 }}>{s.legalName}</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.user?.email}</div>
          </div>
          <KycStatusPill status={s.status} />
        </div>

        <div className="kyc-recap mb">
          <div><span className="muted">{t('admin.kyc.birth')}</span><b>{s.birthDate} ({t('admin.kyc.age', { age: s.age })})</b></div>
          <div><span className="muted">{t('admin.document')}</span><b>{t(s.documentType === 'passport' ? 'admin.kyc.passport' : 'admin.kyc.idCard')}</b></div>
          <div><span className="muted">{t('admin.kyc.submitted')}</span><b>{formatAdminShortDate(s.submittedAt)}</b></div>
          <div><span className="muted">{t('admin.kyc.accountCreated')}</span><b>{s.user ? formatAdminShortDate(s.user.createdAt) : '—'}</b></div>
        </div>

        {s.priorRejects > 0 && (
          <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
            <Icon name="alert" size={16} />
            <span>{t('admin.kyc.previousWarning', { count: s.priorRejects })}</span>
          </div>
        )}

        <div className="kyc-review-grid">
          <KycDoc label={t('admin.kyc.selfie')} photo={s.selfiePhoto} onZoom={setZoom} selfie />
          <KycDoc label={t('admin.kyc.front')} photo={s.idFrontPhoto} onZoom={setZoom} />
          {s.idBackPhoto && <KycDoc label={t('admin.kyc.back')} photo={s.idBackPhoto} onZoom={setZoom} />}
        </div>

        {error && <div className="alert alert-danger mt"><Icon name="alert" size={17} />{error}</div>}

        {!done && !action && (
          <div className="mt">
            <button className="btn btn-teal mb" onClick={() => decide('approve')} disabled={busy}>
              <Icon name="check" size={18} />{t('admin.kyc.approve')}
            </button>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => { setAction('reject'); setReason(''); }}>{t('admin.kyc.rejectCorrectable')}</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => { setAction('refuse'); setReason(''); }}>{t('admin.kyc.refusePermanent')}</button>
            </div>
          </div>
        )}

        {!done && action && (
          <div className="mt kyc-decision-box">
            <div className="field">
              <label>{t(action === 'reject' ? 'admin.kyc.rejectReason' : 'admin.kyc.refuseReason')}</label>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={t(action === 'reject' ? 'admin.kyc.rejectExample' : 'admin.kyc.refuseExample')} autoFocus />
            </div>
            {action === 'refuse' && (
              <div className="alert alert-danger" style={{ fontSize: 12.5 }}>
                <Icon name="alert" size={16} />
                <span>{t('admin.kyc.refuseWarning')}</span>
              </div>
            )}
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => setAction(null)}>{t('common.cancel')}</button>
              <button className={`btn btn-sm ${action === 'refuse' ? 'btn-danger-ghost' : 'btn-primary'}`}
                onClick={() => decide(action)} disabled={busy || reason.trim().length < 5}>
                {busy ? <span className="spinner" /> : t(action === 'reject' ? 'admin.kyc.confirmReject' : 'admin.kyc.confirmRefuse')}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className={`alert ${s.status === 'approved' ? 'alert-teal' : 'alert-danger'} mt`} style={{ marginBottom: 0 }}>
            <Icon name={s.status === 'approved' ? 'check' : 'x'} size={17} />
            <span>{t('admin.kyc.decision')}: {t(s.status === 'approved' ? 'admin.status.approved' : s.status === 'refused' ? 'admin.status.refusedPermanent' : 'admin.status.rejectedLower')}
            {s.decisionReason ? ` — ${s.decisionReason}` : ''}</span>
          </div>
        )}
      </div>

      {data.history.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}><Icon name="clock" size={17} />{t('admin.kyc.history')}</h2>
          {data.history.map((h) => (
            <div className="kyc-history-row" key={h.id}>
              <KycStatusPill status={h.decision === 'approve' ? 'approved' : h.decision === 'refuse' ? 'refused' : 'rejected'} />
              <div className="grow">
                <div style={{ fontSize: 12.5 }}>{h.reason || '—'}</div>
                <div className="muted" style={{ fontSize: 11 }}>{h.adminName} · {formatAdminShortDate(h.at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <img src={zoom} alt={t('admin.document')} className="kyc-zoom" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

function KycDoc({ label, photo, onZoom, selfie }) {
  return (
    <div className="kyc-review-thumb" onClick={() => onZoom(photo)} style={{ cursor: 'zoom-in' }}>
      <img src={photo} alt={label} style={selfie ? { objectPosition: 'center top' } : {}} />
      <span>{label}</span>
    </div>
  );
}

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
