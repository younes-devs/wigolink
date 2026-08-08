import { Link } from 'react-router-dom';
import { Avatar, Icon } from '../../../Icons.jsx';
import { t } from '../../../i18n.js';

const REPORT_REASONS = ['external_payment', 'abuse', 'suspicious', 'off_platform', 'other'];

export function ConversationChrome({
  conversation,
  profileHref,
  headerMeta,
  menuRef,
  menuOpen,
  setMenuOpen,
  searchOpen,
  setSearchOpen,
  reportOpen,
  setReportOpen,
  reportCode,
  setReportCode,
  reportReason,
  setReportReason,
  reportConversation,
  toggleArchive,
  toggleBlock,
  conversationOpen,
  isOnline,
  hasSafetyWarning,
  messageQuery,
  setMessageQuery,
  searchMatches,
  searchIndex,
  goToSearchMatch,
}) {
  const contact = (
    <>
      <Avatar name={conversation.other?.name || t('messages.contact')} photo={conversation.other?.photoUrl} size={44} />
      <div className="grow conversation-title">
        <b>{conversation.other?.name || t('messages.contact')}</b>
        <span>{headerMeta}</span>
      </div>
    </>
  );

  return (
    <>
      <header className="conversation-header">
        <Link to="/messages" className="icon-btn conversation-back" aria-label={t('messages.back')}>
          <Icon name="arrowLeft" size={18} />
        </Link>
        {profileHref ? (
          <Link to={profileHref} className="conversation-contact" aria-label={t('messages.action.viewProfile')}>
            {contact}
          </Link>
        ) : (
          <div className="conversation-contact">{contact}</div>
        )}
        <div className="conversation-actions" ref={menuRef}>
          {conversation.actionHref && (
            <Link to={conversation.actionHref} className="btn btn-sm">
              {conversation.actionKey ? t(conversation.actionKey) : conversation.actionLabel || t('messages.action.view')}
            </Link>
          )}
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
              <button type="button" role="menuitem" onClick={() => { setSearchOpen((value) => !value); setMenuOpen(false); }}>
                <Icon name="search" size={15} /> {t('messages.action.searchInConversation')}
              </button>
              {conversation.actionHref && (
                <Link to={conversation.actionHref} role="menuitem" onClick={() => setMenuOpen(false)}>
                  <Icon name={conversation.contextType === 'trip' ? 'plane' : 'repeat'} size={15} />
                  {conversation.contextType === 'trip' ? t('messages.action.viewTrip') : t('messages.action.viewRecap')}
                </Link>
              )}
              <button type="button" role="menuitem" onClick={() => { setReportOpen(true); setMenuOpen(false); }}>
                <Icon name="alert" size={15} /> {t('messages.action.report')}
              </button>
              <button type="button" role="menuitem" className={conversation.blocked ? '' : 'conversation-menu-danger'} onClick={toggleBlock}>
                <Icon name={conversation.blocked ? 'eye' : 'lock'} size={15} />
                {conversation.blocked ? t('messages.action.unblock') : t('messages.action.block')}
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
          <span>{t('messages.safety.banner')}</span>
          <button type="button" onClick={() => setReportOpen(true)}>{t('messages.action.report')}</button>
        </div>
      )}

      {(conversation.blocked || conversation.blockedByOther) && (
        <div className="conversation-safety-banner conversation-blocked-banner">
          <Icon name="lock" size={16} />
          <span>{conversation.blocked ? t('messages.blocked.byMe') : t('messages.blocked.byOther')}</span>
          {conversation.blocked && <button type="button" onClick={toggleBlock}>{t('messages.action.unblock')}</button>}
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
            onChange={(event) => setReportReason(event.target.value.slice(0, 500))}
            placeholder={t('messages.report.placeholder')}
            rows={3}
            autoFocus
          />
          <div className="report-actions">
            <button type="button" className="btn btn-sm" onClick={() => { setReportOpen(false); setReportReason(''); }}>
              {t('common.cancel')}
            </button>
            <button className="btn btn-primary btn-sm" disabled={!reportCode}>{t('messages.action.report')}</button>
          </div>
        </form>
      )}

      {searchOpen && (
        <div className="conversation-search">
          <Icon name="search" size={16} />
          <input value={messageQuery} onChange={(event) => setMessageQuery(event.target.value)} placeholder={t('messages.search.inConversation')} />
          {messageQuery && <span className="search-results-count">{searchMatches.length ? `${searchIndex + 1}/${searchMatches.length}` : '0'}</span>}
          {messageQuery && <button type="button" onClick={() => goToSearchMatch(-1)} aria-label={t('messages.search.previous')}><Icon name="chevronUp" size={14} /></button>}
          {messageQuery && <button type="button" onClick={() => goToSearchMatch(1)} aria-label={t('messages.search.next')}><Icon name="chevronDown" size={14} /></button>}
          {messageQuery && <button type="button" onClick={() => setMessageQuery('')} aria-label={t('messages.search.clear')}><Icon name="x" size={14} /></button>}
        </div>
      )}
    </>
  );
}
