import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { Icon } from '../Icons.jsx';
import { getTheme, setTheme } from '../theme.js';
import { t, useLang, getLang, setLang, LANGS } from '../i18n.js';

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
      account: { title: 'Compte et sécurité', content: <AccountSecurity me={me} onOpen={setModal} /> },
      notifications: { title: 'Notifications', content: <NotificationsSection /> },
      appearance: { title: 'Apparence et langue', content: <AppearanceSection /> },
      legal: { title: 'Légal', content: <LegalSection /> },
      blocked: { title: 'Compte bloqué', content: <BlockedAccountSection /> },
      support: { title: 'Support', content: <SupportSection /> },
    }[section];
    return (
      <div className="settings-page settings-detail-page">
        <button className="settings-detail-back" onClick={() => setSection('')}><Icon name="arrowLeft" size={18} /> Retour</button>
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
        <div><h1>{t('settings.title')}</h1><p>Gérez votre compte et vos préférences.</p></div>
        <Link className="icon-btn" to="/profil" title={t('settings.back.profile')} aria-label={t('settings.back.profile')}><Icon name="user" size={19} /></Link>
      </div>

      <SettingsEntry icon="shieldCheck" title="Compte et sécurité" sub={account?.email || 'KYC, email, mot de passe et suppression'} onClick={() => setSection('account')} />
      <SettingsEntry icon="bell" title="Notifications" sub="Choisissez les alertes que vous recevez" onClick={() => setSection('notifications')} />
      <SettingsEntry icon="moon" title="Apparence et langue" sub="Mode clair, sombre et langue de l'application" onClick={() => setSection('appearance')} />
      <SettingsEntry icon="fileText" title="Légal" sub="Conditions générales et confidentialité" onClick={() => setSection('legal')} />
      <SettingsEntry icon="lock" title="Compte bloqué" sub="Comprendre un blocage et demander un recours" onClick={() => setSection('blocked')} />
      <SettingsEntry icon="mail" title="Support" sub="Nous contacter pour une question ou un problème" onClick={() => setSection('support')} />

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
      <Link to="/verification" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span><span className="grow"><span className="settings-row-title">Vérification KYC</span><span className="settings-row-sub">Voir ou compléter votre vérification d'identité</span></span><Icon name="arrowRight" size={16} /></Link>
      {!isGoogle && <button className="settings-inline-row" onClick={() => onOpen('password')}><span className="settings-row-icon"><Icon name="key" size={17} /></span><span className="grow"><span className="settings-row-title">Changer le mot de passe</span><span className="settings-row-sub">Votre mot de passe actuel sera demandé</span></span><Icon name="arrowRight" size={16} /></button>}
      {!isGoogle && <button className="settings-inline-row" onClick={() => onOpen('email')}><span className="settings-row-icon"><Icon name="mail" size={17} /></span><span className="grow"><span className="settings-row-title">Changer l'email</span><span className="settings-row-sub">Une confirmation sera envoyée à la nouvelle adresse</span></span><Icon name="arrowRight" size={16} /></button>}
      {isGoogle && <div className="settings-inline-row is-static"><span className="settings-row-icon"><Icon name="mail" size={17} /></span><span className="grow"><span className="settings-row-title">Adresse email</span><span className="settings-row-sub">Gérée par votre compte Google</span></span></div>}
      <button className="settings-inline-row settings-danger-row" onClick={() => onOpen('delete')}><span className="settings-row-icon"><Icon name="trash" size={17} /></span><span className="grow"><span className="settings-row-title">Supprimer mon compte</span><span className="settings-row-sub">Un code de confirmation est obligatoire</span></span><Icon name="arrowRight" size={16} /></button>
    </div>
  );
}

function NotificationsSection() {
  const [prefs, setPrefs] = useState(DEFAULT_NOTIFICATIONS);
  const [status, setStatus] = useState('');
  useEffect(() => { api('/settings').then((d) => setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true })).catch(() => setStatus('Impossible de charger les preferences.')); }, []);
  const toggle = async (key) => {
    if (key === 'security') return;
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next); setStatus('Sauvegarde...');
    try { const d = await api('/settings', { method: 'POST', body: { notifications: next } }); setPrefs({ ...DEFAULT_NOTIFICATIONS, ...(d.settings?.notifications || {}), security: true }); setStatus('Preferences enregistrees.'); }
    catch { setStatus('Impossible de sauvegarder.'); }
  };
  const rows = [
    ['transactions', 'Transactions', 'Paiements, acceptations et changements de statut'],
    ['messages', 'Messages', 'Nouveaux messages lies a vos envois'],
    ['shipments', 'Envois', 'Ramassage, livraison et preuves video'],
    ['reminders', 'Rappels', 'Actions importantes avant un depart ou une remise'],
    ['security', 'Securite', 'Alertes essentielles toujours actives'],
  ];
  return <><div className="settings-card settings-detail-card">{rows.map(([key, title, sub]) => <button key={key} className="settings-inline-row" onClick={() => toggle(key)} disabled={key === 'security'}><span className="settings-row-icon"><Icon name={key === 'messages' ? 'chat' : key === 'security' ? 'shieldCheck' : 'bell'} size={17} /></span><span className="grow"><span className="settings-row-title">{title}</span><span className="settings-row-sub">{sub}</span></span><span className={`switch ${prefs[key] ? 'on' : ''}`}><span /></span></button>)}</div>{status && <p className="settings-save-state">{status}</p>}</>;
}

function AppearanceSection() {
  useLang();
  const [theme, setThemeState] = useState(getTheme());
  const [lang, setLangState] = useState(getLang());
  const chooseTheme = (value) => { setTheme(value); setThemeState(value); };
  const chooseLang = (value) => { setLang(value); setLangState(value); };
  return <div className="settings-card settings-detail-card"><div className="settings-choice-row"><span className="settings-row-icon"><Icon name="moon" size={17} /></span><div className="settings-choice-content"><span className="settings-row-title">Apparence</span><div className="theme-toggle"><button className={`theme-opt ${theme === 'light' ? 'active' : ''}`} onClick={() => chooseTheme('light')}>Clair</button><button className={`theme-opt ${theme === 'dark' ? 'active' : ''}`} onClick={() => chooseTheme('dark')}>Sombre</button></div></div></div><div className="settings-choice-row"><span className="settings-row-icon"><Icon name="mapPin" size={17} /></span><div className="settings-choice-content"><span className="settings-row-title">Langue</span><div className="theme-toggle">{LANGS.map((item) => <button key={item.code} className={`theme-opt ${lang === item.code ? 'active' : ''}`} onClick={() => chooseLang(item.code)}>{item.label}</button>)}</div></div></div></div>;
}

function LegalSection() {
  return <div className="settings-card settings-detail-card"><Link to="/cgu" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="shieldCheck" size={17} /></span><span className="grow"><span className="settings-row-title">Conditions Generales d'Utilisation</span><span className="settings-row-sub">Fonctionnement de la plateforme, responsabilites, litiges</span></span><Icon name="arrowRight" size={16} /></Link><Link to="/confidentialite" className="settings-inline-row link-row"><span className="settings-row-icon"><Icon name="fileText" size={17} /></span><span className="grow"><span className="settings-row-title">Politique de confidentialite</span><span className="settings-row-sub">Ce que nous collectons, pourquoi, et vos droits RGPD</span></span><Icon name="arrowRight" size={16} /></Link></div>;
}

function BlockedAccountSection() {
  return <section className="settings-info-card">
    <span className="settings-row-icon settings-warning-icon"><Icon name="lock" size={18} /></span>
    <h2>Votre compte est bloqué ?</h2>
    <p>Un compte peut être temporairement bloqué pour protéger les membres, vérifier une identité, examiner un signalement ou traiter un litige.</p>
    <p>Si vous pensez qu'il s'agit d'une erreur, contactez le support avec votre adresse email et une brève explication.</p>
    <a className="btn btn-ghost" href={`mailto:${SUPPORT_EMAIL}?subject=Recours%20compte%20Wigofly`}><Icon name="mail" size={16} />Contacter le support</a>
  </section>;
}

function SupportSection() {
  const [form, setForm] = useState({ subject: '', message: '' });
  const [notice, setNotice] = useState('');
  const submit = (event) => {
    event.preventDefault();
    setNotice('Le formulaire sera activé prochainement. Utilisez l’adresse email ci-dessous pour le moment.');
  };
  return <div className="settings-support"><form className="settings-support-form" onSubmit={submit}><label>Sujet</label><input value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Ex. problème avec une transaction" required /><label>Votre message</label><textarea value={form.message} onChange={(event) => setForm({ ...form, message: event.target.value })} placeholder="Décrivez votre demande avec le plus de détails possible." rows="6" required /><button className="btn btn-primary" type="submit"><Icon name="send" size={16} />Envoyer ma demande</button>{notice && <p className="settings-support-notice">{notice}</p>}</form><div className="settings-email-contact"><span className="settings-row-icon"><Icon name="mail" size={17} /></span><div><b>Contacter par email</b><a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a><small>Pour les demandes urgentes ou tant que le formulaire n'est pas encore actif.</small></div></div></div>;
}

function ActionModal({ title, icon, children, onClose }) {
  return <div className="modal-backdrop" onClick={onClose}><div className="modal account-action-modal" onClick={(event) => event.stopPropagation()}><div className="modal-head"><Icon name={icon} size={20} /><b>{title}</b><button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={onClose}><Icon name="x" size={18} /></button></div><div className="account-action-body">{children}</div></div></div>;
}

function PasswordModal({ onClose, onDone }) {
  const [currentPassword, setCurrentPassword] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async () => { setError(''); setBusy(true); try { await api('/profile/password', { method: 'POST', body: { currentPassword, password } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  return <ActionModal title="Changer le mot de passe" icon="key" onClose={onClose}><p className="muted">Entrez votre mot de passe actuel puis choisissez-en un nouveau.</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>Mot de passe actuel</label><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /><label>Nouveau mot de passe</label><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" /><button className="btn btn-primary" disabled={busy || currentPassword.length === 0 || password.length < 8} onClick={submit}>{busy ? <span className="spinner" /> : 'Enregistrer le nouveau mot de passe'}</button></ActionModal>;
}

function EmailModal({ email, provider, onClose, onDone }) {
  const [newEmail, setNewEmail] = useState(''); const [currentPassword, setCurrentPassword] = useState(''); const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const request = async () => { setError(''); setBusy(true); try { await api('/profile/email/change/request', { method: 'POST', body: { newEmail, currentPassword } }); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const confirm = async () => { setError(''); setBusy(true); try { await api('/profile/email/change/confirm', { method: 'POST', body: { code } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  if (provider === 'google') return null;
  return <ActionModal title="Changer l'email" icon="mail" onClose={onClose}>{!sent ? <><p className="muted">Un code a 6 chiffres sera envoye a votre nouvelle adresse.</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>Nouvelle adresse email</label><input type="email" value={newEmail} onChange={(event) => setNewEmail(event.target.value)} placeholder={email} autoComplete="email" /><label>Mot de passe actuel</label><input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" /><button className="btn btn-primary" disabled={busy || !newEmail || !currentPassword} onClick={request}>{busy ? <span className="spinner" /> : 'Envoyer le code'}</button></> : <><p className="muted">Le code est envoye a {newEmail}.</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>Code de verification</label><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /><button className="btn btn-primary" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? <span className="spinner" /> : 'Confirmer le nouvel email'}</button></>}</ActionModal>;
}

function DeleteAccountModal({ email, onClose, onDone }) {
  const [code, setCode] = useState(''); const [sent, setSent] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const request = async () => { setError(''); setBusy(true); try { await api('/profile/delete/request', { method: 'POST' }); setSent(true); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const confirm = async () => { setError(''); setBusy(true); try { await api('/profile/delete', { method: 'POST', body: { code } }); onDone(); } catch (err) { setError(err.message); setBusy(false); } };
  return <ActionModal title="Supprimer mon compte" icon="trash" onClose={onClose}>{!sent ? <><p className="muted">Un code de confirmation sera envoye a {email}. La suppression est impossible lorsqu'une operation est en cours.</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<button className="btn btn-danger-ghost" disabled={busy} onClick={request}>{busy ? <span className="spinner" /> : 'Envoyer le code de confirmation'}</button></> : <><p className="muted">Entrez le code envoye a {email} pour confirmer definitivement la suppression.</p>{error && <div className="alert alert-danger"><Icon name="alert" size={16} />{error}</div>}<label>Code de confirmation</label><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /><button className="btn btn-danger-ghost" disabled={busy || code.length !== 6} onClick={confirm}>{busy ? <span className="spinner" /> : 'Supprimer definitivement mon compte'}</button></>}</ActionModal>;
}
