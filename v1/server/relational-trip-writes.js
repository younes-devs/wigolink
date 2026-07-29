export function relationalTripWritesEnabled(env = process.env) {
  return env.RELATIONAL_TRIP_WRITES === 'true';
}

export function relationalTripMutationsEnabled(env = process.env) {
  return env.RELATIONAL_TRIP_MUTATIONS === 'true';
}

export function createRelationalTripWriter({
  getPool,
  getTrip,
  newId = relationalId,
  today,
  canonicalizeLocation = (value) => ({
    id: null,
    countryCode: null,
    name: String(value || '').trim().slice(0, 60),
    latitude: null,
    longitude: null,
  }),
  auditChange = async () => {},
  now = Date.now,
  logger = console,
}) {
  async function create({ user, body = {} }) {
    if (user.kycStatus !== 'verified') {
      return response(403, {
        error: "Verification d'identite requise",
        needsKyc: true,
      });
    }
    const prepared = prepareTrip({
      body,
      canonicalizeLocation,
      now,
    });
    if (prepared.error) return prepared.error;
    const trip = {
      id: newId('t'),
      travelerId: user.id,
      ...prepared.value,
      status: 'published',
      createdAt: now(),
      updatedAt: now(),
    };
    try {
      await insertRecord(getPool(), 'wigofly_trips', trip);
      await bestEffort(() => auditChange({
        actorId: user.id,
        action: 'trip.create',
        targetType: 'trip',
        targetId: trip.id,
        subjectUserId: user.id,
        before: {},
        after: trip,
        fields: TRIP_AUDIT_FIELDS,
      }), logger);
      const view = await getTrip({
        pool: getPool(),
        user,
        id: trip.id,
        today: today(),
      });
      return view.status === 200 ? view : response(200, { trip });
    } catch (error) {
      logger.error('relational_trip_create_failed', {
        message: error?.message || 'unknown_error',
      });
      return unavailable('Creation');
    }
  }

  async function update({ user, tripId, body = {} }) {
    const pool = getPool();
    const client = await pool.connect();
    let before;
    let trip;
    try {
      await client.query('begin');
      trip = await lockedTrip(client, tripId);
      if (!trip || trip.travelerId !== user.id) {
        return await rollback(client, 404, { error: 'Trajet introuvable' });
      }
      if ((trip.status || 'published') !== 'published') {
        return await rollback(client, 400, { error: 'Trajet indisponible' });
      }
      if (await activeOperationCount(client, trip.id) > 0) {
        return await rollback(client, 400, {
          error: 'Impossible de modifier un trajet avec operation en cours',
        });
      }
      const prepared = prepareTrip({
        body,
        current: trip,
        canonicalizeLocation,
        now,
      });
      if (prepared.error) {
        await client.query('rollback');
        return prepared.error;
      }
      before = structuredClone(trip);
      Object.assign(trip, prepared.value, { updatedAt: now() });
      await updateRecord(client, 'wigofly_trips', trip);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_trip_update_failed', {
        tripId,
        message: error?.message || 'unknown_error',
      });
      return unavailable('Modification');
    } finally {
      client.release();
    }
    await bestEffort(() => auditChange({
      actorId: user.id,
      action: 'trip.update',
      targetType: 'trip',
      targetId: trip.id,
      subjectUserId: user.id,
      before,
      after: trip,
      fields: TRIP_AUDIT_FIELDS.filter((field) => field !== 'status'),
    }), logger);
    const view = await getTrip({
      pool,
      user,
      id: trip.id,
      today: today(),
    });
    return view.status === 200 ? view : response(200, { trip });
  }

  async function remove({ user, tripId }) {
    const pool = getPool();
    const client = await pool.connect();
    let before;
    let trip;
    try {
      await client.query('begin');
      trip = await lockedTrip(client, tripId);
      if (!trip || trip.travelerId !== user.id) {
        return await rollback(client, 404, { error: 'Trajet introuvable' });
      }
      if (await activeOperationCount(client, trip.id) > 0) {
        return await rollback(client, 400, {
          error: 'Impossible de retirer un trajet avec operation en cours',
        });
      }
      before = structuredClone(trip);
      trip.status = 'removed';
      trip.removedAt = now();
      trip.updatedAt = now();
      await updateRecord(client, 'wigofly_trips', trip);
      await client.query(
        `delete from public.wigofly_saved_trips
         where data->>'tripId' = $1`,
        [trip.id],
      );
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      logger.error('relational_trip_remove_failed', {
        tripId,
        message: error?.message || 'unknown_error',
      });
      return unavailable('Retrait');
    } finally {
      client.release();
    }
    await bestEffort(() => auditChange({
      actorId: user.id,
      action: 'trip.remove',
      targetType: 'trip',
      targetId: trip.id,
      subjectUserId: user.id,
      before,
      after: trip,
      fields: ['status'],
    }), logger);
    return response(200, { ok: true });
  }

  async function saveTrip({ user, tripId }) {
    const pool = getPool();
    try {
      const tripResult = await getTrip({
        pool,
        user,
        id: tripId,
        today: today(),
      });
      if (tripResult.status === 404) {
        const missing = tripResult.body.error === 'Trajet introuvable';
        return response(missing ? 404 : 400, {
          error: missing
            ? 'Trajet introuvable'
            : 'Trajet expire ou indisponible',
        });
      }
      if (tripResult.status !== 200) return tripResult;
      const saved = {
        id: newId('saved'),
        userId: user.id,
        tripId,
        createdAt: now(),
      };
      await pool.query(
        `insert into public.wigofly_saved_trips
           (id, data, created_at, updated_at)
         values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())
         on conflict do nothing`,
        [saved.id, JSON.stringify(saved), saved.createdAt],
      );
      return response(200, {
        trip: {
          ...tripResult.body.trip,
          saved: true,
        },
      });
    } catch (error) {
      logger.error('relational_saved_trip_write_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Enregistrement temporairement indisponible. Reessayez.',
      });
    }
  }

  async function unsaveTrip({ user, tripId }) {
    try {
      await getPool().query(
        `delete from public.wigofly_saved_trips
         where data->>'userId' = $1 and data->>'tripId' = $2`,
        [user.id, tripId],
      );
      return response(200, { ok: true });
    } catch (error) {
      logger.error('relational_saved_trip_delete_failed', {
        message: error?.message || 'unknown_error',
      });
      return response(503, {
        error: 'Suppression temporairement indisponible. Reessayez.',
      });
    }
  }

  return {
    create,
    update,
    remove,
    saveTrip,
    unsaveTrip,
  };
}

const TRIP_AUDIT_FIELDS = [
  'from',
  'to',
  'departureDate',
  'transportMode',
  'capacityKg',
  'price',
  'description',
  'conditions',
  'status',
];

function prepareTrip({
  body,
  current = {},
  canonicalizeLocation,
  now,
}) {
  const from = String(body.from ?? current.from ?? '').trim().slice(0, 60);
  const to = String(body.to ?? current.to ?? '').trim().slice(0, 60);
  const travelDate = body.date
    || body.departureDate
    || current.departureDate
    || current.date;
  if (!from || !to || !travelDate) {
    return { error: response(400, { error: 'Trajet, sens et date requis' }) };
  }
  const fromLocation = canonicalizeLocation(from, {
    locationId: body.from === undefined
      ? (body.fromLocationId ?? current.fromLocationId)
      : body.fromLocationId,
    countryCode: body.fromCountryCode || current.fromCountryCode || 'MA',
  });
  const toLocation = canonicalizeLocation(to, {
    locationId: body.to === undefined
      ? (body.toLocationId ?? current.toLocationId)
      : body.toLocationId,
    countryCode: body.toCountryCode || current.toCountryCode || 'MA',
  });
  if (
    (fromLocation.id && fromLocation.id === toLocation.id)
    || (
      !fromLocation.id
      && !toLocation.id
      && fromLocation.name === toLocation.name
    )
  ) {
    return { error: response(400, {
      error: 'Depart et arrivee identiques',
    }) };
  }
  const transportMode = body.transportMode
    ?? current.transportMode
    ?? 'plane';
  if (!['plane', 'car'].includes(transportMode)) {
    return { error: response(400, {
      error: 'Type de transport invalide',
    }) };
  }
  if (new Date(travelDate) < new Date(new Date(now()).toDateString())) {
    return { error: response(400, { error: 'La date est deja passee' }) };
  }
  const price = Number(body.price ?? current.price ?? 25);
  if (!Number.isFinite(price) || price <= 0) {
    return { error: response(400, { error: 'Prix invalide' }) };
  }
  return {
    value: {
      from: fromLocation.name,
      to: toLocation.name,
      fromLocationId: fromLocation.id,
      fromCountryCode: fromLocation.countryCode,
      fromCoordinates: fromLocation.id
        ? {
          latitude: fromLocation.latitude,
          longitude: fromLocation.longitude,
        }
        : null,
      toLocationId: toLocation.id,
      toCountryCode: toLocation.countryCode,
      toCoordinates: toLocation.id
        ? {
          latitude: toLocation.latitude,
          longitude: toLocation.longitude,
        }
        : null,
      date: travelDate,
      departureDate: travelDate,
      transportMode,
      price,
      currency: current.currency || 'EUR',
      description: String(
        body.description
        ?? current.description
        ?? 'Voyageur disponible pour transporter un colis propre et conforme.',
      ).trim().slice(0, 700)
        || 'Voyageur disponible pour transporter un colis propre et conforme.',
      conditions: String(
        body.conditions
        ?? current.conditions
        ?? 'Petit colis propre, ferme et conforme aux regles douanieres.',
      ).trim().slice(0, 500)
        || 'Petit colis propre, ferme et conforme aux regles douanieres.',
      capacityKg: Math.max(
        1,
        Math.min(30, Number(body.capacityKg ?? current.capacityKg) || 5),
      ),
    },
  };
}

async function lockedTrip(client, tripId) {
  const result = await client.query(
    `select data from public.wigofly_trips where id = $1 for update`,
    [tripId],
  );
  return result.rows[0]?.data || null;
}

async function activeOperationCount(client, tripId) {
  const result = await client.query(
    `select count(*)::int as count
     from public.wigofly_transactions
     where data->>'tripId' = $1
       and coalesce(data->>'status', '') not in (
         'released', 'refunded', 'cancelled'
       )`,
    [tripId],
  );
  return Number(result.rows[0]?.count || 0);
}

async function insertRecord(pool, table, value) {
  await pool.query(
    `insert into public.${table} (id, data, created_at, updated_at)
     values ($1, $2::jsonb, to_timestamp($3 / 1000.0), now())`,
    [value.id, JSON.stringify(value), value.createdAt],
  );
}

async function updateRecord(client, table, value) {
  await client.query(
    `update public.${table}
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [value.id, JSON.stringify(value)],
  );
}

async function rollback(client, status, body) {
  await client.query('rollback');
  return response(status, body);
}

async function bestEffort(task, logger) {
  try {
    await task();
  } catch (error) {
    logger.error('relational_trip_audit_failed', {
      message: error?.message || 'unknown_error',
    });
  }
}

function unavailable(action) {
  return response(503, {
    error: `${action} temporairement indisponible. Reessayez.`,
  });
}

function response(status, body) {
  return { status, body };
}
import { relationalId } from './relational-id.js';
