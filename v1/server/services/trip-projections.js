export function createTripProjections({
  db,
  findUser,
  publicUser,
  todayIso,
  transportMode,
  locationMatches,
  normalizeLocationText,
}) {
  function view(trip, user = null) {
    const traveler = findUser(trip.travelerId);
    const saved = user ? db.savedTrips.some((item) => item.userId === user.id && item.tripId === trip.id) : false;
    const price = Number(trip.price ?? trip.proposedPrice ?? trip.travelerPay ?? trip.priceEur ?? 25);
    return {
      ...trip,
      departureDate: trip.departureDate || trip.date,
      ticketDate: trip.ticketDate || trip.date,
      transportMode: transportMode(trip.transportMode),
      price,
      currency: trip.currency || 'EUR',
      capacityKg: Number(trip.capacityKg || 0),
      description: trip.description || 'Voyageur disponible pour transporter un colis propre et conforme.',
      conditions: trip.conditions || 'Petit colis propre, ferme et conforme aux regles douanieres.',
      status: trip.status || (trip.date < todayIso() ? 'expired' : 'published'),
      traveler: publicUser(traveler),
      saved,
    };
  }

  function available(user, query = {}) {
    const today = todayIso();
    let trips = db.trips
      .map((trip) => ({ ...trip, status: trip.status || (trip.date < today ? 'expired' : 'published') }))
      .filter((trip) => trip.status === 'published' && (trip.departureDate || trip.date) >= today)
      .filter((trip) => findUser(trip.travelerId)?.kycStatus === 'verified');
    if (query.excludeMine === '1' && user?.id) {
      trips = trips.filter((trip) => trip.travelerId !== user.id);
    }
    if (query.from) {
      trips = trips.filter((trip) => locationMatches(trip.from, query.from, {
        locationId: trip.fromLocationId,
        countryCode: trip.fromCountryCode || 'ALL',
      }));
    }
    if (query.to) {
      trips = trips.filter((trip) => locationMatches(trip.to, query.to, {
        locationId: trip.toLocationId,
        countryCode: trip.toCountryCode || 'ALL',
      }));
    }
    if (query.date) trips = trips.filter((trip) => (trip.departureDate || trip.date) >= String(query.date));
    const minCapacity = Number(query.capacityKg);
    if (Number.isFinite(minCapacity) && minCapacity >= 0 && String(query.capacityKg).trim() !== '') {
      trips = trips.filter((trip) => Number(trip.capacityKg || 0) >= minCapacity);
    }
    const maxPrice = Number(query.maxPrice);
    if (Number.isFinite(maxPrice) && maxPrice >= 0 && String(query.maxPrice).trim() !== '') {
      trips = trips.filter((trip) => Number(trip.price ?? trip.proposedPrice ?? 25) <= maxPrice);
    }
    if (query.q) {
      const needle = normalizeLocationText(query.q);
      trips = trips.filter((trip) => (
        locationMatches(trip.from, query.q, {
          locationId: trip.fromLocationId,
          countryCode: trip.fromCountryCode || 'ALL',
        })
        || locationMatches(trip.to, query.q, {
          locationId: trip.toLocationId,
          countryCode: trip.toCountryCode || 'ALL',
        })
        || normalizeLocationText(
          `${trip.description || ''} ${findUser(trip.travelerId)?.name || ''}`,
        ).includes(needle)
      ));
    }
    return trips
      .sort((left, right) => (left.departureDate || left.date).localeCompare(right.departureDate || right.date))
      .map((trip) => view(trip, user));
  }

  function cleanupSaved() {
    const today = todayIso();
    const before = db.savedTrips.length;
    db.savedTrips = db.savedTrips.filter((saved) => {
      const trip = db.trips.find((item) => item.id === saved.tripId);
      return trip && (trip.status || 'published') === 'published' && (trip.departureDate || trip.date) >= today;
    });
    return before !== db.savedTrips.length;
  }

  return {
    tripPostView: view,
    availableTripPosts: available,
    cleanupSavedTrips: cleanupSaved,
  };
}
