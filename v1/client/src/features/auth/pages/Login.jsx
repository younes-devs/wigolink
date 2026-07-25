import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../../../api';
import { useAuth } from '../../../App.jsx';
import { Icon } from '../../../Icons.jsx';
import { t, useLang } from '../../../i18n.js';
import AuthJourneyLoop from '../components/AuthJourneyLoop.jsx';

// Authentication: login, registration, email verification, password reset and appeal.
export default function Login() {
  useLang();
  const { login } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', code: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [cguAccepted, setCguAccepted] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [appealReason, setAppealReason] = useState('');

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setHint('');
    setShowPwd(false);
    setShowConfirm(false);
  };

  const run = async (action) => {
    setError('');
    setBusy(true);
    try {
      await action();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  };

  const finishAuth = (data) => login(data.token, data.user);

  const submitLogin = () => run(async () => {
    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: { email: form.email, password: form.password, rememberMe },
      });
      if (data.needsVerification) {
        switchMode('verify');
        setHint(data.message || t('auth.hint.checkEmail'));
        return;
      }
      finishAuth(data);
    } catch (requestError) {
      if (requestError.data?.code === 'account_suspended' && requestError.data?.token) {
        setToken(requestError.data.token);
        setMode('appeal');
        setHint(requestError.data.reason || t('auth.appeal.suspended'));
        return;
      }
      throw requestError;
    }
  });

  const submitAppeal = () => run(async () => {
    await api('/safety/appeals', { method: 'POST', body: { reason: appealReason } });
    setToken(null);
    switchMode('login');
    setHint(t('auth.appeal.sent'));
    setAppealReason('');
  });

  const submitRegister = () => run(async () => {
    if (form.password !== form.confirm) throw new Error(t('err.pwd.mismatch'));
    if (!cguAccepted) throw new Error(t('err.cgu.required'));
    const data = await api('/auth/register', {
      method: 'POST',
      body: { ...form, cguAccepted, rememberMe },
    });
    switchMode('verify');
    setHint(data.message || t('auth.hint.checkEmail'));
  });

  const submitVerify = () => run(async () => {
    const data = await api('/auth/verify-email', {
      method: 'POST',
      body: { email: form.email, code: form.code, rememberMe },
    });
    finishAuth(data);
  });

  const resendCode = () => run(async () => {
    const data = await api('/auth/resend-code', { method: 'POST', body: { email: form.email } });
    setHint(data.message || t('auth.hint.checkEmail'));
  });

  const submitForgot = () => run(async () => {
    const data = await api('/auth/forgot', { method: 'POST', body: { email: form.email } });
    switchMode('reset');
    setHint(data.message || t('auth.hint.resetSent'));
  });

  const submitReset = () => run(async () => {
    if (form.password !== form.confirm) throw new Error(t('err.pwd.mismatch'));
    const data = await api('/auth/reset', {
      method: 'POST',
      body: { email: form.email, code: form.code, password: form.password },
    });
    if (data.needsVerification) {
      switchMode('verify');
      setHint(data.message || t('auth.hint.verifyAccess'));
      return;
    }
    finishAuth(data);
  });

  const heroTitle = mode === 'appeal' ? t('auth.appeal.title') : t(`auth.title.${mode}`);
  const heroSubtitle = mode === 'appeal'
    ? t('auth.appeal.subtitle')
    : mode === 'verify'
      ? t('auth.sub.verify', { email: form.email || t('auth.sub.verify.fallback') })
      : t(`auth.sub.${mode}`);

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <aside className="auth-hero">
          <a href="/decouvrir/" className="brand-link auth-hero-brand">
            <img className="auth-logo" src="/assets/logo-wordmark.png" alt="Wigofly" />
          </a>

          <AuthJourneyLoop t={t} />

          <h1 className="auth-hero-title">{heroTitle}</h1>
          <p className="auth-hero-sub">{heroSubtitle}</p>

          <div className="auth-hero-badges">
            <span><Icon name="shieldCheck" size={14} />{t('auth.badge.verified')}</span>
            <span><Icon name="camera" size={14} />{t('auth.badge.video')}</span>
          </div>
        </aside>

        <main className="auth-panel">
          {(mode === 'login' || mode === 'register') && (
            <div className="auth-mode-switch" role="tablist" aria-label={t('auth.mode.aria')}>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={mode === 'login' ? 'active' : ''}
                onClick={() => switchMode('login')}
              >
                {t('auth.login.submit')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'register'}
                className={mode === 'register' ? 'active' : ''}
                onClick={() => switchMode('register')}
              >
                {t('auth.create.account')}
              </button>
            </div>
          )}

          {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
          {hint && <div className="alert alert-teal"><Icon name="mail" size={17} />{hint}</div>}

          {mode === 'login' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                  placeholder={t('auth.email.placeholder')}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <div className="field">
                <div className="auth-field-head">
                  <label>{t('auth.password')}</label>
                  <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                    {t('auth.forgot.link')}
                  </button>
                </div>
                <PasswordField
                  value={form.password}
                  onChange={(value) => set('password', value)}
                  visible={showPwd}
                  onToggle={() => setShowPwd((current) => !current)}
                  autoComplete="current-password"
                  onEnter={submitLogin}
                />
              </div>
              <RememberMe checked={rememberMe} onChange={setRememberMe} />
              <button className="btn btn-primary" onClick={submitLogin} disabled={busy || !form.email || !form.password}>
                {busy ? <span className="spinner" /> : t('auth.login.submit')}
              </button>
            </div>
          )}

          {mode === 'register' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.name')}</label>
                <input
                  value={form.name}
                  onChange={(event) => set('name', event.target.value)}
                  placeholder={t('auth.name.ph')}
                  autoComplete="name"
                />
              </div>
              <div className="field">
                <label>{t('auth.email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                  placeholder={t('auth.email.placeholder')}
                  autoComplete="email"
                />
              </div>
              <div className="field">
                <label>{t('auth.phone')} <span className="muted">{t('auth.phone.hint')}</span></label>
                <input
                  value={form.phone}
                  onChange={(event) => set('phone', event.target.value)}
                  placeholder="+32 / +212..."
                  inputMode="tel"
                  autoComplete="tel"
                />
              </div>
              <div className="auth-password-grid">
                <div className="field">
                  <label>{t('auth.password')}</label>
                  <PasswordField
                    value={form.password}
                    onChange={(value) => set('password', value)}
                    visible={showPwd}
                    onToggle={() => setShowPwd((current) => !current)}
                    placeholder={t('auth.password.min')}
                    autoComplete="new-password"
                  />
                </div>
                <div className="field">
                  <label>{t('auth.password.confirm')}</label>
                  <PasswordField
                    value={form.confirm}
                    onChange={(value) => set('confirm', value)}
                    visible={showConfirm}
                    onToggle={() => setShowConfirm((current) => !current)}
                    autoComplete="new-password"
                  />
                </div>
              </div>
              {form.password && form.password.length < 8 && (
                <div className="auth-password-hint">
                  {t('auth.password.left', { n: 8 - form.password.length })}
                </div>
              )}
              <RememberMe checked={rememberMe} onChange={setRememberMe} />
              <label className="cgu-check">
                <input type="checkbox" checked={cguAccepted} onChange={(event) => setCguAccepted(event.target.checked)} />
                <CguText />
              </label>
              <button
                className="btn btn-primary"
                onClick={submitRegister}
                disabled={busy || !form.name || !form.email || form.password.length < 8 || !form.confirm || !cguAccepted}
              >
                {busy ? <span className="spinner" /> : t('auth.register.submit')}
              </button>
            </div>
          )}

          {mode === 'verify' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.verify.code')}</label>
                <input
                  className="code-input"
                  value={form.code}
                  onChange={(event) => set('code', event.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <button className="btn btn-primary mb" onClick={submitVerify} disabled={busy || form.code.length !== 6}>
                {busy ? <span className="spinner" /> : t('auth.verify.submit')}
              </button>
              <button className="btn btn-ghost" onClick={resendCode} disabled={busy}>{t('auth.verify.resend')}</button>
              <AuthBack onClick={() => switchMode('login')} />
            </div>
          )}

          {mode === 'forgot' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.forgot.email')}</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => set('email', event.target.value)}
                  placeholder={t('auth.email.placeholder')}
                  autoComplete="email"
                  autoFocus
                />
              </div>
              <button className="btn btn-primary mb" onClick={submitForgot} disabled={busy || !form.email}>
                {busy ? <span className="spinner" /> : t('auth.forgot.submit')}
              </button>
              <AuthBack onClick={() => switchMode('login')} />
            </div>
          )}

          {mode === 'reset' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.reset.code')}</label>
                <input
                  className="code-input"
                  value={form.code}
                  onChange={(event) => set('code', event.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  inputMode="numeric"
                  maxLength={6}
                  autoFocus
                />
              </div>
              <div className="field">
                <label>{t('auth.reset.newpwd')}</label>
                <PasswordField
                  value={form.password}
                  onChange={(value) => set('password', value)}
                  visible={showPwd}
                  onToggle={() => setShowPwd((current) => !current)}
                  placeholder={t('auth.password.min')}
                  autoComplete="new-password"
                />
              </div>
              <div className="field">
                <label>{t('auth.password.confirm')}</label>
                <PasswordField
                  value={form.confirm}
                  onChange={(value) => set('confirm', value)}
                  visible={showConfirm}
                  onToggle={() => setShowConfirm((current) => !current)}
                  autoComplete="new-password"
                />
              </div>
              <button
                className="btn btn-primary"
                onClick={submitReset}
                disabled={busy || form.code.length !== 6 || form.password.length < 8 || !form.confirm}
              >
                {busy ? <span className="spinner" /> : t('auth.reset.submit')}
              </button>
            </div>
          )}

          {mode === 'appeal' && (
            <div className="auth-form">
              <div className="field">
                <label>{t('auth.appeal.label')}</label>
                <textarea
                  value={appealReason}
                  onChange={(event) => setAppealReason(event.target.value.slice(0, 1000))}
                  rows={5}
                  placeholder={t('auth.appeal.placeholder')}
                  autoFocus
                />
              </div>
              <button className="btn btn-primary" onClick={submitAppeal} disabled={busy || appealReason.trim().length < 10}>
                {busy ? <span className="spinner" /> : t('auth.appeal.submit')}
              </button>
              <p className="auth-switch">
                <button className="link-btn" onClick={() => { setToken(null); switchMode('login'); }}>
                  {t('auth.back.login')}
                </button>
              </p>
            </div>
          )}

          <p className="auth-secure-note"><Icon name="lock" size={14} />{t('auth.secure')}</p>
        </main>
      </div>
    </div>
  );
}

function PasswordField({
  value,
  onChange,
  visible,
  onToggle,
  placeholder = '********',
  autoComplete,
  onEnter,
}) {
  return (
    <div className="pwd-wrap">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        onKeyDown={(event) => event.key === 'Enter' && onEnter?.()}
      />
      <button
        type="button"
        className="pwd-toggle"
        onClick={onToggle}
        aria-label={visible ? t('auth.password.hide') : t('auth.password.show')}
      >
        <Icon name={visible ? 'eyeOff' : 'eye'} size={18} />
      </button>
    </div>
  );
}

function AuthBack({ onClick }) {
  return (
    <p className="auth-switch">
      <button className="link-btn" onClick={onClick}>
        <Icon name="arrowLeft" size={13} /> {t('auth.back.login')}
      </button>
    </p>
  );
}

function CguText() {
  const parts = t('auth.cgu').split(/(\{cgu\}|\{privacy\})/);
  return (
    <span>
      {parts.map((part, index) => {
        if (part === '{cgu}') return <Link key={index} to="/cgu" target="_blank">{t('auth.cgu.link')}</Link>;
        if (part === '{privacy}') return <Link key={index} to="/confidentialite" target="_blank">{t('auth.privacy.link')}</Link>;
        return part;
      })}
    </span>
  );
}

function RememberMe({ checked, onChange }) {
  return (
    <label className="remember-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{t('auth.remember')}</span>
    </label>
  );
}
