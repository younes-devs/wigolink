export function createTransactionCommunicationService({
  db,
  isParty,
  messagesRepository,
  analyzeSafety,
  registerSafetyAttempt,
  safetyError,
  audit,
  save,
  notify,
  localizeCustoms,
  customs,
  combinedWhitelist,
  blacklist,
  localizeCategory,
  publicUser,
  findUser,
}) {
  function transactionFor(transactionId) {
    return db.transactions.find(
      (transaction) => transaction.id === transactionId,
    );
  }

  function canRead(transaction, user) {
    return isParty(transaction, user.id) || user.isAdmin;
  }

  async function messages(transactionId, user) {
    const transaction = transactionFor(transactionId);
    if (!transaction) {
      return {
        status: 404,
        body: { error: 'Transaction introuvable' },
      };
    }
    if (!canRead(transaction, user)) {
      return {
        status: 403,
        body: { error: 'Non autorise' },
      };
    }
    return {
      status: 200,
      body: {
        messages: await messagesRepository.listForTransaction(transactionId),
      },
    };
  }

  async function sendMessage(transactionId, user, body = {}) {
    const transaction = transactionFor(transactionId);
    if (!transaction) {
      return {
        status: 404,
        body: { error: 'Transaction introuvable' },
      };
    }
    if (!isParty(transaction, user.id)) {
      return {
        status: 403,
        body: { error: 'Non autorise' },
      };
    }

    const text = String(body.text || '').slice(0, 2000);
    const safety = analyzeSafety(text);
    if (safety.blocked) {
      const conversation = db.conversations.find(
        (candidate) =>
          candidate.operationId === transaction.id
          && candidate.participantIds.includes(user.id),
      );
      const attempt = registerSafetyAttempt({
        user,
        conversation,
        analysis: safety,
      });
      await audit(
        user.id,
        'message.safety_blocked',
        'transaction',
        transaction.id,
        {
          categories: safety.categories,
          severity: safety.severity,
          highCount: attempt.highCount,
        },
      );
      save();
      return {
        status: attempt.cooldownUntil ? 429 : 422,
        body: safetyError({
          analysis: safety,
          cooldownUntil: attempt.cooldownUntil,
        }),
      };
    }

    const message = await messagesRepository.append({
      txId: transaction.id,
      from: user.id,
      text,
      flagged: false,
    });
    await notify(
      [
        transaction.senderId,
        transaction.travelerId,
        transaction.recipientId,
      ].filter((userId) => userId !== user.id),
      { key: 'chat.message', params: { name: user.name } },
      transaction.id,
      'messages',
      'messages',
    );
    save();
    return {
      status: 200,
      body: {
        message,
        warningKey: null,
        warning: null,
      },
    };
  }

  function customsRecap(transactionId, user, lang) {
    const transaction = transactionFor(transactionId);
    if (!transaction) {
      return {
        status: 404,
        body: { error: 'Transaction introuvable' },
      };
    }
    if (!canRead(transaction, user)) {
      return {
        status: 403,
        body: { error: 'Non autorise' },
      };
    }
    const listing = db.listings.find(
      (candidate) => candidate.id === transaction.listingId,
    );
    if (!listing) {
      return {
        status: 404,
        body: { error: 'Annonce introuvable' },
      };
    }

    const localizedCustoms = localizeCustoms(customs, lang);
    const corridor = listing.from === 'Casablanca'
      ? localizedCustoms['MA-EU']
      : localizedCustoms['EU-MA'];
    const category = combinedWhitelist().find(
      (item) => item.id === listing.categoryId,
    ) || blacklist.find((item) => item.id === listing.categoryId);

    return {
      status: 200,
      body: {
        recap: {
          txId: transaction.id,
          product: listing.title,
          category: category
            ? localizeCategory(category, lang).label
            : listing.categoryLabel,
          description: listing.description,
          valueEur: listing.valueEur,
          weightKg: listing.weightKg,
          sender: publicUser(findUser(transaction.senderId)),
          traveler: publicUser(findUser(transaction.travelerId)),
          sealedAt: transaction.sealingVideo?.recordedAt || null,
          corridor,
        },
      },
    };
  }

  return {
    messages,
    sendMessage,
    customsRecap,
  };
}
