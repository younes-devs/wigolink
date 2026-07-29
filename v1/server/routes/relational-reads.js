import { Router } from 'express';

export function createRelationalReadsRouter({
  auth,
  tripReadsEnabled,
  messageReadsEnabled,
  getPool,
  listTrips,
  getTrip,
  listSavedTrips,
  listConversations,
  getConversation,
  operationReadsEnabled = () => false,
  listOperations,
  getOperation,
  operationCodePublicState,
  disputeView,
  today,
  logger = console,
}) {
  const router = Router();

  router.get('/trips/mine', auth, async (req, res, next) => {
    if (!tripReadsEnabled()) return next('route');
    try {
      return res.json(await listTrips({
        pool: getPool(),
        user: req.user,
        query: req.query,
        mine: true,
        today: today(),
      }));
    } catch (error) {
      logger.error('Echec de lecture de mes trajets', error);
      return res.status(503).json({
        error: 'Mes trajets sont temporairement indisponibles. Reessayez.',
      });
    }
  });

  router.get('/trips', auth, async (req, res, next) => {
    if (!tripReadsEnabled()) return next('route');
    try {
      return res.json(await listTrips({
        pool: getPool(),
        user: req.user,
        query: req.query,
        today: today(),
      }));
    } catch (error) {
      logger.error('Echec de recherche relationnelle des trajets', error);
      return res.status(503).json({
        error: 'Recherche temporairement indisponible. Reessayez.',
      });
    }
  });

  router.get('/trips/overview', auth, async (req, res, next) => {
    if (!tripReadsEnabled()) return next('route');
    try {
      const pool = getPool();
      const [feed, mine] = await Promise.all([
        listTrips({
          pool,
          user: req.user,
          query: { ...req.query, excludeMine: '1' },
          today: today(),
        }),
        listTrips({
          pool,
          user: req.user,
          query: req.query,
          mine: true,
          today: today(),
        }),
      ]);
      return res.json({
        trips: feed.trips,
        myTrips: mine.trips,
      });
    } catch (error) {
      logger.error('Echec de chargement de l apercu des trajets', error);
      return res.status(503).json({
        error: 'Les trajets sont temporairement indisponibles. Reessayez.',
      });
    }
  });

  router.get('/trips/:id', auth, async (req, res, next) => {
    if (!tripReadsEnabled()) return next('route');
    try {
      const result = await getTrip({
        pool: getPool(),
        user: req.user,
        id: req.params.id,
        today: today(),
      });
      return res.status(result.status).json(result.body);
    } catch (error) {
      logger.error('Echec de lecture relationnelle d un trajet', error);
      return res.status(503).json({
        error: 'Trajet temporairement indisponible. Reessayez.',
      });
    }
  });

  router.get('/saved-trips', auth, async (req, res, next) => {
    if (!tripReadsEnabled()) return next('route');
    try {
      return res.json(await listSavedTrips({
        pool: getPool(),
        user: req.user,
        today: today(),
        query: req.query,
      }));
    } catch (error) {
      logger.error('Echec de lecture relationnelle des favoris', error);
      return res.status(503).json({
        error: 'Trajets enregistres temporairement indisponibles. Reessayez.',
      });
    }
  });

  router.get('/conversations', auth, async (req, res, next) => {
    if (!messageReadsEnabled()) return next('route');
    try {
      return res.json(await listConversations({
        pool: getPool(),
        user: req.user,
        query: req.query,
        today: today(),
      }));
    } catch (error) {
      logger.error('Echec de lecture relationnelle des conversations', error);
      return res.status(503).json({
        error: 'Messagerie temporairement indisponible. Reessayez.',
      });
    }
  });

  router.get('/conversations/:id', auth, async (req, res, next) => {
    if (!messageReadsEnabled()) return next('route');
    try {
      const data = await getConversation({
        pool: getPool(),
        user: req.user,
        id: req.params.id,
        today: today(),
      });
      if (!data) {
        return res.status(404).json({
          error: 'Conversation introuvable',
        });
      }
      return res.json(data);
    } catch (error) {
      logger.error('Echec de lecture relationnelle de conversation', error);
      return res.status(503).json({
        error: 'Conversation temporairement indisponible. Reessayez.',
      });
    }
  });

  router.get('/conversations/:id/messages', auth, async (req, res, next) => {
    if (!messageReadsEnabled()) return next('route');
    try {
      const data = await getConversation({
        pool: getPool(),
        user: req.user,
        id: req.params.id,
        query: req.query,
        today: today(),
        includeMessages: true,
      });
      if (!data) {
        return res.status(404).json({
          error: 'Conversation introuvable',
        });
      }
      return res.json(data);
    } catch (error) {
      logger.error('Echec de lecture relationnelle des messages', error);
      return res.status(503).json({
        error: 'Messages temporairement indisponibles. Reessayez.',
      });
    }
  });

  router.get('/operations', auth, async (req, res, next) => {
    if (!operationReadsEnabled()) return next('route');
    try {
      return res.json(await listOperations({
        pool: getPool(),
        user: req.user,
        query: req.query,
        operationCodePublicState,
        disputeView,
      }));
    } catch (error) {
      logger.error('Echec de lecture relationnelle des operations', error);
      return res.status(503).json({
        error: 'Operations temporairement indisponibles. Reessayez.',
      });
    }
  });

  router.get('/operations/:id', auth, async (req, res, next) => {
    if (!operationReadsEnabled()) return next('route');
    try {
      const result = await getOperation({
        pool: getPool(),
        user: req.user,
        id: req.params.id,
        operationCodePublicState,
        disputeView,
      });
      return res.status(result.status).json(result.body);
    } catch (error) {
      logger.error('Echec de lecture relationnelle d une operation', error);
      return res.status(503).json({
        error: 'Operation temporairement indisponible. Reessayez.',
      });
    }
  });

  return router;
}
