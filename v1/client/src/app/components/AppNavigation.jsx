import { useEffect, useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { api } from '../../core/api.js';
import { Icon } from '../../Icons.jsx';
import Notifications from '../../Notifications.jsx';
import { t, useLang } from '../../i18n.js';

export function Header({ user }) {
  useLang();
  return (
    <header className="app-header">
      <div className="brand">
        <Link to="/trajets" className="brand-link">
          <img
            className="brand-mark"
            src="/assets/logo-mark-192.png"
            alt="Wigofly"
          />
          <span>Wigofly</span>
        </Link>
        {user && (
          <span className="header-notif">
            <Notifications />
          </span>
        )}
      </div>
      <div className="tagline">{t('header.tagline')}</div>
    </header>
  );
}

export function BottomNav({ user }) {
  useLang();
  const [summary, setSummary] = useState({
    messagesUnread: 0,
    operationsActionRequired: 0,
  });

  useEffect(() => {
    if (!user) return undefined;
    let alive = true;
    const load = () => api('/navigation-summary')
      .then((data) => {
        if (alive) setSummary(data);
      })
      .catch(() => {});
    load();
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 10_000);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, [user]);

  const tabs = [
    { to: '/trajets', icon: 'plane', label: t('nav.trips') },
    {
      to: '/en-cours',
      icon: 'repeat',
      label: t('nav.transactions'),
      badge: summary.operationsActionRequired,
    },
    { to: '/enregistres', icon: 'star', label: t('saved.title') },
    {
      to: '/messages',
      icon: 'chat',
      label: t('messages.title'),
      badge: summary.messagesUnread,
    },
    { to: '/profil', icon: 'user', label: t('nav.profile') },
  ];

  return (
    <nav className="bottom-nav">
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          end={tab.to === '/trajets'}
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <span className="nav-icon-wrap">
            <Icon name={tab.icon} size={21} />
            {tab.badge > 0 && (
              <span className="nav-badge">
                {tab.badge > 9 ? '9+' : tab.badge}
              </span>
            )}
          </span>
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
