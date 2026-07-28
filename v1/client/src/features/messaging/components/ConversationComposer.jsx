import { Icon } from '../../../Icons.jsx';
import { t } from '../../../i18n.js';
import { ImagePreview, LocationShareSheet, MessageActions } from './ConversationThread.jsx';

export function ConversationComposer({
  failed,
  send,
  attachment,
  setAttachment,
  attachmentState,
  locationDraft,
  setLocationDraft,
  setLocationSheet,
  unsafeDraftCategories,
  canWrite,
  fileRef,
  cameraRef,
  addAttachment,
  attachmentMenuRef,
  attachmentMenuOpen,
  setAttachmentMenuOpen,
  sending,
  openLocationSheet,
  text,
  setText,
  announceTyping,
  conversationOpen,
  isOnline,
  locationSheet,
  locationBusy,
  locationError,
  setLocationError,
  useCurrentLocation,
  useMeetingPlace,
  previewImage,
  setPreviewImage,
  selectedMessage,
  userId,
  copyMessage,
  deleteMessage,
  setSelectedMessage,
  setReportOpen,
}) {
  return (
    <>
      {failed && (
        <div className="message-send-error">
          <Icon name="alert" size={16} />
          <span>{failed.message}</span>
          <button type="button" onClick={(event) => send(event, failed.text, failed.clientId, failed.attachment, failed.location)}>
            {t('common.retry')}
          </button>
        </div>
      )}

      {attachment && (
        <div className="message-attachment-preview">
          <img src={attachment.dataUrl} alt={attachment.name || t('messages.attachment.preview')} />
          <span>{attachment.name || t('messages.attachment.preview')}</span>
          <button type="button" onClick={() => setAttachment(null)} aria-label={t('messages.attachment.remove')}>
            <Icon name="x" size={14} />
          </button>
        </div>
      )}
      {attachmentState && <div className="attachment-progress"><span className="spinner" />{t(attachmentState)}</div>}

      {locationDraft && (
        <div className="message-location-preview">
          <Icon name="mapPin" size={20} />
          <div>
            <b>{locationDraft.label || t(locationDraft.kind === 'current' ? 'messages.location.current' : 'messages.location.meeting')}</b>
            <span>{locationDraft.kind === 'current' ? t('messages.location.secure') : locationDraft.city || t('messages.location.addCity')}</span>
          </div>
          <button type="button" onClick={() => setLocationSheet('confirm')} aria-label={t('messages.location.edit')}><Icon name="pencil" size={14} /></button>
          <button type="button" onClick={() => setLocationDraft(null)} aria-label={t('messages.location.remove')}><Icon name="x" size={14} /></button>
        </div>
      )}

      {unsafeDraftCategories.length > 0 && (
        <div className="message-safety-draft" role="alert">
          <Icon name="shieldCheck" size={16} />
          <span>{t('messages.safety.draft', { items: unsafeDraftCategories.map((category) => t(`messages.safety.category.${category}`)).join(', ') })}</span>
        </div>
      )}

      <div className="message-privacy-note"><Icon name="shieldCheck" size={14} />{t('messages.safety.note')}</div>

      <form className={`message-compose ${!canWrite ? 'disabled' : ''}`} onSubmit={send}>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={addAttachment} />
        <input ref={cameraRef} type="file" accept="image/png,image/jpeg,image/webp" capture="environment" hidden onChange={addAttachment} />
        <div className="compose-attachments" ref={attachmentMenuRef}>
          <button
            type="button"
            className="compose-attach"
            disabled={!canWrite || sending}
            onClick={() => setAttachmentMenuOpen((value) => !value)}
            aria-label={t('messages.attachment.addMenu')}
            title={t('messages.attachment.addMenu')}
            aria-expanded={attachmentMenuOpen}
          >
            <Icon name="plus" size={19} />
          </button>
          {attachmentMenuOpen && (
            <div className="compose-attachment-menu" role="menu">
              <button type="button" role="menuitem" onClick={() => cameraRef.current?.click()}><Icon name="camera" size={18} /><span>{t('messages.attachment.camera')}</span></button>
              <button type="button" role="menuitem" onClick={() => fileRef.current?.click()}><Icon name="image" size={18} /><span>{t('messages.attachment.gallery')}</span></button>
              <button type="button" role="menuitem" onClick={openLocationSheet}><Icon name="mapPin" size={18} /><span>{t('messages.attachment.location')}</span></button>
            </div>
          )}
        </div>
        <textarea
          className={unsafeDraftCategories.length ? 'message-compose-unsafe' : ''}
          value={text}
          onChange={(event) => { setText(event.target.value.slice(0, 1000)); announceTyping(); }}
          placeholder={conversationOpen ? (isOnline ? t('messages.composer.placeholder') : t('messages.offline.placeholder')) : t('messages.composer.closed')}
          rows={1}
          disabled={!canWrite || sending}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && window.matchMedia('(pointer: fine)').matches) send(event);
          }}
        />
        <span className="compose-count">{text.length}/1000</span>
        <button className="chat-send" disabled={sending || (!text.trim() && !attachment && !locationDraft) || !canWrite} aria-label={t('messages.composer.send')}>
          {sending ? <span className="spinner" /> : <Icon name="send" size={18} />}
        </button>
      </form>

      {locationSheet && (
        <LocationShareSheet
          step={locationSheet}
          draft={locationDraft}
          busy={locationBusy}
          error={locationError}
          onClose={() => { setLocationSheet(null); setLocationError(''); }}
          onCurrent={useCurrentLocation}
          onPlace={useMeetingPlace}
          onChange={setLocationDraft}
          onConfirm={() => {
            if (locationDraft?.kind === 'place' && !locationDraft.label.trim() && !locationDraft.city.trim()) {
              setLocationError('messages.location.required');
              return;
            }
            setAttachment(null);
            setLocationSheet(null);
            setLocationError('');
          }}
        />
      )}
      {previewImage && <ImagePreview image={previewImage} onClose={() => setPreviewImage(null)} />}
      {selectedMessage && (
        <MessageActions
          message={selectedMessage}
          mine={selectedMessage.from === userId}
          onCopy={copyMessage}
          onDelete={deleteMessage}
          onReport={() => { setSelectedMessage(null); setReportOpen(true); }}
          onClose={() => setSelectedMessage(null)}
        />
      )}
    </>
  );
}
