import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiBlob } from '../../../api';
import { Avatar, Icon } from '../../../Icons.jsx';
import { dateLocale, t } from '../../../i18n.js';
import { shortDate } from '../pages/MessagesSimple.jsx';

export function ConversationContext({ conversation }) {
  const icon = conversation.contextType === 'operation' ? 'repeat' : conversation.contextType === 'trip' ? 'plane' : 'chat';
  const href = conversation.actionHref || conversation.context?.href;
  const price = conversation.operation?.price ?? conversation.trip?.price;
  const currency = conversation.operation?.currency || conversation.trip?.currency || 'EUR';
  return (
    <div className={`conversation-context ${conversation.actionRequired ? 'needs-action' : ''}`}>
      <span className="conversation-context-icon"><Icon name={icon} size={17} /></span>
      <div className="grow">
        <b>{conversation.context?.labelKey ? t(conversation.context.labelKey) : conversation.context?.label || contextLabel(conversation)}</b>
        <span>{conversation.actionKey ? t(conversation.actionKey) : conversation.actionLabel || conversation.context?.detail || t('messages.context.default')}</span>
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

export function MessageGroup({ group, userId, conversation, query, onPreview, onSelect, setMessageNode }) {
  const mine = group.from === userId;
  if (group.type === 'system') {
    return (
      <div className="message-system">
        <Icon name="info" size={14} />
        <span>{group.messages[0].textKey ? t(group.messages[0].textKey) : group.messages[0].text}</span>
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
                  <AuthenticatedMessageImage
                    key={attachment.id || attachment.url || attachment.dataUrl}
                    attachment={attachment}
                    onPreview={onPreview}
                  />
                ))}
              </div>
            )}
            {message.location && <LocationMessage location={message.location} />}
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

function AuthenticatedMessageImage({ attachment, onPreview }) {
  const [objectUrl, setObjectUrl] = useState(null);
  const source = attachment.dataUrl || objectUrl;

  useEffect(() => {
    if (!attachment.url) return undefined;
    let cancelled = false;
    let createdUrl = null;
    void apiBlob(attachment.url)
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setObjectUrl(createdUrl);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL(createdUrl);
    };
  }, [attachment.url]);

  return (
    <button
      type="button"
      onClick={() => source && onPreview({ ...attachment, objectUrl: source })}
      aria-label={t('messages.attachment.enlarge')}
      disabled={!source}
    >
      {source
        ? <img src={source} alt={attachment.name || t('messages.attachment.preview')} loading="lazy" decoding="async" />
        : <span className="spinner" />}
    </button>
  );
}

export function ImagePreview({ image, onClose }) {
  useEffect(() => {
    const close = (event) => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);
  return <div className="image-lightbox" role="dialog" aria-modal="true" onClick={onClose}>
    <button type="button" className="icon-btn" aria-label={t('common.close')} onClick={onClose}><Icon name="x" size={20} /></button>
    <img src={image.objectUrl || image.dataUrl} alt={image.name || t('messages.attachment.preview')} onClick={(event) => event.stopPropagation()} />
  </div>;
}

export function LocationShareSheet({ step, draft, busy, error, onClose, onCurrent, onPlace, onChange, onConfirm }) {
  const current = draft?.kind === 'current';
  return (
    <div className="location-sheet-backdrop" role="presentation" onClick={onClose}>
      <section className="location-sheet" role="dialog" aria-modal="true" aria-label={t('messages.location.share')} onClick={(event) => event.stopPropagation()}>
        <div className="location-sheet-head">
          <div><b>{t('messages.location.share')}</b><span>{t('messages.location.control')}</span></div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('common.close')}><Icon name="x" size={18} /></button>
        </div>
        {step === 'choice' ? (
          <div className="location-choices">
            <button type="button" onClick={onCurrent} disabled={busy}>
              <span className="location-choice-icon"><Icon name="mapPin" size={21} /></span>
              <span><b>{busy ? t('messages.location.searching') : t('messages.location.myCurrent')}</b><small>{t('messages.location.currentHint')}</small></span>
            </button>
            <button type="button" onClick={onPlace} disabled={busy}>
              <span className="location-choice-icon"><Icon name="search" size={21} /></span>
              <span><b>{t('messages.location.meeting')}</b><small>{t('messages.location.meetingHint')}</small></span>
            </button>
          </div>
        ) : (
          <div className="location-confirm">
            <div className="location-privacy"><Icon name="shieldCheck" size={17} /><span>{t(current ? 'messages.location.approximateHint' : 'messages.location.expiryHint')}</span></div>
            {!current && (
              <>
                <label>{t('messages.location.placeName')}<input value={draft?.label || ''} onChange={(event) => onChange({ ...draft, label: event.target.value.slice(0, 120) })} placeholder={t('messages.location.placePlaceholder')} autoFocus /></label>
                <label>{t('messages.location.city')}<input value={draft?.city || ''} onChange={(event) => onChange({ ...draft, city: event.target.value.slice(0, 80) })} placeholder={t('messages.location.cityPlaceholder')} /></label>
              </>
            )}
            {current && <div className="location-current-summary"><Icon name="mapPin" size={20} /><span>{t('messages.location.ready')}</span></div>}
            <label>{t('messages.location.duration')}<select value={draft?.expiresInMinutes || 120} onChange={(event) => onChange({ ...draft, expiresInMinutes: Number(event.target.value) })}><option value={30}>{t('messages.location.30min')}</option><option value={120}>{t('messages.location.2hours')}</option></select></label>
            <button type="button" className="btn btn-primary location-confirm-button" onClick={onConfirm}>{t('messages.location.add')}</button>
          </div>
        )}
        {error && <p className="location-error"><Icon name="alert" size={15} />{t(error)}</p>}
      </section>
    </div>
  );
}

function LocationMessage({ location }) {
  const expired = location.expiresAt && Number(location.expiresAt) <= Date.now();
  const query = location.latitude !== null && location.longitude !== null
    ? `${location.latitude},${location.longitude}`
    : [location.label, location.city].filter(Boolean).join(', ');
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
  return (
    <div className={`location-message ${expired ? 'expired' : ''}`}>
      <div className="location-message-icon"><Icon name="mapPin" size={19} /></div>
      <div>
        <b>{expired ? t('messages.location.expired') : location.labelKey ? t(location.labelKey) : location.label || t('messages.location.shared')}</b>
        <span>{expired ? t('messages.location.expired.sub') : location.city || t(location.precision === 'approximate' ? 'messages.location.approximate' : 'messages.location.meetingPosition')}</span>
        {!expired && <a href={mapUrl} target="_blank" rel="noreferrer">{t('messages.location.directions')}</a>}
      </div>
      {!expired && location.precision === 'approximate' && <small>{t('messages.location.approx')}</small>}
    </div>
  );
}

export function MessageActions({ message, mine, onCopy, onDelete, onReport, onClose }) {
  return <div className="message-actions-sheet" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="message-actions" onClick={(event) => event.stopPropagation()}>
      <button type="button" onClick={() => onCopy(message)}><Icon name="copy" size={17} />{t('messages.action.copy')}</button>
      <button type="button" onClick={onReport}><Icon name="alert" size={17} />{t('messages.action.report')}</button>
      {mine && <button type="button" className="danger" onClick={() => onDelete(message)}><Icon name="trash" size={17} />{t('messages.action.delete')}</button>}
      <button type="button" className="cancel" onClick={onClose}>{t('common.cancel')}</button>
    </div>
  </div>;
}

export function groupMessages(messages, userId) {
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

export function latestMessageAt(messages) {
  return messages.reduce((latest, message) => Math.max(latest, Number(message.at || 0)), 0);
}

export function mergeMessages(current, incoming) {
  const merged = [];
  for (const message of [...current, ...incoming]) {
    const index = merged.findIndex((existing) =>
      existing.id === message.id
      || (message.clientId && existing.clientId === message.clientId)
    );
    if (index >= 0) merged[index] = message;
    else merged.push(message);
  }
  return merged.sort((a, b) => Number(a.at || 0) - Number(b.at || 0));
}

function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function contextLabel(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.operation) return conversation.operation.title || t('messages.status.operation');
  return t('messages.status.direct');
}

export function suggestions(conversation) {
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

export function resizeImage(file, maxPx = 900) {
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

export function useDismissibleMenu(open, ref, onClose) {
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

export function ConversationSkeleton() {
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
