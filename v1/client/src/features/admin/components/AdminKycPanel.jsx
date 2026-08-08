import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { SkeletonCard, SkeletonList } from '../../../Skeleton.jsx';
import { t } from '../../../i18n.js';
import { formatAdminShortDate } from './adminPanelUtils.js';
import { AdminKycDocument } from './AdminKycDocument.jsx';

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

  if (error) return <div><button className="link-btn back-btn" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('common.back')}</button><div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div></div>;
  if (!data) return <SkeletonCard lines={4} />;
  const s = data.submission;
  const done = s.status !== 'pending';

  return (
    <div>
      <button className="link-btn back-btn" onClick={onBack}><Icon name="arrowLeft" size={14} />{t('admin.kyc.backToQueue')}</button>

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
          <AdminKycDocument label={t('admin.kyc.selfie')} photo={s.selfiePhoto} onZoom={setZoom} selfie />
          <AdminKycDocument label={t('admin.kyc.front')} photo={s.idFrontPhoto} onZoom={setZoom} />
          {s.idBackPhoto && <AdminKycDocument label={t('admin.kyc.back')} photo={s.idBackPhoto} onZoom={setZoom} />}
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
