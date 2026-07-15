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
          <span className="conversation-context-icon"><Icon name={conversation.trip ? 'plane' : 'repeat'} size={17} /></span>
          <div className="grow">
            <b>{contextLabel(conversation)}</b>
            <span>{conversation.trip ? 'Trajet lie a cette discussion' : 'Operation liee a cette discussion'}</span>
          </div>
          {conversation.trip && <strong>{conversation.trip.price} {conversation.trip.currency}</strong>}
        </div>
      )}

      <main className="message-thread">
        {messages.length === 0 && (
          <div className="message-empty">
            <Icon name="chat" size={26} />
            <b>Aucun message pour l'instant</b>
            <p>Commencez simplement. Les questions sur le colis, le rendez-vous ou le prix restent ici.</p>
            <div className="message-suggestions">
              {suggestions(conversation).map((suggestion) => (
                <button type="button" key={suggestion} onClick={() => setText(suggestion)}>{suggestion}</button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message, index) => {
          const mine = message.from === user.id;
          const showDate = index === 0 || !sameDay(messages[index - 1]?.at, message.at);
          return (
            <div className="message-group" key={message.id}>
              {showDate && <div className="message-day">{fullDate(message.at)}</div>}
              <div className={`message-line ${mine ? 'mine' : 'theirs'}`}>
                {!mine && <Avatar name={conversation.other?.name || 'Contact'} photo={conversation.other?.photoUrl} size={28} />}
                <div className={`message-bubble ${mine ? 'mine' : ''} ${message.flagged ? 'flagged' : ''}`}>
                  <p>{message.text}</p>
                  <span>{shortDate(message.at)}{message.flagged ? ' - signale' : ''}</span>
                </div>
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

function suggestions(conversation) {
  if (conversation.operation) return ['Ou en est-on ?', 'On confirme le rendez-vous ?', 'Je vous envoie les details.'];
  if (conversation.trip) return ['Bonjour, le trajet est toujours disponible ?', 'Quel type de colis acceptez-vous ?', 'On peut confirmer les details ?'];
  return ['Bonjour', 'Je vous ecris pour une question', 'Merci pour votre retour'];
}

function sameDay(a, b) {
  if (!a || !b) return false;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function fullDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(value));
}
