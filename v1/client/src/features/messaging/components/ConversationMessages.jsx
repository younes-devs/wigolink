import { Icon } from '../../../Icons.jsx';
import { t } from '../../../i18n.js';
import { MessageGroup, suggestions } from './ConversationThread.jsx';

export function ConversationMessages({
  threadRef,
  onThreadScroll,
  messagePage,
  loadOlder,
  loadingOlder,
  messages,
  visibleMessages,
  conversation,
  setText,
  grouped,
  userId,
  messageQuery,
  setPreviewImage,
  setSelectedMessage,
  messageNodesRef,
  newMessageCount,
  jumpToLatest,
  endRef,
}) {
  return (
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
          : (
            <MessageGroup
              key={item.id}
              group={item}
              userId={userId}
              conversation={conversation}
              query={messageQuery}
              onPreview={setPreviewImage}
              onSelect={setSelectedMessage}
              setMessageNode={(messageId, node) => {
                if (node) messageNodesRef.current.set(messageId, node);
              }}
            />
          )
      ))}

      {newMessageCount > 0 && (
        <button className="new-messages-jump" type="button" onClick={jumpToLatest}>
          {t('messages.newMessages', { count: newMessageCount })}
        </button>
      )}
      <div ref={endRef} />
    </main>
  );
}
