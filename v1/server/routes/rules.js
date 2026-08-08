import { Router } from 'express';

export function createRulesRouter({
  getWhitelist,
  blacklist,
  customs,
  localizeCategory,
  localizeCustoms,
}) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const whitelist = await getWhitelist();
      res.set(
        'Cache-Control',
        'public, s-maxage=60, stale-while-revalidate=300',
      );
      res.vary('Accept-Language');
      res.json({
        whitelist: whitelist.map((category) => (
          localizeCategory(category, req.lang)
        )),
        blacklist: blacklist.map((category) => (
          localizeCategory(category, req.lang)
        )),
        customs: localizeCustoms(customs, req.lang),
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
