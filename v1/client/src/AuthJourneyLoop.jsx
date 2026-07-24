import { Icon } from './Icons.jsx';

export default function AuthJourneyLoop({ t }) {
  return (
    <div className="auth-journey" role="img" aria-label={t('auth.journey.aria')}>
      <div className="auth-journey-stage" aria-hidden="true">
        <span className="auth-journey-track auth-journey-track-air" />
        <span className="auth-journey-track auth-journey-track-road" />

        <span className="auth-journey-endpoint auth-journey-origin">
          <span className="auth-journey-pin"><Icon name="mapPin" size={20} strokeWidth={2} /></span>
          <b>{t('auth.journey.origin')}</b>
        </span>

        <span className="auth-journey-endpoint auth-journey-destination">
          <span className="auth-journey-pin"><Icon name="mapPin" size={20} strokeWidth={2} /></span>
          <b>{t('auth.journey.destination')}</b>
        </span>

        <span className="auth-journey-vehicle auth-journey-plane">
          <Icon name="plane" size={21} strokeWidth={2} />
        </span>
        <span className="auth-journey-vehicle auth-journey-car">
          <Icon name="car" size={21} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
