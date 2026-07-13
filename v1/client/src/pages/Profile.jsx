import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge, Stars } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { getTheme, setTheme } from '../theme.js';
import { t, useLang, getLang, setLang, LANGS } from '../i18n.js';

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

      <KycBanner status={me?.kyc?.status || user.kycStatus} />

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
          <li>Paiement séquestré chez un prestataire agréé — jamais chez Wigofly.</li>
          <li>Identités vérifiées (KYC) pour tous les membres.</li>
          <li>Preuve vidéo du contenu à chaque envoi.</li>
          <li>Litiges arbitrés sous 7 jours selon une grille écrite.</li>
        </ul>
      </div>

      <ReviewsSection userId={user.id} />

      <AppearanceSection />

      <PrivacySection onDeleted={logout} email={me?.email} />

      <button className="btn btn-ghost" onClick={logout}>
        <Icon name="logout" size={17} />Se déconnecter
      </button>
    </div>
  );
}

// Bascule clair/sombre (U9) + langue (U14)
function AppearanceSection() {
  useLang();
  const [theme, setThemeState] = useState(getTheme());
  const [lang, setLangState] = useState(getLang());
  const chooseTheme = (v) => { setTheme(v); setThemeState(v); };
  const chooseLang = (v) => { setLang(v); setLangState(v); };
  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}><Icon name="moon" size={17} />{t('appearance.title')}</h2>
      <div className="theme-toggle mb">
        <button className={`theme-opt ${theme === 'light' ? 'active' : ''}`} onClick={() => chooseTheme('light')}>
          <Icon name="star" size={15} />{t('appearance.light')}
        </button>
        <button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => chooseTheme('dark')}>
          <Icon name="moon" size={15} />{t('appearance.dark')}
        </button>
      </div>
      <h2 style={{ margin: '4px 0 12px' }}><Icon name="mapPin" size={17} />{t('lang.title')}</h2>
      <div className="theme-toggle">
        {LANGS.map((l) => (
          <button key={l.code} className={`theme-opt ${lang === l.code ? 'active' : ''}`} onClick={() => chooseLang(l.code)}>
            {l.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Avis reçus (PRD §5.5 : notation mutuelle) — étoiles + commentaire libre laissés par
// les partenaires de transaction, agrégés depuis toutes les livraisons passées.
const REVIEW_FMT = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

function ReviewsSection({ userId }) {
  const [data, setData] = useState(null);

  useEffect(() => { api(`/users/${userId}/reviews`).then(setData).catch(() => setData({ reviews: [] })); }, [userId]);

  if (!data) return null;
  const withComments = data.reviews.filter((r) => r.comment);

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="star" size={17} />Avis reçus {data.reviews.length > 0 ? `(${data.reviews.length})` : ''}</h2>
      {data.reviews.length === 0 && <p className="muted" style={{ fontSize: 13 }}>Pas encore d'avis — ils apparaissent après vos premières livraisons confirmées.</p>}
      {withComments.length === 0 && data.reviews.length > 0 && (
        <p className="muted" style={{ fontSize: 13 }}>{data.reviews.length} note(s) reçue(s), sans commentaire écrit.</p>
      )}
      {withComments.slice(0, 6).map((r, i) => (
        <div key={i} className="mt" style={{ paddingTop: i > 0 ? 10 : 0, borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}>
          <div className="list-row">
            <Stars value={r.stars} readOnly size={15} />
            <span className="muted" style={{ fontSize: 11.5, marginLeft: 'auto' }}>{REVIEW_FMT.format(new Date(r.at))}</span>
          </div>
          <p style={{ fontSize: 13.5, margin: '4px 0 0' }}>{r.comment}</p>
          <div className="muted" style={{ fontSize: 11.5 }}>{r.authorName}</div>
        </div>
      ))}
    </div>
  );
}

// RGPD (PRD §6) : export des données personnelles et droit à l'effacement.
function PrivacySection({ onDeleted, email }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">Légal et données</div>
        <Link to="/cgu" className="settings-row" style={{ marginBottom: 8 }}>
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">Conditions générales d'utilisation</span>
            <span className="settings-row-sub">Fonctionnement de la plateforme, responsabilités, litiges</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
        <Link to="/confidentialite" className="settings-row" style={{ marginBottom: 8 }}>
          <span className="settings-row-icon"><Icon name="fileText" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">Politique de confidentialité</span>
            <span className="settings-row-sub">Ce que nous collectons, pourquoi, et vos droits RGPD</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
        <button className="settings-row" onClick={() => setOpen(true)}>
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">Gérer mes données</span>
            <span className="settings-row-sub">Exporter vos données ou supprimer votre compte</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </button>
      </div>
      {open && <PrivacyModal onClose={() => setOpen(false)} onDeleted={onDeleted} email={email} />}
    </>
  );
}

function PrivacyModal({ onClose, onDeleted, email }) {
  const [confirming, setConfirming] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [exported, setExported] = useState(false);

  const exportData = async () => {
    const res = await fetch('/api/profile/export', { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'wigofly-mes-donnees.json';
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2500);
  };

  const deleteAccount = async () => {
    setErr(''); setBusy(true);
    try {
      await api('/profile/delete', { method: 'POST' });
      onDeleted();
    } catch (e) { setErr(e.message); setBusy(false); }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal privacy-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <Icon name="shieldCheck" size={20} />
          <b>Confidentialité et données</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="privacy-body">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>
            Conformément au Règlement Général sur la Protection des Données (RGPD), vous disposez d'un droit
            d'accès, de rectification et d'effacement sur vos données personnelles. Vos pièces d'identité et
            documents KYC sont conservés chez notre prestataire de vérification agréé, jamais sur nos serveurs.
          </p>

          <div className="privacy-item">
            <div className="privacy-item-icon"><Icon name="fileText" size={18} /></div>
            <div className="grow">
              <div className="privacy-item-title">Exporter mes données</div>
              <div className="privacy-item-desc">
                Téléchargez un fichier JSON contenant votre profil, vos annonces, trajets, transactions et messages.
              </div>
              <button className="btn btn-ghost btn-sm mt" onClick={exportData}>
                <Icon name={exported ? 'check' : 'fileText'} size={15} />
                {exported ? 'Téléchargé' : 'Télécharger mes données'}
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="privacy-item">
            <div className="privacy-item-icon privacy-item-icon-danger"><Icon name="trash" size={18} /></div>
            <div className="grow">
              <div className="privacy-item-title">Supprimer mon compte</div>
              <div className="privacy-item-desc">
                Vos informations personnelles (nom, email, téléphone, photo) seront anonymisées. L'historique de
                vos transactions est conservé pour la traçabilité légale (obligations douanières et litiges).
                Impossible si une transaction est encore en cours.
              </div>
              {!confirming ? (
                <button className="btn btn-danger-ghost btn-sm mt" onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={15} />Supprimer mon compte
                </button>
              ) : (
                <div className="privacy-confirm mt">
                  {err && <div className="alert alert-danger" style={{ marginBottom: 10 }}><Icon name="alert" size={16} />{err}</div>}
                  <p style={{ fontSize: 12.5, marginBottom: 8 }}>
                    Pour confirmer, tapez <b>{email}</b> ci-dessous :
                  </p>
                  <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={email} style={{ marginBottom: 10 }} />
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setConfirming(false); setConfirmText(''); setErr(''); }}>
                      Annuler
                    </button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={deleteAccount}
                      disabled={busy || confirmText !== email}>
                      {busy ? <span className="spinner" /> : 'Confirmer définitivement'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Bandeau de statut de vérification d'identité, affiché sur le profil.
function KycBanner({ status }) {
  const cfg = {
    none: { cls: 'alert-warn', icon: 'shieldCheck', text: "Identité non vérifiée — requise pour envoyer ou transporter.", cta: 'Vérifier mon identité' },
    rejected: { cls: 'alert-danger', icon: 'alert', text: 'Votre vérification a été rejetée. Vous pouvez soumettre à nouveau.', cta: 'Recommencer' },
    pending: { cls: 'alert-warn', icon: 'clock', text: 'Vérification en cours — décision sous 24 h.', cta: 'Voir le statut' },
    verified: { cls: 'alert-teal', icon: 'shieldCheck', text: 'Identité vérifiée.', cta: null },
    refused: { cls: 'alert-danger', icon: 'x', text: 'Vérification définitivement refusée. Contactez le support.', cta: 'Détails' },
  }[status] || null;
  if (!cfg) return null;
  return (
    <div className={`alert ${cfg.cls}`} style={{ alignItems: 'center' }}>
      <Icon name={cfg.icon} size={17} />
      <span className="grow">{cfg.text}</span>
      {cfg.cta && (
        <Link to="/verification"><button className="btn btn-sm" style={{ background: 'rgba(0,0,0,0.06)', color: 'inherit' }}>{cfg.cta}</button></Link>
      )}
    </div>
  );
}
