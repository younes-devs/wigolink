const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const RELATIONAL_TRIP_PATHS = new Set([
  '/api/trips',
  '/api/trips/mine',
  '/api/trips/overview',
]);
const RELATIONAL_TRIP_DETAIL_PATH = /^\/api\/trips\/[^/]+$/;
const RELATIONAL_SAVED_TRIP_PATH = /^\/api\/saved-trips(?:\/[^/]+)?$/;
const RELATIONAL_MESSAGE_PATH = /^\/api\/conversations(?:\/[^/]+(?:\/messages)?)?$/;
const RELATIONAL_MESSAGE_WRITE_PATH = /^\/api\/conversations\/[^/]+(?:\/messages(?:\/[^/]+)?|\/(?:read|unread|archive|pin|typing))?$/;
const RELATIONAL_MESSAGE_MEDIA_PATH = /^\/api\/conversations\/[^/]+\/messages\/[^/]+\/attachments\/[^/]+$/;
const RELATIONAL_OPERATION_WRITE_PATH = /^(?:\/api\/trips\/[^/]+\/accept|\/api\/operations\/[^/]+\/(?:pay|pickup-code|delivery-code|confirm-pickup|confirm-delivery|confirm|reject|cancel|dispute|evidence))$/;

export function isRelationalTripRead(req, relationalTripReadsEnabled) {
  return relationalTripReadsEnabled()
    && req.method === 'GET'
    && (
      RELATIONAL_TRIP_PATHS.has(req.path)
      || RELATIONAL_TRIP_DETAIL_PATH.test(req.path)
      || req.path === '/api/saved-trips'
    );
}

export function isRelationalMessageRead(req, relationalMessageReadsEnabled) {
  return relationalMessageReadsEnabled()
    && req.method === 'GET'
    && (
      RELATIONAL_MESSAGE_PATH.test(req.path)
      || RELATIONAL_MESSAGE_MEDIA_PATH.test(req.path)
    );
}

export function isRelationalMessageWrite(req, relationalMessageWritesEnabled) {
  return relationalMessageWritesEnabled()
    && ['POST', 'DELETE'].includes(req.method)
    && RELATIONAL_MESSAGE_WRITE_PATH.test(req.path);
}

export function isRelationalOperationRead(req, relationalOperationReadsEnabled) {
  return relationalOperationReadsEnabled()
    && req.method === 'GET'
    && /^\/api\/operations(?:\/[^/]+)?$/.test(req.path);
}

export function isRelationalTripWrite(req, relationalTripWritesEnabled) {
  return relationalTripWritesEnabled()
    && ['POST', 'DELETE'].includes(req.method)
    && RELATIONAL_SAVED_TRIP_PATH.test(req.path);
}

export function isRelationalTripMutation(req, relationalTripMutationsEnabled) {
  return relationalTripMutationsEnabled()
    && (
      (req.method === 'POST' && req.path === '/api/trips')
      || (
        ['PATCH', 'DELETE'].includes(req.method)
        && /^\/api\/trips\/[^/]+$/.test(req.path)
      )
    );
}

export function isRelationalOperationWrite(req, relationalOperationWritesEnabled) {
  return relationalOperationWritesEnabled()
    && req.method === 'POST'
    && RELATIONAL_OPERATION_WRITE_PATH.test(req.path);
}

export function isRelationalNavigationRead(req, relationalNavigationEnabled) {
  return relationalNavigationEnabled()
    && req.method === 'GET'
    && req.path === '/api/navigation-summary';
}

export function isRelationalPublicProfileRequest(
  req,
  relationalPublicProfileReadsEnabled,
  relationalOperationWritesEnabled,
) {
  if (
    req.method === 'GET'
    && relationalPublicProfileReadsEnabled()
    && /^\/api\/users\/[^/]+(?:\/reviews)?$/.test(req.path)
  ) {
    return true;
  }
  return req.method === 'POST'
    && relationalOperationWritesEnabled()
    && /^\/api\/transactions\/[^/]+\/rate$/.test(req.path);
}

export function createPersistenceState({
  db,
  usesDatabase,
  refreshDatabaseState,
  acquireDatabaseState,
  releaseDatabaseState,
  relationalTripReadsEnabled,
  relationalMessageReadsEnabled,
  relationalMessageWritesEnabled = () => false,
  relationalOperationReadsEnabled = () => false,
  relationalTripWritesEnabled = () => false,
  relationalTripMutationsEnabled = () => false,
  relationalOperationWritesEnabled = () => false,
  relationalNavigationEnabled = () => false,
  relationalPublicProfileReadsEnabled = () => false,
  snapshotRelationalTripState,
  syncRelationalTripState,
  logger = console,
}) {
  let stateQueue = Promise.resolve();

  return function persistenceState(req, res, next) {
    if (!usesDatabase()) return next();
    if (
      isRelationalTripRead(req, relationalTripReadsEnabled)
      || isRelationalMessageRead(req, relationalMessageReadsEnabled)
      || isRelationalMessageWrite(req, relationalMessageWritesEnabled)
      || isRelationalOperationRead(req, relationalOperationReadsEnabled)
      || isRelationalTripWrite(req, relationalTripWritesEnabled)
      || isRelationalTripMutation(req, relationalTripMutationsEnabled)
      || isRelationalOperationWrite(req, relationalOperationWritesEnabled)
      || isRelationalNavigationRead(req, relationalNavigationEnabled)
      || isRelationalPublicProfileRequest(
        req,
        relationalPublicProfileReadsEnabled,
        relationalOperationWritesEnabled,
      )
    ) {
      return next();
    }

    const write = !READ_METHODS.has(req.method);
    if (!write) {
      void refreshDatabaseState()
        .then(() => next())
        .catch((error) => {
          logger.error('Echec de lecture Supabase', error);
          res.status(503).json({ error: 'Base de donnees temporairement indisponible.' });
        });
      return undefined;
    }

    let releaseTurn;
    const previousTurn = stateQueue;
    stateQueue = new Promise((resolve) => {
      releaseTurn = resolve;
    });

    void (async () => {
      let lock = null;
      let relationalSnapshot = null;
      let settled = false;
      const settle = async ({ commit = false, deliver = null } = {}) => {
        if (settled) return;
        settled = true;
        try {
          if (commit && relationalSnapshot) {
            await syncRelationalTripState({
              pool: lock.client,
              before: relationalSnapshot,
              after: db,
            });
          }
          await releaseDatabaseState(lock, { commit });
          if (deliver) deliver();
        } catch (error) {
          logger.error('Echec de persistance Supabase', error);
          if (!res.headersSent) {
            res.statusCode = 503;
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({
              error: 'Sauvegarde temporairement indisponible. Reessayez.',
            }));
          }
        } finally {
          releaseTurn();
        }
      };

      try {
        await previousTurn;
        lock = await acquireDatabaseState({ write });
        if (relationalTripReadsEnabled() || relationalMessageReadsEnabled()) {
          relationalSnapshot = snapshotRelationalTripState(db);
        }

        const nativeJson = res.json.bind(res);
        const nativeSend = res.send.bind(res);
        res.json = (body) => {
          void settle({
            commit: write,
            deliver: () => {
              res.send = nativeSend;
              nativeJson(body);
            },
          });
          return res;
        };
        res.send = (body) => {
          void settle({
            commit: write,
            deliver: () => nativeSend(body),
          });
          return res;
        };
        res.once('close', () => {
          void settle();
        });
        next();
      } catch (error) {
        logger.error('Echec de lecture Supabase', error);
        await settle();
        if (!res.headersSent) {
          res.status(503).json({
            error: 'Base de donnees temporairement indisponible.',
          });
        }
      }
    })();

    return undefined;
  };
}
