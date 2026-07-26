import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  ADAPTIVE_BOTTOM_NAV,
  createBottomNavIntent,
  updateBottomNavIntent,
} from './adaptiveBottomNavState.js';

const BLOCKING_SELECTOR = [
  '.modal-backdrop',
  '.onboard-overlay',
  '.trip-filter-sheet',
  '.trip-publish-wizard',
  '.kyc-page',
  '.conversation-detail',
].join(',');

const EDITABLE_SELECTOR = 'input, textarea, select, [contenteditable="true"]';

function isKeyboardOpen() {
  const editableFocused = document.activeElement?.matches?.(EDITABLE_SELECTOR);
  const viewport = window.visualViewport;
  const viewportReduced = viewport
    ? window.innerHeight - viewport.height > 140
    : false;
  return Boolean(editableFocused && viewportReduced);
}

function isInteractionBlocked() {
  const navFocused = document.activeElement?.closest?.('.bottom-nav');
  return Boolean(
    navFocused
    || isKeyboardOpen()
    || document.querySelector(BLOCKING_SELECTOR),
  );
}

export default function useAdaptiveBottomNav() {
  const { pathname } = useLocation();
  const [compact, setCompact] = useState(false);
  const intentRef = useRef(createBottomNavIntent());
  const idleTimerRef = useRef();
  const frameRef = useRef();

  const expand = useCallback((scrollTop) => {
    const content = document.querySelector('.content');
    const nextTop = scrollTop ?? content?.scrollTop ?? 0;
    intentRef.current = createBottomNavIntent(nextTop);
    setCompact(false);
    window.clearTimeout(idleTimerRef.current);
  }, []);

  useEffect(() => {
    const content = document.querySelector('.content');
    if (!content) return undefined;

    const mobileQuery = window.matchMedia(
      `(max-width: ${ADAPTIVE_BOTTOM_NAV.mobileMaxWidthPx}px)`,
    );

    const scheduleIdleExpansion = () => {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(
        () => expand(content.scrollTop),
        ADAPTIVE_BOTTOM_NAV.idleExpandMs,
      );
    };

    const evaluate = () => {
      frameRef.current = undefined;
      if (!mobileQuery.matches) {
        expand(content.scrollTop);
        return;
      }

      const nextIntent = updateBottomNavIntent(
        intentRef.current,
        {
          scrollTop: content.scrollTop,
          scrollHeight: content.scrollHeight,
          clientHeight: content.clientHeight,
        },
        { blocked: isInteractionBlocked() },
      );
      intentRef.current = nextIntent;
      setCompact((current) => (
        current === nextIntent.compact ? current : nextIntent.compact
      ));
    };

    const scheduleEvaluation = () => {
      if (frameRef.current === undefined) {
        frameRef.current = window.requestAnimationFrame(evaluate);
      }
    };

    const onScroll = () => {
      scheduleEvaluation();
      scheduleIdleExpansion();
    };

    const onViewportChange = () => {
      if (isInteractionBlocked() || !mobileQuery.matches) {
        expand(content.scrollTop);
      } else {
        scheduleEvaluation();
      }
    };

    const mutationObserver = new MutationObserver(() => {
      if (isInteractionBlocked()) expand(content.scrollTop);
    });
    const resizeObserver = new ResizeObserver(scheduleEvaluation);

    intentRef.current = createBottomNavIntent(content.scrollTop);
    setCompact(false);
    content.addEventListener('scroll', onScroll, { passive: true });
    mobileQuery.addEventListener('change', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    document.addEventListener('focusin', onViewportChange);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    resizeObserver.observe(content);

    return () => {
      content.removeEventListener('scroll', onScroll);
      mobileQuery.removeEventListener('change', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      document.removeEventListener('focusin', onViewportChange);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.clearTimeout(idleTimerRef.current);
      if (frameRef.current !== undefined) {
        window.cancelAnimationFrame(frameRef.current);
      }
    };
  }, [expand, pathname]);

  return { compact, expand };
}
