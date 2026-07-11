import { createContext, useContext, useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import { Header, BottomNav } from './components.jsx';
import Login from './pages/Login.jsx';
import Feed from './pages/Feed.jsx';
import ListingDetail from './pages/ListingDetail.jsx';
import CreateListing from './pages/CreateListing.jsx';
import MyShipments from './pages/MyShipments.jsx';
import Transactions from './pages/Transactions.jsx';
import TransactionDetail from './pages/TransactionDetail.jsx';
import Profile from './pages/Profile.jsx';
import Admin from './pages/Admin.jsx';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api('/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = (token, u) => {
    setToken(token);
    setUser(u);
  };
  const logout = () => {
    setToken(null);
    setUser(null);
  };
  const refreshUser = () => api('/me').then((d) => setUser(d.user));

  if (loading) return <div className="phone"><div className="content center mt">Chargement…</div></div>;

  return (
    <AuthCtx.Provider value={{ user, login, logout, refreshUser }}>
      <BrowserRouter>
        <div className="phone">
          <Header />
          <div className="content">
            {!user ? (
              <Login />
            ) : (
              <Routes>
                <Route path="/" element={<Feed />} />
                <Route path="/annonce/:id" element={<ListingDetail />} />
                <Route path="/envois" element={<MyShipments />} />
                <Route path="/envois/nouveau" element={<CreateListing />} />
                <Route path="/transactions" element={<Transactions />} />
                <Route path="/transactions/:id" element={<TransactionDetail />} />
                <Route path="/profil" element={<Profile />} />
                <Route path="/admin" element={<Admin />} />
                <Route path="*" element={<Navigate to="/" />} />
              </Routes>
            )}
          </div>
          {user && <BottomNav user={user} />}
        </div>
      </BrowserRouter>
    </AuthCtx.Provider>
  );
}
