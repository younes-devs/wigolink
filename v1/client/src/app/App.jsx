import { lazy, Suspense, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from '../core/api.js';
import {
  BottomNav,
  Header,
  Onboarding,
  shouldOnboard,
} from './components/index.js';
import { ToastProvider } from '../shared/ui/Toast.jsx';
import { loadAdminTranslations, t } from '../i18n.js';
import AuthCtx from './authContext.jsx';
import { loginPath, safeReturnPath } from './authNavigation.js';
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

// Reset the application scroller after each route change.
function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector('.content')?.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
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
        <BrowserRouter>
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
  const chromeHidden = ['/connexion', '/cgu', '/confidentialite'].includes(location.pathname);

  return (
    <>
      <ScrollToTop />
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
                <Route path="/trajets/:id" element={<RequireAuth user={user}><TripDetailSimple /></RequireAuth>} />
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
