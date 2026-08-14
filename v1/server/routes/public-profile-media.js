import { Router } from 'express';

export function createPublicProfileMediaRouter({ getPool, profileMedia }) {
  const router = Router();

  router.get('/public/profile-photos/:userId', async (req, res) => {
    const userId = String(req.params.userId || '').trim();
    if (!/^u-[a-z0-9-]+$/i.test(userId)) return res.sendStatus(404);

    try {
      const result = await getPool().query(
        `select member->>'photoUrl' as photo_url
         from public.wigolink_app_state state
         cross join lateral jsonb_array_elements(coalesce(state.state->'users', '[]'::jsonb)) member
         where state.id = 1 and member->>'id' = $1
         limit 1`,
        [userId],
      );
      const value = String(result.rows[0]?.photo_url || '').trim();

      if (value.startsWith('https://')) {
        res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
        return res.redirect(302, value);
      }
      if (value.startsWith('data:image/')) {
        const match = value.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
        if (match) {
          res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
          res.type(match[1]).send(Buffer.from(match[2], 'base64'));
          return undefined;
        }
      }

      const storageUrl = await profileMedia?.recoverPublicUrl({ userId });
      if (storageUrl) {
        res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
        return res.redirect(302, storageUrl);
      }
    } catch {
      // Public avatars are optional; a missing avatar should render initials.
    }
    return res.sendStatus(404);
  });

  return router;
}
