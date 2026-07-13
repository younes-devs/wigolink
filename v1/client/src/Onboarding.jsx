import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icons.jsx';

// Onboarding premier lancement (PRD UI/UX U1) — 2 écrans max, skippable, une seule fois
// par compte. Explique le parcours sécurisé puis route directement vers l'action choisie.
const onboardKey = (userId) => `wigofly_onboarded_${userId}`;

export function shouldOnboard(user) {
  return !!user && !localStorage.getItem(onboardKey(user.id));
}

const STEPS = [
  { icon: 'lock', title: 'Paiement séquestré', text: "L'argent est bloqué dès l'accord, jamais versé avant la livraison confirmée." },
  { icon: 'video', title: 'Preuve vidéo', text: 'Le contenu du colis est filmé au moment de la remise au voyageur.' },
  { icon: 'shieldCheck', title: 'Double validation', text: 'Chaque remise et livraison est confirmée par les deux parties, par QR.' },
  { icon: 'euro', title: 'Versement automatique', text: 'Le voyageur est payé automatiquement une fois la livraison validée.' },
];

export default function Onboarding({ user, onClose }) {
  const nav = useNavigate();
  const [screen, setScreen] = useState(0);

  const finish = (dest) => {
    localStorage.setItem(onboardKey(user.id), '1');
    onClose();
    if (dest) nav(dest);
  };

  return (
    <div className="onboard-overlay">
      <div className="onboard-card">
        <button className="onboard-skip" onClick={() => finish(null)}>Passer</button>

        {screen === 0 && (
          <div className="onboard-screen">
            <img className="onboard-logo" src="/assets/logo-mark-192.png" alt="Wigofly" />
            <h1 className="onboard-title">Bienvenue sur Wigofly</h1>
            <p className="onboard-sub">
              Envoyer entre la Belgique et le Maroc, en sécurité — voici comment on vous protège à chaque étape.
            </p>
            <div className="onboard-steps">
              {STEPS.map((s, i) => (
                <div className="onboard-step" key={i}>
                  <div className="onboard-step-icon"><Icon name={s.icon} size={19} /></div>
                  <div>
                    <b>{s.title}</b>
                    <div className="onboard-step-text">{s.text}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setScreen(1)}>
              Continuer<Icon name="arrowRight" size={17} />
            </button>
          </div>
        )}

        {screen === 1 && (
          <div className="onboard-screen">
            <h1 className="onboard-title">Que voulez-vous faire ?</h1>
            <p className="onboard-sub">Vous pourrez faire les deux à tout moment.</p>
            <button className="onboard-choice" onClick={() => finish('/envois/nouveau')}>
              <div className="onboard-choice-icon"><Icon name="package" size={24} /></div>
              <div className="grow">
                <b>Envoyer un colis</b>
                <div className="onboard-step-text">Publiez ce que vous voulez faire livrer au Maroc ou en Belgique.</div>
              </div>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="onboard-choice" onClick={() => finish('/')}>
              <div className="onboard-choice-icon"><Icon name="luggage" size={24} /></div>
              <div className="grow">
                <b>Transporter et gagner</b>
                <div className="onboard-step-text">Déclarez votre trajet et transportez des colis contre rémunération.</div>
              </div>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="link-btn onboard-back" onClick={() => setScreen(0)}>
              <Icon name="arrowLeft" size={14} />Retour
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
