import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { SkeletonList, SkeletonStatGrid } from '../../../Skeleton.jsx';
import { useToast } from '../../../Toast.jsx';
import { dateLocale, t, useLang } from '../../../i18n.js';
import {
  AccessPanel, CategoriesPanel, ConversationReviewCard, FraudPanel, KpiPanel, KycPanel,
  ListingReviewCard, MembersPanel, OpsPanel, SafetyPanel,
} from '../components/AdminPanels.jsx';

// Compte total des signaux de fraude, tous types confondus — sert au badge du menu
// pour qu'un admin sache qu'il y a quelque chose à regarder sans devoir cliquer à l'aveugle.
function fraudSignalCount(f) {
  if (!f) return 0;
  return f.linkedAccounts.length + f.repeatPairs.length + f.flaggedMessaging.length
    + f.abnormalCancel.length + f.disputeProne.length + f.kycRepeatRejections.length;
}

export default function Admin() {
  useLang();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('ops'); // ops | review | kyc | kpis | fraud | safety | categories | access
  const [ops, setOps] = useState(null);
  const [opsError, setOpsError] = useState('');
  const [fraud, setFraud] = useState(null);
  const [fraudError, setFraudError] = useState('');
  const [kycPending, setKycPending] = useState(null);
  const [team, setTeam] = useState(null);
  const [safety, setSafety] = useState(null);
  const toast = useToast();

  const load = useCallback(() => {
    api('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);
  const loadOps = useCallback(() => {
    api('/admin/ops').then((d) => setOps(d.ops)).catch((e) => setOpsError(e.message));
  }, []);
  const loadFraud = useCallback(() => {
    api('/admin/fraud').then(setFraud).catch((e) => setFraudError(e.message));
  }, []);
  const loadTeam = useCallback(() => {
    api('/admin/users').then(setTeam).catch(() => setTeam({ users: [], adminCount: 0 }));
  }, []);
  const loadSafety = useCallback(() => {
    api('/admin/safety').then(setSafety).catch(() => setSafety({ riskyUsers: [], appeals: [] }));
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadOps(); }, [loadOps]);
  // Chargés au montage (pas seulement à l'ouverture de l'onglet) pour pouvoir afficher un
  // badge de compte sur les boutons "Fraude" et "Identités" — un admin ne devrait pas avoir
  // à cliquer à l'aveugle pour découvrir qu'il y a quelque chose à traiter. Requête légère,
  // découplée du fetch propre à KycPanel (filtres/recherche) qui reste inchangé.
  useEffect(() => { loadFraud(); }, [loadFraud]);
  useEffect(() => { loadTeam(); }, [loadTeam]);
  useEffect(() => { loadSafety(); }, [loadSafety]);
  useEffect(() => { api('/admin/kyc?status=pending').then((d) => setKycPending(d.stats?.pending ?? 0)).catch(() => {}); }, []);

  const decide = async (id, decision, extra = {}) => {
    await api(`/admin/review/${id}`, { method: 'POST', body: { decision, ...extra } });
    load();
    loadOps();
    toast.success(t('admin.toast.decisionSaved'), 2200);
  };

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!data) {
    return (
      <div>
        <h1 className="page-title">{t('admin.title')}</h1>
        <p className="page-sub">{t('admin.subtitle')}</p>
        <SkeletonStatGrid />
        <SkeletonList count={3} avatar={false} />
      </div>
    );
  }

  const { stats, reviewQueue, customWhitelist } = data;

  return (
    <div>
      <h1 className="page-title">{t('admin.title')}</h1>
      <p className="page-sub">{t('admin.subtitle')}</p>

      <div className="tabs">
        <button className={tab === 'ops' ? 'active' : ''} onClick={() => setTab('ops')}>
          {t('admin.tab.operations')} {ops?.health?.status === 'critical' ? '(!)' : ops?.health?.reviewOpen ? `(${ops.health.reviewOpen})` : ''}
        </button>
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          {t('admin.tab.review')} {reviewQueue.length > 0 ? `(${reviewQueue.length})` : ''}
        </button>
        <button className={tab === 'kyc' ? 'active' : ''} onClick={() => setTab('kyc')}>
          {t('admin.tab.identities')} {kycPending > 0 ? `(${kycPending})` : ''}
        </button>
        <button className={tab === 'fraud' ? 'active' : ''} onClick={() => setTab('fraud')}>
          {t('admin.tab.fraud')} {fraudSignalCount(fraud) > 0 ? `(${fraudSignalCount(fraud)})` : ''}
        </button>
        <button className={tab === 'safety' ? 'active' : ''} onClick={() => setTab('safety')}>
          {t('admin.tab.safety')} {(safety?.riskyUsers?.length || 0) + (safety?.appeals?.filter((appeal) => appeal.status === 'open').length || 0) > 0 ? `(${(safety?.riskyUsers?.length || 0) + (safety?.appeals?.filter((appeal) => appeal.status === 'open').length || 0)})` : ''}
        </button>
        <button className={tab === 'members' ? 'active' : ''} onClick={() => setTab('members')}>{t('admin.tab.members')}</button>
        <button className={tab === 'access' ? 'active' : ''} onClick={() => setTab('access')}>{t('admin.tab.access')}</button>
      </div>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{stats.users}</div><div className="lbl">{t('admin.stat.members')}</div></div>
        <div className="stat"><div className="num">{stats.released}/{stats.transactions}</div><div className="lbl">{t('admin.stat.delivered')}</div></div>
        <div className="stat"><div className="num">{stats.escrowHeld.toFixed(0)} €</div><div className="lbl">{t('admin.stat.escrow')}</div></div>
        <div className="stat"><div className="num">{stats.flaggedMessages}</div><div className="lbl">{t('admin.stat.flagged')}</div></div>
      </div>

      {tab === 'ops' && <OpsPanel ops={ops} error={opsError} setTab={setTab} reload={() => { load(); loadOps(); loadFraud(); }} />}
      {tab === 'review' && (
        <>
          {reviewQueue.length === 0 && (
            <div className="card center empty-state">
              <Icon name="check" size={32} />
              <p className="muted">{t('admin.review.empty')}</p>
            </div>
          )}

          {reviewQueue.map((item) => (
            <div className="card" key={item.id}>
              {item.type === 'listing' && item.listing && (
                <ListingReviewCard item={item} decide={decide} />
              )}
              {item.type === 'dispute' && item.dispute && (
                <>
                  <span className="pill pill-danger mb"><Icon name="alert" size={13} />{t('admin.review.dispute')} — {item.dispute.txId}</span>
                  <div className="mt mb" style={{ fontSize: 13.5 }}>
                    <b>{t('admin.reason')}:</b> {item.dispute.reason}
                  </div>
                  {item.dispute.evidence.length > 0 && (
                    <div className="evidence-list">
                      {item.dispute.evidence.map((e, i) => (
                        <div key={i} className="evidence-item">
                          {e.photo && <img src={e.photo} alt={t('admin.evidence')} />}
                          {e.text && <p>{e.text}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
                    <Icon name="fileText" size={16} />
                    <span>{t('admin.review.disputeGuide')}</span>
                  </div>
                  <div className="row">
                    <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'release_traveler')}>{t('admin.review.payTraveler')}</button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'refund_sender')}>{t('admin.review.refundSender')}</button>
                  </div>
                </>
              )}
              {item.type === 'conversation' && item.conversation && (
                <ConversationReviewCard item={item} decide={decide} />
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'kyc' && <KycPanel />}
      {tab === 'kpis' && <KpiPanel />}
      {tab === 'fraud' && <FraudPanel data={fraud} error={fraudError} reload={loadFraud} />}
      {tab === 'safety' && <SafetyPanel data={safety} reload={loadSafety} />}
      {tab === 'categories' && <CategoriesPanel customWhitelist={customWhitelist} reload={load} />}
      {tab === 'members' && <MembersPanel data={team} />}
      {tab === 'access' && <AccessPanel data={team} reload={loadTeam} />}
    </div>
  );
}
