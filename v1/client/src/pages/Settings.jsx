import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { useAuth } from '../App.jsx';
import { Icon } from '../Icons.jsx';
import { getTheme, setTheme } from '../theme.js';
import { t, useLang, getLang, setLang, LANGS } from '../i18n.js';

const DEFAULT_NOTIFICATIONS = {
  transactions: true,
  messages: true,
  shipments: true,
  reminders: true,
  security: true,
};

export default function Settings() {
  useLang();
  const { user, logout } = useAuth();
  const [me, setMe] = useState(null);

  useEffect(() => {
    api('/me').then(setMe).catch(() => {});
  }, []);

  return (
    <div className="settings-page">
      <div className="page-head">
        <div>
          <h1>{t('settings.title')}</h1>
          <p>{t('settings.subtitle')}</p>
        </div>
        <Link className="icon-btn" to="/profil" title={t('settings.back.profile')} aria-label={t('settings.back.profile')}>
          <Icon name="user" size={19} />
        </Link>
      </div>

      <AccountSection user={user} me={me} />
      <NotificationsSection />
      <SecuritySection me={me} />
      <AppearanceSection />
      <PrivacySection onDeleted={logout} email={me?.email} />

      <button className="btn btn-ghost settings-logout" onClick={logout}>
        <Icon name="logout" size={17} />{t('profile.logout')}
      </button>
    </div>
  );
}

function AccountSection({ user, me }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('settings.account.title')}</div>
      <Link to="/profil" className="settings-row link-row">
        <span className="settings-row-icon"><Icon name="user" size={17} /></span>
        <span className="grow">
          <span className="settings-row-title">{user?.name || t('nav.profile')}</span>
          <span className="settings-row-sub">{me?.email || t('settings.account.sub')}</span>
        </span>
        <Icon name="chevronDown" size={16} className="settings-chevron" />
      </Link>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATIONS);
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    api('/settings')
      .then((d) => setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true }))
      .catch(() => setStatus('error'));
  }, []);

  const toggle = async (key) => {
    if (key === 'security') return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    setStatus('saving');
    try {
      const d = await api('/settings', { method: 'POST', body: { notifications: next } });
      setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true });
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 1800);
    } catch {
      setStatus('error');
    }
  };

  const rows = [
    ['transactions', 'settings.notifications.transactions', 'settings.notifications.transactions.sub'],
    ['messages', 'settings.notifications.messages', 'settings.notifications.messages.sub'],
    ['shipments', 'settings.notifications.shipments', 'settings.notifications.shipments.sub'],
    ['reminders', 'settings.notifications.reminders', 'settings.notifications.reminders.sub'],
    ['security', 'settings.notifications.security', 'settings.notifications.security.sub'],
  ];

  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('settings.notifications.title')}</div>
      <div className="settings-card">
        {rows.map(([key, title, sub]) => (
          <button key={key} className="settings-inline-row" onClick={() => toggle(key)} disabled={key === 'security'}>
            <span className="settings-row-icon"><Icon name={key === 'messages' ? 'chat' : key === 'security' ? 'shieldCheck' : 'bell'} size={17} /></span>
            <span className="grow">
              <span className="settings-row-title">{t(title)}</span>
              <span className="settings-row-sub">{t(sub)}</span>
            </span>
            <span className={`switch ${prefs[key] ? 'on' : ''}`} aria-hidden="true"><span /></span>
          </button>
        ))}
      </div>
      {status !== 'idle' && (
        <div className={`settings-save-state ${status === 'error' ? 'error' : ''}`}>
          {status === 'saving' && t('settings.saved.saving')}
          {status === 'saved' && t('settings.saved.done')}
          {status === 'error' && t('settings.saved.error')}
        </div>
      )}
    </div>
  );
}

function SecuritySection({ me }) {
  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('settings.security.title')}</div>
      <div className="settings-card">
        <div className="settings-inline-row is-static">
          <span className="settings-row-icon"><Icon name="key" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('settings.security.login')}</span>
            <span className="settings-row-sub">{me?.provider === 'google' ? t('profile.google') : t('settings.security.email')}</span>
          </span>
        </div>
        <Link to="/verification" className="settings-inline-row link-row">
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('settings.security.kyc')}</span>
            <span className="settings-row-sub">{t('settings.security.kyc.sub')}</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
      </div>
    </div>
  );
}

function AppearanceSection() {
  useLang();
  const [theme, setThemeState] = useState(getTheme());
  const [lang, setLangState] = useState(getLang());
  const chooseTheme = (v) => { setTheme(v); setThemeState(v); };
  const chooseLang = (v) => { setLang(v); setLangState(v); };

  return (
    <div className="settings-group">
      <div className="settings-group-title">{t('appearance.title')}</div>
      <div className="settings-card">
        <div className="settings-choice-row">
          <span className="settings-row-icon"><Icon name="moon" size={17} /></span>
          <div className="settings-choice-content">
            <span className="settings-row-title">{t('appearance.title')}</span>
            <div className="theme-toggle">
              <button className={`theme-opt ${theme === 'light' ? 'active' : ''}`} onClick={() => chooseTheme('light')}>
                <Icon name="star" size={15} />{t('appearance.light')}
              </button>
              <button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => chooseTheme('dark')}>
                <Icon name="moon" size={15} />{t('appearance.dark')}
              </button>
            </div>
          </div>
        </div>
        <div className="settings-choice-row">
          <span className="settings-row-icon"><Icon name="mapPin" size={17} /></span>
          <div className="settings-choice-content">
            <span className="settings-row-title">{t('lang.title')}</span>
            <div className="theme-toggle">
              {LANGS.map((l) => (
                <button key={l.code} className={`theme-opt ${lang === l.code ? 'active' : ''}`} onClick={() => chooseLang(l.code)}>
                  {l.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PrivacySection({ onDeleted, email }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="settings-group">
        <div className="settings-group-title">{t('legal.title')}</div>
        <Link to="/cgu" className="settings-row link-row" style={{ marginBottom: 8 }}>
          <span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span>
          <span className="grow">
            <span className="settings-row-title">{t('auth.cgu.link')}</span>
            <span className="settings-row-sub">{t('legal.cgu.sub')}</span>
          </span>
          <Icon name="chevronDown" size={16} className="settings-chevron" />
        </Link>
        <Link to="/confidentialite" className="settings-row link-row" style={{ marginBottom: 8 }}>
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
