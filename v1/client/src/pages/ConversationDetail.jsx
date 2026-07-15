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
      await api(`/conversations/${id}/messages`, { method: 'POST', body: { text } });
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
        <Link to="/messages" className="icon-btn"><Icon name="arrowLeft" size={18} /></Link>
        <Avatar name={conversation.other?.name || 'Contact'} photo={conversation.other?.photoUrl} size={42} />
        <div className="grow">
          <b>{conversation.other?.name || 'Contact'}</b>
          <span>{conversation.other?.kycStatus === 'verified' ? 'Profil vérifié' : 'Profil'}</span>
        </div>
        {conversation.trip && <Link to={`/trajets/${conversation.trip.id}`} className="btn btn-ghost btn-sm">Trajet</Link>}
        {conversation.operation && <Link to={`/operations/${conversation.operation.id}`} className="btn btn-ghost btn-sm">Opération</Link>}
      </header>

      {conversation.trip && (
        <div className="conversation-context">
          <Icon name="plane" size={16} />
          <span>{conversation.trip.from} {'->'} {conversation.trip.to}</span>
          <b>{conversation.trip.price} {conversation.trip.currency}</b>
        </div>
      )}

      <main className="message-thread">
        {messages.length === 0 && <p className="muted center">Aucun message. Dites bonjour.</p>}
        {messages.map((message) => (
          <div className={`message-bubble ${message.from === user.id ? 'mine' : ''}`} key={message.id}>
            <p>{message.text}</p>
            <span>{shortDate(message.at)}{message.flagged ? ' · signalé' : ''}</span>
          </div>
        ))}
        <div ref={endRef} />
      </main>

      <form className="message-compose" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Message" />
        <button className="btn btn-primary" disabled={sending || !text.trim()}>
          {sending ? <span className="spinner" /> : <Icon name="send" size={18} />}
        </button>
      </form>
    </div>
  );
}
