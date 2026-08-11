import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('le theme clair reste le defaut sans preference utilisateur', async () => {
  const html = await readFile(new URL('../../client/index.html', import.meta.url), 'utf8');

  assert.match(html, /if \(t !== 'light' && t !== 'dark'\) \{\s*t = 'light';/);
  assert.doesNotMatch(html, /prefers-color-scheme/);
});
