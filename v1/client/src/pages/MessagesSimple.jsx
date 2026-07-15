import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Avatar, Icon } from '../Icons.jsx';

export default function MessagesSimple() {
  const [conversations, setConversations] = useState(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    api('/conversations').then((data) => setConversations(data.conversations)).catch(() => setConversations([]));
  }, []);

  const filtered = (conversations || []).filter((conversation) =>
    `${conversation.other?.name || ''} ${conversation.lastMessage?.text || ''} ${conversation.trip?.from || ''} ${conversation.trip?.to || ''}`.toLowerCase().includes(q.toLowerCase())
  );
  const unreadTotal = (conversations || []).reduce((sum, conversation) => sum + (conversation.unread || 0), 0);

  return (
    <div className="simple-page messages-page">
      <div className="messages-head">
        <div>
          <h1 className="page-title">Messagerie</h1>
          <p className="page-sub">Vos discussions avec les voyageurs et expediteurs.</p>
        </div>
        {unreadTotal > 0 && <span className="messages-unread-total">{unreadTotal}</span>}
      </div>

      <label className="message-search">
        <Icon name="search" size={17} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une conversation" />
      </label>

      {conversations === null && <div className="card"><span className="spinner" /> Chargement...</div>}
      {conversations?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="chat" size={34} />
          <p className="muted">Aucune conversation pour l'instant.</p>
          <Link to="/trajets" className="btn btn-primary btn-sm">Voir les trajets</Link>
        </div>
      )}
      {conversations?.length > 0 && filtered.length === 0 && (
        <div className="message-empty-inline">
          <Icon name="search" size={18} />
          <span>Aucune discussion trouvee.</span>
        </div>
      )}

      <div className="conversation-list">
        {filtered.map((conversation) => (
          <Link to={`/messages/${conversation.id}`} className={`conversation-row ${conversation.unread > 0 ? 'has-unread' : ''}`} key={conversation.id}>
            <div className="conversation-avatar">
              <Avatar name={conversation.other?.name || 'Contact'} photo={conversation.other?.photoUrl} size={50} />
              {conversation.other?.kycStatus === 'verified' && <span className="conversation-verified"><Icon name="check" size={10} /></span>}
            </div>
            <div className="grow conversation-copy">
              <div className="conversation-top">
                <b>{conversation.other?.name || 'Contact'}</b>
                <span>{conversation.lastMessage ? shortDate(conversation.lastMessage.at) : shortDate(conversation.createdAt)}</span>
              </div>
              <p>{conversation.lastMessage?.text || conversationLabel(conversation)}</p>
              <small>{conversationContext(conversation)}</small>
            </div>
            {conversation.unread > 0 && <span className="unread-badge">{conversation.unread}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function conversationLabel(conversation) {
  if (conversation.trip) return 'Conversation liee a un trajet';
  if (conversation.operation) return 'Conversation liee a une operation';
  return 'Nouvelle conversation';
}

function conversationContext(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.operation) return conversation.operation.title || 'Operation en cours';
  return 'Discussion directe';
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
