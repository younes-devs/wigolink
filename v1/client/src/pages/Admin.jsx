import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';

export default function Admin() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api('/admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  useEffect(() => { load(); }, [load]);

  const decide = async (id, decision) => {
    await api(`/admin/review/${id}`, { method: 'POST', body: { decision } });
    load();
  };

  if (error) return <div className="alert alert-danger">{error}</div>;
  if (!data) return <div className="muted center">Chargement…</div>;

  const { stats, reviewQueue } = data;

  return (
    <div>
      <h1 className="page-title">Back-office</h1>
      <p className="page-sub">Revue humaine, litiges et surveillance fraude.</p>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{stats.users}</div><div className="lbl">Membres</div></div>
        <div className="stat"><div className="num">{stats.released}/{stats.transactions}</div><div className="lbl">Transactions livrées</div></div>
        <div className="stat"><div className="num">{stats.escrowHeld.toFixed(0)} €</div><div className="lbl">Escrow séquestré</div></div>
        <div className="stat"><div className="num">{stats.flaggedMessages}</div><div className="lbl">Messages signalés 🚩</div></div>
      </div>

      <h2 style={{ fontSize: 16, fontWeight: 800, margin: '16px 0 8px' }}>File de revue ({reviewQueue.length})</h2>
      {reviewQueue.length === 0 && <div className="card muted center">File vide — rien à arbitrer. ✅</div>}

      {reviewQueue.map((item) => (
        <div className="card" key={item.id}>
          {item.type === 'listing' && item.listing && (
            <>
              <span className="pill pill-saffron mb">Zone grise — revue produit</span>
              <div className="mt"><b>{item.listing.icon} {item.listing.title}</b></div>
              <div className="muted mb" style={{ fontSize: 13 }}>{item.listing.description} · {item.listing.valueEur} €</div>
              <div className="row">
                <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'approve')}>✅ Publier</button>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'reject')}>❌ Refuser</button>
              </div>
            </>
          )}
          {item.type === 'dispute' && item.dispute && (
            <>
              <span className="pill pill-danger mb">⚖️ Litige — {item.dispute.txId}</span>
              <div className="mt mb" style={{ fontSize: 13.5 }}>
                <b>Motif :</b> {item.dispute.reason}
                {item.dispute.evidence.map((e, i) => (
                  <div key={i} className="muted mt" style={{ fontSize: 12.5 }}>Preuve : {e.text}</div>
                ))}
              </div>
              <div className="alert alert-warn" style={{ fontSize: 12.5 }}>
                Grille : état ≠ vidéo de scellage → responsabilité voyageur (rembourser).
                Conforme à la vidéo mais ≠ annonce → responsabilité expéditeur (payer le voyageur).
              </div>
              <div className="row">
                <button className="btn btn-teal btn-sm" onClick={() => decide(item.id, 'release_traveler')}>Payer le voyageur</button>
                <button className="btn btn-danger-ghost btn-sm" onClick={() => decide(item.id, 'refund_sender')}>Rembourser l'expéditeur</button>
              </div>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
