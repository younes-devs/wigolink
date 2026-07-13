import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../Icons.jsx';
import { SkeletonCard, SkeletonList, SkeletonStatGrid } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

// Compte total des signaux de fraude, tous types confondus — sert au badge du menu
// pour qu'un admin sache qu'il y a quelque chose à regarder sans devoir cliquer à l'aveugle.
function fraudSignalCount(f) {
  if (!f) return 0;
  return f.linkedAccounts.length + f.repeatPairs.length + f.flaggedMessaging.length
    + f.abnormalCancel.length + f.disputeProne.length + f.kycRepeatRejections.length;
}

export default function Admin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('review'); // review | kyc | kpis | fraud | categories
  const [fraud, setFraud] = useState(null);
  const [fraudError, setFraudError] = useState('');
  const [kycPending, setKycPending] = useState(null);
  const toast = useToast();

  const load = useCallback(() => {
    api('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);
  const loadFraud = useCallback(() => {
    api('/admin/fraud').then(setFraud).catch((e) => setFraudError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);
  // Chargés au montage (pas seulement à l'ouverture de l'onglet) pour pouvoir afficher un
  // badge de compte sur les boutons "Fraude" et "Identités" — un admin ne devrait pas avoir
  // à cliquer à l'aveugle pour découvrir qu'il y a quelque chose à traiter. Requête légère,
  // découplée du fetch propre à KycPanel (filtres/recherche) qui reste inchangé.
  useEffect(() => { loadFraud(); }, [loadFraud]);
  useEffect(() => { api('/admin/kyc?status=pending').then((d) => setKycPending(d.stats?.pending ?? 0)).catch(() => {}); }, []);

  const decide = async (id, decision, extra = {}) => {
    await api(`/admin/review/${id}`, { method: 'POST', body: { decision, ...extra } });
    load();
    toast.success('Décision enregistrée', 2200);
  };

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!data) {
    return (
      <div>
        <h1 className="page-title">Back-office</h1>
        <p className="page-sub">Revue humaine, litiges, KPIs et surveillance fraude.</p>
        <SkeletonStatGrid />
        <SkeletonList count={3} avatar={false} />
      </div>
    );
  }

  const { stats, reviewQueue, customWhitelist } = data;

  return (
    <div>
      <h1 className="page-title">Back-office</h1>
      <p className="page-sub">Revue humaine, litiges, KPIs et surveillance fraude.</p>

      <div className="tabs">
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          File de revue {reviewQueue.length > 0 ? `(${reviewQueue.length})` : ''}
        </button>
        <button className={tab === 'kyc' ? 'active' : ''} onClick={() => setTab('kyc')}>
          Identités {kycPending > 0 ? `(${kycPending})` : ''}
        </button>
        <button className={tab === 'kpis' ? 'active' : ''} onClick={() => setTab('kpis')}>KPIs</button>
        <button className={tab === 'fraud' ? 'active' : ''} onClick={() => setTab('fraud')}>
          Fraude {fraudSignalCount(fraud) > 0 ? `(${fraudSignalCount(fraud)})` : ''}
        </button>
        <button className={tab === 'categories' ? 'active' : ''} onClick={() => setTab('categories')}>Catégories</button>
      </div>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{stats.users}</div><div className="lbl">Membres</div></div>
        <div className="stat"><div className="num">{stats.released}/{stats.transactions}</div><div className="lbl">Transactions livrées</div></div>
        <div className="stat"><div className="num">{stats.escrowHeld.toFixed(0)} €</div><div className="lbl">Escrow séquestré</div></div>
        <div className="stat"><div className="num">{stats.flaggedMessages}</div><div className="lbl">Messages signalés</div></div>
      </div>

      {tab === 'review' && (
        <>
          {reviewQueue.length === 0 && (
            <div className="card center empty-state">
              <Icon name="check" size={32} />
              <p className="muted">File vide — rien à arbitrer.</p>
            </div>
          )}

          {reviewQueue.map((item) => (
            <div className="card" key={item.id}>
              {item.type === 'listing' && item.listing && (
                <ListingReviewCard item={item} decide={decide} />
              )}
              {item.type === 'dispute' && item.dispute && (
                <>
                  <span className="pill pill-danger mb"><Icon name="alert" size={13} />Litige — {item.dispute.txId}</span>
                  <div className="mt mb" style={{ fontSize: 13.5 }}>
                    <b>Motif :</b> {item.dispute.reason}
                  </div>
                  {item.dispute.evidence.length > 0 && (
                    <div className="evidence-list">
                      {item.dispute.evidence.map((e, i) => (
                        <div key={i} className="evidence-item">
                          {e.photo && <img src={e.photo} alt="Preuve" />}
                          {e.text && <p>{e.text}</p>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
                    <Icon name="fileText" size={16} />
                    <span>Grille : état ≠ vidéo de scellage → responsabilité voyageur (rembourser).
                    Conforme à la vidéo mais ≠ annonce → responsabilité expéditeur (payer le voyageur).</span>
                  </div>
                  <div className="row">
                    <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'release_traveler')}>Payer le voyageur</button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'refund_sender')}>Rembourser l'expéditeur</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </>
      )}

      {tab === 'kyc' && <KycPanel />}
      {tab === 'kpis' && <KpiPanel />}
      {tab === 'fraud' && <FraudPanel data={fraud} error={fraudError} reload={loadFraud} />}
      {tab === 'categories' && <CategoriesPanel customWhitelist={customWhitelist} reload={load} />}
    </div>
  );
}

// Revue d'une annonce en zone grise : l'approbation demande une quantité max, car
// approuver promeut la catégorie en liste blanche pour tous les envois suivants.
function ListingReviewCard({ item, decide }) {
  const [maxQty, setMaxQty] = useState('');
  const [approving, setApproving] = useState(false);

  return (
    <>
      <span className="pill pill-saffron mb"><Icon name="alert" size={13} />Zone grise — {item.listing.categoryLabel}</span>
      <div className="mt"><b>{item.listing.title}</b></div>
      <div className="muted mb" style={{ fontSize: 13 }}>{item.listing.description} · {item.listing.valueEur} €</div>

      {!approving ? (
        <div className="row">
          <button className="btn btn-teal btn-sm" onClick={() => setApproving(true)}>
            <Icon name="check" size={15} />Publier
          </button>
          <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'reject')}>
            <Icon name="x" size={15} />Refuser
          </button>
        </div>
      ) : (
        <div className="mt">
          <div className="field">
            <label>Quantité max autorisée pour « {item.listing.categoryLabel} »</label>
            <input value={maxQty} onChange={(e) => setMaxQty(e.target.value)} placeholder="Ex. : 3 kg, 2 L, 500 g…" autoFocus />
            <div className="hint">
              Cette catégorie sera ajoutée à la liste blanche : les prochains envois similaires seront publiés directement.
            </div>
          </div>
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => setApproving(false)}>Annuler</button>
            <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'approve', { maxQty })} disabled={!maxQty.trim()}>
              <Icon name="check" size={15} />Approuver et promouvoir
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function CategoriesPanel({ customWhitelist, reload }) {
  const remove = async (id) => {
    if (!confirm('Retirer cette catégorie de la liste blanche ? Les prochains envois repasseront en revue humaine.')) return;
    await api(`/admin/whitelist/${id}`, { method: 'DELETE' });
    reload();
  };

  return (
    <div>
      <div className="alert alert-teal">
        <Icon name="fileText" size={17} />
        <span>
          Catégories promues depuis la zone grise après validation admin — publiées directement, sans repasser
          en revue. La liste blanche de base (huile d'argan, miel, safran…) reste définie dans le code.
        </span>
      </div>
      {customWhitelist.length === 0 && (
        <div className="card center empty-state">
          <Icon name="package" size={32} />
          <p className="muted">Aucune catégorie promue pour l'instant.</p>
        </div>
      )}
      {customWhitelist.map((c) => (
        <div className="card" key={c.id}>
          <div className="list-row">
            <div className="grow">
              <b>{c.label}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                Max {c.maxQty} · ajoutée le {new Date(c.addedAt).toLocaleDateString('fr-BE')} (annonce {c.addedFrom})
              </div>
            </div>
            <button className="btn btn-danger-ghost btn-sm" onClick={() => remove(c.id)}>Retirer</button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Vérification d'identité (KYC manuel) ----------
const DT_FMT = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const KYC_FILTERS = [
  { id: 'pending', label: 'En attente' },
  { id: 'verified', label: 'Vérifiés' },
  { id: 'rejected', label: 'Rejetés' },
  { id: 'refused', label: 'Refusés' },
  { id: 'all', label: 'Tous' },
];

function KycPanel() {
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
        <div className="stat"><div className="num">{s.pending ?? '…'}</div><div className="lbl">En attente</div></div>
        <div className="stat"><div className="num" style={s.overdue > 0 ? { color: 'var(--danger)' } : {}}>{s.overdue ?? 0}</div><div className="lbl">En retard (&gt;24h)</div></div>
        <div className="stat"><div className="num">{s.verified ?? '…'}</div><div className="lbl">Vérifiés</div></div>
        <div className="stat"><div className="num">{s.avgReviewHours != null ? `${s.avgReviewHours} h` : '—'}</div><div className="lbl">Délai moyen</div></div>
      </div>

      <input className="chat-input mb" style={{ width: '100%' }} value={q} onChange={(e) => setQ(e.target.value)}
        placeholder="Rechercher par nom ou email…" />

      <div className="kyc-filters">
        {KYC_FILTERS.map((f) => (
          <button key={f.id} className={`kyc-filter ${filter === f.id ? 'active' : ''}`} onClick={() => setFilter(f.id)}>{f.label}</button>
        ))}
      </div>

      {!data && <SkeletonList count={4} avatar={false} lines={1} />}
      {data?.submissions.length === 0 && (
        <div className="card center empty-state">
          <Icon name="shieldCheck" size={32} />
          <p className="muted">Aucune demande {filter === 'pending' ? 'en attente' : 'dans cette catégorie'}.</p>
        </div>
      )}

      {data?.submissions.map((sub) => (
        <div className="card clickable" key={sub.id} onClick={() => setSelected(sub.id)}>
          <div className="list-row">
            <div className="cat-icon"><Icon name="user" size={20} /></div>
            <div className="grow">
              <b>{sub.legalName}</b>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {sub.user?.email} · {sub.documentType === 'passport' ? 'Passeport' : "Carte d'identité"} · {sub.age} ans
              </div>
              <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <KycStatusPill status={sub.status} />
                {sub.overdue && <span className="pill pill-danger"><Icon name="clock" size={12} />En retard</span>}
                {sub.priorRejects > 0 && <span className="pill pill-saffron"><Icon name="alert" size={12} />{sub.priorRejects} rejet(s) avant</span>}
              </div>
            </div>
            <div className="muted" style={{ fontSize: 11.5, textAlign: 'right' }}>{DT_FMT.format(sub.submittedAt)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function KycStatusPill({ status }) {
  const map = {
    pending: { cls: 'pill-saffron', label: 'En attente' },
    approved: { cls: 'pill-teal', label: 'Vérifié' },
    rejected: { cls: 'pill-gray', label: 'Rejeté' },
    refused: { cls: 'pill-danger', label: 'Refusé' },
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

  if (error) return <div><button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />Retour</button><div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div></div>;
  if (!data) return <SkeletonCard lines={4} />;
  const s = data.submission;
  const done = s.status !== 'pending';

  return (
    <div>
      <button className="link-btn mb" onClick={onBack}><Icon name="arrowLeft" size={14} />Retour à la file</button>

      <div className="card">
        <div className="list-row mb">
          <div className="grow">
            <h2 style={{ marginBottom: 2 }}>{s.legalName}</h2>
            <div className="muted" style={{ fontSize: 12.5 }}>{s.user?.email}</div>
          </div>
          <KycStatusPill status={s.status} />
        </div>

        <div className="kyc-recap mb">
          <div><span className="muted">Naissance</span><b>{s.birthDate} ({s.age} ans)</b></div>
          <div><span className="muted">Document</span><b>{s.documentType === 'passport' ? 'Passeport' : "Carte d'identité"}</b></div>
          <div><span className="muted">Soumis le</span><b>{DT_FMT.format(s.submittedAt)}</b></div>
          <div><span className="muted">Compte créé</span><b>{s.user ? DT_FMT.format(s.user.createdAt) : '—'}</b></div>
        </div>

        {s.priorRejects > 0 && (
          <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
            <Icon name="alert" size={16} />
            <span>{s.priorRejects} demande(s) précédente(s) rejetée(s) pour cet utilisateur — vigilance accrue.</span>
          </div>
        )}

        <div className="kyc-review-grid">
          <KycDoc label="Selfie" photo={s.selfiePhoto} onZoom={setZoom} selfie />
          <KycDoc label="Recto" photo={s.idFrontPhoto} onZoom={setZoom} />
          {s.idBackPhoto && <KycDoc label="Verso" photo={s.idBackPhoto} onZoom={setZoom} />}
        </div>

        {error && <div className="alert alert-danger mt"><Icon name="alert" size={17} />{error}</div>}

        {!done && !action && (
          <div className="mt">
            <button className="btn btn-teal mb" onClick={() => decide('approve')} disabled={busy}>
              <Icon name="check" size={18} />Approuver — identité vérifiée
            </button>
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => { setAction('reject'); setReason(''); }}>Rejeter (corrigible)</button>
              <button className="btn btn-danger-ghost btn-sm" onClick={() => { setAction('refuse'); setReason(''); }}>Refuser définitivement</button>
            </div>
          </div>
        )}

        {!done && action && (
          <div className="mt kyc-decision-box">
            <div className="field">
              <label>{action === 'reject' ? 'Motif du rejet (visible par l\'utilisateur)' : 'Motif du refus définitif'}</label>
              <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder={action === 'reject' ? 'Ex. : Photo du recto illisible, reprenez-la nette.' : 'Ex. : Document falsifié.'} autoFocus />
            </div>
            {action === 'refuse' && (
              <div className="alert alert-danger" style={{ fontSize: 12.5 }}>
                <Icon name="alert" size={16} />
                <span>Le refus définitif bloque toute nouvelle tentative. Action irréversible.</span>
              </div>
            )}
            <div className="row">
              <button className="btn btn-ghost btn-sm" onClick={() => setAction(null)}>Annuler</button>
              <button className={`btn btn-sm ${action === 'refuse' ? 'btn-danger-ghost' : 'btn-primary'}`}
                onClick={() => decide(action)} disabled={busy || reason.trim().length < 5}>
                {busy ? <span className="spinner" /> : action === 'reject' ? 'Confirmer le rejet' : 'Confirmer le refus définitif'}
              </button>
            </div>
          </div>
        )}

        {done && (
          <div className={`alert ${s.status === 'approved' ? 'alert-teal' : 'alert-danger'} mt`} style={{ marginBottom: 0 }}>
            <Icon name={s.status === 'approved' ? 'check' : 'x'} size={17} />
            <span>Décision : {s.status === 'approved' ? 'approuvé' : s.status === 'refused' ? 'refusé définitivement' : 'rejeté'}
            {s.decisionReason ? ` — ${s.decisionReason}` : ''}</span>
          </div>
        )}
      </div>

      {data.history.length > 0 && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}><Icon name="clock" size={17} />Historique des décisions</h2>
          {data.history.map((h) => (
            <div className="kyc-history-row" key={h.id}>
              <KycStatusPill status={h.decision === 'approve' ? 'approved' : h.decision === 'refuse' ? 'refused' : 'rejected'} />
              <div className="grow">
                <div style={{ fontSize: 12.5 }}>{h.reason || '—'}</div>
                <div className="muted" style={{ fontSize: 11 }}>{h.adminName} · {DT_FMT.format(h.at)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {zoom && (
        <div className="modal-backdrop" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Document" className="kyc-zoom" onClick={(e) => e.stopPropagation()} />
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

const PCT_FMT = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 1 });

function KpiPanel() {
  const [d, setD] = useState(null);

  useEffect(() => { api('/admin/kpis').then(setD); }, []);

  if (!d) return <SkeletonList count={4} avatar={false} lines={1} />;
  const { kpis, totals } = d;

  return (
    <div>
      <div className="alert alert-teal">
        <Icon name="fileText" size={17} />
        <span>
          Cibles à 6 mois post-lancement (plan de projet §7). Calculées en direct sur {totals.transactions} transaction(s)
          et {totals.users} membre(s) — les taux se stabilisent avec le volume, à interpréter avec prudence tant que
          l'échantillon est petit.
        </span>
      </div>

      <KpiCard
        title="Transactions complétées / mois" icon="repeat"
        value={`${kpis.transactionsPerMonth.value}`} targetLabel="Cible : 150+/mois"
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
        title="Taux de litige" icon="alert"
        value={PCT_FMT.format(kpis.disputeRate.value)} targetLabel="Cible : < 5 %"
        status={kpiStatus(kpis.disputeRate)}
      />

      <KpiCard
        title="Résolution litige < 7 jours" icon="clock"
        value={kpis.resolutionRate.value === null ? '—' : PCT_FMT.format(kpis.resolutionRate.value)}
        targetLabel={`Cible : > 90 % · ${kpis.resolutionRate.sampleSize} litige(s) résolu(s)`}
        status={kpiStatus(kpis.resolutionRate)}
      />

      <KpiCard
        title="Voyageurs récurrents (2+ transports)" icon="star"
        value={PCT_FMT.format(kpis.recurringTravelers.value)}
        targetLabel={`Cible : > 40 % · ${kpis.recurringTravelers.sampleSize} voyageur(s)`}
        status={kpiStatus(kpis.recurringTravelers)}
      />

      <KpiCard
        title="Désintermédiation estimée" icon="chat"
        value={PCT_FMT.format(kpis.desintermediationRate.value)}
        targetLabel={`Cible : < 15 % · ${kpis.desintermediationRate.sampleSize} message(s)`}
        status={kpiStatus(kpis.desintermediationRate)}
      />

      <KpiCard
        title="Délai moyen de matching" icon="clock"
        value={kpis.avgMatchHours.value === null ? '—' : `${Math.round(kpis.avgMatchHours.value)} h`}
        targetLabel="Cible : < 72 h (annonce → accord)"
        status={kpiStatus(kpis.avgMatchHours)}
      />

      <KpiCard title="NPS" icon="star" value="—" targetLabel="Cible : > 50" status="nodata">
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

function FraudPanel({ data: d, error, reload }) {
  if (error) {
    return (
      <div className="alert alert-danger">
        <Icon name="alert" size={17} />{error}
        <button className="link-btn" style={{ marginLeft: 8 }} onClick={reload}>Réessayer</button>
      </div>
    );
  }
  if (!d) return <SkeletonList count={4} avatar={false} lines={2} />;

  return (
    <div>
      <div className="alert alert-warn">
        <Icon name="alert" size={17} />
        <span>
          Signaux de corrélation, pas des verdicts. Un IP partagé ou un taux d'annulation élevé appelle une revue
          humaine — jamais une sanction automatique (PRD §5 : collusion, faux KYC, désintermédiation).
        </span>
      </div>

      <FraudSection icon="user" title="Comptes potentiellement liés" count={d.linkedAccounts.length}
        help="Même téléphone ou même adresse IP à l'inscription — signe possible de doublons ou de complicité."
        empty="Aucun rapprochement détecté.">
        {d.linkedAccounts.map((g, i) => (
          <div className="list-row" key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
            <div className="grow">
              <span className="pill pill-gray mb" style={{ fontSize: 11 }}>{g.signal === 'phone' ? 'Téléphone' : 'IP'} : {g.value}</span>
              <div style={{ fontSize: 13 }}>
                {g.users.map((u) => <div key={u.id}>{u.name} — {u.email}</div>)}
              </div>
            </div>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="repeat" title="Paires expéditeur/voyageur récurrentes" count={d.repeatPairs.length}
        help="Deux comptes qui transigent toujours ensemble — risque de fausses transactions ou de collusion sur les litiges."
        empty="Aucune paire récurrente.">
        {d.repeatPairs.map((p, i) => (
          <div className="list-row" key={i} style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none', paddingTop: i > 0 ? 10 : 0, marginTop: i > 0 ? 10 : 0 }}>
            <div className="grow" style={{ fontSize: 13 }}>
              <b>{p.users.map((u) => u.name).join(' ↔ ')}</b>
              <div className="muted" style={{ fontSize: 12 }}>
                {p.transactionCount} transactions · {p.totalValueEur} € cumulés
                {p.disputedCount > 0 ? ` · ${p.disputedCount} litige(s)` : ''}
              </div>
            </div>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="chat" title="Désintermédiation détectée" count={d.flaggedMessaging.length}
        help="Utilisateurs dont des messages ont été signalés pour partage de coordonnées hors app."
        empty="Aucun message signalé.">
        {d.flaggedMessaging.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name}</div>
            <span className="pill pill-danger">{u.count} message(s)</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="alert" title="Taux d'annulation anormal" count={d.abnormalCancel.length}
        help="3+ transactions passées, plus de 20 % d'annulation — à confronter aux avis et litiges."
        empty="Rien d'anormal.">
        {d.abnormalCancel.map((u) => (
          <div className="list-row" key={u.id}>
            <div className="grow">{u.name} <span className="muted" style={{ fontSize: 12 }}>({u.completed} transactions)</span></div>
            <span className="pill pill-danger">{PCT_FMT.format(u.cancelRate)}</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="fileText" title="Litiges répétés" count={d.disputeProne.length}
        help="Comptes impliqués dans 2+ litiges — utile pour repérer une source de friction récurrente."
        empty="Aucun compte au-delà d'un litige isolé.">
        {d.disputeProne.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name}</div>
            <span className="pill pill-saffron">{u.disputeCount} litiges</span>
          </div>
        ))}
      </FraudSection>

      <FraudSection icon="shieldCheck" title="Tentatives KYC répétées" count={d.kycRepeatRejections.length}
        help="2+ soumissions rejetées ou refusées pour le même compte — signal de faux document."
        empty="Rien à signaler.">
        {d.kycRepeatRejections.map((u) => (
          <div className="list-row" key={u.userId}>
            <div className="grow">{u.name} <span className="muted" style={{ fontSize: 12 }}>(statut actuel : {u.currentStatus})</span></div>
            <span className="pill pill-danger">{u.rejectionCount} rejets</span>
          </div>
        ))}
      </FraudSection>
    </div>
  );
}
