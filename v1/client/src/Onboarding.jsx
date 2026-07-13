import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icons.jsx';
import { t, useLang } from './i18n.js';

// Onboarding premier lancement (PRD UI/UX U1) — 2 écrans max, skippable, une seule fois
// par compte. Explique le parcours sécurisé puis route directement vers l'action choisie.
const onboardKey = (userId) => `wigofly_onboarded_${userId}`;

export function shouldOnboard(user) {
  return !!user && !localStorage.getItem(onboardKey(user.id));
}

const STEPS = [
  { icon: 'lock', k: 'escrow' },
  { icon: 'video', k: 'video' },
  { icon: 'shieldCheck', k: 'validation' },
  { icon: 'euro', k: 'pay' },
];

export default function Onboarding({ user, onClose }) {
  useLang();
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
        <button className="onboard-skip" onClick={() => finish(null)}>{t('onboard.skip')}</button>

        {screen === 0 && (
          <div className="onboard-screen">
            <img className="onboard-logo" src="/assets/logo-mark-192.png" alt="Wigofly" />
            <h1 className="onboard-title">{t('onboard.welcome')}</h1>
            <p className="onboard-sub">{t('onboard.intro')}</p>
            <div className="onboard-steps">
              {STEPS.map((s) => (
                <div className="onboard-step" key={s.k}>
                  <div className="onboard-step-icon"><Icon name={s.icon} size={19} /></div>
                  <div>
                    <b>{t(`onboard.${s.k}.t`)}</b>
                    <div className="onboard-step-text">{t(`onboard.${s.k}.d`)}</div>
                  </div>
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => setScreen(1)}>
              {t('onboard.continue')}<Icon name="arrowRight" size={17} />
            </button>
          </div>
        )}

        {screen === 1 && (
          <div className="onboard-screen">
            <h1 className="onboard-title">{t('onboard.q')}</h1>
            <p className="onboard-sub">{t('onboard.q.sub')}</p>
            <button className="onboard-choice" onClick={() => finish('/envois/nouveau')}>
              <div className="onboard-choice-icon"><Icon name="package" size={24} /></div>
              <div className="grow">
                <b>{t('onboard.send.t')}</b>
                <div className="onboard-step-text">{t('onboard.send.d')}</div>
              </div>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="onboard-choice" onClick={() => finish('/')}>
              <div className="onboard-choice-icon"><Icon name="luggage" size={24} /></div>
              <div className="grow">
                <b>{t('onboard.carry.t')}</b>
                <div className="onboard-step-text">{t('onboard.carry.d')}</div>
              </div>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="link-btn onboard-back" onClick={() => setScreen(0)}>
              <Icon name="arrowLeft" size={14} />{t('onboard.back')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
