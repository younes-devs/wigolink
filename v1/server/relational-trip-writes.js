export function relationalTripWritesEnabled(env = process.env) {
  return env.RELATIONAL_TRIP_WRITES === 'true';
}

export function createRelationalTripWriter({
  getPool,
  getTrip,
  newId = relationalId,
  today,
  now = Date.now,
  logger = console,
}) {
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

  return { saveTrip, unsaveTrip };
}

function response(status, body) {
  return { status, body };
}
import { relationalId } from './relational-id.js';
