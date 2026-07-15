import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';
import { t, useLang } from '../i18n.js';

const FILTERS = [
  { id: 'all', label: 'messages.filter.all' },
  { id: 'unread', label: 'messages.filter.unread' },
  { id: 'action', label: 'messages.filter.action' },
  { id: 'pinned', label: 'messages.filter.pinned' },
  { id: 'active', label: 'messages.filter.active' },
  { id: 'done', label: 'messages.filter.done' },
  { id: 'archived', label: 'messages.filter.archived' },
];

export default function MessagesSimple() {
  useLang();
  const [conversations, setConversations] = useState(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');

  const load = () => {
    setError('');
    Promise.all([api('/conversations'), api('/conversations?filter=archived')])
      .then(([activeData, archivedData]) => {
        const byId = new Map();
        for (const conversation of [...(activeData.conversations || []), ...(archivedData.conversations || [])]) {
          byId.set(conversation.id, conversation);
        }
        setConversations([...byId.values()]);
      })
      .catch((err) => {
        setError(err.message || t('messages.error.load'));
        setConversations([]);
      });
  };

  useEffect(() => { load(); }, []);

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

  const archive = async (conversationId) => {
    await api(`/conversations/${conversationId}/archive`, { method: 'POST', body: { archived: true } });
    load();
  };

  const restore = async (conversationId) => {
    await api(`/conversations/${conversationId}/archive`, { method: 'POST', body: { archived: false } });
    load();
  };

  const markUnread = async (conversationId) => {
    await api(`/conversations/${conversationId}/unread`, { method: 'POST' });
    load();
  };

  const togglePin = async (conversation) => {
    await api(`/conversations/${conversation.id}/pin`, { method: 'POST', body: { pinned: !conversation.pinned } });
    load();
  };

  return (
    <div className="messages-shell">
      <section className="messages-inbox" aria-label={t('messages.inbox.aria')}>
        <div className="messages-head">
          <div>
            <h1 className="page-title">{t('messages.title')}</h1>
            <p className="page-sub">{t('messages.subtitle')}</p>
          </div>
          <button className="icon-btn" onClick={load} aria-label={t('messages.refresh')} title={t('messages.refresh')}>
            <Icon name="repeat" size={17} />
          </button>
          {unreadTotal > 0 && <span className="messages-unread-total">{unreadTotal}</span>}
        </div>

        <label className="message-search">
          <Icon name="search" size={17} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('messages.search.placeholder')} />
          {q && (
            <button type="button" onClick={() => setQ('')} aria-label={t('messages.search.clear')}>
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
              onClick={() => setFilter(item.id)}
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
            <button className="btn btn-sm" onClick={() => { setQ(''); setFilter('all'); }}>{t('messages.noresult.reset')}</button>
          </div>
        )}

        <div className="conversation-list">
          {filtered.map((conversation) => (
            <ConversationRow
              key={conversation.id}
              conversation={conversation}
              onArchive={archive}
              onRestore={restore}
              onUnread={markUnread}
              onTogglePin={togglePin}
            />
          ))}
        </div>
      </section>

      <aside className="messages-welcome" aria-label={t('messages.welcome.aria')}>
        <WelcomePanel />
      </aside>
    </div>
  );
}

function ConversationRow({ conversation, onArchive, onRestore, onUnread, onTogglePin }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const unread = unreadCount(conversation);
  const status = statusLabel(conversation);
  const context = conversation.context?.label || conversationContext(conversation);
  const preview = conversation.lastMessagePreview || conversation.lastMessage?.text || conversationLabel(conversation);
  const closeMenu = () => setMenuOpen(false);
  const runAction = async (action) => {
    closeMenu();
    await action();
  };
  return (
    <article className={`conversation-row ${menuOpen ? 'menu-open' : ''} ${unread > 0 ? 'has-unread' : ''} ${conversation.actionRequired ? 'needs-action' : ''} ${conversation.pinned ? 'is-pinned' : ''}`}>
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
      <div className="conversation-side">
        {conversation.pinned && <span className="pin-dot" aria-label={t('messages.status.pinned')} title={t('messages.status.pinned')}><Icon name="pin" size={12} /></span>}
        {conversation.actionRequired && <span className="action-dot">{t('messages.status.action')}</span>}
        {unread > 0 && <span className="unread-badge">{unread}</span>}
        <button
          type="button"
          className="conversation-more"
          onClick={() => setMenuOpen((value) => !value)}
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
          </div>
        )}
      </div>
    </article>
  );
}

function WelcomePanel() {
  return (
    <div className="messages-welcome-inner">
      <span className="messages-welcome-icon"><Icon name="chat" size={28} /></span>
      <h2>{t('messages.welcome.title')}</h2>
      <p>{t('messages.welcome.body')}</p>
      <ul>
        <li><Icon name="plane" size={15} /> {t('messages.welcome.trip')}</li>
        <li><Icon name="repeat" size={15} /> {t('messages.welcome.operation')}</li>
        <li><Icon name="shieldCheck" size={15} /> {t('messages.welcome.safe')}</li>
      </ul>
      <Link to="/trajets" className="btn btn-primary btn-sm">{t('messages.action.viewTrips')}</Link>
    </div>
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

function unreadCount(conversation) {
  return conversation.unreadCount ?? conversation.unread ?? 0;
}

function conversationSearchText(conversation) {
  return `${conversation.other?.name || ''} ${conversation.lastMessagePreview || ''} ${conversation.lastMessage?.text || ''} ${conversation.context?.label || ''} ${conversation.trip?.from || ''} ${conversation.trip?.to || ''} ${conversation.operation?.title || ''}`.toLowerCase();
}

function statusLabel(conversation) {
  if (conversation.status === 'waiting_user') return conversation.actionLabel || t('messages.status.actionRequired');
  if (conversation.status === 'waiting_other') return conversation.actionLabel || t('messages.status.waiting');
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
  if (conversation.operation) return conversation.operation.title || 'Operation en cours';
  return t('messages.status.direct');
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
