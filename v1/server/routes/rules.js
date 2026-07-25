import { Router } from 'express';

export function createRulesRouter({
  getWhitelist,
  blacklist,
  customs,
  localizeCategory,
  localizeCustoms,
}) {
  const router = Router();

  router.get('/', (req, res) => {
    res.json({
      whitelist: getWhitelist().map((category) => (
        localizeCategory(category, req.lang)
      )),
      blacklist: blacklist.map((category) => (
        localizeCategory(category, req.lang)
      )),
      customs: localizeCustoms(customs, req.lang),
    });
  });

  return router;
}
