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
import {
  loadMessagesRoute,
  loadOperationsRoute,
  loadProfileRoute,
  loadSavedTripsRoute,
  loadTripsRoute,
} from './primaryRouteLoaders.js';

export { useAuth } from './authContext.jsx';

// Les ecrans ne sont telecharges que lorsqu'ils sont ouverts. Cela garde la
// connexion et le premier trajet rapides, meme avec les centres admin/PDF actifs.
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

// Remonte en haut de la page à chaque changement de route — évite de rester scrollé
// au milieu d'un écran précédent en arrivant sur une nouvelle page.
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

        // Une fonction Vercel ou Supabase peut etre momentanement indisponible.
        // Garder la session locale et reessayer evite de deconnecter a tort l'utilisateur.
        retryTimer = window.setTimeout(restoreSession, 1500);
      }
    };

    void restoreSession();
    return () => {
      cancelled = true;
      window.clearTimeout(retryTimer);
    };
  }, []);

  // Onboarding premier lancement (PRD UI/UX U1) — une seule fois par compte.
  useEffect(() => { setOnboarding(shouldOnboard(user)); }, [user]);

  const login = (token, u) => {
    setToken(token);
    setUser(u);
  };
  const logout = () => {
    api('/auth/logout', { method: 'POST' }).catch(() => {}); // invalide la session serveur
    setToken(null);
    setUser(null);
  };
  const refreshUser = () => api('/me').then((d) => setUser(d.user));

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
        <ScrollToTop />
        <div className="phone">
          {user && <Header user={user} />}
          <div className="main-wrap">
          <div className="content">
            <Suspense fallback={<PageLoading />}>
            <Routes>
              {/* Pages légales publiques : accessibles avant connexion (lien depuis l'inscription) */}
              <Route path="/confidentialite" element={<PrivacyPolicy />} />
              <Route path="/cgu" element={<Terms />} />
              {!user ? (
                <Route path="*" element={<Login />} />
              ) : (
                <>
                  <Route path="/" element={<Navigate to="/trajets" replace />} />
                  <Route path="/trajets" element={<TripFeedSimple />} />
                  <Route path="/trajets/nouveau" element={<CreateTrip />} />
                  <Route path="/trajets/:id/demande" element={<TripRequestSimple />} />
                  <Route path="/trajets/:id" element={<TripDetailSimple />} />
                  <Route path="/en-cours" element={<OperationsSimple />} />
                  <Route path="/operations/:id" element={<OperationDetailSimple />} />
                  <Route path="/enregistres" element={<SavedTrips />} />
                  <Route path="/messages" element={<MessagesSimple />} />
                  <Route path="/messages/:id" element={<ConversationDetail />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/membres/:id" element={<PublicProfile />} />
                  <Route path="/parametres" element={<Settings />} />
                  <Route path="/verification" element={<Kyc />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<NotFound />} />
                </>
              )}
            </Routes>
            </Suspense>
          </div>
          </div>
          {user && <BottomNav user={user} />}
          {user && onboarding && <Onboarding user={user} onClose={() => setOnboarding(false)} />}
        </div>
      </BrowserRouter>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}

function PageLoading() {
  return (
    <div className="boot-splash" aria-label={t('common.loading')}>
      <span className="spinner boot-spinner" />
    </div>
  );
}
