import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../App.jsx';
import { TrustBadge, Stars } from '../components.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { getTheme, setTheme } from '../theme.js';
import { t, useLang, getLang, setLang, LANGS } from '../i18n.js';

const memberFmt = () => new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { month: 'long', year: 'numeric' });

export default function Profile() {
  useLang();
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
          <button className="btn btn-ghost btn-sm profile-edit-btn" onClick={() => setEditing(!editing)}>
            {editing ? t('common.cancel') : t('common.edit')}
          </button>
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

      <div className="stat-grid mb">
        <div className="stat"><div className="num">{user.completed}</div><div className="lbl">{t('profile.stat.completed')}</div></div>
        <div className="stat"><div className="num">{user.rating ?? '—'}</div><div className="lbl">{t('profile.stat.rating')}</div></div>
        <div className="stat"><div className="num">{Math.round((user.cancelRate || 0) * 100)} %</div><div className="lbl">{t('profile.stat.cancel')}</div></div>
        <div className="stat"><div className="num">{me ? `${me.maxValue} €` : '…'}</div><div className="lbl">{t('profile.stat.cap')}</div></div>
      </div>

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

      <AppearanceSection />

      <PrivacySection onDeleted={logout} email={me?.email} />

      <button className="btn btn-ghost" onClick={logout}>
        <Icon name="logout" size={17} />{t('profile.logout')}
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
const reviewFmt = () => new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

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

// RGPD (PRD §6) : export des données personnelles et droit à l'effacement.
function PrivacySection({ onDeleted, email }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">{t('legal.title')}</div>
        <Link to="/cgu" className="settings-row" style={{ marginBottom: 8 }}>
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('auth.cgu.link')}</span>
            <span className="settings-row-sub">{t('legal.cgu.sub')}</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
        <Link to="/confidentialite" className="settings-row" style={{ marginBottom: 8 }}>
          <span className="settings-row-icon"><Icon name="fileText" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('auth.privacy.link')}</span>
            <span className="settings-row-sub">{t('legal.privacy.sub')}</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
        <button className="settings-row" onClick={() => setOpen(true)}>
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('legal.data.title')}</span>
            <span className="settings-row-sub">{t('legal.data.sub')}</span>
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
          <b>{t('privacy.modal.title')}</b>
          <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}>
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="privacy-body">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.6 }}>{t('privacy.modal.intro')}</p>

          <div className="privacy-item">
            <div className="privacy-item-icon"><Icon name="fileText" size={18} /></div>
            <div className="grow">
              <div className="privacy-item-title">{t('privacy.export.title')}</div>
              <div className="privacy-item-desc">{t('privacy.export.desc')}</div>
              <button className="btn btn-ghost btn-sm mt" onClick={exportData}>
                <Icon name={exported ? 'check' : 'fileText'} size={15} />
                {exported ? t('privacy.export.done') : t('privacy.export.btn')}
              </button>
            </div>
          </div>

          <div className="divider" />

          <div className="privacy-item">
            <div className="privacy-item-icon privacy-item-icon-danger"><Icon name="trash" size={18} /></div>
            <div className="grow">
              <div className="privacy-item-title">{t('privacy.delete.title')}</div>
              <div className="privacy-item-desc">{t('privacy.delete.desc')}</div>
              {!confirming ? (
                <button className="btn btn-danger-ghost btn-sm mt" onClick={() => setConfirming(true)}>
                  <Icon name="trash" size={15} />{t('privacy.delete.title')}
                </button>
              ) : (
                <div className="privacy-confirm mt">
                  {err && <div className="alert alert-danger" style={{ marginBottom: 10 }}><Icon name="alert" size={16} />{err}</div>}
                  <p style={{ fontSize: 12.5, marginBottom: 8 }}>{t('privacy.delete.confirm.text', { email })}</p>
                  <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)}
                    placeholder={email} style={{ marginBottom: 10 }} />
                  <div className="row">
                    <button className="btn btn-ghost btn-sm" onClick={() => { setConfirming(false); setConfirmText(''); setErr(''); }}>
                      {t('common.cancel')}
                    </button>
                    <button className="btn btn-danger-ghost btn-sm" onClick={deleteAccount}
                      disabled={busy || confirmText !== email}>
                      {busy ? <span className="spinner" /> : t('privacy.delete.confirm.btn')}
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
