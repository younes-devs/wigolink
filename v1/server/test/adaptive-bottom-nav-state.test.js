import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ADAPTIVE_BOTTOM_NAV,
  createBottomNavIntent,
  updateBottomNavIntent,
} from '../../client/src/app/hooks/adaptiveBottomNavState.js';

const longPage = {
  scrollHeight: 1_400,
  clientHeight: 700,
};

function move(intent, scrollTop, options) {
  return updateBottomNavIntent(
    intent,
    { ...longPage, scrollTop },
    options,
  );
}

test('bottom nav compacts only after enough cumulative downward movement', () => {
  let intent = createBottomNavIntent(100);
  intent = move(intent, 108);
  assert.equal(intent.compact, false);

  intent = move(intent, 119);
  assert.equal(intent.compact, false);

  intent = move(intent, 124);
  assert.equal(intent.compact, true);
});

test('bottom nav expands quickly when the user scrolls upward', () => {
  let intent = { ...createBottomNavIntent(180), compact: true };
  intent = move(intent, 174);
  assert.equal(intent.compact, true);

  intent = move(intent, 168);
  assert.equal(intent.compact, false);
});

test('top, bottom and short pages always keep the full navigation', () => {
  const compactIntent = { ...createBottomNavIntent(100), compact: true };

  const atTop = updateBottomNavIntent(
    compactIntent,
    { ...longPage, scrollTop: ADAPTIVE_BOTTOM_NAV.topGuardPx },
  );
  assert.equal(atTop.compact, false);

  const atBottom = updateBottomNavIntent(
    compactIntent,
    { ...longPage, scrollTop: 690 },
  );
  assert.equal(atBottom.compact, false);

  const shortPage = updateBottomNavIntent(
    compactIntent,
    { scrollTop: 0, scrollHeight: 600, clientHeight: 700 },
  );
  assert.equal(shortPage.compact, false);
});

test('blocking interactions force the navigation back to normal', () => {
  const compactIntent = { ...createBottomNavIntent(180), compact: true };
  const next = move(compactIntent, 190, { blocked: true });

  assert.equal(next.compact, false);
  assert.equal(next.downDistance, 0);
  assert.equal(next.upDistance, 0);
});
