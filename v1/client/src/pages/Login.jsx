import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, setToken } from '../api';
import { useAuth } from '../App.jsx';
import { Icon } from '../Icons.jsx';
import { t, useLang } from '../i18n.js';

// Auth complète : connexion / inscription / vérification email / mot de passe oublié.
// La vérification d'identité est déclenchée à la demande (page dédiée), pas ici.
export default function Login() {
  useLang();
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | verify | forgot | reset | appeal
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', code: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [cguAccepted, setCguAccepted] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [appealReason, setAppealReason] = useState('');

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const switchMode = (m) => { setMode(m); setError(''); setHint(''); };

  const run = async (fn) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  // La vérification d'identité n'est plus exigée à l'inscription (PRD KYC §2) :
  // elle est demandée seulement au moment d'une action transactionnelle.
  const finishAuth = (d) => login(d.token, d.user);

  const submitLogin = () => run(async () => {
    try {
      const d = await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password, rememberMe } });
      if (d.needsVerification) { switchMode('verify'); setHint(d.message || 'Consultez votre boite email pour recuperer le code.'); return; }
      finishAuth(d);
    } catch (error) {
      if (error.data?.code === 'account_suspended' && error.data?.token) {
        setToken(error.data.token);
        setMode('appeal');
        setHint(error.data.reason || 'Votre compte est temporairement suspendu. Expliquez votre situation a l equipe.');
        return;
      }
      throw error;
    }
  });

  const submitAppeal = () => run(async () => {
    await api('/safety/appeals', { method: 'POST', body: { reason: appealReason } });
    setToken(null);
    switchMode('login');
    setHint('Votre recours a ete envoye. Vous recevrez une reponse apres examen.');
    setAppealReason('');
  });

  const submitRegister = () => run(async () => {
    if (form.password !== form.confirm) throw new Error(t('err.pwd.mismatch'));
    if (!cguAccepted) throw new Error(t('err.cgu.required'));
    const d = await api('/auth/register', { method: 'POST', body: { ...form, cguAccepted, rememberMe } });
    switchMode('verify');
    setHint(d.message || 'Consultez votre boite email pour recuperer le code.');
  });

  const submitVerify = () => run(async () => {
    const d = await api('/auth/verify-email', { method: 'POST', body: { email: form.email, code: form.code, rememberMe } });
    finishAuth(d);
  });

  const resendCode = () => run(async () => {
    const d = await api('/auth/resend-code', { method: 'POST', body: { email: form.email } });
    setHint(d.message || 'Consultez votre boite email pour recuperer le code.');
  });

  const submitForgot = () => run(async () => {
    const d = await api('/auth/forgot', { method: 'POST', body: { email: form.email } });
    switchMode('reset');
    setHint(d.message || 'Si un compte correspond a cette adresse, un email vient d etre envoye.');
  });

  const submitReset = () => run(async () => {
    if (form.password !== form.confirm) throw new Error(t('err.pwd.mismatch'));
    const d = await api('/auth/reset', { method: 'POST', body: { email: form.email, code: form.code, password: form.password } });
    if (d.needsVerification) {
      switchMode('verify');
      setHint(d.message || 'Verifiez votre adresse email pour acceder a l application.');
      return;
    }
    finishAuth(d);
  });


  return (
    <div className="auth-page">
      <div className="auth-hero">
        <div className="auth-hero-glow" />
        <a href="/decouvrir/" className="brand-link auth-hero-brand">
          <img className="auth-logo" src="/assets/logo-wordmark.png" alt="Wigofly" />
        </a>
        <h1 className="auth-hero-title">{mode === 'appeal' ? 'Recours de securite' : t(`auth.title.${mode}`)}</h1>
        <p className="auth-hero-sub">{
          mode === 'appeal'
            ? 'Expliquez la situation a l equipe de moderation.'
            : mode === 'verify'
            ? t('auth.sub.verify', { email: form.email || t('auth.sub.verify.fallback') })
            : t(`auth.sub.${mode}`)
        }</p>
        <div className="auth-hero-badges">
          <span><Icon name="shieldCheck" size={13} />{t('auth.badge.escrow')}</span>
          <span><Icon name="camera" size={13} />{t('auth.badge.video')}</span>
        </div>
      </div>

      {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
      {hint && <div className="alert alert-teal"><Icon name="mail" size={17} />{hint}</div>}

      {mode === 'login' && (
        <>
          <div className="card">
            <div className="field">
              <label>{t('auth.email')}</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="vous@exemple.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>{t('auth.password')}</label>
              <div className="pwd-wrap">
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={(e) => set('password', e.target.value)} placeholder="••••••••"
                  autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && submitLogin()} />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? t('auth.password.hide') : t('auth.password.show')}>
                  <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>{t('auth.forgot.link')}</button>
            </div>
            <RememberMe checked={rememberMe} onChange={setRememberMe} />
            <button className="btn btn-primary" onClick={submitLogin} disabled={busy || !form.email || !form.password}>
              {busy ? <span className="spinner" /> : t('auth.login.submit')}
            </button>
          </div>
          <p className="auth-switch">
            {t('auth.no.account')}{' '}
            <button className="link-btn" onClick={() => switchMode('register')}>{t('auth.create.account')}</button>
          </p>
        </>
      )}

      {mode === 'register' && (
        <>
          <div className="card">
            <div className="field">
              <label>{t('auth.name')}</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder={t('auth.name.ph')} autoComplete="name" />
            </div>
            <div className="field">
              <label>{t('auth.email')}</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="vous@exemple.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>{t('auth.phone')} <span className="muted">{t('auth.phone.hint')}</span></label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+32 / +212…" inputMode="tel" autoComplete="tel" />
            </div>
            <div className="row">
              <div className="field">
                <label>{t('auth.password')}</label>
                <div className="pwd-wrap">
                  <input type={showPwd ? 'text' : 'password'} value={form.password}
                    onChange={(e) => set('password', e.target.value)} placeholder={t('auth.password.min')} autoComplete="new-password" />
                  <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                    <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label>{t('auth.password.confirm')}</label>
                <input type={showPwd ? 'text' : 'password'} value={form.confirm}
                  onChange={(e) => set('confirm', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
            </div>
            {form.password && form.password.length < 8 && (
              <div className="hint" style={{ marginTop: -8, marginBottom: 10, color: 'var(--amber)' }}>
                {t('auth.password.left', { n: 8 - form.password.length })}
              </div>
            )}
            <RememberMe checked={rememberMe} onChange={setRememberMe} />
            <label className="cgu-check">
              <input type="checkbox" checked={cguAccepted} onChange={(e) => setCguAccepted(e.target.checked)} />
              <CguText />
            </label>
            <button className="btn btn-primary" onClick={submitRegister}
              disabled={busy || !form.name || !form.email || form.password.length < 8 || !form.confirm || !cguAccepted}>
              {busy ? <span className="spinner" /> : t('auth.register.submit')}
            </button>
          </div>
          <p className="auth-switch">
            {t('auth.already.member')}{' '}
            <button className="link-btn" onClick={() => switchMode('login')}>{t('auth.login.submit')}</button>
          </p>
        </>
      )}

      {mode === 'verify' && (
        <div className="card">
          <div className="field">
            <label>{t('auth.verify.code')}</label>
            <input className="code-input" value={form.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))}
              placeholder="000000" inputMode="numeric" maxLength={6} autoFocus />
          </div>
          <button className="btn btn-primary mb" onClick={submitVerify} disabled={busy || form.code.length !== 6}>
            {busy ? <span className="spinner" /> : t('auth.verify.submit')}
          </button>
          <button className="btn btn-ghost" onClick={resendCode} disabled={busy}>{t('auth.verify.resend')}</button>
          <p className="auth-switch" style={{ marginTop: 12 }}>
            <button className="link-btn" onClick={() => switchMode('login')}>
              <Icon name="arrowLeft" size={13} /> {t('auth.back.login')}
            </button>
          </p>
        </div>
      )}

      {mode === 'forgot' && (
        <div className="card">
          <div className="field">
            <label>{t('auth.forgot.email')}</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              placeholder="vous@exemple.com" autoComplete="email" autoFocus />
          </div>
          <button className="btn btn-primary mb" onClick={submitForgot} disabled={busy || !form.email}>
            {busy ? <span className="spinner" /> : t('auth.forgot.submit')}
          </button>
          <p className="auth-switch">
            <button className="link-btn" onClick={() => switchMode('login')}>
              <Icon name="arrowLeft" size={13} /> {t('auth.back.login')}
            </button>
          </p>
        </div>
      )}

      {mode === 'reset' && (
        <div className="card">
          <div className="field">
            <label>{t('auth.reset.code')}</label>
            <input className="code-input" value={form.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))}
              placeholder="000000" inputMode="numeric" maxLength={6} autoFocus />
          </div>
          <div className="field">
            <label>{t('auth.reset.newpwd')}</label>
            <div className="pwd-wrap">
              <input type={showPwd ? 'text' : 'password'} value={form.password}
                onChange={(e) => set('password', e.target.value)} placeholder={t('auth.password.min')} autoComplete="new-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          <div className="field">
            <label>{t('auth.password.confirm')}</label>
            <input type={showPwd ? 'text' : 'password'} value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <button className="btn btn-primary" onClick={submitReset}
            disabled={busy || form.code.length !== 6 || form.password.length < 8 || !form.confirm}>
            {busy ? <span className="spinner" /> : t('auth.reset.submit')}
          </button>
        </div>
      )}

      {mode === 'appeal' && (
        <div className="card">
          <div className="field">
            <label>Votre recours</label>
            <textarea value={appealReason} onChange={(e) => setAppealReason(e.target.value.slice(0, 1000))} rows={5} placeholder="Expliquez pourquoi la suspension devrait etre reexaminee." autoFocus />
          </div>
          <button className="btn btn-primary" onClick={submitAppeal} disabled={busy || appealReason.trim().length < 10}>
            {busy ? <span className="spinner" /> : 'Envoyer mon recours'}
          </button>
          <p className="auth-switch" style={{ marginTop: 12 }}><button className="link-btn" onClick={() => { setToken(null); switchMode('login'); }}>Retour a la connexion</button></p>
        </div>
      )}

    </div>
  );
}

// Phrase CGU traduite avec liens inline : découpe la chaîne autour des placeholders
// {cgu} et {privacy} pour y insérer les <Link> (l'ordre des mots varie selon la langue).
function CguText() {
  const parts = t('auth.cgu').split(/(\{cgu\}|\{privacy\})/);
  return (
    <span>
      {parts.map((p, i) => {
        if (p === '{cgu}') return <Link key={i} to="/cgu" target="_blank">{t('auth.cgu.link')}</Link>;
        if (p === '{privacy}') return <Link key={i} to="/confidentialite" target="_blank">{t('auth.privacy.link')}</Link>;
        return p;
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

