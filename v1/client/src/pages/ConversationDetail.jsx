import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, realtimeUrl } from '../api';
import { useAuth } from '../App.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { dateLocale, t, useLang } from '../i18n.js';
import { useToast } from '../Toast.jsx';
import { shortDate } from './MessagesSimple.jsx';

const REPORT_REASONS = ['external_payment', 'abuse', 'suspicious', 'off_platform', 'other'];

export default function ConversationDetail() {
  useLang();
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState(() => sessionStorage.getItem(`draft:${id}`) || '');
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState(null);
  const [error, setError] = useState('');
  const [nearBottom, setNearBottom] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [messageQuery, setMessageQuery] = useState('');
  const [messagePage, setMessagePage] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' ? true : navigator.onLine);
  const [attachment, setAttachment] = useState(null);
  const [attachmentState, setAttachmentState] = useState('');
  const [otherTyping, setOtherTyping] = useState(false);
  const [otherOnline, setOtherOnline] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [searchIndex, setSearchIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportCode, setReportCode] = useState('external_payment');
  const [reportReason, setReportReason] = useState('');
  const threadRef = useRef(null);
  const endRef = useRef(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);
  const menuRef = useRef(null);
  const latestMessageAtRef = useRef(0);
  const nearBottomRef = useRef(true);
  const typingTimerRef = useRef(null);
  const lastTypingRef = useRef(0);
  const messageNodesRef = useRef(new Map());

  const load = (silent = false, q = messageQuery) => {
    const params = new URLSearchParams({ limit: '50' });
    if (q.trim()) params.set('q', q.trim());
    return api(`/conversations/${id}/messages?${params.toString()}`)
    .then((data) => {
      const incoming = data.messages || [];
      const latestAt = latestMessageAt(incoming);
      const previousLatestAt = latestMessageAtRef.current;
      const isSearch = !!q.trim();
      const receivedWhileReading = silent && !isSearch && previousLatestAt > 0 && latestAt > previousLatestAt && !nearBottomRef.current;
      if (receivedWhileReading) {
        const receivedCount = incoming.filter((message) => message.at > previousLatestAt && message.from !== user.id).length;
        if (receivedCount > 0) setNewMessageCount((count) => count + receivedCount);
      } else if (!silent || nearBottomRef.current || isSearch) {
        setNewMessageCount(0);
      }
      latestMessageAtRef.current = Math.max(previousLatestAt, latestAt);
      setConversation(data.conversation);
      setMessages(incoming);
      setMessagePage(data.page || null);
      setError('');
      if (!silent) api(`/conversations/${id}/read`, { method: 'POST' }).catch(() => {});
    })
    .catch((err) => {
      setError(err.message || t('messages.conversation.notFound'));
      setConversation(false);
    });
  };

  useEffect(() => {
    setConversation(null);
    setMessages([]);
    setNewMessageCount(0);
    latestMessageAtRef.current = 0;
    nearBottomRef.current = true;
    setFailed(null);
    setAttachment(null);
    setAttachmentState('');
    setOtherTyping(false);
    setOtherOnline(false);
    setPreviewImage(null);
    setSelectedMessage(null);
    setMenuOpen(false);
    setReportOpen(false);
    setReportCode('external_payment');
    setReportReason('');
    setMessageQuery('');
    setText(sessionStorage.getItem(`draft:${id}`) || '');
    load();
  }, [id]);

  useEffect(() => {
    const source = new EventSource(realtimeUrl());
    const onUpdate = (event) => {
      const update = JSON.parse(event.data || '{}');
      if (update.conversationId !== id) return;
      if (update.type === 'typing') setOtherTyping(update.userId !== user.id && !!update.active);
      if (update.type === 'presence') setOtherOnline(update.userId !== user.id && !!update.online);
      if (['message', 'message_deleted', 'read'].includes(update.type)) load(true);
    };
    source.addEventListener('update', onUpdate);
    return () => {
      source.removeEventListener('update', onUpdate);
      source.close();
      clearTimeout(typingTimerRef.current);
      api(`/conversations/${id}/typing`, { method: 'POST', body: { active: false } }).catch(() => {});
    };
  }, [id, user.id]);

  useEffect(() => { setSearchIndex(0); }, [messageQuery]);

  useEffect(() => {
    sessionStorage.setItem(`draft:${id}`, text);
  }, [id, text]);

  useEffect(() => {
    const updateOnline = () => setIsOnline(typeof navigator === 'undefined' ? true : navigator.onLine);
    window.addEventListener('online', updateOnline);
    window.addEventListener('offline', updateOnline);
    return () => {
      window.removeEventListener('online', updateOnline);
      window.removeEventListener('offline', updateOnline);
    };
  }, []);

  useEffect(() => {
    if (nearBottom) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    if (nearBottom) setNewMessageCount(0);
  }, [messages.length, nearBottom]);

  useDismissibleMenu(menuOpen, menuRef, () => setMenuOpen(false));

  const conversationOpen = conversation && conversation.status !== 'completed' && conversation.status !== 'archived';
  const canWrite = conversationOpen && isOnline;
  const visibleMessages = useMemo(() => {
    return messages;
  }, [messages]);
  const grouped = useMemo(() => groupMessages(visibleMessages, user.id), [visibleMessages, user.id]);
  const searchMatches = useMemo(() => messageQuery.trim() ? messages.filter((message) => message.text?.toLowerCase().includes(messageQuery.trim().toLowerCase())) : [], [messages, messageQuery]);

  const announceTyping = () => {
    if (!conversationOpen || !isOnline) return;
    const now = Date.now();
    if (now - lastTypingRef.current > 1200) {
      lastTypingRef.current = now;
      api(`/conversations/${id}/typing`, { method: 'POST', body: { active: true } }).catch(() => {});
    }
    clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => api(`/conversations/${id}/typing`, { method: 'POST', body: { active: false } }).catch(() => {}), 1800);
  };

  const goToSearchMatch = (direction) => {
    if (!searchMatches.length) return;
    const next = (searchIndex + direction + searchMatches.length) % searchMatches.length;
    setSearchIndex(next);
    messageNodesRef.current.get(searchMatches[next].id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const loadOlder = async () => {
    if (!messagePage?.hasMore || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const params = new URLSearchParams({ limit: String(messagePage.limit || 50), before: String(messagePage.nextBefore) });
      if (messageQuery.trim()) params.set('q', messageQuery.trim());
      const data = await api(`/conversations/${id}/messages?${params.toString()}`);
      setConversation(data.conversation);
      setMessages((current) => [...(data.messages || []), ...current]);
      setMessagePage(data.page || null);
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (e, retryText = null, retryClientId = null, retryAttachment = null) => {
    e?.preventDefault();
    const bodyText = (retryText || text).trim();
    const outgoingAttachment = retryText ? retryAttachment : attachment;
    if ((!bodyText && !outgoingAttachment) || sending || !canWrite) {
      if (!isOnline) toast.error(t('messages.offline.toast'));
      return;
    }
    const clientId = retryClientId || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic = {
      id: clientId,
      clientId,
      from: user.id,
      text: bodyText,
      type: outgoingAttachment ? 'attachment' : 'text',
      attachments: outgoingAttachment ? [{ ...outgoingAttachment, id: `${clientId}-attachment` }] : [],
      deliveryStatus: 'sending',
      at: Date.now(),
      readBy: [user.id],
    };
    setSending(true);
    setFailed(null);
    if (!retryText) {
      setMessages((current) => [...current, optimistic]);
      setText('');
      setAttachment(null);
      sessionStorage.removeItem(`draft:${id}`);
    }
    try {
      const data = await api(`/conversations/${id}/messages`, {
        method: 'POST',
        body: {
          text: bodyText,
          clientId,
          attachments: outgoingAttachment ? [outgoingAttachment] : [],
        },
      });
      if (data.warning) toast.info(data.warning);
      api(`/conversations/${id}/typing`, { method: 'POST', body: { active: false } }).catch(() => {});
      await load(true);
    } catch (err) {
      setFailed({ text: bodyText, clientId, attachment: outgoingAttachment, message: err.message || t('messages.composer.failed') });
      setMessages((current) => current.map((message) =>
        message.id === clientId ? { ...message, deliveryStatus: 'failed' } : message
      ));
    } finally {
      setSending(false);
    }
  };

  const onThreadScroll = () => {
    const node = threadRef.current;
    if (!node) return;
    const isNearBottom = node.scrollHeight - node.scrollTop - node.clientHeight < 120;
    nearBottomRef.current = isNearBottom;
    setNearBottom(isNearBottom);
    if (isNearBottom) setNewMessageCount(0);
  };

  const jumpToLatest = () => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
    nearBottomRef.current = true;
    setNearBottom(true);
    setNewMessageCount(0);
  };

  const reportConversation = async (e) => {
    e?.preventDefault();
    const comment = reportReason.trim();
    if (!reportCode) {
      toast.error(t('messages.report.empty'));
      return;
    }
    try {
      await api(`/conversations/${id}/report`, {
        method: 'POST',
        body: {
          reasonCode: reportCode,
          reason: comment || t(`messages.report.reason.${reportCode}`),
          comment,
        },
      });
      toast.success(t('messages.report.sent'));
      setReportReason('');
      setReportCode('external_payment');
      setReportOpen(false);
      setMenuOpen(false);
    } catch (err) {
      toast.error(err.message || t('messages.report.failed'));
    }
  };

  const togglePin = async () => {
    try {
      const data = await api(`/conversations/${id}/pin`, { method: 'POST', body: { pinned: !conversation.pinned } });
      setConversation(data.conversation);
      toast.success(data.conversation.pinned ? t('messages.toast.pinned') : t('messages.toast.unpinned'));
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    } finally {
      setMenuOpen(false);
    }
  };

  const toggleArchive = async (archived) => {
    try {
      const data = await api(`/conversations/${id}/archive`, { method: 'POST', body: { archived } });
      setConversation(data.conversation);
      toast.success(archived ? t('messages.toast.archived') : t('messages.toast.restored'));
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    } finally {
      setMenuOpen(false);
    }
  };

  const markUnread = async () => {
    try {
      await api(`/conversations/${id}/unread`, { method: 'POST' });
      toast.success(t('messages.toast.markedUnread'));
    } catch (err) {
      toast.error(err.message || t('messages.error.load'));
    } finally {
      setMenuOpen(false);
    }
  };

  const addAttachment = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('messages.attachment.type'));
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La photo doit faire moins de 10 Mo.');
      return;
    }
    try {
      setAttachmentState('Compression de la photo...');
      const dataUrl = await resizeImage(file);
      setAttachment({ dataUrl, name: file.name, type: 'image' });
      setAttachmentState('Photo optimisee et prete a envoyer');
    } catch {
      toast.error(t('messages.attachment.failed'));
    } finally {
      setTimeout(() => setAttachmentState(''), 1800);
    }
  };

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text || '');
      toast.success('Message copie');
    } catch { toast.error('Copie impossible'); }
    setSelectedMessage(null);
  };

  const deleteMessage = async (message) => {
    try {
      await api(`/conversations/${id}/messages/${message.id}`, { method: 'DELETE' });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      toast.success('Message supprime');
    } catch (err) { toast.error(err.message || 'Suppression impossible'); }
    setSelectedMessage(null);
  };

  if (conversation === null) return <ConversationSkeleton />;
  if (conversation === false) {
    return (
      <div className="conversation-detail">
        <div className="message-state">
          <Icon name="alert" size={30} />
          <b>{t('messages.conversation.notFoundTitle')}</b>
          <p>{error || t('messages.conversation.unavailable')}</p>
          <Link to="/messages" className="btn btn-sm">{t('messages.back')}</Link>
        </div>
      </div>
    );
  }

  const contextText = conversation.context?.label || contextLabel(conversation);
  const price = conversation.operation?.price ?? conversation.trip?.price;
  const currency = conversation.operation?.currency || conversation.trip?.currency || 'EUR';
  const profileLabel = conversation.other?.kycStatus === 'verified' ? t('messages.profile.verified') : t('messages.profile.basic');
  const headerMeta = otherTyping ? 'ecrit...' : otherOnline ? 'En ligne' : [profileLabel, contextText, price ? `${price} ${currency}` : null].filter(Boolean).join(' - ');
  const hasSafetyWarning = messages.some((message) => message.flagged || message.type === 'warning');

  return (
    <div className="conversation-detail">
      <header className="conversation-header">
        <Link to="/messages" className="icon-btn conversation-back" aria-label={t('messages.back')}><Icon name="arrowLeft" size={18} /></Link>
        <Avatar name={conversation.other?.name || t('messages.contact')} photo={conversation.other?.photoUrl} size={44} />
        <div className="grow conversation-title">
          <b>{conversation.other?.name || t('messages.contact')}</b>
          <span>{headerMeta}</span>
        </div>
        <div className="conversation-actions" ref={menuRef}>
          {conversation.actionHref && <Link to={conversation.actionHref} className="btn btn-sm">{conversation.actionLabel || t('messages.action.view')}</Link>}
          <button
            className="icon-btn"
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              setMenuOpen((value) => !value);
            }}
            aria-label={t('messages.action.openMenu')}
            aria-expanded={menuOpen}
          >
            <Icon name="moreVertical" size={17} />
          </button>
          {menuOpen && (
            <div className="conversation-header-menu" role="menu">
              {conversation.other?.id && (
                <Link to={`/membres/${conversation.other.id}`} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Icon name="user" size={15} /> {t('messages.action.viewProfile')}
                </Link>
              )}
              <button type="button" role="menuitem" onClick={() => { setSearchOpen((value) => !value); setMenuOpen(false); }}>
                <Icon name="search" size={15} /> {t('messages.action.searchInConversation')}
              </button>
              {conversation.actionHref && (
                <Link to={conversation.actionHref} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Icon name={conversation.contextType === 'trip' ? 'plane' : 'repeat'} size={15} /> {conversation.contextType === 'trip' ? t('messages.status.trip') : t('messages.status.operation')}
                </Link>
              )}
              <button type="button" role="menuitem" onClick={togglePin}>
                <Icon name="pin" size={15} /> {conversation.pinned ? t('messages.action.unpin') : t('messages.action.pin')}
              </button>
              <button type="button" role="menuitem" onClick={markUnread}>
                <Icon name="mail" size={15} /> {t('messages.action.markUnread')}
              </button>
              <button type="button" role="menuitem" onClick={() => toggleArchive(!conversation.archived)}>
                <Icon name={conversation.archived ? 'eye' : 'eyeOff'} size={15} /> {conversation.archived ? t('messages.action.restore') : t('messages.action.archive')}
              </button>
              <button type="button" role="menuitem" onClick={() => { setReportOpen(true); setMenuOpen(false); }}>
                <Icon name="alert" size={15} /> {t('messages.action.report')}
              </button>
            </div>
          )}
        </div>
      </header>

      {!conversationOpen && (
        <div className="conversation-closed-banner">
          <Icon name="lock" size={15} />
          <span>{conversation.status === 'archived' ? t('messages.closed.archived') : t('messages.closed.completed')}</span>
          {conversation.status === 'archived'
            ? <button type="button" onClick={() => toggleArchive(false)}>{t('messages.action.restore')}</button>
            : conversation.actionHref && <Link to={conversation.actionHref}>{t('messages.action.view')}</Link>}
        </div>
      )}

      {!isOnline && conversationOpen && (
        <div className="conversation-offline-banner">
          <Icon name="info" size={15} />
          <span>{t('messages.offline.banner')}</span>
        </div>
      )}

      {hasSafetyWarning && (
        <div className="conversation-safety-banner">
          <Icon name="shieldCheck" size={16} />
          <span>Pour votre securite, gardez paiement et echanges sur Wigofly.</span>
          <button type="button" onClick={() => setReportOpen(true)}>Signaler</button>
        </div>
      )}

      {reportOpen && (
        <form className="conversation-report-panel" onSubmit={reportConversation}>
          <div>
            <b>{t('messages.report.title')}</b>
            <p>{t('messages.report.body')}</p>
          </div>
          <div className="report-reasons" role="radiogroup" aria-label={t('messages.report.reasonLabel')}>
            {REPORT_REASONS.map((reason) => (
              <button
                type="button"
                key={reason}
                className={reportCode === reason ? 'active' : ''}
                onClick={() => setReportCode(reason)}
                role="radio"
                aria-checked={reportCode === reason}
              >
                {t(`messages.report.reason.${reason}`)}
              </button>
            ))}
          </div>
          <textarea
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value.slice(0, 500))}
            placeholder={t('messages.report.placeholder')}
            rows={3}
            autoFocus
          />
          <div className="report-actions">
            <button type="button" className="btn btn-sm" onClick={() => { setReportOpen(false); setReportReason(''); }}>{t('common.cancel')}</button>
            <button className="btn btn-primary btn-sm" disabled={!reportCode}>{t('messages.action.report')}</button>
          </div>
        </form>
      )}

      {searchOpen && (
        <div className="conversation-search">
          <Icon name="search" size={16} />
          <input value={messageQuery} onChange={(e) => setMessageQuery(e.target.value)} placeholder={t('messages.search.inConversation')} />
          {messageQuery && <span className="search-results-count">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0'}</span>}
          {messageQuery && <button type="button" onClick={() => goToSearchMatch(-1)} aria-label="Resultat precedent"><Icon name="chevronUp" size={14} /></button>}
          {messageQuery && <button type="button" onClick={() => goToSearchMatch(1)} aria-label="Resultat suivant"><Icon name="chevronDown" size={14} /></button>}
          {messageQuery && <button type="button" onClick={() => setMessageQuery('')} aria-label={t('messages.search.clear')}><Icon name="x" size={14} /></button>}
        </div>
      )}

      <main className="message-thread" ref={threadRef} onScroll={onThreadScroll}>
        {messagePage?.hasMore && (
          <button className="load-older-messages" type="button" onClick={loadOlder} disabled={loadingOlder}>
            {loadingOlder ? t('common.loading') : t('messages.loadOlder')}
          </button>
        )}
        {messages.length === 0 && (
          <div className="message-empty">
            <Icon name="chat" size={26} />
            <b>{t('messages.conversation.empty.title')}</b>
            <p>{t('messages.conversation.empty.body')}</p>
            <div className="message-suggestions">
              {suggestions(conversation).map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setText(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </div>
        )}
        {messages.length > 0 && visibleMessages.length === 0 && (
          <div className="message-empty">
            <Icon name="search" size={24} />
            <b>{t('messages.search.noMessage')}</b>
            <p>{t('messages.search.noMessageBody')}</p>
          </div>
        )}

        {grouped.map((item) => (
          item.kind === 'date'
            ? <div className="message-day" key={item.id}>{item.label}</div>
            : <MessageGroup key={item.id} group={item} userId={user.id} conversation={conversation} query={messageQuery} onPreview={setPreviewImage} onSelect={setSelectedMessage} setMessageNode={(messageId, node) => { if (node) messageNodesRef.current.set(messageId, node); }} />
        ))}

        {newMessageCount > 0 && (
          <button className="new-messages-jump" type="button" onClick={jumpToLatest}>
            {t('messages.newMessages', { count: newMessageCount })}
          </button>
        )}
        <div ref={endRef} />
      </main>

      {failed && (
        <div className="message-send-error">
          <Icon name="alert" size={16} />
          <span>{failed.message}</span>
          <button type="button" onClick={(e) => send(e, failed.text, failed.clientId, failed.attachment)}>{t('common.retry')}</button>
        </div>
      )}

      {attachment && (
        <div className="message-attachment-preview">
          <img src={attachment.dataUrl} alt={attachment.name || t('messages.attachment.preview')} />
          <span>{attachment.name || t('messages.attachment.preview')}</span>
          <button type="button" onClick={() => setAttachment(null)} aria-label={t('messages.attachment.remove')}><Icon name="x" size={14} /></button>
        </div>
      )}
      {attachmentState && <div className="attachment-progress"><span className="spinner" />{attachmentState}</div>}

      <form className={`message-compose ${!canWrite ? 'disabled' : ''}`} onSubmit={send}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={addAttachment} />
        <input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden onChange={addAttachment} />
        <button type="button" className="compose-attach" disabled={!canWrite || sending} onClick={() => fileRef.current?.click()} aria-label={t('messages.attachment.add')} title={t('messages.attachment.add')}>
          <Icon name="image" size={18} />
        </button>
        <button type="button" className="compose-attach camera" disabled={!canWrite || sending} onClick={() => cameraRef.current?.click()} aria-label="Prendre une photo" title="Prendre une photo"><Icon name="camera" size={18} /></button>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value.slice(0, 1000)); announceTyping(); }}
          placeholder={conversationOpen ? (isOnline ? t('messages.composer.placeholder') : t('messages.offline.placeholder')) : t('messages.composer.closed')}
          rows={1}
          disabled={!canWrite || sending}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) send(e);
          }}
        />
        <span className="compose-count">{text.length}/1000</span>
        <button className="chat-send" disabled={sending || (!text.trim() && !attachment) || !canWrite} aria-label={t('messages.composer.send')}>
          {sending ? <span className="spinner" /> : <Icon name="send" size={18} />}
        </button>
      </form>
      {previewImage && <ImagePreview image={previewImage} onClose={() => setPreviewImage(null)} />}
      {selectedMessage && <MessageActions message={selectedMessage} mine={selectedMessage.from === user.id} onCopy={copyMessage} onDelete={deleteMessage} onReport={() => { setSelectedMessage(null); setReportOpen(true); }} onClose={() => setSelectedMessage(null)} />}
    </div>
  );
}

function ConversationContext({ conversation }) {
  const icon = conversation.contextType === 'operation' ? 'repeat' : conversation.contextType === 'trip' ? 'plane' : 'chat';
  const href = conversation.actionHref || conversation.context?.href;
  const price = conversation.operation?.price ?? conversation.trip?.price;
  const currency = conversation.operation?.currency || conversation.trip?.currency || 'EUR';
  return (
    <div className={`conversation-context ${conversation.actionRequired ? 'needs-action' : ''}`}>
      <span className="conversation-context-icon"><Icon name={icon} size={17} /></span>
      <div className="grow">
        <b>{conversation.context?.label || contextLabel(conversation)}</b>
        <span>{conversation.actionLabel || conversation.context?.detail || t('messages.context.default')}</span>
      </div>
      {(price || href) && (
        <div className="conversation-context-actions">
          {price ? <strong>{price} {currency}</strong> : null}
          {href && <Link to={href} className="btn btn-sm">{conversation.contextType === 'trip' ? t('messages.status.trip') : t('messages.status.operation')}</Link>}
        </div>
      )}
    </div>
  );
}

function MessageGroup({ group, userId, conversation, query, onPreview, onSelect, setMessageNode }) {
  const mine = group.from === userId;
  if (group.type === 'system') {
    return (
      <div className="message-system">
        <Icon name="info" size={14} />
        <span>{group.messages[0].text}</span>
      </div>
    );
  }
  return (
    <div className={`message-line ${mine ? 'mine' : 'theirs'}`}>
      {!mine && <Avatar name={conversation.other?.name || t('messages.contact')} photo={conversation.other?.photoUrl} size={28} />}
      <div className="message-stack">
        {group.messages.map((message) => (
          <div
            className={`message-bubble ${mine ? 'mine' : ''} ${message.flagged || message.type === 'warning' ? 'flagged' : ''} ${message.deliveryStatus === 'failed' ? 'failed' : ''}`}
            key={message.id}
            ref={(node) => setMessageNode(message.id, node)}
            onContextMenu={(event) => { event.preventDefault(); onSelect(message); }}
            onTouchStart={(event) => {
              const timer = setTimeout(() => onSelect(message), 560);
              event.currentTarget.dataset.longPress = timer;
            }}
            onTouchEnd={(event) => clearTimeout(Number(event.currentTarget.dataset.longPress))}
          >
            {message.attachments?.length > 0 && (
              <div className="message-attachments">
                {message.attachments.map((attachment) => (
                  <button type="button" key={attachment.id || attachment.dataUrl} onClick={() => onPreview(attachment)} aria-label="Agrandir la photo">
                    <img src={attachment.dataUrl} alt={attachment.name || t('messages.attachment.preview')} />
                  </button>
                ))}
              </div>
            )}
            {message.text && <p><HighlightedText text={message.text} query={query} /></p>}
            <span className="message-status"><time>{shortDate(message.at)}</time>{mine && <DeliveryState message={message} />}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightedText({ text, query }) {
  if (!query?.trim()) return text;
  const parts = text.split(new RegExp(`(${escapeRegExp(query.trim())})`, 'ig'));
  return parts.map((part, index) => part.toLowerCase() === query.trim().toLowerCase() ? <mark key={index}>{part}</mark> : part);
}

function DeliveryState({ message }) {
  if (message.deliveryStatus === 'sending') return <Icon name="clock" size={12} />;
  if (message.deliveryStatus === 'failed') return <Icon name="alert" size={12} />;
  const read = (message.readBy || []).length > 1;
  return <Icon name="checkCheck" className={read ? 'is-read' : ''} size={14} />;
}

function ImagePreview({ image, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
    <button type="button" className="icon-btn" aria-label="Fermer" onClick={onClose}><Icon name="x" size={20} /></button>
    <img src={image.dataUrl} alt={image.name || 'Photo jointe'} onClick={(event) => event.stopPropagation()} />
  </div>;
}

function MessageActions({ message, mine, onCopy, onDelete, onReport, onClose }) {
  return <div className="message-actions-sheet" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="message-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onCopy(message)}><Icon name="copy" size={17} />Copier</button>
      <button type="button" onClick={onReport}><Icon name="alert" size={17} />Signaler</button>
      {mine && <button type="button" className="danger" onClick={() => onDelete(message)}><Icon name="trash" size={17} />Supprimer</button>}
      <button type="button" className="cancel" onClick={onClose}>Annuler</button>
    </div>
  </div>;
}

function groupMessages(messages, userId) {
  const output = [];
  let lastDay = '';
  let current = null;
  for (const message of messages) {
    const day = new Date(message.at).toDateString();
    if (day !== lastDay) {
      output.push({ kind: 'date', id: `date-${day}`, label: fullDate(message.at) });
      lastDay = day;
      current = null;
    }
    if (message.type === 'system') {
      output.push({ kind: 'group', id: message.id, type: 'system', from: null, messages: [message] });
      current = null;
      continue;
    }
    const sameAuthor = current && current.from === message.from && current.type !== 'system';
    const closeEnough = current && message.at - current.messages[current.messages.length - 1].at < 5 * 60 * 1000;
    if (!sameAuthor || !closeEnough) {
      current = { kind: 'group', id: `group-${message.id}`, type: 'text', from: message.from, mine: message.from === userId, messages: [] };
      output.push(current);
    }
    current.messages.push(message);
  }
  return output;
}

function latestMessageAt(messages) {
  return messages.reduce((latest, message) => Math.max(latest, Number(message.at || 0)), 0);
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function contextLabel(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.operation) return conversation.operation.title || t('messages.status.operation');
  return t('messages.status.direct');
}

function suggestions(conversation) {
  if (conversation.operation?.operationStatus === 'paiement_requis') return [t('messages.suggest.paid'), t('messages.suggest.confirmHandoff'), t('messages.suggest.place')];
  if (conversation.operation?.operationStatus === 'collecte_prevue') return [t('messages.suggest.meeting'), t('messages.suggest.place'), t('messages.suggest.update')];
  if (conversation.operation?.operationStatus === 'termine') return [];
  if (conversation.operation) return [t('messages.suggest.status'), t('messages.suggest.confirmMeeting'), t('messages.suggest.details')];
  if (conversation.trip) return [t('messages.suggest.tripAvailable'), t('messages.suggest.price'), t('messages.suggest.handoff')];
  return [t('messages.suggest.hello'), t('messages.suggest.question'), t('messages.suggest.thanks')];
}

function fullDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value));
}

function resizeImage(file, maxPx = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
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

function ConversationSkeleton() {
  return (
    <div className="conversation-detail">
      <div className="conversation-header">
        <span className="skeleton avatar-skeleton" />
        <div className="grow">
          <span className="skeleton line-skeleton wide" />
          <span className="skeleton line-skeleton" />
        </div>
      </div>
      <div className="conversation-context">
        <span className="skeleton avatar-skeleton" />
        <div className="grow">
          <span className="skeleton line-skeleton wide" />
          <span className="skeleton line-skeleton" />
        </div>
      </div>
      <main className="message-thread">
        <span className="skeleton bubble-skeleton" />
        <span className="skeleton bubble-skeleton mine" />
        <span className="skeleton bubble-skeleton" />
      </main>
    </div>
  );
}
