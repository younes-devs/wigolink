export function createMatchingOfferReminderJob({
  db,
  normalizeMatchingOffers,
  normalizeMatchingOffer,
  matchingOfferWaitingUser,
  notify,
  save,
  reminderMs,
  now = Date.now,
}) {
  return async function runMatchingOfferReminders({ persist = false } = {}) {
    let changed = normalizeMatchingOffers();
    const writes = [];
    const currentTime = now();

    for (const offer of db.matchingOffers || []) {
      normalizeMatchingOffer(offer);
      const listing = db.listings.find((item) => item.id === offer.listingId);
      const title = listing?.title || 'une proposition';
      offer.reminders = offer.reminders || {};

      if (['pending_traveler', 'countered_sender'].includes(offer.status)) {
        const waitingUserId = matchingOfferWaitingUser(offer);
        const expiresIn = (offer.expiresAt || 0) - currentTime;
        if (
          waitingUserId
          && expiresIn > 0
          && expiresIn <= reminderMs
          && !offer.reminders.expiresSoonAt
        ) {
          offer.reminders.expiresSoonAt = currentTime;
          writes.push(notify(
            [waitingUserId],
            { key: 'offer.expiring', params: { title } },
            null,
            'reminders',
            'matching',
          ));
          changed = true;
        }
      }

      if (offer.status === 'expired' && !offer.reminders.expiredAt) {
        offer.reminders.expiredAt = currentTime;
        writes.push(notify(
          [offer.senderId, offer.travelerId],
          { key: 'offer.expired', params: { title } },
          null,
          'reminders',
          'matching',
        ));
        changed = true;
      }
    }

    await Promise.all(writes);
    if (changed && persist) save();
    return changed;
  };
}
