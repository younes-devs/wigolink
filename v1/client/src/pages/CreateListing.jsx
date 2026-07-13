import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { KycRequiredNotice, Stepper } from '../components.jsx';
import { Icon } from '../Icons.jsx';
import { SkeletonCard } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

// Fourchette de rémunération suggérée selon le poids (PRD UI/UX U7) — repère simple
// pour ne pas laisser l'expéditeur fixer un prix à l'aveugle. ~3–5 €/kg, plancher 8 €.
function suggestedPay(weightKg) {
  const w = Number(weightKg) || 0;
  const low = Math.max(8, Math.round(w * 3));
  const high = Math.max(12, Math.round(w * 5));
  return { low, high };
}

// Redimensionne une image en dataURL JPEG (côté client, max 720px).
function resizeImage(file, maxPx = 720) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => reject(new Error('Image illisible'));
    img.src = URL.createObjectURL(file);
  });
}

// Image de test générée (autofill)
function placeholderPhoto(label) {
  const c = document.createElement('canvas');
  c.width = 480; c.height = 360;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 480, 360);
  grad.addColorStop(0, '#e8edf5'); grad.addColorStop(1, '#d5dde9');
  g.fillStyle = grad; g.fillRect(0, 0, 480, 360);
  g.fillStyle = '#5f646e'; g.font = '600 26px sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(label, 240, 172);
  g.font = '13px sans-serif';
  g.fillText('Photo de test', 240, 205);
  return c.toDataURL('image/jpeg', 0.8);
}

// Création de demande d'envoi — parcours ≤ 3 écrans (PRD §6 accessibilité)
export default function CreateListing() {
  const nav = useNavigate();
  const toast = useToast();
  const [rules, setRules] = useState(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [needsKyc, setNeedsKyc] = useState(false);
  const [showBlacklist, setShowBlacklist] = useState(false);
  const [form, setForm] = useState({
    title: '', categoryId: '', categoryLabel: '', description: '', weightKg: '', valueEur: '',
    from: 'Casablanca', to: 'Bruxelles', dateFrom: '', dateTo: '', travelerPay: '',
    recipientPhone: '', customsAccepted: false, photos: [],
  });
  const fileRef = useRef(null);

  const addPhotos = async (e) => {
    const files = [...(e.target.files || [])].slice(0, 3 - form.photos.length);
    const converted = await Promise.all(files.map((f) => resizeImage(f).catch(() => null)));
    setForm((f) => ({ ...f, photos: [...f.photos, ...converted.filter(Boolean)].slice(0, 3) }));
    e.target.value = '';
  };

  useEffect(() => { api('/rules').then(setRules); }, []);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // Mode test : pré-remplit tout le formulaire avec des données plausibles.
  const autofill = () => {
    const picks = [
      { categoryId: 'miel', title: 'Miel de thym pour la famille', description: 'Deux pots de miel de thym scellés (500 g chacun), achetés à la coopérative.', weightKg: 1.2, valueEur: 40, travelerPay: 12 },
      { categoryId: 'safran', title: 'Safran de Taliouine', description: 'Boîte scellée de 20 g de safran en filaments, origine Taliouine.', weightKg: 0.1, valueEur: 60, travelerPay: 10 },
      { categoryId: 'argan', title: "Huile d'argan cosmétique", description: "Deux flacons scellés d'huile d'argan cosmétique pressée à froid (250 ml).", weightKg: 0.8, valueEur: 35, travelerPay: 10 },
      { categoryId: 'dattes', title: 'Dattes Medjool du bled', description: 'Trois kilos de dattes Medjool en barquettes operculées.', weightKg: 3, valueEur: 45, travelerPay: 14 },
    ];
    const p = picks[Math.floor(Math.random() * picks.length)];
    const in7 = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
    const in21 = new Date(Date.now() + 21 * 864e5).toISOString().slice(0, 10);
    setForm((f) => ({
      ...f, ...p, from: 'Casablanca', to: 'Bruxelles', dateFrom: in7, dateTo: in21,
      recipientPhone: '+32470000003', customsAccepted: false,
      photos: [placeholderPhoto(p.title)],
    }));
    setStep(2);
  };

  if (!rules) return <SkeletonCard lines={3} />;

  const corridor = form.from === 'Casablanca' ? rules.customs['MA-EU'] : rules.customs['EU-MA'];
  const selectedCat = rules.whitelist.find((c) => c.id === form.categoryId);

  const submit = async () => {
    setError(''); setNeedsKyc(false);
    try {
      const d = await api('/listings', { method: 'POST', body: form });
      nav('/envois');
      toast.success(d.listing.status === 'pending_review' ? 'Envoi soumis, en revue avant publication' : 'Annonce publiée !');
    } catch (e) {
      if (e.data?.needsKyc) setNeedsKyc(true);
      else setError(e.message);
    }
  };

  return (
    <div>
      <div className="list-row">
        <h1 className="page-title grow">Nouvel envoi</h1>
        <button className="autofill-btn" onClick={autofill} title="Remplir avec des données de test">
          <Icon name="sparkles" size={14} />Remplir (test)
        </button>
      </div>
      <Stepper labels={['Colis', 'Trajet & prix', 'Douane']} current={step} onGo={setStep} />

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 0 && (
        <div className="card">
          <div className="field">
            <label>Que voulez-vous envoyer ?</label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">— Choisir une catégorie autorisée —</option>
              {rules.whitelist.map((c) => (
                <option key={c.id} value={c.id}>{c.label} (max {c.maxQty})</option>
              ))}
              <option value="autre">Autre (revue humaine avant publication)</option>
            </select>
            <div className="hint">
              Certains produits sont interdits (compléments, médicaments, produits non scellés…).{' '}
              <button type="button" className="link-btn" onClick={() => setShowBlacklist(true)}>
                Voir la liste complète
              </button>
            </div>
          </div>
          {form.categoryId === 'autre' && (
            <div className="field">
              <label>Quel type de produit ?</label>
              <input value={form.categoryLabel} onChange={(e) => set('categoryLabel', e.target.value)}
                placeholder="Ex. : Confiture d'abricots artisanale" />
              <div className="hint">
                Un membre de notre équipe valide cette catégorie avant publication. Une fois approuvée,
                les envois suivants du même type seront publiés directement.
              </div>
            </div>
          )}
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
          <div className="field">
            <label>Photos du produit (obligatoire, 3 max)</label>
            <div className="photo-picker">
              {form.photos.map((p, i) => (
                <div key={i} className="photo-thumb">
                  <img src={p} alt={`Photo ${i + 1}`} />
                  <button type="button" onClick={() => set('photos', form.photos.filter((_, j) => j !== i))} aria-label="Retirer">
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              {form.photos.length < 3 && (
                <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                  <Icon name="image" size={20} />
                  Ajouter
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} />
            <div className="hint">Le voyageur doit voir exactement ce qu'il transportera.</div>
          </div>
          <button className="btn btn-primary"
            disabled={!form.categoryId || !form.title || !form.valueEur || form.photos.length === 0
              || (form.categoryId === 'autre' && !form.categoryLabel.trim())}
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
            {(() => {
              const { low, high } = suggestedPay(form.weightKg);
              return (
                <div className="pay-suggest">
                  <span className="muted">Suggéré pour {form.weightKg || '?'} kg :</span>
                  <button type="button" className="pay-chip" onClick={() => set('travelerPay', low)}>{low} €</button>
                  <button type="button" className="pay-chip" onClick={() => set('travelerPay', high)}>{high} €</button>
                </div>
              );
            })()}
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
            <div className="hint">S'il a un compte Wigofly, il validera la livraison.</div>
          </div>
          <button className="btn btn-primary" disabled={!form.dateFrom || !form.dateTo || !form.travelerPay}
            onClick={() => setStep(2)}>Continuer</button>
        </div>
      )}

      {step === 2 && (
        <div>
          {/* Écran douane dédié — acceptation explicite, pas une checkbox CGU (PRD §1.3) */}
          <div className="card">
            <h2 style={{ marginBottom: 10 }}><Icon name="fileText" size={17} />Règles douanières — {corridor.label}</h2>
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
          {needsKyc && <KycRequiredNotice />}
          <button className="btn btn-primary" disabled={!form.customsAccepted} onClick={submit}>
            Publier ma demande d'envoi
          </button>
        </div>
      )}

      {showBlacklist && (
        <div className="modal-backdrop" onClick={() => setShowBlacklist(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name="alert" size={19} />
              <b>Produits interdits</b>
              <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={() => setShowBlacklist(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                Ces produits ne peuvent pas être transportés via Wigofly, pour des raisons douanières ou de sécurité.
              </p>
              <ul className="blacklist-list">
                {rules.blacklist.map((b) => (
                  <li key={b.id}>
                    <Icon name="x" size={14} />
                    <span><b>{b.label}</b>{b.reason ? ` — ${b.reason}` : ''}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
