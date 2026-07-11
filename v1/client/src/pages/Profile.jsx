import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';

const MEMBER_FMT = new Intl.DateTimeFormat('fr-BE', { month: 'long', year: 'numeric' });

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
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
      flash('Profil mis à jour');
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
        flash('Photo mise à jour');
      } catch (er) { setErr(er.message); }
    };
    img.onerror = () => setErr('Impossible de lire cette image');
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const removePhoto = async () => {
    await api('/profile/photo', { method: 'POST', body: { dataUrl: null } });
    await refreshUser();
    flash('Photo supprimée');
  };

  const memberSince = user.createdAt ? MEMBER_FMT.format(new Date(user.createdAt)) : null;

  return (
    <div>
      {/* En-tête profil : bannière + avatar + actions */}
      <div className="card profile-card">
        <div className="profile-banner" />
        <div className="profile-head">
          <div className="profile-avatar-wrap">
            <Avatar name={user.name} photo={user.photoUrl} size={92} />
            <button className="avatar-edit" onClick={() => fileRef.current?.click()} title="Changer la photo">
              <Icon name="camera" size={15} />
            </button>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPick} />
          </div>
          <div className="profile-id">
            <h1>{user.name}</h1>
            <div className="muted">{me?.email}{me?.provider === 'google' ? ' · compte Google' : ''}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {user.city ? `${user.city} · ` : ''}{memberSince ? `Membre depuis ${memberSince}` : ''}
            </div>
            <div style={{ marginTop: 8 }}><TrustBadge user={user} /></div>
          </div>
          <button className="btn btn-ghost btn-sm profile-edit-btn" onClick={() => setEditing(!editing)}>
            {editing ? 'Annuler' : 'Modifier'}
          </button>
        </div>

        {user.photoUrl && !editing && (
          <button className="link-btn" style={{ fontSize: 12, margin: '10px 0 0 4px' }} onClick={removePhoto}>
            Supprimer la photo
          </button>
        )}

        {editing && (
          <div className="mt">
            <div className="divider" style={{ margin: '10px 0 14px' }} />
            <div className="row">
              <div className="field">
                <label>Nom</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="field">
                <label>Ville</label>
                <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Bruxelles, Casablanca…" />
              </div>
            </div>
            <div className="field">
              <label>Téléphone</label>
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" placeholder="+32…" />
              <div className="hint">Jamais visible publiquement — utilisé uniquement pour les rendez-vous confirmés.</div>
            </div>
            <button className="btn btn-primary" onClick={saveProfile} disabled={form.name.trim().length < 2}>
              Enregistrer
            </button>
          </div>
        )}
      </div>

      {msg && <div className="alert alert-teal"><Icon name="check" size={17} />{msg}</div>}
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{user.completed}</div><div className="lbl">Transactions réussies</div></div>
        <div className="stat"><div className="num">{user.rating ?? '—'}</div><div className="lbl">Note moyenne</div></div>
        <div className="stat"><div className="num">{Math.round((user.cancelRate || 0) * 100)} %</div><div className="lbl">Taux d'annulation</div></div>
        <div className="stat"><div className="num">{me ? `${me.maxValue} €` : '…'}</div><div className="lbl">Plafond par envoi</div></div>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="lock" size={17} />Plafonds progressifs</h2>
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.55 }}>
          Votre compte peut gérer <b>{me?.maxActive ?? '…'} transaction(s) active(s)</b> et des envois
          jusqu'à <b>{me?.maxValue ?? '…'} €</b>. Ces limites augmentent automatiquement avec votre
          historique de transactions réussies — c'est notre façon de construire la confiance.
        </p>
      </div>

      <div className="card">
        <h2 style={{ marginBottom: 8 }}><Icon name="shieldCheck" size={17} />Vos garanties</h2>
        <ul className="checklist">
          <li>Paiement séquestré chez un prestataire agréé — jamais chez Salama.</li>
          <li>Identités vérifiées (KYC) pour tous les membres.</li>
          <li>Preuve vidéo du contenu à chaque envoi.</li>
          <li>Litiges arbitrés sous 7 jours selon une grille écrite.</li>
        </ul>
      </div>

      <button className="btn btn-ghost" onClick={logout}>
        <Icon name="logout" size={17} />Se déconnecter
      </button>
    </div>
  );
}
