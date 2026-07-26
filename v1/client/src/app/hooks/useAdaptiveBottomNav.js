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

function readScrollMetrics(content, source) {
  if (source === 'content') {
    return {
      scrollTop: content.scrollTop,
      scrollHeight: content.scrollHeight,
      clientHeight: content.clientHeight,
    };
  }

  const scroller = document.scrollingElement || document.documentElement;
  return {
    scrollTop: scroller.scrollTop,
    scrollHeight: scroller.scrollHeight,
    clientHeight: window.innerHeight,
  };
}

function initialScrollSource(content) {
  return content.scrollHeight - content.clientHeight > 1 ? 'content' : 'window';
}

export default function useAdaptiveBottomNav() {
  const { pathname } = useLocation();
  const [compact, setCompact] = useState(false);
  const intentRef = useRef(createBottomNavIntent());
  const idleTimerRef = useRef();
  const frameRef = useRef();
  const scrollSourceRef = useRef('window');

  const expand = useCallback((scrollTop) => {
    const content = document.querySelector('.content');
    const metrics = content
      ? readScrollMetrics(content, scrollSourceRef.current)
      : { scrollTop: 0 };
    const nextTop = scrollTop ?? metrics.scrollTop;
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
    scrollSourceRef.current = initialScrollSource(content);

    const scheduleIdleExpansion = () => {
      window.clearTimeout(idleTimerRef.current);
      idleTimerRef.current = window.setTimeout(
        () => expand(),
        ADAPTIVE_BOTTOM_NAV.idleExpandMs,
      );
    };

    const evaluate = () => {
      frameRef.current = undefined;
      if (!mobileQuery.matches) {
        expand();
        return;
      }

      const metrics = readScrollMetrics(content, scrollSourceRef.current);
      const nextIntent = updateBottomNavIntent(
        intentRef.current,
        metrics,
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

    const onContentScroll = () => {
      scrollSourceRef.current = 'content';
      scheduleEvaluation();
      scheduleIdleExpansion();
    };

    const onWindowScroll = () => {
      scrollSourceRef.current = 'window';
      scheduleEvaluation();
      scheduleIdleExpansion();
    };

    const onViewportChange = () => {
      if (isInteractionBlocked() || !mobileQuery.matches) {
        expand();
      } else {
        scheduleEvaluation();
      }
    };

    const mutationObserver = new MutationObserver(() => {
      if (isInteractionBlocked()) expand();
    });
    const resizeObserver = new ResizeObserver(scheduleEvaluation);

    intentRef.current = createBottomNavIntent(
      readScrollMetrics(content, scrollSourceRef.current).scrollTop,
    );
    setCompact(false);
    content.addEventListener('scroll', onContentScroll, { passive: true });
    window.addEventListener('scroll', onWindowScroll, { passive: true });
    mobileQuery.addEventListener('change', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    document.addEventListener('focusin', onViewportChange);
    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true,
    });
    resizeObserver.observe(content);

    return () => {
      content.removeEventListener('scroll', onContentScroll);
      window.removeEventListener('scroll', onWindowScroll);
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
