import { useState } from 'react';
import { api } from '../api';
import { useAuth } from '../App.jsx';

export default function Login() {
  const { login } = useAuth();
  const [step, setStep] = useState('phone'); // phone | otp | kyc
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [otp, setOtp] = useState('');
  const [hint, setHint] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(null); // {token, user} en attente de KYC

  const requestOtp = async () => {
    setError('');
    try {
      const d = await api('/auth/request-otp', { method: 'POST', body: { phone } });
      setHint(d.demoHint);
      setStep('otp');
    } catch (e) { setError(e.message); }
  };

  const verify = async () => {
    setError('');
    try {
      const d = await api('/auth/verify-otp', { method: 'POST', body: { phone, otp, name } });
      if (d.user.kycStatus === 'verified') {
        login(d.token, d.user);
      } else {
        setPending(d);
        setStep('kyc');
      }
    } catch (e) { setError(e.message); }
  };

  const doKyc = async () => {
    setError('');
    login(pending.token, pending.user); // pose le token pour l'appel KYC
    try {
      const d = await api('/kyc/submit', { method: 'POST' });
      login(pending.token, d.user);
    } catch (e) { setError(e.message); }
  };

  return (
    <div>
      <div className="center" style={{ padding: '26px 0 18px' }}>
        <div style={{ fontSize: 56 }}>🕊️</div>
        <h1 className="page-title">Bienvenue sur Salama</h1>
        <p className="page-sub">
          La façon sûre d'envoyer des produits du terroir entre le Maroc et la Belgique, avec des voyageurs vérifiés.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {step === 'phone' && (
        <div className="card">
          <div className="field">
            <label>Votre nom</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Prénom et initiale" />
            <div className="hint">Utilisé pour votre profil public (comptes de démo : +212600000001 Fatima, +32470000002 Karim, +32470000003 Mehdi, +32470000000 Admin)</div>
          </div>
          <div className="field">
            <label>Numéro de téléphone</label>
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+32 ou +212…" inputMode="tel" />
          </div>
          <button className="btn btn-primary" onClick={requestOtp} disabled={!phone}>
            Recevoir mon code
          </button>
        </div>
      )}

      {step === 'otp' && (
        <div className="card">
          {hint && <div className="alert alert-warn">{hint}</div>}
          <div className="field">
            <label>Code reçu par SMS</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="123456" inputMode="numeric" maxLength={6} />
          </div>
          <button className="btn btn-primary" onClick={verify} disabled={otp.length !== 6}>
            Vérifier
          </button>
        </div>
      )}

      {step === 'kyc' && (
        <div className="card">
          <h2 style={{ fontSize: 17, marginBottom: 8 }}>🪪 Vérification d'identité</h2>
          <p className="muted mb">
            Avant toute transaction, nous vérifions l'identité de chaque membre : pièce d'identité + selfie.
            C'est ce qui rend Salama sûr pour tout le monde.
          </p>
          <div className="alert alert-teal">
            Mode démo : la vérification est simulée et instantanée. En production, elle passe par un prestataire
            spécialisé (détection de faux documents + liveness).
          </div>
          <button className="btn btn-teal" onClick={doKyc}>📸 Vérifier mon identité</button>
        </div>
      )}
    </div>
  );
}
