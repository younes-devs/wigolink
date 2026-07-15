import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { formatDate } from './TripFeedSimple.jsx';

export default function SavedTrips() {
  const [trips, setTrips] = useState(null);
  const toast = useToast();
  const load = () => api('/saved-trips').then((data) => setTrips(data.trips)).catch(() => setTrips([]));
  useEffect(() => { load(); }, []);

  const remove = async (tripId) => {
    await api(`/saved-trips/${tripId}`, { method: 'DELETE' });
    toast.info('Trajet retiré');
    load();
  };

  return (
    <div className="simple-page">
      <h1 className="page-title">Enregistrés</h1>
      <p className="page-sub">Les trajets que vous gardez pour plus tard. Les trajets expirés disparaissent automatiquement.</p>

      {trips === null && <div className="card"><span className="spinner" /> Chargement...</div>}
      {trips?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="star" size={34} />
          <p className="muted">Aucun trajet enregistré pour l’instant.</p>
          <Link to="/trajets" className="btn btn-primary btn-sm">Voir les trajets</Link>
        </div>
      )}
      <div className="saved-list">
        {trips?.map((trip) => (
          <article className="card saved-trip" key={trip.id}>
            <Avatar name={trip.traveler?.name || 'Voyageur'} photo={trip.traveler?.photoUrl} size={44} />
            <div className="grow">
              <b>{trip.from} {'->'} {trip.to}</b>
              <span>{formatDate(trip.departureDate)} · {trip.price} {trip.currency} · {trip.capacityKg} kg</span>
              <small>{trip.traveler?.name || 'Voyageur'}</small>
            </div>
            <div className="saved-actions">
              <Link to={`/trajets/${trip.id}`} className="btn btn-primary btn-sm">Voir</Link>
              <button className="icon-btn" onClick={() => remove(trip.id)} title="Retirer"><Icon name="trash" size={16} /></button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
