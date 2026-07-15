import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge, Stars } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { t, useLang, dateLocale } from '../i18n.js';

const memberFmt = () => new Intl.DateTimeFormat(dateLocale(), { month: 'long', year: 'numeric' });

export default function Profile() {
  useLang();
  const { user, refreshUser } = useAuth();
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', phone: '' });
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const fileRef = useRef(null);

  useEffect(() => {
    api('/me').then((d) => {
      setMe(d);
      setForm({ name: d.user.name || '', city: d.user.city || '', phone: d.phone || '' });
    });
  }, []);

  const flash = (m) => { setMsg(m); setErr(''); setTimeout(() => setMsg(''), 3000); };

  const saveProfile = async () => {
    setErr('');
    try {
      await api('/profile', { method: 'POST', body: form });
      await refreshUser();
      setEditing(false);
      flash(t('profile.updated'));
    } catch (e) { setErr(e.message); }
  };

  // Redimensionne l'image côté client (max 320px, JPEG) avant envoi.
  const onPhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setErr('');
    const img = new Image();
    img.onload = async () => {
      const max = 320;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      URL.revokeObjectURL(img.src);
      try {
        await api('/profile/photo', { method: 'POST', body: { dataUrl } });
        await refreshUser();
        flash(t('profile.photo.updated'));
      } catch (er) { setErr(er.message); }
    };
    img.onerror = () => setErr(t('err.image.unreadable'));
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const removePhoto = async () => {
    await api('/profile/photo', { method: 'POST', body: { dataUrl: null } });
    await refreshUser();
    flash(t('profile.photo.removed'));
  };

  const memberSince = user.createdAt ? memberFmt().format(new Date(user.createdAt)) : null;

  return (
    <div>
      {/* En-tête profil : bannière + avatar + actions */}
      <div className="card profile-card">
        <div className="profile-banner" />
        <div className="profile-head">
          <div className="profile-avatar-wrap">
            <Avatar name={user.name} photo={user.photoUrl} size={92} />
            <button className="avatar-edit" onClick={() => fileRef.current?.click()} title={t('profile.photo.change')}>
              <Icon name="camera" size={15} />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPick} />
          </div>
          <div className="profile-id">
            <h1>{user.name}</h1>
            <div className="muted">{me?.email}{me?.provider === 'google' ? ` · ${t('profile.google')}` : ''}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user.city ? `${user.city} · ` : ''}{memberSince ? t('profile.member.since', { date: memberSince }) : ''}
            </div>
            <div style={{ marginTop: 8 }}><TrustBadge user={user} /></div>
          </div>
          <div className="profile-actions">
            <Link className="icon-btn" to="/parametres" title={t('settings.title')} aria-label={t('settings.title')}>
              <Icon name="settings" size={18} />
            </Link>
            <button className="btn btn-ghost btn-sm profile-edit-btn" onClick={() => setEditing(!editing)}>
              {editing ? t('common.cancel') : t('common.edit')}
            </button>
          </div>
        </div>

        {user.photoUrl && !editing && (
          <button className="link-btn" style={{ fontSize: 12, margin: '10px 0 0 4px' }} onClick={removePhoto}>
            {t('profile.photo.remove')}
          </button>
        )}

        {editing && (
          <div className="mt">
            <div className="divider" style={{ margin: '10px 0 14px' }} />
            <div className="row">
              <div className="field">
                <label>{t('profile.name')}</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>{t('profile.city')}</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder={t('profile.city.ph')} />
              </div>
            </div>
            <div className="field">
              <label>{t('auth.phone')}</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="+32…" />
              <div className="hint">{t('profile.phone.hint')}</div>
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={form.name.trim().length < 2}>
              {t('common.save')}
            </button>
          </div>
        )}
      </div>

      {msg && <div className="alert alert-teal"><Icon name="check" size={17} />{msg}</div>}
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}

      <KycBanner status={me?.kyc?.status || user.kycStatus} />
      <ProfileSummary user={user} me={me} memberSince={memberSince} />

      <div className="profile-simple-links">
        <Link to="/trajets" className="profile-trust-link">
          <span className="settings-row-icon"><Icon name="plane" size={18} /></span>
          <span className="grow">
            <b>Trajets</b>
            <small>Voir les voyageurs disponibles ou publier votre propre trajet</small>
          </span>
          <Icon name="arrowRight" size={16} />
        </Link>
        <Link to="/en-cours" className="profile-trust-link">
          <span className="settings-row-icon"><Icon name="repeat" size={18} /></span>
          <span className="grow">
            <b>En cours</b>
            <small>Suivre les opérations acceptées, payées ou en transport</small>
          </span>
          <Icon name="arrowRight" size={16} />
        </Link>
        <Link to="/enregistres" className="profile-trust-link">
          <span className="settings-row-icon"><Icon name="star" size={18} /></span>
          <span className="grow">
            <b>Enregistrés</b>
            <small>Retrouver les trajets sauvegardés avant expiration</small>
          </span>
          <Icon name="arrowRight" size={16} />
        </Link>
        <Link to="/messages" className="profile-trust-link">
          <span className="settings-row-icon"><Icon name="chat" size={18} /></span>
          <span className="grow">
            <b>Messagerie</b>
            <small>Discuter avec les voyageurs et expéditeurs</small>
          </span>
          <Icon name="arrowRight" size={16} />
        </Link>
      </div>

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{user.completed}</div><div className="lbl">{t('profile.stat.completed')}</div></div>
        <div className="stat"><div className="num">{user.rating ?? '—'}</div><div className="lbl">{t('profile.stat.rating')}</div></div>
        <div className="stat"><div className="num">{Math.round((user.cancelRate || 0) * 100)} %</div><div className="lbl">{t('profile.stat.cancel')}</div></div>
        <div className="stat"><div className="num">{me ? `${me.maxValue} €` : '…'}</div><div className="lbl">{t('profile.stat.cap')}</div></div>
      </div>

      <MyPublishedTrips />

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="lock" size={17} />{t('profile.caps.title')}</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          {t('profile.caps.text', { active: me?.maxActive ?? '…', value: me?.maxValue ?? '…' })}
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="shieldCheck" size={17} />{t('profile.guarantees.title')}</h2>
        <ul className="checklist">
          <li>{t('profile.g1')}</li>
          <li>{t('profile.g2')}</li>
          <li>{t('profile.g3')}</li>
          <li>{t('profile.g4')}</li>
        </ul>
      </div>

      <ReviewsSection userId={user.id} />
    </div>
  );
}

function MyPublishedTrips() {
  const [trips, setTrips] = useState(null);
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState(null);

  const load = () => api('/trips/mine').then((data) => setTrips(data.trips)).catch(() => setTrips([]));
  useEffect(() => { load(); }, []);

  const remove = async (tripId) => {
    setBusy(tripId);
    setErr('');
    try {
      await api(`/trips/${tripId}`, { method: 'DELETE' });
      await load();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy('');
    }
  };

  const startEdit = (trip) => {
    setErr('');
    setEditId(trip.id);
    setEditForm({
      from: trip.from || '',
      to: trip.to || '',
      date: (trip.departureDate || trip.date || '').slice(0, 10),
      capacityKg: trip.capacityKg || 1,
      price: trip.price || 1,
      description: trip.description || '',
      conditions: trip.conditions || '',
    });
  };

  const saveEdit = async (e) => {
    e.preventDefault();
    setBusy(editId);
    setErr('');
    try {
      await api(`/trips/${editId}`, { method: 'PATCH', body: editForm });
      setEditId('');
      setEditForm(null);
      await load();
    } catch (error) {
      setErr(error.message);
    } finally {
      setBusy('');
    }
  };

  const visibleTrips = (trips || []).filter((trip) => trip.status !== 'removed');

  return (
    <div className="card my-trips-card">
      <div className="list-row" style={{ alignItems: 'center' }}>
        <Icon name="plane" size={17} />
        <h2 className="grow" style={{ margin: 0 }}>Mes trajets publiés</h2>
        <Link to="/trajets" className="btn btn-ghost btn-sm"><Icon name="plus" size={15} />Publier</Link>
      </div>
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
      {trips === null && <p className="muted">Chargement...</p>}
      {trips !== null && visibleTrips.length === 0 && (
        <div className="profile-empty-inline">
          <span>Aucun trajet publié.</span>
          <Link to="/trajets">Publier mon trajet</Link>
        </div>
      )}
      <div className="my-trip-list">
        {visibleTrips.slice(0, 5).map((trip) => (
          editId === trip.id ? (
            <form className="my-trip-edit" key={trip.id} onSubmit={saveEdit}>
              <div className="row">
                <label className="field">
                  <span>Depart</span>
                  <input value={editForm.from} onChange={(e) => setEditForm({ ...editForm, from: e.target.value })} />
                </label>
                <label className="field">
                  <span>Arrivee</span>
                  <input value={editForm.to} onChange={(e) => setEditForm({ ...editForm, to: e.target.value })} />
                </label>
              </div>
              <div className="row">
                <label className="field">
                  <span>Date</span>
                  <input type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                </label>
                <label className="field">
                  <span>Kg</span>
                  <input type="number" min="1" max="30" value={editForm.capacityKg} onChange={(e) => setEditForm({ ...editForm, capacityKg: e.target.value })} />
                </label>
                <label className="field">
                  <span>Prix</span>
                  <input type="number" min="1" value={editForm.price} onChange={(e) => setEditForm({ ...editForm, price: e.target.value })} />
                </label>
              </div>
              <label className="field">
                <span>Description</span>
                <textarea rows={2} value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} />
              </label>
              <label className="field">
                <span>Conditions</span>
                <textarea rows={2} value={editForm.conditions} onChange={(e) => setEditForm({ ...editForm, conditions: e.target.value })} />
              </label>
              <div className="my-trip-edit-actions">
                <button className="btn btn-primary btn-sm" disabled={busy === trip.id || !editForm.from || !editForm.to || !editForm.date}>
                  {busy === trip.id ? <span className="spinner" /> : <Icon name="check" size={15} />}
                  Enregistrer
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditId(''); setEditForm(null); }}>
                  <Icon name="x" size={15} />Annuler
                </button>
              </div>
            </form>
          ) : (
            <article className="my-trip-row" key={trip.id}>
              <div className="grow">
                <b>{trip.from} {'->'} {trip.to}</b>
                <span>{profileTripDate(trip.departureDate)} · {trip.price} {trip.currency} · {trip.capacityKg} kg</span>
                {trip.activeOperations > 0 && <small>{trip.activeOperations} opération(s) en cours</small>}
              </div>
              <span className={`pill ${trip.status === 'published' ? 'pill-teal' : 'pill-gray'}`}>
                {trip.status === 'published' ? 'Publié' : trip.status}
              </span>
              <button className="icon-btn" onClick={() => startEdit(trip)} disabled={busy === trip.id || trip.activeOperations > 0} title="Modifier">
                <Icon name="pencil" size={16} />
              </button>
              <button className="icon-btn" onClick={() => remove(trip.id)} disabled={busy === trip.id || trip.activeOperations > 0} title="Retirer">
                {busy === trip.id ? <span className="spinner" /> : <Icon name="trash" size={16} />}
              </button>
            </article>
          )
        ))}
      </div>
    </div>
  );
}

function profileTripDate(value) {
  if (!value) return 'Date à confirmer';
  return new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
}

function ProfileSummary({ user, me, memberSince }) {
  const status = me?.kyc?.status || user.kycStatus || 'none';
  const identityKey = status === 'verified'
    ? 'profile.summary.identity.verified'
    : status === 'pending'
      ? 'profile.summary.identity.pending'
      : 'profile.summary.identity.none';

  return (
    <div className="profile-summary">
      <div className="profile-summary-head">
        <Icon name="shieldCheck" size={17} />
        <b>{t('profile.summary.title')}</b>
      </div>
      <div className="profile-summary-grid">
        <div>
          <span>{t('profile.summary.identity')}</span>
          <strong>{t(identityKey)}</strong>
        </div>
        <div>
          <span>{t('profile.summary.limits')}</span>
          <strong>{me ? t('profile.summary.limits.value', { active: me.maxActive, value: me.maxValue }) : '...'}</strong>
        </div>
        <div>
          <span>{t('profile.summary.member')}</span>
          <strong>{memberSince || t('profile.summary.member.fallback')}</strong>
        </div>
      </div>
    </div>
  );
}

// Avis reçus (PRD §5.5 : notation mutuelle) — étoiles + commentaire libre laissés par
// les partenaires de transaction, agrégés depuis toutes les livraisons passées.
const reviewFmt = () => new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

function ReviewsSection({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => { api(`/users/${userId}/reviews`).then(setData).catch(() => setData({ reviews: [] })); }, [userId]);

  if (!data) return null;
  const withComments = data.reviews.filter((r) => r.comment);

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="star" size={17} />{t('reviews.title')} {data.reviews.length > 0 ? `(${data.reviews.length})` : ''}</h2>
      {data.reviews.length === 0 && <p className="muted" style={{ fontSize: 13 }}>{t('reviews.none')}</p>}
      {withComments.length === 0 && data.reviews.length > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{t('reviews.nocomment', { n: data.reviews.length })}</p>
      )}
      {withComments.slice(0, 6).map((r, i) => (
        <div key={i} className="mt" style={{ paddingTop: i > 0 ? 10 : 0, borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <div className="list-row">
            <Stars value={r.stars} readOnly size={15} />
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{reviewFmt().format(new Date(r.at))}</span>
          </div>
          <p style={{ fontSize: 13.5, margin: '4px 0 0' }}>{r.comment}</p>
          <div className="muted" style={{ fontSize: 11.5 }}>{r.authorName}</div>
        </div>
      ))}
    </div>
  );
}

// Bandeau de statut de vérification d'identité, affiché sur le profil.
function KycBanner({ status }) {
  const cfg = {
    none: { cls: 'alert-warn', icon: 'shieldCheck', cta: true },
    rejected: { cls: 'alert-danger', icon: 'alert', cta: true },
    pending: { cls: 'alert-warn', icon: 'clock', cta: true },
    verified: { cls: 'alert-teal', icon: 'shieldCheck', cta: false },
    refused: { cls: 'alert-danger', icon: 'x', cta: true },
  }[status] || null;
  if (!cfg) return null;
  return (
    <div className={`alert ${cfg.cls}`} style={{ alignItems: 'center' }}>
      <Icon name={cfg.icon} size={17} />
      <span className="grow">{t(`kycbanner.${status}`)}</span>
      {cfg.cta && (
        <Link to="/verification"><button className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.06)', color: 'inherit' }}>{t(`kycbanner.${status}.cta`)}</button></Link>
      )}
    </div>
  );
}
