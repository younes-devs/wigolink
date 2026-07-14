import { Link } from 'react-router-dom';
import { Icon } from '../Icons.jsx';
import { t, useLang } from '../i18n.js';

// Page 404 in-app (PRD UI/UX U18) — au lieu d'une redirection silencieuse vers l'accueil,
// on explique et on propose de revenir.
export default function NotFound() {
  useLang();
  return (
    <div className="card center empty-state" style={{ marginTop: 40 }}>
      <Icon name="alert" size={40} />
      <h1 className="page-title" style={{ marginBottom: 0 }}>{t('notfound.title')}</h1>
      <p className="muted" style={{ maxWidth: 320 }}>
        {t('notfound.text')}
      </p>
      <Link to="/"><button className="btn btn-primary btn-sm"><Icon name="arrowLeft" size={15} />{t('notfound.home')}</button></Link>
    </div>
  );
}
