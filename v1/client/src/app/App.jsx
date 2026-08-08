import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
  useNavigationType,
} from 'react-router-dom';
import { api, getToken, setToken } from '../core/api.js';
import {
  BottomNav,
  Header,
  Onboarding,
  shouldOnboard,
} from './components/index.js';
import { ToastProvider } from '../shared/ui/Toast.jsx';
import { getLang, loadAdminTranslations, t } from '../i18n.js';
import AuthCtx from './authContext.jsx';
import { loginPath, safeReturnPath } from './authNavigation.js';
import { shouldHideAppChrome } from './chromeVisibility.js';
import { RouteSeoPolicy } from './Seo.jsx';
import GuestAccess from './components/GuestAccess.jsx';
import {
  loadMessagesRoute,
  loadOperationsRoute,
  loadProfileRoute,
  loadSavedTripsRoute,
  loadTripsRoute,
} from './primaryRouteLoaders.js';

export { useAuth } from './authContext.jsx';

// Route chunks are loaded only when their screens are rendered.
const Login = lazy(() => import('../features/auth/pages/Login.jsx'));
const TripFeedSimple = lazy(loadTripsRoute);
const CreateTrip = lazy(() => import('../features/trips/pages/CreateTrip.jsx'));
const TripDetailSimple = lazy(() => import('../features/trips/pages/TripDetailSimple.jsx'));
const TripRequestSimple = lazy(() => import('../features/trips/pages/TripRequestSimple.jsx'));
const SavedTrips = lazy(loadSavedTripsRoute);
const MessagesSimple = lazy(loadMessagesRoute);
const ConversationDetail = lazy(() => import('../features/messaging/pages/ConversationDetail.jsx'));
const OperationsSimple = lazy(loadOperationsRoute);
const OperationDetailSimple = lazy(() => import('../features/operations/pages/OperationDetailSimple.jsx'));
const Profile = lazy(loadProfileRoute);
const PublicProfile = lazy(() => import('../features/profile/pages/PublicProfile.jsx'));
const Settings = lazy(() => import('../features/profile/pages/Settings.jsx'));
const Admin = lazy(async () => {
  await loadAdminTranslations();
  return import('../features/admin/pages/Admin.jsx');
});
const PrivacyPolicy = lazy(() => import('../pages/PrivacyPolicy.jsx'));
const Terms = lazy(() => import('../pages/Terms.jsx'));
const Kyc = lazy(() => import('../features/kyc/pages/Kyc.jsx'));
const NotFound = lazy(() => import('../pages/NotFound.jsx'));

const routeScrollPositions = new Map();
const SCROLL_SESSION_PREFIX = 'wigolink:scroll:';

function scrollSessionKey(location) {
  return `${SCROLL_SESSION_PREFIX}${location.pathname}${location.search}${location.hash}`;
}

function readSessionScroll(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return undefined;
    const value = JSON.parse(raw);
    if (Number.isFinite(value)) return { window: value, content: 0 };
    if (!value || typeof value !== 'object') return undefined;
    return {
      window: Number.isFinite(value.window) ? value.window : 0,
      content: Number.isFinite(value.content) ? value.content : 0,
    };
  } catch {
    return undefined;
  }
}

function writeSessionScroll(key, value) {
  try {
    sessionStorage.setItem(key, JSON.stringify({
      window: Math.max(0, Math.round(value.window)),
      content: Math.max(0, Math.round(value.content)),
    }));
  } catch {
    // In-memory history restoration remains available when storage is blocked.
  }
}

function readHistoryScroll(key) {
  try {
    const saved = window.history.state?.__wigolinkScroll;
    return saved?.key === key ? saved.position : undefined;
  } catch {
    return undefined;
  }
}

function writeHistoryScroll(key, position) {
  try {
    window.history.replaceState({
      ...(window.history.state || {}),
      __wigolinkScroll: { key, position },
    }, document.title);
  } catch {
    // Session storage remains the primary fallback in restricted webviews.
  }
}

// New screens start at the top; history navigation and reload restore the previous position.
function RouteScrollRestoration() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const initialLocationKey = useRef(location.key);

  useEffect(() => {
    if (!('scrollRestoration' in window.history)) return undefined;
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = 'manual';
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useLayoutEffect(() => {
    const contentScroller = document.querySelector('.content');
    if (!contentScroller) return undefined;

    const sessionKey = scrollSessionKey(location);
    const isInitialLocation = location.key === initialLocationKey.current;
    const savedPosition = navigationType === 'POP' || isInitialLocation
      ? (routeScrollPositions.get(location.key)
        ?? (isInitialLocation ? readHistoryScroll(sessionKey) : undefined)
        ?? (isInitialLocation ? readSessionScroll(sessionKey) : undefined))
      : undefined;
    let restoring = Number(savedPosition?.window) > 0 || Number(savedPosition?.content) > 0;
    let writeFrame = 0;
    let restoreFrame = 0;
    let restoreTimer;
    let historyTimer;

    const persistPosition = (includeHistory = false) => {
      const position = {
        window: window.scrollY || document.scrollingElement?.scrollTop || 0,
        content: contentScroller.scrollTop,
      };
      routeScrollPositions.set(location.key, position);
      writeSessionScroll(sessionKey, position);
      if (includeHistory) writeHistoryScroll(sessionKey, position);
    };

    const finishRestoration = () => {
      restoring = false;
      if (restoreTimer) window.clearTimeout(restoreTimer);
      observer?.disconnect();
    };

    const restorePosition = () => {
      if (!restoring) return;
      window.scrollTo({ top: savedPosition.window, behavior: 'auto' });
      contentScroller.scrollTo({ top: savedPosition.content, behavior: 'auto' });
      const windowPosition = window.scrollY || document.scrollingElement?.scrollTop || 0;
      if (
        Math.abs(windowPosition - savedPosition.window) <= 1
        && Math.abs(contentScroller.scrollTop - savedPosition.content) <= 1
      ) finishRestoration();
    };

    const observer = restoring
      ? new MutationObserver(() => {
          window.cancelAnimationFrame(restoreFrame);
          restoreFrame = window.requestAnimationFrame(restorePosition);
        })
      : null;

    if (restoring) {
      observer.observe(contentScroller, { childList: true, subtree: true });
      restorePosition();
      restoreTimer = window.setTimeout(() => {
        finishRestoration();
        persistPosition(true);
      }, 3_000);
    } else {
      window.scrollTo({ top: savedPosition?.window ?? 0, behavior: 'auto' });
      contentScroller.scrollTo({ top: savedPosition?.content ?? 0, behavior: 'auto' });
    }

    const onScroll = () => {
      if (restoring) return;
      window.cancelAnimationFrame(writeFrame);
      window.clearTimeout(historyTimer);
      writeFrame = window.requestAnimationFrame(() => persistPosition(false));
      historyTimer = window.setTimeout(() => persistPosition(true), 180);
    };
    const onPageHide = () => persistPosition(true);
    window.addEventListener('scroll', onScroll, { passive: true });
    contentScroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pagehide', onPageHide);

    return () => {
      window.removeEventListener('scroll', onScroll);
      contentScroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('pagehide', onPageHide);
      window.cancelAnimationFrame(writeFrame);
      window.cancelAnimationFrame(restoreFrame);
      window.clearTimeout(historyTimer);
      if (restoreTimer) window.clearTimeout(restoreTimer);
      observer?.disconnect();
      if (!restoring) persistPosition(false);
      if (routeScrollPositions.size > 50) {
        routeScrollPositions.delete(routeScrollPositions.keys().next().value);
      }
    };
  }, [location.key, navigationType]);

  return null;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());
  const [onboarding, setOnboarding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer;

    const restoreSession = async () => {
      if (!getToken()) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const data = await api('/me');
        if (!cancelled) {
          setUser(data.user);
          setLoading(false);
        }
      } catch (error) {
        if (cancelled) return;
        if (error.status === 401 || error.status === 403) {
          setToken(null);
          setLoading(false);
          return;
        }

        // A transient API outage must not incorrectly sign out an existing member.
        retryTimer = window.setTimeout(restoreSession, 1500);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, []);

  // Onboarding is shown once per authenticated account.
  useEffect(() => { setOnboarding(shouldOnboard(user)); }, [user]);

  const login = (token, authenticatedUser) => {
    setToken(token);
    setUser(authenticatedUser);
  };
  const logout = () => {
    // Invalidate the server session before clearing the local credential.
    api('/auth/logout', { method: 'POST' }).catch(() => {});
    setToken(null);
    setUser(null);
  };
  const refreshUser = () => api('/me').then((data) => setUser(data.user));

  if (loading) {
    return (
      <div className="phone">
        <div className="boot-splash">
          <img className="brand-mark boot-logo" src="/assets/logo-mark-192.png" alt="Wigolink" />
          <span className="spinner boot-spinner" />
        </div>
      </div>
    );
  }

  return (
    <AuthCtx.Provider value={{ user, login, logout, refreshUser }}>
      <ToastProvider>
        <BrowserRouter basename={`/${getLang()}`}>
          <AppWorkspace
            user={user}
            onboarding={onboarding}
            setOnboarding={setOnboarding}
          />
        </BrowserRouter>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}

function AppWorkspace({ user, onboarding, setOnboarding }) {
  const location = useLocation();
  const chromeHidden = shouldHideAppChrome(location.pathname);

  return (
    <>
      <RouteScrollRestoration />
      <RouteSeoPolicy />
      <div className="phone">
        {!chromeHidden && <Header user={user} />}
        <div className="main-wrap">
          <div className="content">
            <Suspense fallback={<PageLoading />}>
              <Routes>
                <Route path="/" element={<Navigate to="/trajets" replace />} />
                <Route path="/connexion" element={user ? <LoginReturn /> : <Login />} />
                <Route path="/confidentialite" element={<PrivacyPolicy />} />
                <Route path="/cgu" element={<Terms />} />
                <Route path="/trajets" element={<TripFeedSimple />} />
                <Route path="/en-cours" element={user ? <OperationsSimple /> : <GuestAccess area="operations" />} />
                <Route path="/enregistres" element={user ? <SavedTrips /> : <GuestAccess area="saved" />} />
                <Route path="/messages" element={user ? <MessagesSimple /> : <GuestAccess area="messages" />} />
                <Route path="/profil" element={user ? <Profile /> : <GuestAccess area="profile" />} />
                <Route path="/trajets/nouveau" element={<RequireAuth user={user}><CreateTrip /></RequireAuth>} />
                <Route path="/trajets/:id/demande" element={<RequireAuth user={user}><TripRequestSimple /></RequireAuth>} />
                <Route path="/trajets/:id" element={<TripDetailSimple />} />
                <Route path="/operations/:id" element={<RequireAuth user={user}><OperationDetailSimple /></RequireAuth>} />
                <Route path="/messages/:id" element={<RequireAuth user={user}><ConversationDetail /></RequireAuth>} />
                <Route path="/membres/:id" element={<RequireAuth user={user}><PublicProfile /></RequireAuth>} />
                <Route path="/parametres" element={<RequireAuth user={user}><Settings /></RequireAuth>} />
                <Route path="/verification" element={<RequireAuth user={user}><Kyc /></RequireAuth>} />
                <Route path="/admin" element={<RequireAuth user={user}><Admin /></RequireAuth>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </div>
        </div>
        {!chromeHidden && <BottomNav user={user} />}
        {user && onboarding && !chromeHidden && (
          <Onboarding user={user} onClose={() => setOnboarding(false)} />
        )}
      </div>
    </>
  );
}

function RequireAuth({ user, children }) {
  const location = useLocation();
  if (user) return children;
  const returnTo = `${location.pathname}${location.search}${location.hash}`;
  return <Navigate to={loginPath(returnTo)} replace />;
}

function LoginReturn() {
  const location = useLocation();
  const returnTo = new URLSearchParams(location.search).get('retour');
  return <Navigate to={safeReturnPath(returnTo)} replace />;
}

function PageLoading() {
  return (
    <div className="boot-splash" aria-label={t('common.loading')}>
      <span className="spinner boot-spinner" />
    </div>
  );
}
