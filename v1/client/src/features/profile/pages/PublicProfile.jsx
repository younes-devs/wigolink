import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { Avatar, Icon } from '../../../Icons.jsx';
import { Stars, TrustBadge } from '../../../components.jsx';
import { TripTransportIcon } from '../../trips/components/TripTransport.jsx';
import { dateLocale, t, useLang } from '../../../i18n.js';

const dateFmt = () => new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', year: 'numeric' });

export default function PublicProfile() {
  useLang();
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setData(null);
    setReviews(null);
    setError('');
    Promise.all([api(`/users/${id}`), api(`/users/${id}/reviews`)])
      .then(([profile, reviewData]) => {
        setData(profile);
        setReviews(reviewData);
      })
      .catch((err) => setError(err.message || t('publicProfile.error')));
  }, [id]);

  if (error) {
    return (
      <div className="message-state">
        <Icon name="alert" size={30} />
        <b>{t('publicProfile.errorTitle')}</b>
        <p>{error}</p>
        <Link to="/messages" className="btn btn-sm">{t('messages.back')}</Link>
      </div>
    );
  }

  if (!data || !reviews) {
    return (
      <div className="card public-profile-card">
        <span className="skeleton avatar-skeleton" />
        <span className="skeleton line-skeleton wide" />
        <span className="skeleton line-skeleton" />
      </div>
    );
  }

  const user = data.user;
  const comments = (reviews.reviews || []).filter((review) => review.comment);

  return (
    <div className="public-profile">
      <button type="button" className="profile-back" onClick={() => navigate(-1)}><Icon name="arrowLeft" size={17} /> {t('common.back')}</button>
      <section className="card public-profile-card">
        <div className="public-profile-head">
          <Avatar name={user.name} photo={user.photoUrl} size={74} />
          <div className="grow">
            <h1>{user.name}</h1>
            <p>{user.city || t('publicProfile.cityFallback')}</p>
            <TrustBadge user={user} />
          </div>
        </div>
        <div className="public-profile-stats">
          <div><b>{user.completed || 0}</b><span>{t('publicProfile.completed')}</span></div>
          <div><b>{user.rating ?? '-'}</b><span>{t('publicProfile.rating')}</span></div>
          <div><b>{user.ratingCount || 0}</b><span>{t('publicProfile.reviews')}</span></div>
        </div>
      </section>

      <section className="card">
        <h2><Icon name="mapPin" size={17} />{t('publicProfile.trips')}</h2>
        {data.trips.length === 0 && <p className="muted">{t('publicProfile.noTrips')}</p>}
        <div className="public-trip-list">
          {data.trips.map((trip) => (
            <Link to={`/trajets/${trip.id}`} className="public-trip-row" key={trip.id}>
              <TripTransportIcon mode={trip.transportMode} size={18} />
              <span className="grow">
                <b>{trip.from} {'->'} {trip.to}</b>
                <small>{dateFmt().format(new Date(trip.departureDate))} · {trip.price} {trip.currency} · {trip.capacityKg} kg</small>
              </span>
              <Icon name="arrowRight" size={15} />
            </Link>
          ))}
        </div>
      </section>

      <section className="card">
        <h2><Icon name="star" size={17} />{t('reviews.title')}</h2>
        {(reviews.reviews || []).length === 0 && <p className="muted">{t('reviews.none')}</p>}
        {comments.length === 0 && (reviews.reviews || []).length > 0 && (
          <p className="muted">{t('reviews.nocomment', { n: reviews.reviews.length })}</p>
        )}
        {comments.slice(0, 6).map((review, index) => (
          <div className="public-review" key={`${review.at}-${index}`}>
            <div className="list-row">
              <Stars value={review.stars} readOnly size={15} />
              <small>{dateFmt().format(new Date(review.at))}</small>
            </div>
            <p>{review.comment}</p>
            <span>{review.authorName}</span>
          </div>
        ))}
      </section>
    </div>
  );
}
