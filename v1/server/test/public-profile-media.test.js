import assert from 'node:assert/strict';
import test from 'node:test';
import { createPublicProfileMediaRouter } from '../routes/public-profile-media.js';

test('le fallback public sert un avatar legacy sans authentification', async () => {
  const router = createPublicProfileMediaRouter({
    getPool: () => ({
      async query() {
        return { rows: [{ photo_url: 'data:image/png;base64,YQ==' }] };
      },
    }),
    profileMedia: { async recoverPublicUrl() { return null; } },
  });
  const layer = router.stack.find((item) => item.route?.path === '/public/profile-photos/:userId');
  const response = { headers: {}, statusCode: 200, body: null, set(k, v) { this.headers[k] = v; }, type() { return this; }, send(value) { this.body = value; }, sendStatus(code) { this.statusCode = code; }, redirect(code, value) { this.statusCode = code; this.body = value; } };
  await layer.route.stack[0].handle({ params: { userId: 'u-102' } }, response);
  assert.equal(response.body.toString(), 'a');
});
