import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { Avatar, Icon } from '../../../Icons.jsx';
import { getTheme, setTheme } from '../../../theme.js';
import { t, useLang, getLang, setLang, LANGS } from '../../../i18n.js';

const DEFAULT_NOTIFICATIONS = { transactions: true, messages: true, shipments: true, reminders: true, security: true };
const SUPPORT_EMAIL = 'support@wigofly.app';

export default function Settings() {
  useLang();
  const { user, logout } = useAuth();
  const [me, setMe] = useState(null);
  const [section, setSection] = useState('');
  const [modal, setModal] = useState('');

  useEffect(() => { api('/me').then(setMe).catch(() => {}); }, []);

  const closeModal = () => setModal('');
  const account = me?.user || user;

  if (section) {
    const detail = {
      account: { title: t('settings.section.account'), content: <AccountSecurity me={me} onOpen={setModal} /> },
      notifications: { title: t('settings.section.notifications'), content: <NotificationsSection /> },
      appearance: { title: t('settings.section.appearance'), content: <AppearanceSection /> },
      legal: { title: t('settings.section.legal'), content: <LegalSection /> },
      blocked: { title: t('settings.section.blocked'), content: <BlockedAccountSection /> },
      support: { title: t('settings.section.support'), content: <SupportSection /> },
    }[section];
    return (
      <div className="settings-page settings-detail-page">
        <button className="settings-detail-back" onClick={() => setSection('')}><Icon name="arrowLeft" size={18} /> {t('common.back')}</button>
        <h1>{detail.title}</h1>
        {detail.content}
        {modal === 'password' && <PasswordModal onClose={closeModal} onDone={logout} />}
        {modal === 'email' && <EmailModal email={me?.email} provider={me?.provider} onClose={closeModal} onDone={logout} />}
        {modal === 'delete' && <DeleteAccountModal email={me?.email} onClose={closeModal} onDone={logout} />}
      </div>
    );
  }

  return (
    <div className="settings-page settings-home">
      <div className="page-head">
        <div><h1>{t('settings.title')}</h1><p>{t('settings.home.subtitle')}</p></div>
        <Link className="icon-btn" to="/profil" title={t('settings.back.profile')} aria-label={t('settings.back.profile')}><Icon name="user" size={19} /></Link>
      </div>

      <SettingsEntry icon="shieldCheck" title={t('settings.section.account')} sub={account?.email || t('settings.section.account.sub')} onClick={() => setSection('account')} />
      <SettingsEntry icon="bell" title={t('settings.section.notifications')} sub={t('settings.section.notifications.sub')} onClick={() => setSection('notifications')} />
      <SettingsEntry icon="moon" title={t('settings.section.appearance')} sub={t('settings.section.appearance.sub')} onClick={() => setSection('appearance')} />
      <SettingsEntry icon="fileText" title={t('settings.section.legal')} sub={t('settings.section.legal.sub')} onClick={() => setSection('legal')} />
      <SettingsEntry icon="lock" title={t('settings.section.blocked')} sub={t('settings.section.blocked.sub')} onClick={() => setSection('blocked')} />
      <SettingsEntry icon="mail" title={t('settings.section.support')} sub={t('settings.section.support.sub')} onClick={() => setSection('support')} />

      <button className="btn btn-ghost settings-logout" onClick={logout}><Icon name="logout" size={17} />{t('profile.logout')}</button>
    </div>
  );
}

function SettingsEntry({ icon, title, sub, onClick }) {
  return (
    <button className="settings-row settings-entry" onClick={onClick}>
      <span className="settings-row-icon"><Icon name={icon} size={18} /></span>
      <span className="grow"><span className="settings-row-title">{title}</span><span className="settings-row-sub">{sub}</span></span>
      <Icon name="arrowRight" size={17} className="settings-arrow" />
    </button>
  );
}

function AccountSecurity({ me, onOpen }) {
  const isGoogle = me?.provider === 'google';
  return (
    <div className="settings-card settings-detail-card">
      <Link to="/verification" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.account.kyc')}</span><span className="settings-row-sub">{t('settings.account.kyc.sub')}</span></span><Icon name="arrowRight" size={16} /></Link>
      {!isGoogle && <button className="settings-inline-row" onClick={() => onOpen('password')}><span className="settings-row-icon"><Icon name="key" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.account.password')}</span><span className="settings-row-sub">{t('settings.account.password.sub')}</span></span><Icon name="arrowRight" size={16} /></button>}
      {!isGoogle && <button className="settings-inline-row" onClick={() => onOpen('email')}><span className="settings-row-icon"><Icon name="mail" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.account.email')}</span><span className="settings-row-sub">{t('settings.account.email.sub')}</span></span><Icon name="arrowRight" size={16} /></button>}
      {isGoogle && <div className="settings-inline-row is-static"><span className="settings-row-icon"><Icon name="mail" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.account.email.address')}</span><span className="settings-row-sub">{t('settings.account.email.google')}</span></span></div>}
      <button className="settings-inline-row settings-danger-row" onClick={() => onOpen('delete')}><span className="settings-row-icon"><Icon name="trash" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.account.delete')}</span><span className="settings-row-sub">{t('settings.account.delete.sub')}</span></span><Icon name="arrowRight" size={16} /></button>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATIONS);
  const [status, setStatus] = useState('');
  useEffect(() => { api('/settings').then((d) => setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true })).catch(() => setStatus('settings.notifications.load.error')); }, []);
  const toggle = async (key) => {
    if (key === 'security') return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setStatus('settings.saved.saving');
    try { const d = await api('/settings', { method: 'POST', body: { notifications: next } }); setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true }); setStatus('settings.saved.done'); }
    catch { setStatus('settings.saved.error'); }
  };
  const rows = [
    ['transactions', 'settings.notifications.transactions', 'settings.notifications.transactions.sub'],
    ['messages', 'settings.notifications.messages', 'settings.notifications.messages.sub'],
    ['shipments', 'settings.notifications.shipments', 'settings.notifications.shipments.sub'],
    ['reminders', 'settings.notifications.reminders', 'settings.notifications.reminders.sub'],
    ['security', 'settings.notifications.security', 'settings.notifications.security.sub'],
  ];
  return <><div className="settings-card settings-detail-card">{rows.map(([key, title, sub]) => <button key={key} className="settings-inline-row" onClick={() => toggle(key)} disabled={key === 'security'}><span className="settings-row-icon"><Icon name={key === 'messages' ? 'chat' : key === 'security' ? 'shieldCheck' : 'bell'} size={17} /></span><span className="grow"><span className="settings-row-title">{t(title)}</span><span className="settings-row-sub">{t(sub)}</span></span><span className={`switch ${prefs[key] ? 'on' : ''}`}><span /></span></button>)}</div>{status && <p className="settings-save-state">{t(status)}</p>}</>;
}

function AppearanceSection() {
  useLang();
  const [theme, setThemeState] = useState(getTheme());
  const [lang, setLangState] = useState(getLang());
  const chooseTheme = (value) => { setTheme(value); setThemeState(value); };
  const chooseLang = async (value) => {
    if (await setLang(value)) setLangState(value);
  };
  return <div className="settings-card settings-detail-card"><div className="settings-choice-row"><span className="settings-row-icon"><Icon name="moon" size={17} /></span><div className="settings-choice-content"><span className="settings-row-title">{t('settings.appearance.title')}</span><div className="theme-toggle"><button className={`theme-opt ${theme === 'light' ? 'active' : ''}`} onClick={() => chooseTheme('light')}>{t('settings.appearance.light')}</button><button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => chooseTheme('dark')}>{t('settings.appearance.dark')}</button></div></div></div><div className="settings-choice-row"><span className="settings-row-icon"><Icon name="mapPin" size={17} /></span><div className="settings-choice-content"><span className="settings-row-title">{t('settings.appearance.language')}</span><div className="theme-toggle">{LANGS.map((item) => <button key={item.code} className={`theme-opt ${lang === item.code ? 'active' : ''}`} onClick={() => chooseLang(item.code)}>{item.label}</button>)}</div></div></div></div>;
}

function LegalSection() {
  return <div className="settings-card settings-detail-card"><Link to="/cgu" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.legal.terms')}</span><span className="settings-row-sub">{t('legal.cgu.sub')}</span></span><Icon name="arrowRight" size={16} /></Link><Link to="/confidentialite" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="fileText" size={17} /></span><span className="grow"><span className="settings-row-title">{t('settings.legal.privacy')}</span><span className="settings-row-sub">{t('legal.privacy.sub')}</span></span><Icon name="arrowRight" size={16} /></Link></div>;
}

function BlockedAccountSection() {
  const [users, setUsers] = useState(null);
  const [openMenu, setOpenMenu] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { api('/blocked-users').then((data) => setUsers(data.users || [])).catch((err) => { setUsers([]); setError(err.message); }); }, []);
  const unblock = async (id) => {
    setError('');
    try { await api(`/blocked-users/${id}/unblock`, { method: 'POST' }); setUsers((current) => current.filter((user) => user.id !== id)); setOpenMenu(''); }
    catch (err) { setError(err.message); }
  };
  if (users === null) return <div className="settings-empty-state">{t('settings.blocked.loading')}</div>;
  return <section className="blocked-users-panel">
    <p className="blocked-users-intro">{t('settings.blocked.intro')}</p>
    {error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}
    {users.length === 0 ? <div className="settings-empty-state"><Icon name="shieldCheck" size={22} /><b>{t('settings.blocked.empty')}</b><span>{t('settings.blocked.empty.sub')}</span></div> : <div className="blocked-users-list">{users.map((user) => <div className="blocked-user-row" key={user.id}><Avatar name={user.name} photo={user.photoUrl} size={44} /><div className="grow"><b>{user.name}</b><small>{user.city || t('settings.blocked.member')}</small></div><div className="blocked-user-actions"><button className="icon-btn blocked-user-more" onClick={() => setOpenMenu(openMenu === user.id ? '' : user.id)} aria-label={t('settings.blocked.options', { name: user.name })}><Icon name="moreVertical" size={18} /></button>{openMenu === user.id && <div className="blocked-user-menu"><button onClick={() => unblock(user.id)}><Icon name="check" size={16} />{t('settings.blocked.unblock')}</button></div>}</div></div>)}</div>}
  </section>;
}

function SupportSection() {
  const [form, setForm] = useState({ subject: '', message: '' });
  const [notice, setNotice] = useState('');
  const submit = (event) => {
    event.preventDefault();
    setNotice('settings.support.pending');
  };
  return <div className="settings-support"><form className="settings-support-form" onSubmit={submit}><label>{t('settings.support.subject')}</label><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder={t('settings.support.subject.placeholder')} required /><label>{t('settings.support.message')}</label><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder={t('settings.support.message.placeholder')} rows="6" required /><button className="btn btn-primary" type="submit"><Icon name="send" size={16} />{t('settings.support.send')}</button>{notice && <p className="settings-support-notice">{t(notice)}</p>}</form><div className="settings-email-contact"><span className="settings-row-icon"><Icon name="mail" size={17} /></span><div><b>{t('settings.support.email')}</b><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><small>{t('settings.support.email.sub')}</small></div></div></div>;
}

function ActionModal({ title, icon, children, onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal account-action-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><Icon name={icon} size={20} /><b>{title}</b><button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}><Icon name="x" size={18} /></button></div><div className="account-action-body">{children}</div></div></div>;
}

function PasswordModal({ onClose, onDone }) {
  const [currentPassword, setCurrentPassword] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setError(''); setBusy(true); try { await api('/profile/password', { method: 'POST', body: { currentPassword, password } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  return <ActionModal title={t('settings.password.title')} icon="key" onClose={onClose}><p className="muted">{t('settings.password.intro')}</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>{t('settings.password.current')}</label><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /><label>{t('settings.password.new')}</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button className="btn btn-primary" disabled={busy || currentPassword.length === 0 || password.length < 8} onClick={submit}>{busy ? <span className="spinner" /> : t('settings.password.save')}</button></ActionModal>;
}

function EmailModal({ email, provider, onClose, onDone }) {
  const [newEmail, setNewEmail] = useState(''); const [currentPassword, setCurrentPassword] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const request = async () => { setError(''); setBusy(true); try { await api('/profile/email/change/request', { method: 'POST', body: { newEmail, currentPassword } }); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const confirm = async () => { setError(''); setBusy(true); try { await api('/profile/email/change/confirm', { method: 'POST', body: { code } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  if (provider === 'google') return null;
  return <ActionModal title={t('settings.email.title')} icon="mail" onClose={onClose}>{!sent ? <><p className="muted">{t('settings.email.intro')}</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>{t('settings.email.new')}</label><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder={email} autoComplete="email" /><label>{t('settings.password.current')}</label><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /><button className="btn btn-primary" disabled={busy || !newEmail || !currentPassword} onClick={request}>{busy ? <span className="spinner" /> : t('settings.email.send')}</button></> : <><p className="muted">{t('settings.email.sent', { email: newEmail })}</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>{t('settings.email.code')}</label><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /><button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? <span className="spinner" /> : t('settings.email.confirm')}</button></>}</ActionModal>;
}

function DeleteAccountModal({ email, onClose, onDone }) {
  const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const request = async () => { setError(''); setBusy(true); try { await api('/profile/delete/request', { method: 'POST' }); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const confirm = async () => { setError(''); setBusy(true); try { await api('/profile/delete', { method: 'POST', body: { code } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  return <ActionModal title={t('settings.delete.title')} icon="trash" onClose={onClose}>{!sent ? <><p className="muted">{t('settings.delete.intro', { email })}</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<button className="btn btn-danger-ghost" disabled={busy} onClick={request}>{busy ? <span className="spinner" /> : t('settings.delete.send')}</button></> : <><p className="muted">{t('settings.delete.sent', { email })}</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>{t('settings.delete.code')}</label><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /><button className="btn btn-danger-ghost" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? <span className="spinner" /> : t('settings.delete.confirm')}</button></>}</ActionModal>;
}
