import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { Avatar, Icon } from '../../../Icons.jsx';
import { dateLocale, t, useLang } from '../../../i18n.js';
import { useToast } from '../../../Toast.jsx';
import { ConfirmDialog } from '../../../components.jsx';
import { readInboxCache, writeInboxCache } from '../services/messageCache.js';

const FILTERS = [
  { id: 'all', label: 'messages.filter.all' },
  { id: 'unread', label: 'messages.filter.unread' },
  { id: 'action', label: 'messages.filter.action' },
  { id: 'pinned', label: 'messages.filter.pinned' },
  { id: 'active', label: 'messages.filter.active' },
  { id: 'done', label: 'messages.filter.done' },
  { id: 'archived', label: 'messages.filter.archived' },
];
const inboxCacheByUser = new Map();
const INBOX_CACHE_MS = 20_000;

// The inbox can stay cached while a user reads a thread. Reflect that read
// immediately so returning to the list never shows a stale unread badge.
export function markInboxConversationRead(userId, conversationId, conversation = null) {
  const cached = inboxCacheByUser.get(userId);
  if (!cached) return;
  const conversations = cached.conversations.map((item) => {
    if (item.id !== conversationId) return item;
    return { ...item, ...(conversation || {}), unread: 0, unreadCount: 0 };
  });
  const next = { ...cached, conversations };
  inboxCacheByUser.set(userId, next);
  writeInboxCache(userId, next);
}

export default function MessagesSimple() {
  useLang();
  const toast = useToast();
  const { user } = useAuth();
  const [conversations, setConversations] = useState(() => inboxCacheByUser.get(user?.id)?.conversations || null);
  const [page, setPage] = useState(() => inboxCacheByUser.get(user?.id)?.page || {});
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [openMenuId, setOpenMenuId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const realtimeConnectedRef = useRef(false);

  const load = async ({ force = false } = {}) => {
    setOpenMenuId(null);
    setError('');
    const cached = inboxCacheByUser.get(user?.id);
    if (cached) {
      setConversations(cached.conversations);
      setPage(cached.page || {});
      if (!force && Date.now() - cached.at < INBOX_CACHE_MS) return;
    }
    try {
      const limit = Math.min(200, Math.max(40, cached?.conversations?.length || 0));
      const data = await api(`/conversations?includeArchived=1&limit=${limit}`);
      const next = { conversations: data.conversations || [], page: data.page || {}, at: Date.now() };
      inboxCacheByUser.set(user?.id, next);
      writeInboxCache(user?.id, next);
      setConversations(next.conversations);
      setPage(next.page);
    } catch (err) {
      setError(err.message || t('messages.error.load'));
      if (!cached) setConversations([]);
    }
  };

  const refreshConversation = async (conversationId) => {
    if (!conversationId) return load({ force: true });
    try {
      const data = await api(`/conversations/${conversationId}`);
      const nextConversation = data.conversation;
      setConversations((current) => {
        const list = current || [];
        const next = [
          nextConversation,
          ...list.filter((item) => item.id !== conversationId),
        ].sort((a, b) =>
          Number(b.pinned) - Number(a.pinned)
          || Number(b.lastMessageAt || b.createdAt) - Number(a.lastMessageAt || a.createdAt)
        );
        const cached = { conversations: next, page, at: Date.now() };
        inboxCacheByUser.set(user?.id, cached);
        writeInboxCache(user?.id, cached);
        return next;
      });
    } catch {
      void load({ force: true });
    }
  };

  useEffect(() => {
    let cancelled = false;
    const memory = inboxCacheByUser.get(user?.id);
    if (memory) {
      void load();
      return () => { cancelled = true; };
    }
    void readInboxCache(user?.id).then((cached) => {
      if (cancelled) return;
      if (cached) {
        inboxCacheByUser.set(user?.id, cached);
        setConversations(cached.conversations || []);
        setPage(cached.page || {});
      }
      void load();
    });
    return () => { cancelled = true; };
  }, [user?.id]);

  const loadMore = async () => {
    if (!page?.hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api(`/conversations?includeArchived=1&limit=40&offset=${page.nextOffset}`);
      const incoming = data.conversations || [];
      setConversations((current) => {
        const seen = new Set((current || []).map((item) => item.id));
        const conversationsNext = [...(current || []), ...incoming.filter((item) => !seen.has(item.id))];
        const cached = { conversations: conversationsNext, page: data.page || {}, at: Date.now() };
        inboxCacheByUser.set(user?.id, cached);
        writeInboxCache(user?.id, cached);
        return conversationsNext;
      });
      setPage(data.page || {});
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      if (!realtimeConnectedRef.current && document.visibilityState === 'visible') {
        load({ force: true });
      }
    }, 12_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void import('../services/realtime.js')
      .then(({ subscribeToMessageUpdates }) => subscribeToMessageUpdates(
        user?.id,
        (update) => {
          if (document.visibilityState === 'visible') {
            void refreshConversation(update.conversationId);
          }
        },
        (status) => {
          realtimeConnectedRef.current = status === 'connected';
        }
      ))
      .then((dispose) => {
        if (cancelled) dispose();
        else unsubscribe = dispose;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      realtimeConnectedRef.current = false;
      unsubscribe();
    };
  }, [user?.id]);

  useEffect(() => {
    const refreshVisibleInbox = () => {
      if (document.visibilityState === 'visible') void load({ force: true });
    };
    document.addEventListener('visibilitychange', refreshVisibleInbox);
    window.addEventListener('focus', refreshVisibleInbox);
    return () => {
      document.removeEventListener('visibilitychange', refreshVisibleInbox);
      window.removeEventListener('focus', refreshVisibleInbox);
    };
  }, []);

  const counts = useMemo(() => {
    const list = conversations || [];
    return {
      all: list.filter((c) => !c.archived).length,
      unread: list.filter((c) => !c.archived && (c.unreadCount || c.unread || 0) > 0).length,
      action: list.filter((c) => !c.archived && c.actionRequired).length,
      pinned: list.filter((c) => !c.archived && c.pinned).length,
      active: list.filter((c) => !c.archived && ['active', 'waiting_user', 'waiting_other'].includes(c.status)).length,
      done: list.filter((c) => !c.archived && c.status === 'completed').length,
      archived: list.filter((c) => c.archived).length,
    };
  }, [conversations]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (conversations || [])
      .filter((conversation) => {
        if (filter !== 'archived' && conversation.archived) return false;
        if (filter === 'archived') return conversation.archived;
        if (filter === 'unread') return unreadCount(conversation) > 0;
        if (filter === 'action') return conversation.actionRequired;
        if (filter === 'pinned') return conversation.pinned;
        if (filter === 'active') return ['active', 'waiting_user', 'waiting_other'].includes(conversation.status);
        if (filter === 'done') return conversation.status === 'completed';
        return true;
      })
      .filter((conversation) => !needle || conversationSearchText(conversation).includes(needle));
  }, [conversations, filter, q]);

  const unreadTotal = (conversations || []).reduce((sum, conversation) => sum + unreadCount(conversation), 0);
  const refreshAfterMutation = () => {
    inboxCacheByUser.delete(user?.id);
    return load({ force: true });
  };

  const archive = async (conversationId) => {
    try {
      await api(`/conversations/${conversationId}/archive`, { method: 'POST', body: { archived: true } });
      toast.success(t('messages.toast.archived'));
      refreshAfterMutation();
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    }
  };

  const restore = async (conversationId) => {
    try {
      await api(`/conversations/${conversationId}/archive`, { method: 'POST', body: { archived: false } });
      toast.success(t('messages.toast.restored'));
      refreshAfterMutation();
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    }
  };

  const markUnread = async (conversationId) => {
    try {
      await api(`/conversations/${conversationId}/unread`, { method: 'POST' });
      toast.success(t('messages.toast.markedUnread'));
      refreshAfterMutation();
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    }
  };

  const togglePin = async (conversation) => {
    try {
      const data = await api(`/conversations/${conversation.id}/pin`, { method: 'POST', body: { pinned: !conversation.pinned } });
      toast.success(data.conversation.pinned ? t('messages.toast.pinned') : t('messages.toast.unpinned'));
      refreshAfterMutation();
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    }
  };

  const remove = async (conversationId) => {
    try {
      await api(`/conversations/${conversationId}`, { method: 'DELETE' });
      toast.success(t('messages.toast.deleted'));
      refreshAfterMutation();
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    }
  };

  return (
    <div className="messages-shell">
      <section className="messages-inbox" aria-label={t('messages.inbox.aria')}>
        <div className="messages-head">
          <div>
            <h1 className="page-title">{t('messages.title')}</h1>
            <p className="page-sub">{t('messages.subtitle')}</p>
          </div>
          <button className="icon-btn" onClick={() => load({ force: true })} aria-label={t('messages.refresh')} title={t('messages.refresh')}>
            <Icon name="repeat" size={17} />
          </button>
          {unreadTotal > 0 && <span className="messages-unread-total">{unreadTotal}</span>}
        </div>

        <label className="message-search">
          <Icon name="search" size={17} />
          <input value={q} onChange={(e) => { setOpenMenuId(null); setQ(e.target.value); }} placeholder={t('messages.search.placeholder')} />
          {q && (
            <button type="button" onClick={() => { setOpenMenuId(null); setQ(''); }} aria-label={t('messages.search.clear')}>
              <Icon name="x" size={15} />
            </button>
          )}
        </label>

        <div className="message-filters" role="tablist" aria-label={t('messages.filters.aria')}>
          {FILTERS.map((item) => (
            <button
              type="button"
              key={item.id}
              className={filter === item.id ? 'active' : ''}
              onClick={() => { setOpenMenuId(null); setFilter(item.id); }}
            >
              <span>{t(item.label)}</span>
              <b>{counts[item.id] || 0}</b>
            </button>
          ))}
        </div>

        {conversations === null && <InboxSkeleton />}
        {error && (
          <div className="message-state">
            <Icon name="alert" size={24} />
            <b>{t('messages.error.title')}</b>
            <p>{error}</p>
            <button className="btn btn-sm" onClick={load}>{t('common.retry')}</button>
          </div>
        )}
        {conversations?.length === 0 && !error && (
          <div className="message-state">
            <Icon name="chat" size={30} />
            <b>{t('messages.empty.title')}</b>
            <p>{t('messages.empty.body')}</p>
            <Link to="/trajets" className="btn btn-primary btn-sm">{t('messages.action.viewTrips')}</Link>
          </div>
        )}
        {conversations?.length > 0 && filtered.length === 0 && (
          <div className="message-state compact">
            <Icon name="search" size={22} />
            <b>{t('messages.noresult.title')}</b>
            <p>{t('messages.noresult.body')}</p>
            <button className="btn btn-sm" onClick={() => { setOpenMenuId(null); setQ(''); setFilter('all'); }}>{t('messages.noresult.reset')}</button>
          </div>
        )}

        <div className="conversation-list">
          {filtered.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              menuOpen={openMenuId === conversation.id}
              onMenuOpenChange={(open) => setOpenMenuId(open ? conversation.id : null)}
              onArchive={archive}
              onRestore={restore}
              onUnread={markUnread}
              onTogglePin={togglePin}
              onRemove={setDeleteTarget}
            />
          ))}
        </div>
        {page?.hasMore && (
          <div className="center">
            <button className="btn btn-ghost btn-sm" type="button" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? t('common.loading') : t('common.loadMore')}
            </button>
          </div>
        )}
      </section>
      {deleteTarget && <ConfirmDialog
        title={t('messages.delete.confirm.title')}
        message={t('messages.delete.confirm.body')}
        confirmLabel={t('messages.delete.confirm.action')}
        danger icon="trash"
        onConfirm={() => { void remove(deleteTarget.id); setDeleteTarget(null); }}
        onClose={() => setDeleteTarget(null)}
      />}

    </div>
  );
}

function ConversationRow({ conversation, menuOpen, onMenuOpenChange, onArchive, onRestore, onUnread, onTogglePin, onRemove }) {
  const menuRef = useRef(null);
  const touchStart = useRef(null);
  const [swiped, setSwiped] = useState(false);
  const unread = unreadCount(conversation);
  const status = statusLabel(conversation);
  const context = conversation.context?.labelKey ? t(conversation.context.labelKey) : conversation.context?.label || conversationContext(conversation);
  const preview = conversation.lastMessagePreviewKey ? t(conversation.lastMessagePreviewKey) : conversation.lastMessagePreview || conversation.lastMessage?.text || conversationLabel(conversation);
  useDismissibleMenu(menuOpen, menuRef, () => onMenuOpenChange(false));
  const closeMenu = () => onMenuOpenChange(false);
  const runAction = async (action) => {
    closeMenu();
    await action();
  };
  const onTouchStart = (event) => { touchStart.current = event.touches[0]?.clientX ?? null; };
  const onTouchEnd = (event) => {
    const start = touchStart.current;
    const end = event.changedTouches[0]?.clientX;
    touchStart.current = null;
    if (start !== null && end !== undefined && Math.abs(end - start) > 54) setSwiped(end < start);
  };
  return (
    <article className={`conversation-row ${menuOpen ? 'menu-open' : ''} ${swiped ? 'is-swiped' : ''} ${unread > 0 ? 'has-unread' : ''} ${conversation.actionRequired ? 'needs-action' : ''} ${conversation.pinned ? 'is-pinned' : ''}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      {swiped && <div className="conversation-swipe-actions"><button type="button" onClick={() => runAction(() => onTogglePin(conversation))}><Icon name="pin" size={16} /></button><button type="button" onClick={() => runAction(() => onArchive(conversation.id))}><Icon name="eyeOff" size={16} /></button><button type="button" onClick={() => runAction(() => onUnread(conversation.id))}><Icon name="mail" size={16} /></button></div>}
      <Link to={`/messages/${conversation.id}`} className="conversation-row-main" onClick={closeMenu}>
        <div className="conversation-avatar">
          <Avatar name={conversation.other?.name || t('messages.contact')} photo={conversation.other?.photoUrl} size={50} />
          {conversation.other?.kycStatus === 'verified' && <span className="conversation-verified"><Icon name="check" size={10} /></span>}
        </div>
        <div className="grow conversation-copy">
          <div className="conversation-top">
            <b>{conversation.other?.name || t('messages.contact')}</b>
            <span>{shortDate(conversation.lastMessageAt || conversation.createdAt)}</span>
          </div>
          <div className="conversation-meta">
            <span>{context}</span>
            <i>{status}</i>
          </div>
          <p>{preview}</p>
        </div>
      </Link>
      <div className="conversation-side" ref={menuRef}>
        {conversation.pinned && <span className="pin-dot" aria-label={t('messages.status.pinned')} title={t('messages.status.pinned')}><Icon name="pin" size={12} /></span>}
        {conversation.actionRequired && <span className="action-dot">{t('messages.status.action')}</span>}
        {unread > 0 && <span className="unread-badge">{unread}</span>}
        <button
          type="button"
          className="conversation-more"
          onClick={(event) => {
            event.stopPropagation();
            onMenuOpenChange(!menuOpen);
          }}
          aria-label={t('messages.action.openMenu')}
          aria-expanded={menuOpen}
        >
          <Icon name="moreVertical" size={16} />
        </button>
        {menuOpen && (
          <div className="conversation-menu" role="menu">
            <button type="button" role="menuitem" onClick={() => runAction(() => onTogglePin(conversation))}>
              <Icon name="pin" size={15} /> {conversation.pinned ? t('messages.action.unpin') : t('messages.action.pin')}
            </button>
            <button type="button" role="menuitem" onClick={() => runAction(() => onUnread(conversation.id))}>
              <Icon name="mail" size={15} /> {t('messages.action.markUnread')}
            </button>
            {conversation.archived ? (
              <button type="button" role="menuitem" onClick={() => runAction(() => onRestore(conversation.id))}>
                <Icon name="eye" size={15} /> {t('messages.action.restore')}
              </button>
            ) : (
              <button type="button" role="menuitem" onClick={() => runAction(() => onArchive(conversation.id))}>
                <Icon name="eyeOff" size={15} /> {t('messages.action.archive')}
              </button>
            )}
            <button type="button" role="menuitem" className="conversation-menu-danger" onClick={() => runAction(() => onRemove(conversation))}>
              <Icon name="trash" size={15} /> {t('messages.action.delete')}
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

function InboxSkeleton() {
  return (
    <div className="conversation-list skeleton-list" aria-label={t('common.loading')}>
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="conversation-row" key={item}>
          <span className="skeleton avatar-skeleton" />
          <div className="grow">
            <span className="skeleton line-skeleton wide" />
            <span className="skeleton line-skeleton" />
          </div>
        </div>
      ))}
    </div>
  );
}

function useDismissibleMenu(open, ref, onClose) {
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!ref.current || ref.current.contains(event.target)) return;
      onClose();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, ref, onClose]);
}

function unreadCount(conversation) {
  return conversation.unreadCount ?? conversation.unread ?? 0;
}

function conversationSearchText(conversation) {
  return `${conversation.other?.name || ''} ${conversation.lastMessagePreview || ''} ${conversation.lastMessage?.text || ''} ${conversation.context?.label || ''} ${conversation.trip?.from || ''} ${conversation.trip?.to || ''} ${conversation.operation?.title || ''}`.toLowerCase();
}

function statusLabel(conversation) {
  if (conversation.status === 'waiting_user') return conversation.actionKey ? t(conversation.actionKey) : conversation.actionLabel || t('messages.status.actionRequired');
  if (conversation.status === 'waiting_other') return conversation.actionKey ? t(conversation.actionKey) : conversation.actionLabel || t('messages.status.waiting');
  if (conversation.status === 'completed') return t('messages.status.completed');
  if (conversation.status === 'archived') return t('messages.status.archived');
  if (conversation.operation || conversation.context?.type === 'operation') return t('messages.status.operation');
  if (conversation.trip || conversation.context?.type === 'trip') return t('messages.status.trip');
  return conversation.contextType === 'operation' ? t('messages.status.operation') : conversation.contextType === 'trip' ? t('messages.status.trip') : t('messages.status.direct');
}

function conversationLabel(conversation) {
  if (conversation.trip) return t('messages.preview.trip');
  if (conversation.operation) return t('messages.preview.operation');
  return t('messages.preview.new');
}

function conversationContext(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.operation) return conversation.operation.title || t('messages.operation.active');
  return t('messages.status.direct');
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit' });
}
