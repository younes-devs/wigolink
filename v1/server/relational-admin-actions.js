const ADMIN_ROLE_LOCK = 'wigolink:admin-roles';

export function relationalAdminActionsEnabled(env = process.env) {
  return env.RELATIONAL_ADMIN_ACTIONS === 'true';
}

export function createRelationalAdminMemberMutations({ getPool }) {
  const pool = () => {
    const value = getPool();
    if (!value || typeof value.query !== 'function') {
      throw new Error('La base relationnelle est indisponible.');
    }
    return value;
  };

  return {
    async recordCaseAccess({ actorId, userId, section }) {
      const result = await pool().query(
        `insert into public.audit_logs
           (actor_id, action, target_type, target_id, meta)
         select $1, 'admin.member_case.view', 'user', member.id, $3::jsonb
         from public.wigolink_users member
         where member.id = $2
         returning id`,
        [
          String(actorId),
          String(userId),
          JSON.stringify({ section }),
        ],
      );
      return result.rowCount > 0;
    },

    async changeRole({ actorId, userId, becomesAdmin, at }) {
      return transaction(pool(), async (client) => {
        await client.query(
          'select pg_advisory_xact_lock(hashtext($1))',
          [ADMIN_ROLE_LOCK],
        );
        const target = await lockedUser(client, userId);
        if (!target || target.deletedAt) return { kind: 'not_found' };
        if (!!target.isAdmin === becomesAdmin) {
          return { kind: 'unchanged', user: target };
        }
        if (!becomesAdmin && target.isAdmin) {
          const active = await client.query(
            `select count(*)::int as count
             from public.wigolink_users
             where coalesce((data->>'isAdmin')::boolean, false)
               and nullif(data->>'deletedAt', '') is null`,
          );
          if (Number(active.rows[0]?.count || 0) <= 1) {
            return { kind: 'last_admin' };
          }
        }

        target.isAdmin = becomesAdmin;
        target.roleChangedAt = at;
        target.roleChangedBy = actorId;
        await updateUser(client, target);
        await appendAudit(client, {
          actorId,
          action: becomesAdmin ? 'role.admin.grant' : 'role.admin.revoke',
          targetId: target.id,
          meta: { email: target.email },
        });
        return { kind: 'ok', user: target };
      });
    },

    async moderateUser({
      actorId,
      userId,
      action,
      reason,
      durationHours,
      at,
    }) {
      return transaction(pool(), async (client) => {
        const target = await lockedUser(client, userId);
        if (!target || target.deletedAt) return { kind: 'not_found' };
        if (target.isAdmin) return { kind: 'admin_target' };

        if (action === 'suspend') {
          target.suspendedUntil = at + durationHours * 3600e3;
          target.suspensionReason = reason;
          target.suspendedAt = at;
          target.suspendedBy = actorId;
        } else if (action === 'restore') {
          target.suspendedUntil = null;
          target.suspensionReason = null;
          target.restoredAt = at;
          target.restoredBy = actorId;
        } else {
          target.lastSafetyWarningAt = at;
          target.lastSafetyWarningReason = reason;
        }

        await updateUser(client, target);
        await appendAudit(client, {
          actorId,
          action: `user.safety.${action}`,
          targetId: target.id,
          meta: {
            reason,
            durationHours: action === 'suspend' ? durationHours : null,
          },
        });
        return { kind: 'ok', user: target };
      });
    },

    async listTrips({ userId, limit, offset }) {
      const member = await pool().query(
        'select 1 from public.wigolink_users where id = $1',
        [String(userId)],
      );
      if (!member.rowCount) return { kind: 'not_found' };
      const [rows, total] = await Promise.all([
        pool().query(
          `select trip.data,
                  (select count(*)::int
                     from public.wigolink_transactions operation
                    where operation.data->>'tripId' = trip.id
                      and coalesce(operation.data->>'status', '') not in (
                        'delivery_confirmed','released','refunded','cancelled',
                        'completed','refused','rejected'
                      )) as active_operations
             from public.wigolink_trips trip
            where trip.data->>'travelerId' = $1
            order by trip.created_at desc, trip.id desc
            limit $2 offset $3`,
          [String(userId), limit, offset],
        ),
        pool().query(
          `select count(*)::int as count from public.wigolink_trips
            where data->>'travelerId' = $1`,
          [String(userId)],
        ),
      ]);
      const trips = rows.rows.map((row) => ({
        ...row.data,
        activeOperations: Number(row.active_operations || 0),
      }));
      const count = Number(total.rows[0]?.count || 0);
      return {
        kind: 'ok',
        page: {
          trips,
          page: {
            total: count,
            hasMore: offset + trips.length < count,
            nextCursor: offset + trips.length < count ? String(offset + trips.length) : null,
          },
        },
      };
    },

    async removeTrip({ actorId, userId, tripId, reason, at, today }) {
      return transaction(pool(), async (client) => {
        const result = await client.query(
          `select data from public.wigolink_trips
            where id = $1 and data->>'travelerId' = $2
            for update`,
          [String(tripId), String(userId)],
        );
        const trip = result.rows[0]?.data;
        if (!trip) return { kind: 'not_found' };
        if ((trip.status || 'published') !== 'published'
          || String(trip.departureDate || trip.date || '') < today) {
          return { kind: 'not_removable' };
        }
        const active = await client.query(
          `select 1 from public.wigolink_transactions
            where data->>'tripId' = $1
              and coalesce(data->>'status', '') not in (
                'delivery_confirmed','released','refunded','cancelled',
                'completed','refused','rejected'
              ) limit 1`,
          [String(tripId)],
        );
        if (active.rowCount) return { kind: 'active_operation' };
        const previousStatus = trip.status || 'published';
        trip.status = 'removed';
        trip.removedAt = at;
        trip.removedBy = actorId;
        trip.removalReason = reason;
        await client.query(
          `update public.wigolink_trips
              set data = $2::jsonb, updated_at = now()
            where id = $1`,
          [String(tripId), JSON.stringify(trip)],
        );
        await client.query(
          `delete from public.wigolink_saved_trips
            where data->>'tripId' = $1`,
          [String(tripId)],
        );
        await client.query(
          `insert into public.audit_logs
             (actor_id, action, target_type, target_id, meta)
           values ($1, 'trip.admin_remove', 'trip', $2, $3::jsonb)`,
          [String(actorId), String(tripId), JSON.stringify({
            subjectUserId: userId,
            reason,
            changes: [{ field: 'status', before: previousStatus, after: 'removed' }],
          })],
        );
        return { kind: 'ok', trip };
      });
    },

    async removeWhitelist({ actorId, categoryId }) {
      return transaction(pool(), async (client) => {
        const result = await client.query(
          `delete from public.wigolink_custom_whitelist
           where id = $1
           returning data`,
          [String(categoryId)],
        );
        const removed = result.rows[0]?.data;
        if (!removed) return null;
        await client.query(
          `insert into public.audit_logs
             (actor_id, action, target_type, target_id, meta)
           values ($1, 'custom_whitelist.remove', 'custom_whitelist', $2, $3::jsonb)`,
          [
            String(actorId),
            String(removed.id),
            JSON.stringify({ label: removed.label }),
          ],
        );
        return removed;
      });
    },
  };
}

async function transaction(pool, operation) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const result = await operation(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function lockedUser(client, userId) {
  const result = await client.query(
    `select data
     from public.wigolink_users
     where id = $1
     for update`,
    [String(userId)],
  );
  return result.rows[0]?.data || null;
}

async function updateUser(client, user) {
  const result = await client.query(
    `update public.wigolink_users
     set data = $2::jsonb, updated_at = now()
     where id = $1`,
    [String(user.id), JSON.stringify(user)],
  );
  if (!result.rowCount) throw new Error('Utilisateur introuvable.');
}

async function appendAudit(client, {
  actorId,
  action,
  targetId,
  meta,
}) {
  await client.query(
    `insert into public.audit_logs
       (actor_id, action, target_type, target_id, meta)
     values ($1, $2, 'user', $3, $4::jsonb)`,
    [
      String(actorId),
      action,
      String(targetId),
      JSON.stringify(meta || {}),
    ],
  );
}
