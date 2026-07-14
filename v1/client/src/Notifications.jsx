import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from './api';
import { Icon } from './Icons.jsx';
import { t, useLang } from './i18n.js';

const REL_FMT = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
function relTime(at) {
  const mins = Math.round((at - Date.now()) / 60e3);
  if (mins > -60) return REL_FMT.format(mins, 'minute');
  const hours = Math.round(mins / 60);
  if (hours > -24) return REL_FMT.format(hours, 'hour');
  return REL_FMT.format(Math.round(hours / 24), 'day');
}

export default function Notifications() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const nav = useNavigate();
  const panelRef = useRef(null);

  const load = useCallback(() => {
    api('/notifications')
      .then((d) => { setItems(d.notifications); setUnread(d.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
    const iv = setInterval(load, 12000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!panelRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next) {
      // Rafraîchit à l'ouverture puis marque tout lu.
      const d = await api('/notifications').catch(() => null);
      if (d) setItems(d.notifications);
      if (d?.unread > 0) {
        await api('/notifications/read', { method: 'POST' }).catch(() => {});
      }
      setUnread(0);
    }
  };

  const go = (n) => {
    setOpen(false);
    if (n.txId) nav(`/transactions/${n.txId}`);
  };

  return (
    <div className="notif-wrap" ref={panelRef}>
      <button className="notif-bell" onClick={toggle} aria-label={t('notif.title')}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-title">{t('notif.title')}</div>
          {items.length === 0 && <div className="notif-empty">{t('notif.empty')}</div>}
          {items.map((n) => (
            <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => go(n)}>
              <span className="notif-dot" />
              <span className="grow">
                {n.text}
                <span className="notif-time">{relTime(n.at)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
