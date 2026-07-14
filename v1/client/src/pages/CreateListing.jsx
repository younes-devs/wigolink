import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { KycRequiredNotice, Stepper } from '../components.jsx';
import { Icon } from '../Icons.jsx';
import { SkeletonCard } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';
import { t, useLang } from '../i18n.js';

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
    img.onerror = () => reject(new Error(t('err.image.unreadable')));
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
  useLang();
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
      toast.success(d.listing.status === 'pending_review' ? t('create.toast.review') : t('create.toast.published'));
    } catch (e) {
      if (e.data?.needsKyc) setNeedsKyc(true);
      else setError(e.message);
    }
  };

  return (
    <div>
      <div className="list-row">
        <h1 className="page-title grow">{t('create.title')}</h1>
        <button className="autofill-btn" onClick={autofill} title="Remplir avec des données de test">
          <Icon name="sparkles" size={14} />Remplir (test)
        </button>
      </div>
      <Stepper labels={[t('create.step.package'), t('create.step.route'), t('create.step.customs')]} current={step} onGo={setStep} />

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 0 && (
        <div className="card">
          <div className="field">
            <label>{t('create.what')}</label>
            <select value={form.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              <option value="">{t('create.cat.choose')}</option>
              {rules.whitelist.map((c) => (
                <option key={c.id} value={c.id}>{c.label} ({t('create.cat.max')} {c.maxQty})</option>
              ))}
              <option value="autre">{t('create.cat.other')}</option>
            </select>
            <div className="hint">
              {t('create.forbidden')}{' '}
              <button type="button" className="link-btn" onClick={() => setShowBlacklist(true)}>
                {t('create.forbidden.link')}
              </button>
            </div>
          </div>
          {form.categoryId === 'autre' && (
            <div className="field">
              <label>{t('create.other.what')}</label>
              <input value={form.categoryLabel} onChange={(e) => set('categoryLabel', e.target.value)}
                placeholder={t('create.other.ph')} />
              <div className="hint">{t('create.other.hint')}</div>
            </div>
          )}
          <div className="field">
            <label>{t('create.listing.title')}</label>
            <input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder={t('create.listing.title.ph')} />
          </div>
          <div className="field">
            <label>{t('create.desc')}</label>
            <textarea rows={3} value={form.description} onChange={(e) => set('description', e.target.value)}
              placeholder={t('create.desc.ph')} />
          </div>
          <div className="row">
            <div className="field">
              <label>{t('create.weight')}</label>
              <input type="number" value={form.weightKg} onChange={(e) => set('weightKg', e.target.value)} />
            </div>
            <div className="field">
              <label>{t('create.value')}</label>
              <input type="number" value={form.valueEur} onChange={(e) => set('valueEur', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t('create.photos')}</label>
            <div className="photo-picker">
              {form.photos.map((p, i) => (
                <div key={i} className="photo-thumb">
                  <img src={p} alt={`Photo ${i + 1}`} />
                  <button type="button" onClick={() => set('photos', form.photos.filter((_, j) => j !== i))} aria-label={t('common.remove')}>
                    <Icon name="x" size={12} />
                  </button>
                </div>
              ))}
              {form.photos.length < 3 && (
                <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                  <Icon name="image" size={20} />
                  {t('create.photos.add')}
                </button>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={addPhotos} />
            <div className="hint">{t('create.photos.hint')}</div>
          </div>
          <button className="btn btn-primary"
            disabled={!form.categoryId || !form.title || !form.valueEur || form.photos.length === 0
              || (form.categoryId === 'autre' && !form.categoryLabel.trim())}
            onClick={() => setStep(1)}>{t('common.continue')}</button>
        </div>
      )}

      {step === 1 && (
        <div className="card">
          <div className="row">
            <div className="field">
              <label>{t('create.from')}</label>
              <select value={form.from} onChange={(e) => { set('from', e.target.value); set('to', e.target.value === 'Casablanca' ? 'Bruxelles' : 'Casablanca'); }}>
                <option>Casablanca</option>
                <option>Bruxelles</option>
              </select>
            </div>
            <div className="field">
              <label>{t('create.to')}</label>
              <input value={form.to} disabled />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>{t('create.date.from')}</label>
              <input type="date" value={form.dateFrom} onChange={(e) => set('dateFrom', e.target.value)} />
            </div>
            <div className="field">
              <label>{t('create.date.to')}</label>
              <input type="date" value={form.dateTo} onChange={(e) => set('dateTo', e.target.value)} />
            </div>
          </div>
          <div className="field">
            <label>{t('create.pay')}</label>
            <input type="number" value={form.travelerPay} onChange={(e) => set('travelerPay', e.target.value)} />
            {(() => {
              const { low, high } = suggestedPay(form.weightKg);
              return (
                <div className="pay-suggest">
                  <span className="muted">{t('create.pay.suggest', { w: form.weightKg || '?' })}</span>
                  <button type="button" className="pay-chip" onClick={() => set('travelerPay', low)}>{low} €</button>
                  <button type="button" className="pay-chip" onClick={() => set('travelerPay', high)}>{high} €</button>
                </div>
              );
            })()}
            {form.travelerPay > 0 && (
              <div className="hint">
                {t('create.pay.commission', { c: Math.round(form.travelerPay * 0.18 * 100) / 100, total: Math.round(form.travelerPay * 1.18 * 100) / 100 })}
              </div>
            )}
          </div>
          <div className="field">
            <label>{t('create.recipient')}</label>
            <input value={form.recipientPhone} onChange={(e) => set('recipientPhone', e.target.value)} placeholder="+32…" />
            <div className="hint">{t('create.recipient.hint')}</div>
          </div>
          <button className="btn btn-primary" disabled={!form.dateFrom || !form.dateTo || !form.travelerPay}
            onClick={() => setStep(2)}>{t('common.continue')}</button>
        </div>
      )}

      {step === 2 && (
        <div>
          {/* Écran douane dédié — acceptation explicite, pas une checkbox CGU (PRD §1.3) */}
          <div className="card">
            <h2 style={{ marginBottom: 10 }}><Icon name="fileText" size={17} />{t('create.customs.title', { label: corridor.label })}</h2>
            <div className="alert alert-warn">
              <b>{t('create.customs.franchise', { franchise: corridor.franchise })}</b>
            </div>
            <ul style={{ paddingLeft: 18, fontSize: 13.5, lineHeight: 1.6 }}>
              {corridor.rules.map((r, i) => <li key={i}>{r}</li>)}
              {selectedCat && <li>{t('create.customs.maxqty', { cat: selectedCat.label.toLowerCase(), max: selectedCat.maxQty })}</li>}
            </ul>
            <div className="divider" />
            <p style={{ fontSize: 13.5, lineHeight: 1.5 }}>{t('create.customs.resp')}</p>
            <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 12, fontSize: 14, fontWeight: 700 }}>
              <input type="checkbox" style={{ width: 20, height: 20 }} checked={form.customsAccepted}
                onChange={(e) => set('customsAccepted', e.target.checked)} />
              {t('create.customs.accept')}
            </label>
          </div>
          {needsKyc && <KycRequiredNotice />}
          <button className="btn btn-primary" disabled={!form.customsAccepted} onClick={submit}>
            {t('create.submit')}
          </button>
        </div>
      )}

      {showBlacklist && (
        <div className="modal-backdrop" onClick={() => setShowBlacklist(false)}>
          <div className="modal" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <Icon name="alert" size={19} />
              <b>{t('create.blacklist.title')}</b>
              <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={() => setShowBlacklist(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <div style={{ padding: '0 16px 16px' }}>
              <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>{t('create.blacklist.intro')}</p>
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
