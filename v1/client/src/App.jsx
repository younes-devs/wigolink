import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import { Header, BottomNav } from './components.jsx';
import { ToastProvider } from './Toast.jsx';
import SideRail from './SideRail.jsx';
import Login from './pages/Login.jsx';
import TripFeedSimple from './pages/TripFeedSimple.jsx';
import TripDetailSimple from './pages/TripDetailSimple.jsx';
import SavedTrips from './pages/SavedTrips.jsx';
import MessagesSimple from './pages/MessagesSimple.jsx';
import ConversationDetail from './pages/ConversationDetail.jsx';
import OperationsSimple from './pages/OperationsSimple.jsx';
import OperationDetailSimple from './pages/OperationDetailSimple.jsx';
import Feed from './pages/Feed.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import CreateListing from './pages/CreateListing.jsx';
import MyShipments from './pages/MyShipments.jsx';
import Transactions from './pages/Transactions.jsx';
import TransactionDetail from './pages/TransactionDetail.jsx';
import FinanceCenter from './pages/FinanceCenter.jsx';
import DocumentsCenter from './pages/DocumentsCenter.jsx';
import SupportCenter from './pages/SupportCenter.jsx';
import ComplianceCenter from './pages/ComplianceCenter.jsx';
import SenderMatching from './pages/SenderMatching.jsx';
import OffersCenter from './pages/OffersCenter.jsx';
import Profile from './pages/Profile.jsx';
import PublicProfile from './pages/PublicProfile.jsx';
import Settings from './pages/Settings.jsx';
import TrustCenter from './pages/TrustCenter.jsx';
import Admin from './pages/Admin.jsx';
import PrivacyPolicy from './pages/PrivacyPolicy.jsx';
import Terms from './pages/Terms.jsx';
import Kyc from './pages/Kyc.jsx';
import Onboarding, { shouldOnboard } from './Onboarding.jsx';
import NotFound from './pages/NotFound.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

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
    if (!getToken()) return;
    api('/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
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
          <img className="brand-mark boot-logo" src="/assets/logo-mark-192.png" alt="Wigofly" />
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
                  <Route path="/trajets/:id" element={<TripDetailSimple />} />
                  <Route path="/en-cours" element={<OperationsSimple />} />
                  <Route path="/operations/:id" element={<OperationDetailSimple />} />
                  <Route path="/enregistres" element={<SavedTrips />} />
                  <Route path="/messages" element={<MessagesSimple />} />
                  <Route path="/messages/:id" element={<ConversationDetail />} />
                  <Route path="/ancien-feed" element={<Feed />} />
                  <Route path="/annonce/:id" element={<ListingDetail />} />
                  <Route path="/envois" element={<MyShipments />} />
                  <Route path="/envois/nouveau" element={<CreateListing />} />
                  <Route path="/transactions" element={<Transactions />} />
                  <Route path="/transactions/:id" element={<TransactionDetail />} />
                  <Route path="/finance" element={<FinanceCenter />} />
                  <Route path="/documents" element={<DocumentsCenter />} />
                  <Route path="/assistance" element={<SupportCenter />} />
                  <Route path="/conformite" element={<ComplianceCenter />} />
                  <Route path="/matching" element={<SenderMatching />} />
                  <Route path="/offres" element={<OffersCenter />} />
                  <Route path="/profil" element={<Profile />} />
                  <Route path="/membres/:id" element={<PublicProfile />} />
                  <Route path="/parametres" element={<Settings />} />
                  <Route path="/confiance" element={<TrustCenter />} />
                  <Route path="/verification" element={<Kyc />} />
                  <Route path="/admin" element={<Admin />} />
                  <Route path="*" element={<NotFound />} />
                </>
              )}
            </Routes>
          </div>
          {user && <SideRail user={user} />}
          </div>
          {user && <BottomNav user={user} />}
          {user && onboarding && <Onboarding user={user} onClose={() => setOnboarding(false)} />}
        </div>
      </BrowserRouter>
      </ToastProvider>
    </AuthCtx.Provider>
  );
}
