import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { Icon } from '../Icons.jsx';

export default function Admin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('review'); // review | kpis

  const load = useCallback(() => {
    api('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    await api(`/admin/review/${id}`, { method: 'POST', body: { decision } });
    load();
  };

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!data) return <div className="muted center">Chargement…</div>;

  const { stats, reviewQueue } = data;

  return (
    <div>
      <h1 className="page-title">Back-office</h1>
      <p className="page-sub">Revue humaine, litiges, KPIs et surveillance fraude.</p>

      <div className="tabs">
        <button className={tab === 'review' ? 'active' : ''} onClick={() => setTab('review')}>
          File de revue {reviewQueue.length > 0 ? `(${reviewQueue.length})` : ''}
        </button>
        <button className={tab === 'kpis' ? 'active' : ''} onClick={() => setTab('kpis')}>KPIs</button>
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
                <>
                  <span className="pill pill-saffron mb"><Icon name="alert" size={13} />Zone grise — revue produit</span>
                  <div className="mt"><b>{item.listing.title}</b></div>
                  <div className="muted mb" style={{ fontSize: 13 }}>{item.listing.description} · {item.listing.valueEur} €</div>
                  <div className="row">
                    <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'approve')}>
                      <Icon name="check" size={15} />Publier
                    </button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'reject')}>
                      <Icon name="x" size={15} />Refuser
                    </button>
                  </div>
                </>
              )}
              {item.type === 'dispute' && item.dispute && (
                <>
                  <span className="pill pill-danger mb"><Icon name="alert" size={13} />Litige — {item.dispute.txId}</span>
                  <div className="mt mb" style={{ fontSize: 13.5 }}>
                    <b>Motif :</b> {item.dispute.reason}
                    {item.dispute.evidence.map((e, i) => (
                      <div key={i} className="muted mt" style={{ fontSize: 12.5 }}>Preuve : {e.text}</div>
                    ))}
                  </div>
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

      {tab === 'kpis' && <KpiPanel />}
    </div>
  );
}

const PCT_FMT = new Intl.NumberFormat('fr-BE', { style: 'percent', maximumFractionDigits: 1 });

function KpiPanel() {
  const [d, setD] = useState(null);

  useEffect(() => { api('/admin/kpis').then(setD); }, []);

  if (!d) return <div className="muted center">Chargement…</div>;
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
