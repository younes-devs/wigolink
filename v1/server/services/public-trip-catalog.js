export function publicTripCatalog(result = {}) {
  return {
    trips: (result.trips || []).map(publicTrip),
    page: result.page || {
      limit: 40,
      offset: 0,
      hasMore: false,
      nextOffset: null,
      nextCursor: null,
    },
  };
}

export function publicTripDetail(result = {}) {
  if (result.status !== 200 || !result.body?.trip) return result;
  return {
    status: 200,
    body: { trip: publicTrip(result.body.trip) },
  };
}

function publicTrip(trip = {}) {
  return {
    id: trip.id,
    from: trip.from,
    to: trip.to,
    departureDate: trip.departureDate || trip.date,
    ticketDate: trip.ticketDate || trip.date,
    transportMode: trip.transportMode === 'car' ? 'car' : 'plane',
    price: Number(trip.price || 0),
    currency: trip.currency || 'EUR',
    capacityKg: Number(trip.capacityKg || 0),
    description: trip.description || '',
    conditions: trip.conditions || '',
    status: trip.status || 'published',
    traveler: publicTraveler(trip.traveler),
    saved: false,
  };
}

function publicTraveler(traveler) {
  if (!traveler) return null;
  return {
    id: traveler.id,
    name: traveler.name,
    city: traveler.city,
    kycStatus: traveler.kycStatus,
    rating: traveler.rating,
    ratingCount: traveler.ratingCount,
    completed: traveler.completed,
    badges: traveler.badges,
    photoUrl: publicPhotoUrl(traveler.photoUrl),
  };
}

function publicPhotoUrl(value) {
  const url = String(value || '').trim();
  if (url.startsWith('https://') || url.startsWith('/assets/') || url.startsWith('/api/public/profile-photos/')) return url;
  return null;
}
