import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CategoryIcon, Icon } from '../Icons.jsx';
import { ConfirmDialog } from '../components.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';

const LISTING_STATUS = {
  published: { label: 'Publiée — en attente de voyageur', pill: 'pill-saffron' },
  pending_review: { label: 'En revue par notre équipe', pill: 'pill-gray' },
  matched: { label: 'Voyageur trouvé', pill: 'pill-teal' },
  rejected: { label: 'Refusée', pill: 'pill-danger' },
  cancelled: { label: 'Retirée', pill: 'pill-gray' },
};
const EDITABLE = ['published', 'pending_review'];

export default function MyShipments() {
  const [listings, setListings] = useState(null);
  const [editing, setEditing] = useState(null);
  const [confirming, setConfirming] = useState(null); // id de l'annonce à retirer
  const toast = useToast();

  const load = () => api('/listings/mine').then((d) => setListings(d.listings));
  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    await api(`/listings/${id}/cancel`, { method: 'POST' });
    load();
    toast.info('Annonce retirée');
  };

  return (
    <div>
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">Mes envois</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>Vos demandes d'envoi et leur statut.</p>
        </div>
        <Link to="/envois/nouveau">
          <button className="btn btn-primary btn-sm"><Icon name="plus" size={16} />Nouvel envoi</button>
        </Link>
      </div>

      {listings === null && <SkeletonList count={2} avatar={true} />}
      {listings?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="package" size={36} />
          <p className="muted">Aucun envoi pour l'instant. Créez votre première demande !</p>
          <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm"><Icon name="plus" size={15} />Publier un envoi</button></Link>
        </div>
      )}

      {listings?.map((l) => {
        const s = LISTING_STATUS[l.status] || { label: l.status, pill: 'pill-gray' };
        const canEdit = EDITABLE.includes(l.status);
        return (
          <div className="card" key={l.id}>
            <div className="list-row">
              <CategoryIcon categoryId={l.categoryId} />
              <div className="grow">
                <b>{l.title}</b>
                <div className="muted">{l.from} → {l.to} · {l.valueEur} €</div>
              </div>
            </div>
            <div className="list-row mt">
              <span className={`pill ${s.pill}`}>{s.label}</span>
              {canEdit && (
                <div className="list-row" style={{ marginLeft: 'auto', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>Modifier</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => setConfirming(l.id)}>Retirer</button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {editing && (
        <EditListingModal listing={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success('Annonce mise à jour'); }} />
      )}

      {confirming && (
        <ConfirmDialog
          title="Retirer cette annonce ?"
          message="Elle ne sera plus visible par les voyageurs. Cette action est définitive."
          confirmLabel="Retirer" danger icon="trash"
          onConfirm={() => cancel(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

function EditListingModal({ listing, onClose, onSaved }) {
  const [form, setForm] = useState({
    title: listing.title, description: listing.description, weightKg: listing.weightKg,
    valueEur: listing.valueEur, dateFrom: listing.dateFrom, dateTo: listing.dateTo,
    travelerPay: listing.travelerPay,
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setErr(''); setBusy(true);
    try {
      await api(`/listings/${listing.id}`, { method: 'PUT', body: form });
      onSaved();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 440 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="package" size={19} />
          <b>Modifier l'annonce</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
          <div className="field">
            <label>Titre</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label>Description</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="row">
            <div className="field">
              <label>Poids (kg)</label>
              <input type="number" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
            </div>
            <div className="field">
              <label>Valeur (€)</label>
              <input type="number" value={form.valueEur} onChange={(e) => setForm({ ...form, valueEur: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>Entre le</label>
              <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
            </div>
            <div className="field">
              <label>et le</label>
              <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>Rémunération voyageur (€)</label>
            <input type="number" value={form.travelerPay} onChange={(e) => setForm({ ...form, travelerPay: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.title}>
            {busy ? <span className="spinner" /> : 'Enregistrer'}
          </button>
        </div>
      </div>
    </div>
  );
}
