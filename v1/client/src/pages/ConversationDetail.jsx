import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { Avatar, Icon } from '../Icons.jsx';
import { useToast } from '../Toast.jsx';
import { shortDate } from './MessagesSimple.jsx';

export default function ConversationDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const toast = useToast();
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);

  const load = () => api(`/conversations/${id}/messages`)
    .then((data) => {
      setConversation(data.conversation);
      setMessages(data.messages);
      api(`/conversations/${id}/read`, { method: 'POST' })
        .then((read) => setConversation(read.conversation))
        .catch(() => {});
    })
    .catch(() => setConversation(false));

  useEffect(() => { load(); }, [id]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages.length]);

  const send = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      const data = await api(`/conversations/${id}/messages`, { method: 'POST', body: { text } });
      if (data.warning) toast.info(data.warning);
      setText('');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  if (conversation === null) return <div className="card"><span className="spinner" /> Chargement...</div>;
  if (conversation === false) return <div className="card center empty-state"><Icon name="alert" size={32} /><p>Conversation introuvable.</p></div>;

  return (
    <div className="conversation-detail">
      <header className="conversation-header">
        <Link to="/messages" className="icon-btn conversation-back" aria-label="Retour aux messages"><Icon name="arrowLeft" size={18} /></Link>
        <Avatar name={conversation.other?.name || 'Contact'} photo={conversation.other?.photoUrl} size={44} />
        <div className="grow conversation-title">
          <b>{conversation.other?.name || 'Contact'}</b>
          <span>{conversation.other?.kycStatus === 'verified' ? 'Profil verifie' : 'Profil'}</span>
        </div>
        <div className="conversation-actions">
          {conversation.trip && <Link to={`/trajets/${conversation.trip.id}`} className="icon-btn" title="Trajet" aria-label="Trajet"><Icon name="plane" size={17} /></Link>}
          {conversation.operation && <Link to={`/operations/${conversation.operation.id}`} className="icon-btn" title="Operation" aria-label="Operation"><Icon name="repeat" size={17} /></Link>}
        </div>
      </header>

      {(conversation.trip || conversation.operation) && (
        <div className="conversation-context">
          <Icon name={conversation.trip ? 'plane' : 'repeat'} size={16} />
          <span>{contextLabel(conversation)}</span>
          {conversation.trip && <b>{conversation.trip.price} {conversation.trip.currency}</b>}
        </div>
      )}

      <main className="message-thread">
        {messages.length === 0 && (
          <div className="message-empty">
            <Icon name="chat" size={26} />
            <p>Aucun message pour l'instant.</p>
          </div>
        )}
        {messages.map((message) => {
          const mine = message.from === user.id;
          return (
            <div className={`message-line ${mine ? 'mine' : 'theirs'}`} key={message.id}>
              <div className={`message-bubble ${mine ? 'mine' : ''} ${message.flagged ? 'flagged' : ''}`}>
                <p>{message.text}</p>
                <span>{shortDate(message.at)}{message.flagged ? ' - signale' : ''}</span>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </main>

      <form className="message-compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ecrire un message" />
        <button className="chat-send" disabled={sending || !text.trim()} aria-label="Envoyer">
          {sending ? <span className="spinner" /> : <Icon name="send" size={18} />}
        </button>
      </form>
    </div>
  );
}

function contextLabel(conversation) {
  if (conversation.trip) return `${conversation.trip.from} -> ${conversation.trip.to}`;
  if (conversation.operation) return conversation.operation.title || 'Operation en cours';
  return '';
}
