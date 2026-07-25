import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../shared/ui/Skeleton.jsx';
import { useToast } from '../../../shared/ui/Toast.jsx';
import { t, useLang } from '../../../i18n.js';

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
  const [commandCenter, setCommandCenter] = useState(null);
  const [editing, setEditing] = useState(null);
  const toast = useToast();

  const load = () => api('/shipments/command-center').then((d) => setCommandCenter(d.commandCenter));
  useEffect(() => { load(); }, []);

  const cancel = (listing) => {
    setCommandCenter((prev) => prev && ({
      ...prev,
      items: prev.items.filter((i) => i.listing.id !== listing.id),
      totals: {
        ...prev.totals,
        total: Math.max(0, prev.totals.total - 1),
        active: Math.max(0, prev.totals.active - 1),
      },
    }));
    const timer = setTimeout(() => {
      api(`/listings/${listing.id}/cancel`, { method: 'POST' }).catch(() => load());
    }, 5000);
    toast.action(t('ship.toast.removed'), t('ship.undo'), () => { clearTimeout(timer); load(); });
  };

  const items = commandCenter?.items;

  return (
    <div>
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('ship.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('ship.sub')}</p>
        </div>
        <div className="list-row" style={{ gap: 8 }}>
          <Link to="/matching" className="btn btn-ghost btn-sm"><Icon name="user" size={15} />{t('matching.nav')}</Link>
          <Link to="/envois/nouveau">
            <button className="btn btn-primary btn-sm"><Icon name="plus" size={16} />{t('ship.new')}</button>
          </Link>
        </div>
      </div>

      {commandCenter && <ShipmentCommandCenter data={commandCenter} />}

      {items === undefined && <SkeletonList count={2} avatar={true} />}
      {items?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="package" size={36} />
          <p className="muted">{t('ship.empty')}</p>
          <Link to="/envois/nouveau"><button className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('feed.empty.publish')}</button></Link>
        </div>
      )}

      <div className="shipment-board">
        {items?.map(({ listing: l, transaction, action, risk }) => {
          const s = LISTING_STATUS[l.status] || { key: null, pill: 'pill-gray' };
          const canEdit = EDITABLE.includes(l.status);
          return (
            <div className={`card shipment-card ${action.priority === 'high' ? 'shipment-card-hot' : ''}`} key={l.id}>
              <div className="shipment-card-head">
                <CategoryIcon categoryId={l.categoryId} />
                <div className="grow">
                  <b>{l.title}</b>
                  <div className="muted">{l.from} {'->'} {l.to} · {l.valueEur} € · {l.weightKg} kg</div>
                </div>
                <span className={`pill ${s.pill}`}>{s.key ? t(s.key) : l.status}</span>
              </div>
              <div className="shipment-card-body">
                <div>
                  <span className="mini-label">{t('ship.command.next')}</span>
                  <b>{t(`ship.action.${action.id}`)}</b>
                  <p className="muted">{t(`ship.action.${action.id}.sub`)}</p>
                </div>
                <div className="shipment-proof">
                  <span><Icon name="euro" size={15} />{transaction?.escrow?.amount ? `${transaction.escrow.amount} € ${t('ship.command.escrow')}` : `${l.travelerPay} € ${t('ship.command.pay')}`}</span>
                  <span><Icon name="clock" size={15} />{l.dateFrom} {'->'} {l.dateTo}</span>
                </div>
              </div>
              {(risk.customs || risk.gray || risk.disputed) && (
                <div className="shipment-risks">
                  {risk.customs && <span className="pill pill-saffron">{t('ship.risk.customs')}</span>}
                  {risk.gray && <span className="pill pill-gray">{t('ship.risk.gray')}</span>}
                  {risk.disputed && <span className="pill pill-danger">{t('ship.risk.disputed')}</span>}
                </div>
              )}
              <div className="list-row mt">
                <Link to={action.href} className="btn btn-primary btn-sm"><Icon name="arrowRight" size={15} />{t('ship.command.open')}</Link>
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
      </div>

      {editing && (
        <EditListingModal listing={editing} onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); toast.success(t('ship.toast.updated')); }} />
      )}
    </div>
  );
}

function ShipmentCommandCenter({ data }) {
  const totals = data.totals || {};
  return (
    <section className="ship-command">
      <div className="ship-command-hero">
        <div>
          <span className="mini-label">{t('ship.command.label')}</span>
          <h2>{t('ship.command.title')}</h2>
          <p>{t('ship.command.sub')}</p>
        </div>
        <Link to="/envois/nouveau" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('ship.new')}</Link>
      </div>
      <div className="ship-command-metrics">
        <CommandMetric icon="package" label={t('ship.metric.active')} value={totals.active || 0} />
        <CommandMetric icon="clock" label={t('ship.metric.pending')} value={totals.pendingReview || 0} />
        <CommandMetric icon="plane" label={t('ship.metric.transit')} value={totals.inTransit || 0} />
        <CommandMetric icon="euro" label={t('ship.metric.escrow')} value={`${Math.round((totals.escrowHeld || 0) * 100) / 100} €`} />
      </div>
      {data.actions?.length > 0 && (
        <div className="ship-action-strip">
          {data.actions.map((a) => (
            <Link to={a.action.href} className={`ship-action-chip ${a.action.priority}`} key={a.id}>
              <Icon name={a.action.priority === 'high' ? 'alert' : 'clock'} size={16} />
              <span>{t(`ship.action.${a.action.id}`)}</span>
              <b>{a.title}</b>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function CommandMetric({ icon, label, value }) {
  return (
    <div className="ship-command-metric">
      <Icon name={icon} size={17} />
      <span>{label}</span>
      <b>{value}</b>
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
