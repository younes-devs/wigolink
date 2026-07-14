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
  const [filter, setFilter] = useState('all');
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

  const openPanel = async () => {
    setOpen(true);
    const d = await api('/notifications').catch(() => null);
    if (d) {
      setItems(d.notifications);
      setUnread(d.unread);
    }
  };

  const markAllRead = async () => {
    await api('/notifications/read', { method: 'POST' }).catch(() => {});
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const toggle = (e) => {
    e.stopPropagation();
    if (open) setOpen(false);
    else openPanel();
  };

  const visibleItems = filter === 'unread' ? items.filter((n) => !n.read) : items;

  const targetFor = (n) => {
    if (n.txId) return `/transactions/${n.txId}${n.section ? `#${n.section}` : ''}`;
    if (n.section === 'matching') return '/offres';
    return '/parametres';
  };

  const go = (n) => {
    setOpen(false);
    nav(targetFor(n));
  };

  return (
    <div className="notif-wrap" ref={panelRef} onMouseDown={(e) => e.stopPropagation()}>
      <button className="notif-bell" onClick={toggle} aria-label={t('notif.title')} aria-expanded={open}>
        <Icon name="bell" size={20} />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label={t('notif.title')} onMouseDown={(e) => e.stopPropagation()}>
          <div className="notif-head">
            <div>
              <div className="notif-title">{t('notif.title')}</div>
              <div className="notif-sub">{items.length} notification{items.length > 1 ? 's' : ''}</div>
            </div>
            <button className="notif-close" onClick={() => setOpen(false)} aria-label="Fermer">
              <Icon name="x" size={18} />
            </button>
          </div>
          <div className="notif-tools">
            <div className="notif-tabs" role="tablist" aria-label={t('notif.title')}>
              <button className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>{t('notif.filter.all')}</button>
              <button className={filter === 'unread' ? 'active' : ''} onClick={() => setFilter('unread')}>{t('notif.filter.unread')}</button>
            </div>
            <button className="notif-read-all" onClick={markAllRead} disabled={unread === 0}>
              <Icon name="check" size={14} />{t('notif.mark.read')}
            </button>
          </div>
          <div className="notif-list">
            {visibleItems.length === 0 && (
              <div className="notif-empty">
                <span className="notif-empty-icon"><Icon name="bell" size={22} /></span>
                <b>{filter === 'unread' ? t('notif.empty.unread') : t('notif.empty')}</b>
                <span>{t('notif.empty.sub')}</span>
              </div>
            )}
            {visibleItems.map((n) => (
              <button key={n.id} className={`notif-item ${n.read ? '' : 'unread'}`} onClick={() => go(n)}>
                <span className="notif-dot" />
                <span className="grow">
                  {n.text}
                  <span className="notif-time">{relTime(n.at)}</span>
                </span>
                <Icon name="arrowRight" size={16} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
