import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { CategoryIcon, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';
import { t, useLang } from '../i18n.js';

const LISTING_STATUS = {
  published: { key: 'ship.status.published', pill: 'pill-saffron' },
  pending_review: { key: 'ship.status.pending_review', pill: 'pill-gray' },
  matched: { key: 'ship.status.matched', pill: 'pill-teal' },
  rejected: { key: 'ship.status.rejected', pill: 'pill-danger' },
  cancelled: { key: 'ship.status.cancelled', pill: 'pill-gray' },
};
const EDITABLE = ['published', 'pending_review'];

export default function MyShipments() {
  useLang();
  const [listings, setListings] = useState(null);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const load = () => api('/listings/mine').then((d) => setListings(d.listings));
  useEffect(() => { load(); }, []);

  // Retrait réversible (PRD UI/UX U17) : on masque l'annonce tout de suite et on ne commit
  // le retrait côté serveur qu'après la fenêtre d'annulation (5 s). « Annuler » restaure.
  const cancel = (listing) => {
    setListings((prev) => prev.filter((l) => l.id !== listing.id));
    const timer = setTimeout(() => {
      api(`/listings/${listing.id}/cancel`, { method: 'POST' }).catch(() => load());
    }, 5000);
    toast.action(t('ship.toast.removed'), t('ship.undo'), () => { clearTimeout(timer); load(); });
  };

  return (
    <div>
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('ship.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('ship.sub')}</p>
        </div>
        <Link to="/envois/nouveau">
          <button className="btn btn-primary btn-sm"><Icon name="plus" size={16} />{t('ship.new')}</button>
        </Link>
      </div>

      {listings === null && <SkeletonList count={2} avatar={true} />}
      {listings?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="package" size={36} />
          <p className="muted">{t('ship.empty')}</p>
          <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('feed.empty.publish')}</button></Link>
        </div>
      )}

      {listings?.map((l) => {
        const s = LISTING_STATUS[l.status] || { key: null, pill: 'pill-gray' };
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
              <span className={`pill ${s.pill}`}>{s.key ? t(s.key) : l.status}</span>
              {canEdit && (
                <div className="list-row" style={{ marginLeft: 'auto', gap: 8 }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditing(l)}>{t('common.edit')}</button>
                  <button className="btn btn-danger-ghost btn-sm" onClick={() => cancel(l)}>{t('common.remove')}</button>
                </div>
              )}
            </div>
          </div>
        );
      })}

      {editing && (
        <EditListingModal listing={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success(t('ship.toast.updated')); }} />
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
          <b>{t('ship.edit.title')}</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>
        <div style={{ padding: '0 16px 16px' }}>
          {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
          <div className="field">
            <label>{t('ship.edit.name')}</label>
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="field">
            <label>{t('ship.edit.desc')}</label>
            <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="row">
            <div className="field">
              <label>{t('create.weight')}</label>
              <input type="number" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('create.value')}</label>
              <input type="number" value={form.valueEur} onChange={(e) => setForm({ ...form, valueEur: e.target.value })} />
            </div>
          </div>
          <div className="row">
            <div className="field">
              <label>{t('create.date.from')}</label>
              <input type="date" value={form.dateFrom} onChange={(e) => setForm({ ...form, dateFrom: e.target.value })} />
            </div>
            <div className="field">
              <label>{t('create.date.to')}</label>
              <input type="date" value={form.dateTo} onChange={(e) => setForm({ ...form, dateTo: e.target.value })} />
            </div>
          </div>
          <div className="field">
            <label>{t('ship.edit.pay')}</label>
            <input type="number" value={form.travelerPay} onChange={(e) => setForm({ ...form, travelerPay: e.target.value })} />
          </div>
          <button className="btn btn-primary" onClick={save} disabled={busy || !form.title}>
            {busy ? <span className="spinner" /> : t('common.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
