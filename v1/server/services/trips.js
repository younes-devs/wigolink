export function createTripService({
  db,
  isClosedStatus,
  transportModes,
  normalizeTransportMode,
  tripView,
  availableTrips,
  cleanupSavedTrips,
  positiveNumber,
  auditChange,
  save,
  newId,
  today,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function activeOperationCount(tripId) {
    return db.transactions.filter((transaction) =>
      transaction.tripId === tripId
      && !isClosedStatus(transaction.status)
    ).length;
  }

  function mine(user) {
    const trips = db.trips
      .filter((trip) => trip.travelerId === user.id)
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((trip) => ({
        ...tripView(trip, user),
        activeOperations: activeOperationCount(trip.id),
      }));
    return { trips };
  }

  async function create(user, body = {}) {
    if (user.kycStatus !== 'verified') {
      return response(403, {
        error: "Vérification d'identité requise",
        needsKyc: true,
      });
    }

    const {
      from,
      to,
      date,
      departureDate,
      capacityKg,
      price,
      description,
      conditions,
      transportMode = 'plane',
    } = body;
    const travelDate = date || departureDate;
    if (!from || !to || !travelDate) {
      return response(400, { error: 'Trajet, sens et date requis' });
    }
    if (from === to) {
      return response(400, { error: 'Départ et arrivée identiques' });
    }
    if (!transportModes.has(transportMode)) {
      return response(400, { error: 'Type de transport invalide' });
    }
    if (new Date(travelDate) < new Date(new Date(now()).toDateString())) {
      return response(400, { error: 'La date est déjà passée' });
    }
    const proposedPrice = positiveNumber(
      price === undefined ? 25 : price,
    );
    if (proposedPrice === null) {
      return response(400, { error: 'Prix invalide' });
    }

    const trip = {
      id: newId('t'),
      travelerId: user.id,
      from: String(from).trim().slice(0, 60),
      to: String(to).trim().slice(0, 60),
      date: travelDate,
      departureDate: travelDate,
      transportMode,
      price: proposedPrice,
      currency: 'EUR',
      description: String(
        description
        || 'Voyageur disponible pour transporter un colis propre et conforme.',
      ).trim().slice(0, 700),
      conditions: String(
        conditions
        || 'Petit colis propre, ferme et conforme aux regles douanieres.',
      ).trim().slice(0, 500),
      status: 'published',
      capacityKg: Math.max(1, Math.min(30, Number(capacityKg) || 5)),
      createdAt: now(),
      updatedAt: now(),
    };
    db.trips.push(trip);
    await auditChange({
      actorId: user.id,
      action: 'trip.create',
      targetType: 'trip',
      targetId: trip.id,
      subjectUserId: user.id,
      before: {},
      after: trip,
      fields: [
        'from',
        'to',
        'departureDate',
        'transportMode',
        'capacityKg',
        'price',
        'description',
        'conditions',
        'status',
      ],
    });
    save();
    return response(200, {
      trip: tripView(trip, user),
    });
  }

  async function update(id, user, body = {}) {
    const trip = db.trips.find((item) =>
      item.id === id
      && item.travelerId === user.id
    );
    if (!trip) return response(404, { error: 'Trajet introuvable' });
    if ((trip.status || 'published') !== 'published') {
      return response(400, { error: 'Trajet indisponible' });
    }
    if (activeOperationCount(trip.id) > 0) {
      return response(400, {
        error: 'Impossible de modifier un trajet avec operation en cours',
      });
    }

    const before = { ...trip };
    const {
      from,
      to,
      date,
      departureDate,
      capacityKg,
      price,
      description,
      conditions,
      transportMode,
    } = body;
    const travelDate = date
      || departureDate
      || trip.departureDate
      || trip.date;
    const nextFrom = String(from ?? trip.from).trim().slice(0, 60);
    const nextTo = String(to ?? trip.to).trim().slice(0, 60);
    const nextTransportMode = transportMode === undefined
      ? normalizeTransportMode(trip.transportMode)
      : transportMode;

    if (!nextFrom || !nextTo || !travelDate) {
      return response(400, { error: 'Trajet, sens et date requis' });
    }
    if (nextFrom === nextTo) {
      return response(400, { error: 'Depart et arrivee identiques' });
    }
    if (!transportModes.has(nextTransportMode)) {
      return response(400, { error: 'Type de transport invalide' });
    }
    if (new Date(travelDate) < new Date(new Date(now()).toDateString())) {
      return response(400, { error: 'La date est deja passee' });
    }
    const proposedPrice = positiveNumber(
      price === undefined ? trip.price : price,
    );
    if (proposedPrice === null) {
      return response(400, { error: 'Prix invalide' });
    }

    trip.from = nextFrom;
    trip.to = nextTo;
    trip.date = travelDate;
    trip.departureDate = travelDate;
    trip.transportMode = nextTransportMode;
    trip.price = proposedPrice;
    trip.capacityKg = Math.max(
      1,
      Math.min(30, Number(capacityKg ?? trip.capacityKg) || 5),
    );
    trip.description = String(
      description ?? trip.description ?? '',
    ).trim().slice(0, 700)
      || 'Voyageur disponible pour transporter un colis propre et conforme.';
    trip.conditions = String(
      conditions ?? trip.conditions ?? '',
    ).trim().slice(0, 500)
      || 'Petit colis propre, ferme et conforme aux regles douanieres.';
    trip.updatedAt = now();
    await auditChange({
      actorId: user.id,
      action: 'trip.update',
      targetType: 'trip',
      targetId: trip.id,
      subjectUserId: user.id,
      before,
      after: trip,
      fields: [
        'from',
        'to',
        'departureDate',
        'transportMode',
        'capacityKg',
        'price',
        'description',
        'conditions',
      ],
    });
    save();
    return response(200, {
      trip: tripView(trip, user),
    });
  }

  async function remove(id, user) {
    const trip = db.trips.find((item) =>
      item.id === id
      && item.travelerId === user.id
    );
    if (!trip) return response(404, { error: 'Trajet introuvable' });
    if (activeOperationCount(trip.id) > 0) {
      return response(400, {
        error: 'Impossible de retirer un trajet avec operation en cours',
      });
    }

    const before = { ...trip };
    trip.status = 'removed';
    trip.removedAt = now();
    db.savedTrips = db.savedTrips.filter((saved) =>
      saved.tripId !== trip.id
    );
    await auditChange({
      actorId: user.id,
      action: 'trip.remove',
      targetType: 'trip',
      targetId: trip.id,
      subjectUserId: user.id,
      before,
      after: trip,
      fields: ['status'],
    });
    save();
    return response(200, { ok: true });
  }

  function list(user, query = {}) {
    return {
      trips: availableTrips(user, query),
    };
  }

  function overview(user, query = {}) {
    return {
      trips: availableTrips(user, {
        ...query,
        excludeMine: '1',
      }),
      myTrips: mine(user).trips,
    };
  }

  function detail(id, user) {
    const trip = db.trips.find((item) => item.id === id);
    if (!trip) return response(404, { error: 'Trajet introuvable' });
    const view = tripView(trip, user);
    if (
      view.status !== 'published'
      || view.departureDate < today()
    ) {
      return response(404, {
        error: 'Trajet expiré ou indisponible',
      });
    }
    if (trip.travelerId === user.id) {
      view.activeOperations = activeOperationCount(trip.id);
    }
    return response(200, { trip: view });
  }

  function saved(user) {
    const changed = cleanupSavedTrips();
    if (changed) save();
    const trips = db.savedTrips
      .filter((savedTrip) => savedTrip.userId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((savedTrip) =>
        db.trips.find((trip) => trip.id === savedTrip.tripId)
      )
      .filter(Boolean)
      .map((trip) => tripView(trip, user));
    return { trips };
  }

  function saveTrip(tripId, user) {
    cleanupSavedTrips();
    const trip = db.trips.find((item) => item.id === tripId);
    if (!trip) return response(404, { error: 'Trajet introuvable' });
    const view = tripView(trip, user);
    if (
      view.status !== 'published'
      || view.departureDate < today()
    ) {
      return response(400, {
        error: 'Trajet expiré ou indisponible',
      });
    }
    let savedTrip = db.savedTrips.find((item) =>
      item.userId === user.id
      && item.tripId === trip.id
    );
    if (!savedTrip) {
      savedTrip = {
        id: newId('saved'),
        userId: user.id,
        tripId: trip.id,
        createdAt: now(),
      };
      db.savedTrips.push(savedTrip);
    }
    save();
    return response(200, {
      trip: tripView(trip, user),
    });
  }

  function unsaveTrip(tripId, user) {
    const before = db.savedTrips.length;
    db.savedTrips = db.savedTrips.filter((savedTrip) =>
      !(
        savedTrip.userId === user.id
        && savedTrip.tripId === tripId
      )
    );
    if (before !== db.savedTrips.length) save();
    return { ok: true };
  }

  return {
    create,
    detail,
    list,
    mine,
    overview,
    remove,
    saveTrip,
    saved,
    unsaveTrip,
    update,
  };
}
