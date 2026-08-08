import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../../../api';
import { useAuth } from '../../../app/authContext.jsx';
import { Icon } from '../../../Icons.jsx';
import { t, useLang } from '../../../i18n.js';
import { useToast } from '../../../Toast.jsx';
import { markInboxConversationRead } from './MessagesSimple.jsx';
import { readThreadCache, writeThreadCache } from '../services/messageCache.js';
import { ConversationChrome } from '../components/ConversationChrome.jsx';
import { ConversationComposer } from '../components/ConversationComposer.jsx';
import { ConversationMessages } from '../components/ConversationMessages.jsx';
import { contextLabel } from '../utils/conversationDisplay.js';
import {
  ConversationSkeleton, groupMessages, latestMessageAt, mergeMessages, resizeImage,
  useDismissibleMenu,
} from '../components/ConversationThread.jsx';

const threadCacheByKey = new Map();
const THREAD_CACHE_MS = 15_000;

function threadCacheKey(userId, conversationId) {
  return `${userId || 'anonymous'}:${conversationId}`;
}

function draftSafety(text) {
  const value = String(text || '');
  const normalized = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const categories = [];
  if (/[\w.+-]+@[\w-]+\.[a-z]{2,}/i.test(value)) categories.push('email');
  if (/(?:https?:\/\/|www\.|\.(?:com|net|org|io|me)\b)/i.test(value)) categories.push('link');
  if (/@[a-z0-9_.]{3,}/i.test(value)) categories.push('social');
  if (/\+?\d(?:[\s().-]*\d){7,}/.test(value)) categories.push('phone');
  if (/(\bwhats?app\b|\btelegram\b|\bsignal\b|\binstagram\b|\binsta\b|\bfacebook\b|\bsnapchat\b|\bpaypal\b|\brevolut\b|\bwise\b|\bwestern union\b|\bmoneygram\b|\bbitcoin\b|\bcrypto\b|\bvirement\b|\bbank transfer\b|\btransferencia\b|\buberweisung\b|واتساب|تلغرام|رقم الهاتف|تحويل بنكي|بايبال)/i.test(normalized)) categories.push('outside');
  return [...new Set(categories)];
}

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
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [locationSheet, setLocationSheet] = useState(null);
  const [locationDraft, setLocationDraft] = useState(null);
  const [locationBusy, setLocationBusy] = useState(false);
  const [locationError, setLocationError] = useState('');
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
  const attachmentMenuRef = useRef(null);
  const menuRef = useRef(null);
  const latestMessageAtRef = useRef(0);
  const nearBottomRef = useRef(true);
  const typingTimerRef = useRef(null);
  const lastTypingRef = useRef(0);
  const messageNodesRef = useRef(new Map());
  const realtimeConnectedRef = useRef(false);

  const cacheThread = (value) => {
    threadCacheByKey.set(threadCacheKey(user.id, id), value);
    writeThreadCache(user.id, id, value);
  };

  const markConversationRead = () => api(`/conversations/${id}/read`, { method: 'POST' })
    .then((read) => {
      markInboxConversationRead(user.id, id, read.conversation);
      setConversation((current) => current?.id === id
        ? { ...current, ...read.conversation, unread: 0, unreadCount: 0 }
        : current);
    })
    .catch(() => {});

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
      setOtherOnline(!!data.conversation?.otherOnline);
      setMessages(incoming);
      setMessagePage(data.page || null);
      cacheThread({
        conversation: data.conversation,
        messages: incoming,
        page: data.page || null,
        latestAt: latestMessageAtRef.current,
        at: Date.now(),
      });
      setError('');
      if (!silent) void markConversationRead();
    })
    .catch((err) => {
      setError(err.message || t('messages.conversation.notFound'));
      setConversation(false);
    });
  };

  const loadNewer = async () => {
    const latestAt = latestMessageAtRef.current;
    if (!latestAt) return load(true);
    try {
      const params = new URLSearchParams({
        limit: '50',
        after: String(Math.max(0, latestAt - 1)),
      });
      const data = await api(`/conversations/${id}/messages?${params.toString()}`);
      const incoming = data.messages || [];
      const receivedCount = incoming.filter((message) =>
        message.at > latestAt && message.from !== user.id
      ).length;
      const nextLatestAt = Math.max(latestAt, latestMessageAt(incoming));
      latestMessageAtRef.current = nextLatestAt;
      setConversation(data.conversation);
      setOtherOnline(!!data.conversation?.otherOnline);
      setMessages((current) => {
        const merged = mergeMessages(current, incoming);
        cacheThread({
          conversation: data.conversation,
          messages: merged,
          page: messagePage,
          latestAt: nextLatestAt,
          at: Date.now(),
        });
        return merged;
      });
      if (receivedCount > 0 && !nearBottomRef.current) {
        setNewMessageCount((count) => count + receivedCount);
      }
      setError('');
    } catch {
      if (!realtimeConnectedRef.current) void load(true);
    }
  };

  useEffect(() => {
    const cached = threadCacheByKey.get(threadCacheKey(user.id, id));
    setConversation(null);
    setMessages([]);
    setMessagePage(null);
    setNewMessageCount(0);
    latestMessageAtRef.current = 0;
    nearBottomRef.current = true;
    setFailed(null);
    setAttachment(null);
    setAttachmentState('');
    setAttachmentMenuOpen(false);
    setLocationSheet(null);
    setLocationDraft(null);
    setLocationBusy(false);
    setLocationError('');
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
    const restoreCache = (stored) => {
      if (!stored) return false;
      threadCacheByKey.set(threadCacheKey(user.id, id), stored);
      setConversation(stored.conversation);
      setMessages(stored.messages || []);
      setMessagePage(stored.page);
      latestMessageAtRef.current = stored.latestAt || latestMessageAt(stored.messages || []);
      setOtherOnline(!!stored.conversation?.otherOnline);
      if (Date.now() - stored.at < THREAD_CACHE_MS) {
        void markConversationRead();
        return true;
      }
      return false;
    };
    if (cached) {
      if (restoreCache(cached)) return;
      load();
      return;
    }
    let cancelled = false;
    void readThreadCache(user.id, id).then((stored) => {
      if (cancelled) return;
      if (!restoreCache(stored)) void load();
    });
    return () => { cancelled = true; };
  }, [id]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!realtimeConnectedRef.current && document.visibilityState === 'visible') {
        loadNewer();
      }
    }, 4_000);
    return () => {
      clearInterval(interval);
      clearTimeout(typingTimerRef.current);
      api(`/conversations/${id}/typing`, { method: 'POST', body: { active: false } }).catch(() => {});
    };
  }, [id, user.id]);

  useEffect(() => {
    let unsubscribe = () => {};
    let cancelled = false;
    void import('../services/realtime.js')
      .then(({ subscribeToMessageUpdates }) => subscribeToMessageUpdates(
        user.id,
        (update) => {
          if (update.conversationId !== id || document.visibilityState !== 'visible') return;
          if (update.type === 'message_deleted' && update.messageId) {
            setMessages((current) => current.filter((message) => message.id !== update.messageId));
            return;
          }
          if (update.type === 'typing' && update.userId !== user.id) {
            setOtherTyping(!!update.active);
            return;
          }
          void loadNewer();
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
  }, [id, user.id]);

  useEffect(() => {
    const refreshVisibleThread = () => {
      if (document.visibilityState === 'visible') void loadNewer();
    };
    document.addEventListener('visibilitychange', refreshVisibleThread);
    window.addEventListener('focus', refreshVisibleThread);
    return () => {
      document.removeEventListener('visibilitychange', refreshVisibleThread);
      window.removeEventListener('focus', refreshVisibleThread);
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
  useDismissibleMenu(attachmentMenuOpen, attachmentMenuRef, () => setAttachmentMenuOpen(false));

  const conversationOpen = conversation && conversation.status !== 'completed' && conversation.status !== 'archived';
  const unsafeDraftCategories = useMemo(() => draftSafety(text), [text]);
  const canWrite = conversationOpen && isOnline && !conversation.blocked && !conversation.blockedByOther;
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

  const send = async (e, retryText = null, retryClientId = null, retryAttachment = null, retryLocation = null) => {
    e?.preventDefault();
    const isRetry = retryClientId !== null;
    const bodyText = String(isRetry ? retryText : text).trim();
    const outgoingAttachment = isRetry ? retryAttachment : attachment;
    const outgoingLocation = isRetry ? retryLocation : locationDraft;
    if ((!bodyText && !outgoingAttachment && !outgoingLocation) || sending || !canWrite) {
      if (!isOnline) toast.error(t('messages.offline.toast'));
      if (unsafeDraftCategories.length) toast.error(t('messages.safety.removeUnsafe'));
      if (conversation?.blocked || conversation?.blockedByOther) toast.error(t('messages.blocked.toast'));
      return;
    }
    if (!retryText && unsafeDraftCategories.length) {
      toast.error(t('messages.safety.keepInside'));
      return;
    }
    const clientId = retryClientId || `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const optimistic = {
      id: clientId,
      clientId,
      from: user.id,
      text: bodyText,
      type: outgoingLocation ? 'location' : outgoingAttachment ? 'attachment' : 'text',
      attachments: outgoingAttachment ? [{ ...outgoingAttachment, id: `${clientId}-attachment` }] : [],
      location: outgoingLocation,
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
      setLocationDraft(null);
      sessionStorage.removeItem(`draft:${id}`);
    }
    try {
      const serverAttachment = outgoingAttachment
        ? await uploadMessageAttachment(id, outgoingAttachment)
        : null;
      const data = await api(`/conversations/${id}/messages`, {
        method: 'POST',
        body: {
          text: bodyText,
          clientId,
          attachments: serverAttachment ? [serverAttachment] : [],
          location: outgoingLocation,
        },
      });
      if (data.warningKey || data.warning) toast.info(data.warningKey ? t(data.warningKey) : data.warning);
      api(`/conversations/${id}/typing`, { method: 'POST', body: { active: false } }).catch(() => {});
      const delivered = data.message;
      const nextLatestAt = Math.max(latestMessageAtRef.current, delivered?.at || 0);
      latestMessageAtRef.current = nextLatestAt;
      setConversation(data.conversation);
      setMessages((current) => {
        const withoutOptimistic = current.filter((message) =>
          message.id !== clientId && message.clientId !== clientId
        );
        const merged = mergeMessages(withoutOptimistic, delivered ? [delivered] : []);
        cacheThread({
          conversation: data.conversation,
          messages: merged,
          page: messagePage,
          latestAt: nextLatestAt,
          at: Date.now(),
        });
        return merged;
      });
    } catch (err) {
      if (err.data?.code === 'message_safety_blocked' || err.data?.code === 'message_safety_cooldown') {
        setMessages((current) => current.filter((message) => message.id !== clientId));
        if (!retryText) setText(bodyText);
        toast.error(err.message || t('messages.safety.blocked'));
        return;
      }
      setFailed({ text: bodyText, clientId, attachment: outgoingAttachment, location: outgoingLocation, message: err.message || t('messages.composer.failed') });
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

  const toggleBlock = async () => {
    const nextBlocked = !conversation.blocked;
    if (nextBlocked && !window.confirm(t('messages.block.confirm'))) return;
    try {
      const data = await api(`/conversations/${id}/block`, { method: 'POST', body: { blocked: nextBlocked } });
      setConversation(data.conversation);
      toast.success(nextBlocked ? t('messages.toast.blocked') : t('messages.toast.unblocked'));
    } catch (err) {
      toast.error(err.message || t('common.action.error'));
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
      toast.error(t('messages.attachment.size'));
      return;
    }
    try {
      setAttachmentState('messages.attachment.compressing');
      const dataUrl = await resizeImage(file);
      setAttachment({ dataUrl, name: file.name, type: 'image' });
      setLocationDraft(null);
      setAttachmentMenuOpen(false);
      setAttachmentState('messages.attachment.ready');
    } catch {
      toast.error(t('messages.attachment.failed'));
    } finally {
      setTimeout(() => setAttachmentState(''), 1800);
    }
  };

  const openLocationSheet = () => {
    setAttachmentMenuOpen(false);
    setLocationError('');
    setLocationSheet('choice');
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('messages.location.unavailable');
      return;
    }
    setLocationBusy(true);
    setLocationError('');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocationDraft({
          kind: 'current', label: '', city: '', latitude: position.coords.latitude,
          longitude: position.coords.longitude, accuracy: position.coords.accuracy, expiresInMinutes: 120,
        });
        setLocationBusy(false);
        setLocationSheet('confirm');
      },
      () => {
        setLocationBusy(false);
        setLocationError('messages.location.denied');
      },
      { enableHighAccuracy: false, timeout: 12_000, maximumAge: 60_000 }
    );
  };

  const useMeetingPlace = () => {
    setLocationDraft({ kind: 'place', label: '', city: '', expiresInMinutes: 120 });
    setLocationError('');
    setLocationSheet('confirm');
  };

  const copyMessage = async (message) => {
    try {
      await navigator.clipboard.writeText(message.text || '');
      toast.success(t('messages.toast.copied'));
    } catch { toast.error(t('messages.toast.copyFailed')); }
    setSelectedMessage(null);
  };

  const deleteMessage = async (message) => {
    try {
      await api(`/conversations/${id}/messages/${message.id}`, { method: 'DELETE' });
      setMessages((current) => current.filter((item) => item.id !== message.id));
      toast.success(t('messages.toast.messageDeleted'));
    } catch (err) { toast.error(err.message || t('messages.toast.deleteFailed')); }
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

  const contextText = contextLabel(conversation);
  const price = conversation.operation?.price ?? conversation.trip?.price;
  const currency = conversation.operation?.currency || conversation.trip?.currency || 'EUR';
  const profileLabel = conversation.other?.kycStatus === 'verified' ? t('messages.profile.verified') : t('messages.profile.basic');
  const seenRecently = conversation.otherLastSeenAt && Date.now() - conversation.otherLastSeenAt < 24 * 60 * 60 * 1000;
  const headerMeta = otherTyping ? t('messages.presence.typing') : otherOnline ? t('messages.presence.online') : seenRecently ? t('messages.presence.recent') : [profileLabel, contextText, price ? `${price} ${currency}` : null].filter(Boolean).join(' - ');
  const hasSafetyWarning = messages.some((message) => message.flagged || message.type === 'warning');
  const profileHref = conversation.other?.id ? `/membres/${conversation.other.id}` : null;

  return (
    <div className="conversation-detail">
      <ConversationChrome
        conversation={conversation}
        profileHref={profileHref}
        headerMeta={headerMeta}
        menuRef={menuRef}
        menuOpen={menuOpen}
        setMenuOpen={setMenuOpen}
        searchOpen={searchOpen}
        setSearchOpen={setSearchOpen}
        reportOpen={reportOpen}
        setReportOpen={setReportOpen}
        reportCode={reportCode}
        setReportCode={setReportCode}
        reportReason={reportReason}
        setReportReason={setReportReason}
        reportConversation={reportConversation}
        toggleArchive={toggleArchive}
        toggleBlock={toggleBlock}
        conversationOpen={conversationOpen}
        isOnline={isOnline}
        hasSafetyWarning={hasSafetyWarning}
        messageQuery={messageQuery}
        setMessageQuery={setMessageQuery}
        searchMatches={searchMatches}
        searchIndex={searchIndex}
        goToSearchMatch={goToSearchMatch}
      />
      <ConversationMessages
        threadRef={threadRef}
        onThreadScroll={onThreadScroll}
        messagePage={messagePage}
        loadOlder={loadOlder}
        loadingOlder={loadingOlder}
        messages={messages}
        visibleMessages={visibleMessages}
        conversation={conversation}
        setText={setText}
        grouped={grouped}
        userId={user.id}
        messageQuery={messageQuery}
        setPreviewImage={setPreviewImage}
        setSelectedMessage={setSelectedMessage}
        messageNodesRef={messageNodesRef}
        newMessageCount={newMessageCount}
        jumpToLatest={jumpToLatest}
        endRef={endRef}
      />
      <ConversationComposer
        failed={failed}
        send={send}
        attachment={attachment}
        setAttachment={setAttachment}
        attachmentState={attachmentState}
        locationDraft={locationDraft}
        setLocationDraft={setLocationDraft}
        setLocationSheet={setLocationSheet}
        unsafeDraftCategories={unsafeDraftCategories}
        canWrite={canWrite}
        fileRef={fileRef}
        cameraRef={cameraRef}
        addAttachment={addAttachment}
        attachmentMenuRef={attachmentMenuRef}
        attachmentMenuOpen={attachmentMenuOpen}
        setAttachmentMenuOpen={setAttachmentMenuOpen}
        sending={sending}
        openLocationSheet={openLocationSheet}
        text={text}
        setText={setText}
        announceTyping={announceTyping}
        conversationOpen={conversationOpen}
        isOnline={isOnline}
        locationSheet={locationSheet}
        locationBusy={locationBusy}
        locationError={locationError}
        setLocationError={setLocationError}
        useCurrentLocation={useCurrentLocation}
        useMeetingPlace={useMeetingPlace}
        previewImage={previewImage}
        setPreviewImage={setPreviewImage}
        selectedMessage={selectedMessage}
        userId={user.id}
        copyMessage={copyMessage}
        deleteMessage={deleteMessage}
        setSelectedMessage={setSelectedMessage}
        setReportOpen={setReportOpen}
      />
    </div>
  );
}

async function uploadMessageAttachment(conversationId, attachment) {
  if (!attachment?.dataUrl) return attachment;
  const blob = await fetch(attachment.dataUrl).then((response) => response.blob());
  const data = await api(`/conversations/${conversationId}/attachments/upload`, {
    method: 'POST',
    body: {
      mime: blob.type || 'image/jpeg',
      name: attachment.name,
      size: blob.size,
    },
  });
  const upload = data.upload;
  if (!upload?.signedUrl || !upload?.storagePath || !upload?.attachmentId) {
    throw new Error(t('messages.attachment.failed'));
  }
  const form = new FormData();
  form.append('cacheControl', '86400');
  form.append('', blob);
  const response = await fetch(upload.signedUrl, {
    method: 'PUT',
    body: form,
  });
  if (!response.ok) throw new Error(t('messages.attachment.failed'));
  return {
    id: upload.attachmentId,
    type: 'image',
    name: String(attachment.name || 'image').slice(0, 80),
    mime: upload.mime,
    size: blob.size,
    storagePath: upload.storagePath,
  };
}
