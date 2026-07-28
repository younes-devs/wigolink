import { useState } from 'react';
import { api } from '../../../api';
import { ConfirmDialog } from '../../../components.jsx';
import { SkeletonList } from '../../../Skeleton.jsx';
import { useToast } from '../../../Toast.jsx';
import { dateLocale, t } from '../../../i18n.js';

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
