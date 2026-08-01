import { Link, useLocation } from 'react-router-dom';
import { Icon } from '../../Icons.jsx';
import { t, useLang } from '../../i18n.js';
import { loginPath } from '../authNavigation.js';

const AREA_ICONS = {
  operations: 'repeat',
  saved: 'star',
  messages: 'chat',
  profile: 'user',
};

export default function GuestAccess({ area }) {
  useLang();
  const location = useLocation();
  const returnTo = `${location.pathname}${location.search}${location.hash}`;

  return (
    <main className="guest-access" aria-labelledby="guest-access-title">
      <span className="guest-access-icon" aria-hidden="true">
        <Icon name={AREA_ICONS[area] || 'lock'} size={28} />
      </span>
      <p className="guest-access-kicker">{t('guest.private')}</p>
      <h1 id="guest-access-title">{t(`guest.${area}.title`)}</h1>
      <p>{t(`guest.${area}.text`)}</p>
      <Link className="btn btn-primary" to={loginPath(returnTo)}>
        <Icon name="lock" size={17} />
        {t('guest.login')}
      </Link>
      <Link className="guest-access-back" to="/trajets">
        <Icon name="arrowLeft" size={15} />
        {t('guest.backToTrips')}
      </Link>
    </main>
  );
}
