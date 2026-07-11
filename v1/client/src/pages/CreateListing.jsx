import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';

// Création de demande d'envoi — parcours ≤ 3 écrans (PRD §6 accessibilité)
export default function CreateListing() {
  const nav = useNavigate();
  const [rules, setRules] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    title: '', categoryId: '', description: '', weightKg: '', valueEur: '',
    from: 'Casablanca', to: 'Bruxelles', dateFrom: '', dateTo: '', travelerPay: '',
    recipientPhone: '', customsAccepted: false,
  });

  useEffect(() => { api('/rules').then(setRules); }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  if (!rules) return <div className="muted center">Chargement…</div>;

  const corridor = form.from === 'Casablanca' ? rules.customs['MA-EU'] : rules.customs['EU-MA'];
  const selectedCat = rules.whitelist.find((c) => c.id === form.categoryId);

  const submit = async () => {
    setError('');
    try {
      const d = await api('/listings', { method: 'POST', body: form });
      nav(d.listing.status === 'pending_review' ? '/envois' : '/envois');
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <h1 className="page-title">Nouvel envoi</h1>
      <div className="step-dots">{[0, 1, 2].map((i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 0 && (
        <div className="card">
          <div className="field">
            <label>Que voulez-vous envoyer ?</label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Choisir une catégorie autorisée —</option>
              {rules.whitelist.map((c) => (
                <option key={c.id} value={c.id}>{c.icon} {c.label} (max {c.maxQty})</option>
              ))}
              <option value="autre">❓ Autre (revue humaine avant publication)</option>
            </select>
            <div className="hint">
              Interdits : {rules.blacklist.slice(0, 4).map((b) => b.label.toLowerCase()).join(', ')}…
            </div>
          </div>
          <div className="field">
            <label>Titre de l'annonce</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex. : Huile d'argan pour ma fille" />
          </div>
          <div className="field">
            <label>Description précise du contenu</label>
            <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder="Marque, conditionnement, scellé ou non…" />
          </div>
          <div className="row">
            <div className="field">
              <label>Poids (kg)</label>
              <input type="number" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
            </div>
            <div className="field">
              <label>Valeur (€)</label>
              <input type="number" value={form.valueEur} onChange={(e) => set('valueEur', e.target.value)} />
            </div>
          </div>
          <button className="btn btn-primary" disabled={!form.categoryId || !form.title || !form.valueEur}
            onClick={() => setStep(1)}>Continuer</button>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div className="row">
            <div className="field">
              <label>Départ</label>
              <select value={form.from} onChange={(e) => { set('from', e.target.value); set('to', e.target.value === 'Casablanca' ? 'Bruxelles' : 'Casablanca'); }}>
                <option>Casablanca</option>
                <option>Bruxelles</option>
              </select>
            </div>
            <div className="field">
              <label>Arrivée</label>
              <input value={form.to} disabled />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Entre le</label>
              <input type="date" value={form.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            </div>
            <div className="field">
              <label>et le</label>
              <input type="date" value={form.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>Rémunération proposée au voyageur (€)</label>
            <input type="number" value={form.travelerPay} onChange={(e) => set('travelerPay', e.target.value)} />
            {form.travelerPay > 0 && (
              <div className="hint">
                + commission plateforme 18 % ({Math.round(form.travelerPay * 0.18 * 100) / 100} €) —
                total payé : {Math.round(form.travelerPay * 1.18 * 100) / 100} €
              </div>
            )}
          </div>
          <div className="field">
            <label>Téléphone du destinataire (optionnel)</label>
            <input value={form.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} placeholder="+32…" />
            <div className="hint">S'il a un compte Salama, il validera la livraison.</div>
          </div>
          <button className="btn btn-primary" disabled={!form.dateFrom || !form.dateTo || !form.travelerPay}
            onClick={() => setStep(2)}>Continuer</button>
        </div>
      )}

      {step === 2 && (
        <div>
          {/* Écran douane dédié — acceptation explicite, pas une checkbox CGU (PRD §1.3) */}
          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 10 }}>🛃 Règles douanières — {corridor.label}</h2>
            <div className="alert alert-warn">
              <b>Franchise applicable : {corridor.franchise}</b>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {corridor.rules.map((r, i) => <li key={i}>{r}</li>)}
              {selectedCat && <li>Quantité max pour {selectedCat.label.toLowerCase()} : <b>{selectedCat.maxQty}</b> par envoi.</li>}
            </ul>
            <div className="divider" />
            <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              <b>Vous êtes responsable</b> de la conformité du contenu déclaré. En cas de saisie douanière d'un
              produit conforme à votre déclaration, le risque est porté par vous (expéditeur). Le voyageur peut
              refuser le transport sans pénalité lors de la remise.
            </p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 14, fontWeight: 700 }}>
              <input type="checkbox" style={{ width: 20, height: 20 }} checked={form.customsAccepted}
                onChange={(e) => set('customsAccepted', e.target.checked)} />
              J'ai lu et j'accepte explicitement ces règles et responsabilités.
            </label>
          </div>
          <button className="btn btn-primary" disabled={!form.customsAccepted} onClick={submit}>
            📦 Publier ma demande d'envoi
          </button>
        </div>
      )}
    </div>
  );
}
