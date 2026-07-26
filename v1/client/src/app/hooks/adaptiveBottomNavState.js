export const ADAPTIVE_BOTTOM_NAV = Object.freeze({
  compactAfterDownPx: 24,
  expandAfterUpPx: 12,
  topGuardPx: 24,
  bottomGuardPx: 32,
  idleExpandMs: 600,
  mobileMaxWidthPx: 899,
});

export function createBottomNavIntent(scrollTop = 0) {
  return {
    compact: false,
    downDistance: 0,
    upDistance: 0,
    lastScrollTop: Math.max(0, scrollTop),
  };
}

export function updateBottomNavIntent(intent, metrics, options = {}) {
  const {
    scrollTop = 0,
    scrollHeight = 0,
    clientHeight = 0,
  } = metrics;
  const { blocked = false } = options;
  const nextTop = Math.max(0, scrollTop);
  const maxScrollTop = Math.max(0, scrollHeight - clientHeight);
  const isScrollable = maxScrollTop > ADAPTIVE_BOTTOM_NAV.compactAfterDownPx;
  const nearTop = nextTop <= ADAPTIVE_BOTTOM_NAV.topGuardPx;
  const nearBottom = maxScrollTop - nextTop <= ADAPTIVE_BOTTOM_NAV.bottomGuardPx;

  if (blocked || !isScrollable || nearTop || nearBottom) {
    return createBottomNavIntent(nextTop);
  }

  const delta = nextTop - intent.lastScrollTop;
  if (delta === 0) return intent;

  if (delta > 0) {
    const downDistance = intent.downDistance + delta;
    return {
      compact: intent.compact
        || downDistance >= ADAPTIVE_BOTTOM_NAV.compactAfterDownPx,
      downDistance,
      upDistance: 0,
      lastScrollTop: nextTop,
    };
  }

  const upDistance = intent.upDistance + Math.abs(delta);
  return {
    compact: intent.compact
      && upDistance < ADAPTIVE_BOTTOM_NAV.expandAfterUpPx,
    downDistance: 0,
    upDistance,
    lastScrollTop: nextTop,
  };
}
