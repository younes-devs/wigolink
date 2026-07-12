import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { Icon, GoogleLogo } from '../Icons.jsx';

// Auth complète : connexion / inscription / vérification email / mot de passe oublié.
// Le KYC (bloquant avant transaction) suit la première connexion.
export default function Login() {
  const { login } = useAuth();
  const [mode, setMode] = useState('login'); // login | register | verify | forgot | reset | kyc
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', confirm: '', code: '' });
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // session en attente de KYC
  const [googleOpen, setGoogleOpen] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const switchMode = (m) => { setMode(m); setError(''); setHint(''); };

  const run = async (fn) => {
    setError(''); setBusy(true);
    try { await fn(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const finishAuth = (d) => {
    if (d.user.kycStatus === 'verified') login(d.token, d.user);
    else { setPending(d); switchMode('kyc'); }
  };

  const submitLogin = () => run(async () => {
    const d = await api('/auth/login', { method: 'POST', body: { email: form.email, password: form.password } });
    if (d.needsVerification) { setHint(d.demoHint); switchMode('verify'); return; }
    finishAuth(d);
  });

  const submitRegister = () => run(async () => {
    if (form.password !== form.confirm) throw new Error('Les mots de passe ne correspondent pas');
    const d = await api('/auth/register', { method: 'POST', body: form });
    setHint(d.demoHint);
    switchMode('verify');
  });

  const submitVerify = () => run(async () => {
    const d = await api('/auth/verify-email', { method: 'POST', body: { email: form.email, code: form.code } });
    finishAuth(d);
  });

  const resendCode = () => run(async () => {
    const d = await api('/auth/resend-code', { method: 'POST', body: { email: form.email } });
    setHint(d.demoHint);
  });

  const submitForgot = () => run(async () => {
    const d = await api('/auth/forgot', { method: 'POST', body: { email: form.email } });
    setHint(d.demoHint);
    switchMode('reset');
  });

  const submitReset = () => run(async () => {
    if (form.password !== form.confirm) throw new Error('Les mots de passe ne correspondent pas');
    const d = await api('/auth/reset', { method: 'POST', body: { email: form.email, code: form.code, password: form.password } });
    finishAuth(d);
  });

  const googleSignIn = (email, name) => run(async () => {
    setGoogleOpen(false);
    const d = await api('/auth/google', { method: 'POST', body: { email, name } });
    finishAuth(d);
  });

  const doKyc = () => run(async () => {
    login(pending.token, pending.user); // pose le token pour l'appel KYC
    const d = await api('/kyc/submit', { method: 'POST' });
    login(pending.token, d.user);
  });

  return (
    <div className="auth-page">
      <div className="center" style={{ padding: '26px 0 20px' }}>
        <span className="brand-mark auth-logo">CK</span>
        <h1 className="page-title">{
          { login: 'Bon retour', register: 'Créer un compte', verify: 'Vérifiez votre email',
            forgot: 'Mot de passe oublié', reset: 'Nouveau mot de passe', kyc: "Vérification d'identité" }[mode]
        }</h1>
        <p className="page-sub" style={{ marginBottom: 0 }}>{
          { login: 'Connectez-vous pour envoyer ou transporter en toute confiance.',
            register: 'Rejoignez la communauté Bruxelles ↔ Casablanca.',
            verify: `Un code à 6 chiffres a été envoyé à ${form.email || 'votre adresse'}.`,
            forgot: 'Indiquez votre email, nous vous envoyons un code de réinitialisation.',
            reset: 'Saisissez le code reçu et choisissez un nouveau mot de passe.',
            kyc: 'Dernière étape avant de pouvoir échanger sur CloudKilo.' }[mode]
        }</p>
      </div>

      {error && <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>}
      {hint && <div className="alert alert-teal"><Icon name="mail" size={17} />{hint}</div>}

      {mode === 'login' && (
        <>
          <div className="card">
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="vous@exemple.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Mot de passe</label>
              <div className="pwd-wrap">
                <input type={showPwd ? 'text' : 'password'} value={form.password}
                  onChange={(e) => set('password', e.target.value)} placeholder="••••••••"
                  autoComplete="current-password" onKeyDown={(e) => e.key === 'Enter' && submitLogin()} />
                <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}
                  aria-label={showPwd ? 'Masquer' : 'Afficher'}>
                  <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
                </button>
              </div>
              <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>Mot de passe oublié ?</button>
            </div>
            <button className="btn btn-primary" onClick={submitLogin} disabled={busy || !form.email || !form.password}>
              {busy ? '…' : 'Se connecter'}
            </button>
            <div className="auth-sep"><span>ou</span></div>
            <button className="btn btn-google" onClick={() => setGoogleOpen(true)} disabled={busy}>
              <GoogleLogo size={18} />Continuer avec Google
            </button>
          </div>
          <p className="auth-switch">
            Pas encore de compte ?{' '}
            <button className="link-btn" onClick={() => switchMode('register')}>Créer un compte</button>
          </p>
          <p className="muted center" style={{ fontSize: 11.5 }}>
            Comptes de démo : fatima@ / karim@ / mehdi@ / admin@demo.cloudkilo.app — mot de passe <b>demo1234</b>
          </p>
        </>
      )}

      {mode === 'register' && (
        <>
          <div className="card">
            <button className="btn btn-google mb" onClick={() => setGoogleOpen(true)} disabled={busy}>
              <GoogleLogo size={18} />S'inscrire avec Google
            </button>
            <div className="auth-sep"><span>ou par email</span></div>
            <button type="button" className="autofill-btn mb" onClick={() => {
              const n = Math.floor(Math.random() * 9000) + 1000;
              setForm((f) => ({ ...f, name: `Testeur ${n}`, email: `testeur${n}@exemple.com`, phone: `+3247${n}111`, password: 'demo1234', confirm: 'demo1234' }));
            }}>
              <Icon name="sparkles" size={13} />Remplir (test)
            </button>
            <div className="field">
              <label>Nom complet</label>
              <input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Prénom Nom" autoComplete="name" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                placeholder="vous@exemple.com" autoComplete="email" />
            </div>
            <div className="field">
              <label>Téléphone <span className="muted">(pour les rendez-vous)</span></label>
              <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+32 ou +212…" inputMode="tel" autoComplete="tel" />
            </div>
            <div className="row">
              <div className="field">
                <label>Mot de passe</label>
                <div className="pwd-wrap">
                  <input type={showPwd ? 'text' : 'password'} value={form.password}
                    onChange={(e) => set('password', e.target.value)} placeholder="8 caractères min." autoComplete="new-password" />
                  <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                    <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
                  </button>
                </div>
              </div>
              <div className="field">
                <label>Confirmer</label>
                <input type={showPwd ? 'text' : 'password'} value={form.confirm}
                  onChange={(e) => set('confirm', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
              </div>
            </div>
            {form.password && form.password.length < 8 && (
              <div className="hint" style={{ marginTop: -8, marginBottom: 10, color: 'var(--amber)' }}>
                Encore {8 - form.password.length} caractère(s) minimum.
              </div>
            )}
            <button className="btn btn-primary" onClick={submitRegister}
              disabled={busy || !form.name || !form.email || form.password.length < 8 || !form.confirm}>
              {busy ? '…' : 'Créer mon compte'}
            </button>
          </div>
          <p className="auth-switch">
            Déjà membre ?{' '}
            <button className="link-btn" onClick={() => switchMode('login')}>Se connecter</button>
          </p>
        </>
      )}

      {mode === 'verify' && (
        <div className="card">
          <div className="field">
            <label>Code de vérification</label>
            <input className="code-input" value={form.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))}
              placeholder="000000" inputMode="numeric" maxLength={6} autoFocus />
          </div>
          <button className="btn btn-primary mb" onClick={submitVerify} disabled={busy || form.code.length !== 6}>
            {busy ? '…' : 'Vérifier mon email'}
          </button>
          <button className="btn btn-ghost" onClick={resendCode} disabled={busy}>Renvoyer le code</button>
          <p className="auth-switch" style={{ marginTop: 12 }}>
            <button className="link-btn" onClick={() => switchMode('login')}>
              <Icon name="arrowLeft" size={13} /> Retour à la connexion
            </button>
          </p>
        </div>
      )}

      {mode === 'forgot' && (
        <div className="card">
          <div className="field">
            <label>Email du compte</label>
            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
              placeholder="vous@exemple.com" autoComplete="email" autoFocus />
          </div>
          <button className="btn btn-primary mb" onClick={submitForgot} disabled={busy || !form.email}>
            {busy ? '…' : 'Envoyer le code'}
          </button>
          <p className="auth-switch">
            <button className="link-btn" onClick={() => switchMode('login')}>
              <Icon name="arrowLeft" size={13} /> Retour à la connexion
            </button>
          </p>
        </div>
      )}

      {mode === 'reset' && (
        <div className="card">
          <div className="field">
            <label>Code reçu par email</label>
            <input className="code-input" value={form.code} onChange={(e) => set('code', e.target.value.replace(/\D/g, ''))}
              placeholder="000000" inputMode="numeric" maxLength={6} autoFocus />
          </div>
          <div className="field">
            <label>Nouveau mot de passe</label>
            <div className="pwd-wrap">
              <input type={showPwd ? 'text' : 'password'} value={form.password}
                onChange={(e) => set('password', e.target.value)} placeholder="8 caractères min." autoComplete="new-password" />
              <button type="button" className="pwd-toggle" onClick={() => setShowPwd(!showPwd)}>
                <Icon name={showPwd ? 'eyeOff' : 'eye'} size={18} />
              </button>
            </div>
          </div>
          <div className="field">
            <label>Confirmer</label>
            <input type={showPwd ? 'text' : 'password'} value={form.confirm}
              onChange={(e) => set('confirm', e.target.value)} placeholder="••••••••" autoComplete="new-password" />
          </div>
          <button className="btn btn-primary" onClick={submitReset}
            disabled={busy || form.code.length !== 6 || form.password.length < 8 || !form.confirm}>
            {busy ? '…' : 'Réinitialiser et me connecter'}
          </button>
        </div>
      )}

      {mode === 'kyc' && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}><Icon name="shieldCheck" size={18} />Identité vérifiée obligatoire</h2>
          <p className="muted mb">
            Avant toute transaction, nous vérifions l'identité de chaque membre : pièce d'identité + selfie.
            C'est ce qui rend CloudKilo sûr pour tout le monde.
          </p>
          <div className="alert alert-teal">
            <Icon name="lock" size={17} />
            <span>Mode démo : la vérification est simulée et instantanée. En production, elle passe par un prestataire
            spécialisé (détection de faux documents + liveness).</span>
          </div>
          <button className="btn btn-teal" onClick={doKyc} disabled={busy}>
            <Icon name="camera" size={18} />Vérifier mon identité
          </button>
        </div>
      )}

      {googleOpen && (
        <div className="modal-backdrop" onClick={() => setGoogleOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <GoogleLogo size={20} />
              <b>Choisir un compte</b>
              <button className="pwd-toggle" style={{ position: 'static', marginLeft: 'auto' }} onClick={() => setGoogleOpen(false)}>
                <Icon name="x" size={18} />
              </button>
            </div>
            <p className="muted" style={{ fontSize: 12, padding: '0 16px 10px' }}>
              Simulation du sélecteur Google (démo — OAuth réel en production).
            </p>
            {[
              { email: 'yasmine.demo@gmail.com', name: 'Yasmine D.' },
              { email: 'omar.demo@gmail.com', name: 'Omar T.' },
            ].map((a) => (
              <button key={a.email} className="google-account" onClick={() => googleSignIn(a.email, a.name)}>
                <span className="avatar" style={{ width: 34, height: 34, fontSize: 13, background: '#e8f0fe', color: '#1a73e8' }}>
                  {a.name[0]}
                </span>
                <span className="grow" style={{ textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 13.5 }}>{a.name}</b>
                  <span className="muted" style={{ fontSize: 12 }}>{a.email}</span>
                </span>
              </button>
            ))}
            <GoogleCustom onPick={googleSignIn} />
          </div>
        </div>
      )}
    </div>
  );
}

function GoogleCustom({ onPick }) {
  const [email, setEmail] = useState('');
  return (
    <div style={{ display: 'flex', gap: 8, padding: '10px 16px 16px' }}>
      <input className="chat-input" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="Autre adresse Gmail…" type="email" />
      <button className="btn btn-primary btn-sm" style={{ flex: '0 0 auto' }}
        disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)}
        onClick={() => onPick(email, email.split('@')[0])}>
        OK
      </button>
    </div>
  );
}
