export function createMatchingOfferService({
  db,
  matchesTrip,
  publicUser,
  findUser,
  positiveNumber,
  notify,
  save,
  newId,
  runReminders,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function snapshot(offer) {
    if (!offer) return '';
    return JSON.stringify({
      status: offer.status,
      offeredPay: offer.offeredPay,
      expiresAt: offer.expiresAt,
      respondedAt: offer.respondedAt,
      historyLength:
        Array.isArray(offer.history) ? offer.history.length : 0,
    });
  }

  function normalize(offer) {
    if (!offer) return offer;
    const currentTime = now();
    const listing = db.listings.find(
      (candidate) => candidate.id === offer.listingId,
    );
    if (!offer.offeredPay && listing) {
      offer.offeredPay = listing.travelerPay;
    }
    if (!offer.expiresAt) {
      offer.expiresAt = offer.createdAt + 72 * 36e5;
    }
    if (!offer.history) {
      offer.history = [{
        by: offer.senderId,
        type: 'created',
        pay: offer.offeredPay || listing?.travelerPay || 0,
        message: offer.message || '',
        at: offer.createdAt,
      }];
    }
    if (offer.status === 'pending') {
      offer.status = 'pending_traveler';
    }
    if (
      ['pending_traveler', 'countered_sender'].includes(offer.status)
      && offer.expiresAt <= currentTime
    ) {
      offer.status = 'expired';
      offer.respondedAt = currentTime;
      if (!offer.history.some((event) => event.type === 'expired')) {
        offer.history.push({
          by: 'system',
          type: 'expired',
          pay: offer.offeredPay || 0,
          message: '',
          at: currentTime,
        });
      }
    }
    return offer;
  }

  function normalizeAll({ persist = false } = {}) {
    let changed = false;
    for (const offer of db.matchingOffers || []) {
      const before = snapshot(offer);
      normalize(offer);
      if (snapshot(offer) !== before) changed = true;
    }
    if (changed && persist) save();
    return changed;
  }

  function normalizeAndSave(offer) {
    const before = snapshot(offer);
    normalize(offer);
    if (snapshot(offer) !== before) save();
    return offer;
  }

  function matchingCenter(user) {
    const today = new Date(now()).toISOString().slice(0, 10);
    const mine = db.listings
      .filter(
        (listing) =>
          listing.senderId === user.id
          && ['published', 'pending_review'].includes(listing.status),
      )
      .sort((a, b) => b.createdAt - a.createdAt);
    const trips = db.trips
      .filter(
        (trip) =>
          trip.travelerId !== user.id
          && trip.date >= today,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const items = mine.map((listing) => {
      const candidates = trips
        .filter((trip) => matchesTrip(listing, trip))
        .map((trip) => {
          const traveler = findUser(trip.travelerId);
          const capacityFit = listing.weightKg
            ? Math.min(
              100,
              Math.round((listing.weightKg / trip.capacityKg) * 100),
            )
            : 0;
          const offer = (db.matchingOffers || [])
            .filter(
              (candidate) =>
                candidate.listingId === listing.id
                && candidate.tripId === trip.id
                && candidate.senderId === user.id,
            )
            .sort((a, b) => b.createdAt - a.createdAt)[0] || null;
          return {
            trip,
            traveler: publicUser(traveler),
            score: Math.min(
              100,
              Math.max(
                40,
                100
                  - capacityFit
                  + Math.min(10, traveler?.completed || 0),
              ),
            ),
            capacityFit,
            offer,
          };
        })
        .sort(
          (a, b) =>
            b.score - a.score
            || a.trip.date.localeCompare(b.trip.date),
        );
      const action =
        listing.status === 'pending_review'
          ? {
            id: 'wait_review',
            priority: 'medium',
            href: '/envois',
          }
          : candidates.length
            ? {
              id: 'contact_ready',
              priority: 'high',
              href: `/annonce/${listing.id}`,
            }
            : {
              id: 'adjust_listing',
              priority: 'medium',
              href: '/envois',
            };
      return {
        listing,
        candidates: candidates.slice(0, 5),
        candidateCount: candidates.length,
        action,
      };
    });

    return {
      totals: {
        listings: mine.length,
        matched: items.filter((item) => item.candidateCount > 0).length,
        candidates: items.reduce(
          (total, item) => total + item.candidateCount,
          0,
        ),
        pendingReview: mine.filter(
          (listing) => listing.status === 'pending_review',
        ).length,
      },
      actions: items
        .filter((item) => item.action.priority !== 'low')
        .sort((a, b) => {
          const rank = { high: 0, medium: 1, low: 2 };
          return (
            rank[a.action.priority] - rank[b.action.priority]
            || b.candidateCount - a.candidateCount
          );
        })
        .slice(0, 6)
        .map((item) => ({
          id: `${item.listing.id}:${item.action.id}`,
          listingId: item.listing.id,
          title: item.listing.title,
          action: item.action,
          candidateCount: item.candidateCount,
        })),
      items,
    };
  }

  async function center(user) {
    await runReminders({ persist: true });
    return { matching: matchingCenter(user) };
  }

  async function list(user) {
    await runReminders({ persist: true });
    const offers = (db.matchingOffers || [])
      .map(normalize)
      .filter(
        (offer) =>
          offer.senderId === user.id
          || offer.travelerId === user.id,
      )
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((offer) => ({
        ...offer,
        myRole: offer.senderId === user.id ? 'sender' : 'traveler',
        listing: db.listings.find(
          (listing) => listing.id === offer.listingId,
        ),
        trip: db.trips.find((trip) => trip.id === offer.tripId),
        sender: publicUser(findUser(offer.senderId)),
        traveler: publicUser(findUser(offer.travelerId)),
      }));
    return { offers };
  }

  async function create(user, body = {}) {
    normalizeAll({ persist: true });
    const {
      listingId,
      tripId,
      message = '',
      offeredPay,
      expiresInHours,
    } = body;
    const listing = db.listings.find(
      (candidate) => candidate.id === listingId,
    );
    const trip = db.trips.find(
      (candidate) => candidate.id === tripId,
    );
    if (!listing || listing.senderId !== user.id) {
      return response(404, { error: 'Annonce introuvable' });
    }
    if (listing.status !== 'published') {
      return response(400, {
        error: 'Cette annonce ne peut plus recevoir de proposition',
      });
    }
    if (!trip || trip.travelerId === user.id) {
      return response(400, { error: 'Trajet incompatible' });
    }
    if (!matchesTrip(listing, trip)) {
      return response(400, {
        error: 'Ce trajet ne correspond pas aux contraintes de l annonce',
      });
    }

    const pay = positiveNumber(
      offeredPay === undefined ? listing.travelerPay : offeredPay,
    );
    if (pay === null) {
      return response(400, { error: 'Montant proposé invalide' });
    }

    const existing = (db.matchingOffers || []).find(
      (offer) =>
        offer.listingId === listing.id
        && offer.tripId === trip.id
        && ['pending_traveler', 'countered_sender'].includes(
          offer.status,
        ),
    );
    if (existing) {
      return response(200, { offer: existing });
    }

    const currentTime = now();
    const rawTtl =
      expiresInHours === undefined ? 72 : Number(expiresInHours);
    const ttlHours = Number.isFinite(rawTtl)
      ? Math.max(0, Math.min(168, rawTtl))
      : 72;
    const normalizedMessage = String(message || '').trim().slice(0, 500);
    const offer = {
      id: newId('mo'),
      listingId: listing.id,
      tripId: trip.id,
      senderId: user.id,
      travelerId: trip.travelerId,
      status: 'pending_traveler',
      offeredPay: pay,
      message: normalizedMessage,
      history: [{
        by: user.id,
        type: 'offer',
        pay,
        message: normalizedMessage,
        at: currentTime,
      }],
      createdAt: currentTime,
      expiresAt: currentTime + ttlHours * 36e5,
      respondedAt: null,
      txId: null,
    };
    db.matchingOffers.push(offer);
    await notify(
      [offer.travelerId],
      {
        key: 'offer.received',
        params: { name: user.name, title: listing.title },
      },
      null,
      'messages',
      'matching',
    );
    save();
    return response(200, { offer });
  }

  function activeOffer(id, user, { senderOnly = false } = {}) {
    const offer = normalizeAndSave(
      (db.matchingOffers || []).find(
        (candidate) => candidate.id === id,
      ),
    );
    const allowed =
      offer
      && (
        senderOnly
          ? offer.senderId === user.id
          : [offer.travelerId, offer.senderId].includes(user.id)
      );
    if (!allowed) {
      return {
        error: response(404, { error: 'Proposition introuvable' }),
      };
    }
    if (
      !['pending_traveler', 'countered_sender'].includes(offer.status)
    ) {
      return {
        error: response(400, {
          error: 'Cette proposition n est plus active',
        }),
      };
    }
    return { offer };
  }

  async function decline(id, user) {
    const found = activeOffer(id, user);
    if (found.error) return found.error;
    const { offer } = found;
    const currentTime = now();
    offer.status = 'declined';
    offer.respondedAt = currentTime;
    offer.history.push({
      by: user.id,
      type: 'declined',
      pay: offer.offeredPay,
      message: '',
      at: currentTime,
    });
    await notify(
      [user.id === offer.senderId ? offer.travelerId : offer.senderId],
      { key: 'offer.declined', params: { name: user.name } },
      null,
      'messages',
      'matching',
    );
    save();
    return response(200, { offer });
  }

  async function withdraw(id, user) {
    const found = activeOffer(id, user, { senderOnly: true });
    if (found.error) return found.error;
    const { offer } = found;
    const currentTime = now();
    offer.status = 'withdrawn';
    offer.respondedAt = currentTime;
    offer.history.push({
      by: user.id,
      type: 'withdrawn',
      pay: offer.offeredPay,
      message: '',
      at: currentTime,
    });
    await notify(
      [offer.travelerId],
      { key: 'offer.withdrawn', params: { name: user.name } },
      null,
      'messages',
      'matching',
    );
    save();
    return response(200, { offer });
  }

  async function counter(id, user, body = {}) {
    const found = activeOffer(id, user);
    if (found.error) return found.error;
    const { offer } = found;
    const pay = positiveNumber(body.offeredPay);
    if (pay === null) {
      return response(400, { error: 'Montant proposé invalide' });
    }
    const message = String(body.message || '').trim().slice(0, 500);
    const currentTime = now();
    offer.offeredPay = pay;
    offer.message = message;
    offer.status =
      user.id === offer.travelerId
        ? 'countered_sender'
        : 'pending_traveler';
    offer.expiresAt = currentTime + 72 * 36e5;
    offer.history.push({
      by: user.id,
      type: 'counter',
      pay,
      message,
      at: currentTime,
    });
    await notify(
      [user.id === offer.senderId ? offer.travelerId : offer.senderId],
      { key: 'offer.countered', params: { name: user.name } },
      null,
      'messages',
      'matching',
    );
    save();
    return response(200, { offer });
  }

  return {
    center,
    list,
    create,
    decline,
    withdraw,
    counter,
    normalize,
    normalizeAll,
    normalizeAndSave,
  };
}
