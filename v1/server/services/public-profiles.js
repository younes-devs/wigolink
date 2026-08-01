export function createPublicProfileService({
  db,
  findUser,
  publicUser,
  normalizeTransportMode,
  detectLeak,
  addEvent,
  save,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function participantIds(transaction) {
    return new Set([
      transaction.senderId,
      transaction.travelerId,
      transaction.recipientId,
    ].filter(Boolean));
  }

  function rate(transactionId, user, body = {}) {
    const transaction = db.transactions.find(
      (candidate) => candidate.id === transactionId,
    );
    if (!transaction || transaction.status !== 'released') {
      return response(400, {
        error: 'Notation après livraison uniquement',
      });
    }

    const participants = participantIds(transaction);
    if (!participants.has(user.id)) {
      return response(403, { error: 'Non autorisé' });
    }

    const targetId = String(body.targetId || '');
    const target = findUser(targetId);
    if (
      !target
      || !participants.has(targetId)
      || targetId === user.id
    ) {
      return response(400, { error: 'Cible invalide' });
    }

    const stars = Number(body.stars);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return response(400, { error: 'Note invalide (1 à 5)' });
    }

    transaction.ratings = transaction.ratings || [];
    if (
      transaction.ratings.some(
        (rating) =>
          rating.by === user.id && rating.target === targetId,
      )
    ) {
      return response(400, { error: 'Déjà noté' });
    }

    const comment = String(body.comment || '').trim().slice(0, 400);
    if (comment && detectLeak(comment)) {
      return response(400, {
        error:
          "L'avis ne peut pas contenir de coordonnées de contact "
          + '(téléphone, email, WhatsApp…)',
      });
    }

    transaction.ratings.push({
      by: user.id,
      target: targetId,
      stars,
      comment: comment || null,
      at: now(),
    });
    const ratingCount = Number(target.ratingCount) || 0;
    const previousTotal = (Number(target.rating) || 0) * ratingCount;
    target.ratingCount = ratingCount + 1;
    target.rating = Math.round(
      ((previousTotal + stars) / target.ratingCount) * 10,
    ) / 10;
    addEvent(transaction, 'rated', user.id, {
      target: targetId,
      stars,
    });
    save();
    return response(200, { ok: true });
  }

  function reviews(userId) {
    const target = findUser(userId);
    if (!target) {
      return response(404, { error: 'Introuvable' });
    }

    const received = [];
    for (const transaction of db.transactions) {
      for (const rating of transaction.ratings || []) {
        if (rating.target !== userId) continue;
        const author = findUser(rating.by);
        received.push({
          stars: rating.stars,
          comment: rating.comment || null,
          at: rating.at,
          authorName: author?.name || 'Membre Wigolink',
        });
      }
    }
    received.sort((a, b) => b.at - a.at);
    return response(200, {
      reviews: received,
      rating: target.rating,
      ratingCount: target.ratingCount,
    });
  }

  function profile(userId) {
    const target = findUser(userId);
    if (!target) {
      return response(404, { error: 'Introuvable' });
    }

    const trips = db.trips
      .filter(
        (trip) =>
          trip.travelerId === target.id
          && (trip.status || 'published') === 'published',
      )
      .sort(
        (a, b) =>
          String(a.departureDate || a.date).localeCompare(
            String(b.departureDate || b.date),
          ),
      )
      .slice(0, 4)
      .map((trip) => ({
        id: trip.id,
        from: trip.from,
        to: trip.to,
        departureDate: trip.departureDate || trip.date,
        transportMode: normalizeTransportMode(trip.transportMode),
        price: trip.price,
        currency: trip.currency || 'EUR',
        capacityKg: trip.capacityKg,
      }));

    return response(200, {
      user: publicUser(target),
      trips,
      stats: {
        completed: target.completed || 0,
        rating: target.rating,
        ratingCount: target.ratingCount || 0,
        cancelRate: target.cancelRate || 0,
      },
    });
  }

  return {
    rate,
    reviews,
    profile,
  };
}
