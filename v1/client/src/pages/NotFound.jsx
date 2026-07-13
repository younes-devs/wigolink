import { Link } from 'react-router-dom';
import { Icon } from '../Icons.jsx';

// Page 404 in-app (PRD UI/UX U18) — au lieu d'une redirection silencieuse vers l'accueil,
// on explique et on propose de revenir.
export default function NotFound() {
  return (
    <div className="card center empty-state" style={{ marginTop: 40 }}>
      <Icon name="alert" size={40} />
      <h1 className="page-title" style={{ marginBottom: 0 }}>Page introuvable</h1>
      <p className="muted" style={{ maxWidth: 320 }}>
        Cette page n'existe pas ou a été déplacée. Vérifiez le lien, ou revenez à l'accueil.
      </p>
      <Link to="/"><button className="btn btn-primary btn-sm"><Icon name="arrowLeft" size={15} />Retour à l'accueil</button></Link>
    </div>
  );
}
