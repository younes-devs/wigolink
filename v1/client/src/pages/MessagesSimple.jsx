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

  return (
    <div className="simple-page messages-page">
      <h1 className="page-title">Messagerie</h1>
      <p className="page-sub">Vos discussions avec les voyageurs et expéditeurs.</p>
      <input className="chat-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une conversation" />

      {conversations === null && <div className="card"><span className="spinner" /> Chargement...</div>}
      {conversations?.length === 0 && (
        <div className="card center empty-state">
          <Icon name="chat" size={34} />
          <p className="muted">Aucune conversation pour l’instant.</p>
          <Link to="/trajets" className="btn btn-primary btn-sm">Voir les trajets</Link>
        </div>
      )}
      <div className="conversation-list">
        {filtered.map((conversation) => (
          <Link to={`/messages/${conversation.id}`} className="conversation-row" key={conversation.id}>
            <Avatar name={conversation.other?.name || 'Contact'} photo={conversation.other?.photoUrl} size={48} />
            <div className="grow">
              <div className="conversation-top">
                <b>{conversation.other?.name || 'Contact'}</b>
                <span>{conversation.lastMessage ? shortDate(conversation.lastMessage.at) : shortDate(conversation.createdAt)}</span>
              </div>
              <p>{conversation.lastMessage?.text || conversationLabel(conversation)}</p>
              {conversation.trip && <small>{conversation.trip.from} {'->'} {conversation.trip.to}</small>}
            </div>
            {conversation.unread > 0 && <span className="unread-badge">{conversation.unread}</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}

function conversationLabel(conversation) {
  if (conversation.trip) return 'Conversation liée à un trajet';
  if (conversation.operation) return 'Conversation liée à une opération';
  return 'Nouvelle conversation';
}

export function shortDate(value) {
  if (!value) return '';
  const d = new Date(value);
  const today = new Date().toDateString();
  if (d.toDateString() === today) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}
