import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../core/api.js';
import { Icon } from '../../Icons.jsx';
import { t, useLang } from '../../i18n.js';

// Onboarding premier lancement (PRD UI/UX U1) — 2 écrans max, skippable, une seule fois
// par compte. Le serveur garde l'état pour éviter de le revoir sur un autre appareil ;
// localStorage reste un fallback immédiat si la sauvegarde réseau échoue.
const onboardKey = (userId) => `wigofly_onboarded_${userId}`;

export function shouldOnboard(user) {
  return !!user && !user.onboardingDone && !localStorage.getItem(onboardKey(user.id));
}

const STEPS = [
  { icon: 'plane', k: 'escrow' },
  { icon: 'chat', k: 'video' },
  { icon: 'repeat', k: 'validation' },
  { icon: 'star', k: 'pay' },
];

export default function Onboarding({ user, onClose }) {
  useLang();
  const nav = useNavigate();
  const [screen, setScreen] = useState(0);

  const finish = (dest) => {
    localStorage.setItem(onboardKey(user.id), '1');
    onClose();
    if (dest) nav(dest);
    api('/onboarding/complete', { method: 'POST' }).catch(() => {});
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
            <button className="onboard-choice" onClick={() => finish('/trajets')}>
              <div className="onboard-choice-icon"><Icon name="plane" size={24} /></div>
              <div className="grow">
                <b>{t('onboard.send.t')}</b>
                <div className="onboard-step-text">{t('onboard.send.d')}</div>
              </div>
              <Icon name="arrowRight" size={18} />
            </button>
            <button className="onboard-choice" onClick={() => finish('/trajets')}>
              <div className="onboard-choice-icon"><Icon name="plus" size={24} /></div>
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
