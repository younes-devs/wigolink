import assert from 'node:assert/strict';
import test from 'node:test';
import localeEntry from '../../api/locale-entry.js';

function requestRoot(headers = {}) {
  const response = {
    headers: {},
    setHeader(name, value) { this.headers[name] = value; },
    end() { this.ended = true; },
  };
  localeEntry({ headers }, response);
  return response;
}

test('locale entry redirige selon Accept-Language sans cache partage', () => {
  const response = requestRoot({ 'accept-language': 'es-ES,fr;q=0.8' });
  assert.equal(response.statusCode, 307);
  assert.equal(response.headers.Location, '/es');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  assert.equal(response.headers.Vary, 'Cookie, Accept-Language');
  assert.equal(response.ended, true);
});

test('locale entry prefere le cookie et retombe sur le francais', () => {
  assert.equal(requestRoot({ cookie: 'wigolink_lang=ar', 'accept-language': 'en' }).headers.Location, '/ar');
  assert.equal(requestRoot({ 'accept-language': 'de-DE' }).headers.Location, '/fr');
  assert.equal(requestRoot().headers.Location, '/fr');
});
