export function createListingService({
  db,
  matchesTrip,
  listingView,
  publicUser,
  findUser,
  validPhotos,
  positiveNumber,
  slugify,
  evaluateCategory,
  combinedWhitelist,
  localizeCategory,
  localizeCustoms,
  customs,
  reviewQueue,
  auditChange,
  save,
  newId,
  now = Date.now,
}) {
  function response(status, body) {
    return { status, body };
  }

  function list(user, query = {}, lang = 'fr') {
    let open = db.listings.filter(
      (listing) =>
        listing.status === 'published'
        && listing.senderId !== user.id,
    );

    const {
      category,
      minPrice,
      maxPrice,
      q,
    } = query;
    if (category) {
      open = open.filter((listing) => listing.categoryId === category);
    }
    if (minPrice) {
      open = open.filter(
        (listing) => listing.travelerPay >= Number(minPrice),
      );
    }
    if (maxPrice) {
      open = open.filter(
        (listing) => listing.travelerPay <= Number(maxPrice),
      );
    }
    if (q) {
      const needle = String(q).toLowerCase();
      open = open.filter((listing) =>
        `${listing.title} ${listing.description || ''} ${listing.categoryLabel || ''}`
          .toLowerCase()
          .includes(needle)
      );
    }

    const today = new Date(now()).toISOString().slice(0, 10);
    const myTrips = db.trips.filter((trip) =>
      trip.travelerId === user.id
      && (trip.status || 'published') === 'published'
      && trip.date >= today
    );
    const showAll = query.all === '1' || myTrips.length === 0;
    const listings = (
      showAll
        ? open
        : open.filter((listing) =>
          myTrips.some((trip) => matchesTrip(listing, trip))
        )
    ).map((listing) => ({
      ...listingView(listing, lang),
      sender: publicUser(findUser(listing.senderId)),
      matched: myTrips.some((trip) => matchesTrip(listing, trip)),
    }));

    return {
      listings,
      filteredByTrip: !showAll,
      tripCount: myTrips.length,
      totalOpen: open.length,
    };
  }

  function mine(user, lang = 'fr') {
    return {
      listings: db.listings
        .filter((listing) => listing.senderId === user.id)
        .map((listing) => listingView(listing, lang)),
    };
  }

  function preflight(user, body = {}, lang = 'fr') {
    const {
      title,
      categoryId: rawCategoryId,
      categoryLabel: rawCategoryLabel,
      weightKg,
      valueEur,
      from,
      to,
      dateFrom,
      dateTo,
      travelerPay,
      customsAccepted,
      recipientPhone,
      photos,
    } = body;
    const checks = [];
    const warnings = [];
    const blockers = [];
    const addCheck = (
      id,
      ok,
      label,
      severity = 'blocker',
      detail = null,
      {
        labelKey = `preflight.check.${id}`,
        labelVars = null,
        detailKey = null,
        detailVars = null,
      } = {},
    ) => {
      checks.push({
        id,
        ok,
        label,
        labelKey,
        labelVars,
        severity,
        detail,
        detailKey,
        detailVars,
      });
      if (!ok && severity === 'blocker') blockers.push(id);
      if (!ok && severity === 'warning') warnings.push(id);
    };

    addCheck('kyc', user.kycStatus === 'verified', 'Identité vérifiée');
    addCheck(
      'required',
      !!title && !!rawCategoryId && !!valueEur && !!from && !!to,
      'Informations essentielles complètes',
    );
    addCheck(
      'photos',
      !!photos?.length && photos.length <= 3 && validPhotos(photos),
      'Photos produit exploitables',
    );
    addCheck(
      'customs',
      !!customsAccepted,
      'Responsabilités douanières acceptées',
    );

    const valueNum = positiveNumber(valueEur);
    const weightNum = positiveNumber(weightKg);
    const payNum = positiveNumber(travelerPay);
    addCheck('value', valueNum !== null, 'Valeur déclarée valide');
    addCheck('weight', weightNum !== null, 'Poids valide');
    addCheck('pay', payNum !== null, 'Rémunération voyageur valide');
    addCheck(
      'limit',
      valueNum !== null && valueNum <= user.maxValue,
      `Plafond compte : ${user.maxValue} €`,
      'blocker',
      null,
      { labelVars: { max: user.maxValue } },
    );
    addCheck(
      'route',
      !!from && !!to && from !== to,
      'Trajet cohérent',
    );
    addCheck(
      'dates',
      !!dateFrom && !!dateTo && dateFrom <= dateTo,
      'Fenêtre de dates cohérente',
    );

    const categoryId =
      rawCategoryId === 'autre' && rawCategoryLabel
        ? slugify(rawCategoryLabel)
        : rawCategoryId;
    const evaluation = categoryId
      ? evaluateCategory(categoryId)
      : { verdict: 'gray' };
    const category = combinedWhitelist().find(
      (candidate) => candidate.id === categoryId,
    );
    const localizedCategory = category
      ? localizeCategory(category, lang)
      : null;
    const localizedEvaluation = evaluation.category
      ? localizeCategory(evaluation.category, lang)
      : null;
    addCheck(
      'category',
      evaluation.verdict !== 'blacklisted',
      'Catégorie autorisée',
      evaluation.verdict === 'blacklisted' ? 'blocker' : 'warning',
      localizedEvaluation?.reason || null,
    );
    if (evaluation.verdict === 'gray') {
      addCheck(
        'review',
        false,
        'Revue humaine nécessaire',
        'warning',
        'Publication après validation admin.',
        {
          labelKey: 'preflight.check.review.required',
          detailKey: 'preflight.check.review.required.detail',
        },
      );
    } else {
      addCheck(
        'review',
        true,
        'Publication directe possible',
        'warning',
        null,
        { labelKey: 'preflight.check.review.direct' },
      );
    }

    const localizedCustoms = localizeCustoms(customs, lang);
    const corridor =
      from === 'Casablanca'
        ? localizedCustoms['MA-EU']
        : localizedCustoms['EU-MA'];
    const customsLimit = from === 'Casablanca' ? 430 : 185;
    if (valueNum !== null && valueNum > customsLimit) {
      addCheck(
        'customs-value',
        false,
        `Valeur au-dessus de la franchise indicative (${customsLimit} €)`,
        'warning',
        null,
        {
          labelKey: 'preflight.check.customsValue.over',
          labelVars: { limit: customsLimit },
        },
      );
    } else {
      addCheck(
        'customs-value',
        true,
        'Valeur dans la franchise indicative',
        'warning',
        null,
        { labelKey: 'preflight.check.customsValue.within' },
      );
    }

    const recipient = recipientPhone
      ? db.users.find((candidate) => candidate.phone === recipientPhone)
      : null;
    if (recipientPhone && !recipient) {
      addCheck(
        'recipient',
        false,
        'Destinataire non reconnu dans Wigofly',
        'warning',
        null,
        { labelKey: 'preflight.check.recipient.unknown' },
      );
    } else {
      addCheck(
        'recipient',
        true,
        recipient ? 'Destinataire reconnu' : 'Destinataire optionnel',
        'warning',
        null,
        {
          labelKey: recipient
            ? 'preflight.check.recipient.known'
            : 'preflight.check.recipient.optional',
        },
      );
    }

    const publishStatus =
      blockers.length > 0
        ? 'blocked'
        : evaluation.verdict === 'gray'
          ? 'pending_review'
          : 'published';
    return {
      status: publishStatus,
      canSubmit: blockers.length === 0,
      blockers,
      warnings,
      checks,
      category: {
        id: categoryId,
        label:
          localizedCategory?.label
          || rawCategoryLabel
          || categoryId
          || '',
        verdict: evaluation.verdict,
        maxQty: localizedCategory?.maxQty || null,
        reason: localizedEvaluation?.reason || null,
      },
      customs: {
        corridor,
        franchiseLimitEur: customsLimit,
        valueEur: valueNum,
        overFranchise:
          valueNum !== null ? valueNum > customsLimit : false,
      },
      costs:
        payNum === null
          ? null
          : {
            travelerPay: payNum,
            commission: Math.round(payNum * 0.18 * 100) / 100,
            total: Math.round(payNum * 1.18 * 100) / 100,
          },
    };
  }

  async function create(user, body = {}, lang = 'fr') {
    if (user.kycStatus !== 'verified') {
      return response(403, {
        error: "Vérification d'identité requise",
        needsKyc: true,
      });
    }
    const {
      title,
      categoryId: rawCategoryId,
      categoryLabel: rawCategoryLabel,
      description,
      weightKg,
      valueEur,
      from,
      to,
      dateFrom,
      dateTo,
      travelerPay,
      customsAccepted,
      recipientPhone,
      photos,
    } = body;
    if (!title || !rawCategoryId || !valueEur || !from || !to) {
      return response(400, { error: 'Champs obligatoires manquants' });
    }
    if (!photos || photos.length === 0) {
      return response(400, {
        error: 'Au moins une photo du produit est obligatoire',
      });
    }
    if (!validPhotos(photos) || photos.length > 3) {
      return response(400, {
        error: 'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)',
      });
    }
    if (!customsAccepted) {
      return response(400, {
        error: 'Acceptation explicite des règles douanières requise',
      });
    }

    const valueNum = positiveNumber(valueEur);
    const weightNum = positiveNumber(weightKg);
    const payNum = positiveNumber(travelerPay);
    if (valueNum === null) {
      return response(400, { error: 'Valeur déclarée invalide' });
    }
    if (weightNum === null) {
      return response(400, { error: 'Poids invalide' });
    }
    if (payNum === null) {
      return response(400, {
        error: 'Rémunération voyageur invalide',
      });
    }
    if (valueNum > user.maxValue) {
      return response(400, {
        error: `Plafond dépassé : votre compte est limité à ${user.maxValue} € par envoi`,
      });
    }

    const categoryId =
      rawCategoryId === 'autre' && rawCategoryLabel
        ? slugify(rawCategoryLabel)
        : rawCategoryId;
    const evaluation = evaluateCategory(categoryId);
    if (evaluation.verdict === 'blacklisted') {
      return response(400, {
        error: `Catégorie refusée : ${evaluation.category.reason}`,
        verdict: 'blacklisted',
      });
    }

    const category = combinedWhitelist().find(
      (candidate) => candidate.id === categoryId,
    );
    const recipient = recipientPhone
      ? db.users.find((candidate) => candidate.phone === recipientPhone)
      : null;
    const createdAt = now();
    const listing = {
      id: newId('l'),
      senderId: user.id,
      title,
      categoryId,
      categoryLabel:
        category ? category.label : rawCategoryLabel || categoryId,
      icon: category ? category.icon : '📦',
      description,
      photos: photos || [],
      weightKg: weightNum,
      valueEur: valueNum,
      from,
      to,
      dateFrom,
      dateTo,
      travelerPay: payNum,
      commissionRate: 0.18,
      status:
        evaluation.verdict === 'gray'
          ? 'pending_review'
          : 'published',
      whitelistVerdict: evaluation.verdict,
      recipientId: recipient?.id || null,
      createdAt,
    };
    db.listings.push(listing);
    if (evaluation.verdict === 'gray') {
      reviewQueue.append({ type: 'listing', refId: listing.id });
    }
    await auditChange({
      actorId: user.id,
      action: 'listing.create',
      targetType: 'listing',
      targetId: listing.id,
      subjectUserId: user.id,
      before: {},
      after: listing,
      fields: [
        'title',
        'categoryLabel',
        'from',
        'to',
        'weightKg',
        'valueEur',
        'dateFrom',
        'dateTo',
        'travelerPay',
        'status',
      ],
      meta: { photoCount: listing.photos.length },
    });
    save();
    return response(200, { listing: listingView(listing, lang) });
  }

  async function update(id, user, body = {}, lang = 'fr') {
    const listing = db.listings.find((candidate) => candidate.id === id);
    if (!listing) {
      return response(404, { error: 'Annonce introuvable' });
    }
    if (listing.senderId !== user.id) {
      return response(403, { error: 'Non autorisé' });
    }
    if (!['published', 'pending_review'].includes(listing.status)) {
      return response(400, {
        error: 'Cette annonce ne peut plus être modifiée (déjà acceptée)',
      });
    }

    const before = { ...listing };
    const draft = { ...listing };
    const {
      title,
      description,
      weightKg,
      valueEur,
      dateFrom,
      dateTo,
      travelerPay,
      photos,
    } = body;
    if (title !== undefined) {
      draft.title = String(title).trim().slice(0, 120);
    }
    if (description !== undefined) {
      draft.description = String(description).trim().slice(0, 1000);
    }
    if (weightKg !== undefined) {
      const parsed = positiveNumber(weightKg);
      if (parsed === null) {
        return response(400, { error: 'Poids invalide' });
      }
      draft.weightKg = parsed;
    }
    if (valueEur !== undefined) {
      const parsed = positiveNumber(valueEur);
      if (parsed === null) {
        return response(400, { error: 'Valeur déclarée invalide' });
      }
      if (parsed > user.maxValue) {
        return response(400, {
          error: `Plafond dépassé : votre compte est limité à ${user.maxValue} € par envoi`,
        });
      }
      draft.valueEur = parsed;
    }
    if (dateFrom !== undefined) draft.dateFrom = dateFrom;
    if (dateTo !== undefined) draft.dateTo = dateTo;
    if (travelerPay !== undefined) {
      const parsed = positiveNumber(travelerPay);
      if (parsed === null) {
        return response(400, {
          error: 'Rémunération voyageur invalide',
        });
      }
      draft.travelerPay = parsed;
    }
    if (photos !== undefined) {
      if (photos.length === 0) {
        return response(400, {
          error: 'Au moins une photo est obligatoire',
        });
      }
      if (!validPhotos(photos) || photos.length > 3) {
        return response(400, {
          error: 'Photos invalides (JPEG/PNG/WebP, 3 max, 500 Ko chacune)',
        });
      }
      draft.photos = photos;
    }

    Object.assign(listing, draft);
    await auditChange({
      actorId: user.id,
      action: 'listing.update',
      targetType: 'listing',
      targetId: listing.id,
      subjectUserId: user.id,
      before,
      after: listing,
      fields: [
        'title',
        'description',
        'weightKg',
        'valueEur',
        'dateFrom',
        'dateTo',
        'travelerPay',
      ],
      meta: { photosChanged: photos !== undefined },
    });
    save();
    return response(200, { listing: listingView(listing, lang) });
  }

  async function cancel(id, user, lang = 'fr') {
    const listing = db.listings.find((candidate) => candidate.id === id);
    if (!listing) {
      return response(404, { error: 'Annonce introuvable' });
    }
    if (listing.senderId !== user.id) {
      return response(403, { error: 'Non autorisé' });
    }
    if (!['published', 'pending_review'].includes(listing.status)) {
      return response(400, {
        error: 'Cette annonce ne peut plus être retirée (déjà acceptée)',
      });
    }

    const before = { ...listing };
    listing.status = 'cancelled';
    await auditChange({
      actorId: user.id,
      action: 'listing.cancel',
      targetType: 'listing',
      targetId: listing.id,
      subjectUserId: user.id,
      before,
      after: listing,
      fields: ['status'],
    });
    save();
    return response(200, { listing: listingView(listing, lang) });
  }

  return {
    list,
    mine,
    preflight,
    create,
    update,
    cancel,
  };
}
