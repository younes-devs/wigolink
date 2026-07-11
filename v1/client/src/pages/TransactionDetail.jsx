import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { QrBlock, Stars, StatusPill } from '../components.jsx';
import { Avatar, CategoryIcon, Icon } from '../Icons.jsx';

const STEPS = [
  { key: 'accepted', title: 'Accord & escrow', desc: 'Paiement séquestré chez notre prestataire.' },
  { key: 'sealed', title: 'Scellage filmé', desc: "Vidéo in-app du contenu et de l'emballage." },
  { key: 'in_transit', title: 'Remise & transit', desc: 'Double validation QR — responsabilité au voyageur.' },
  { key: 'released', title: 'Livraison & paiement', desc: 'Double validation finale, escrow libéré.' },
];
const ORDER = ['accepted', 'sealed', 'in_transit', 'released'];

export default function TransactionDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api(`/transactions/${id}`).then((d) => setTx(d.transaction)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [load]);

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!tx) return <div className="muted center">Chargement…</div>;

  const stepIdx = ORDER.indexOf(tx.status);

  return (
    <div>
      <div className="list-row mb">
        <CategoryIcon categoryId={tx.listing?.categoryId} />
        <div className="grow">
          <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>{tx.listing?.title}</h1>
          <StatusPill status={tx.status} />
        </div>
      </div>

      <div className="card">
        <div className="timeline">
          {STEPS.map((s, i) => (
            <div key={s.key} className={`tl-step ${stepIdx > i || tx.status === 'released' ? 'done' : stepIdx === i ? 'current' : ''}`}>
              <div className="dot" />
              <div className="tl-title">{s.title}</div>
              <div className="tl-desc">{s.desc}</div>
            </div>
          ))}
        </div>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={15} />Escrow
          </span>
          <b>{tx.escrow.amount} € — {{ held: 'séquestré', frozen: 'gelé (litige)', released: 'versé au voyageur', refunded: 'remboursé' }[tx.escrow.state]}</b>
        </div>
      </div>

      <StepAction tx={tx} user={user} reload={load} />
      {!['cancelled'].includes(tx.status) && <CustomsRecap txId={tx.id} status={tx.status} />}
      {!['cancelled', 'released', 'refunded'].includes(tx.status) && <Chat txId={tx.id} userId={user.id} />}
      {tx.status === 'released' && <Rating tx={tx} user={user} reload={load} />}
    </div>
  );
}

function StepAction({ tx, user, reload }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const role = tx.myRole;

  const act = async (path, body = {}) => {
    setErr('');
    try {
      await api(`/transactions/${tx.id}/${path}`, { method: 'POST', body });
      reload();
    } catch (e) { setErr(e.message); }
  };

  if (tx.status === 'cancelled')
    return <div className="alert alert-warn"><Icon name="alert" size={17} />Transport annulé sans pénalité. L'annonce a été republiée.</div>;
  if (tx.status === 'refunded')
    return <div className="alert alert-teal"><Icon name="check" size={17} />Litige résolu : l'expéditeur a été remboursé.</div>;
  if (tx.status === 'disputed')
    return (
      <div className="alert alert-danger">
        <Icon name="alert" size={17} />
        <span>Litige en cours d'arbitrage. L'escrow est gelé. Notre équipe tranche selon la grille de décision (première réponse sous 24 h).</span>
      </div>
    );

  return (
    <div>
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}

      {tx.status === 'accepted' && role === 'sender' && <SealingVideo tx={tx} reload={reload} />}
      {tx.status === 'accepted' && role !== 'sender' && (
        <div className="card">
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="clock" size={16} />En attente de la vidéo de scellage par l'expéditeur.
          </p>
          {role === 'traveler' && (
            <div className="alert alert-warn mt">
              <Icon name="alert" size={17} />
              <span><b>Règle d'or :</b> ne transportez jamais ce que vous n'avez pas vu ouvert.
              Au rendez-vous, ouvrez, inspectez, comparez. Vous pouvez refuser sans pénalité.</span>
            </div>
          )}
        </div>
      )}

      {tx.status === 'sealed' && role === 'sender' && (
        <div className="card center">
          <h2 style={{ marginBottom: 12, justifyContent: 'center' }}><Icon name="qr" size={17} />Au rendez-vous, montrez ce QR au voyageur</h2>
          <QrBlock code={tx.pickupCode} caption="Il le scanne pour prendre en charge le colis." />
        </div>
      )}
      {tx.status === 'sealed' && role === 'traveler' && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}><Icon name="qr" size={17} />Prise en charge du colis</h2>
          <div className="alert alert-warn">
            <Icon name="alert" size={17} />
            <span>Avant de valider : ouvrez le colis, inspectez le contenu, comparez avec l'annonce et la vidéo.
            <b> Valider transfère la responsabilité sur vous.</b></span>
          </div>
          <div className="field">
            <label>Code affiché sur le téléphone de l'expéditeur</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" maxLength={6} />
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-pickup', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />J'ai vérifié le contenu — prendre en charge
          </button>
          <button className="btn btn-danger-ghost" onClick={() => act('refuse', { reason: 'Contenu non conforme' })}>
            Refuser sans pénalité
          </button>
        </div>
      )}
      {tx.status === 'sealed' && role === 'recipient' && (
        <div className="card">
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="package" size={16} />Colis scellé. En attente de la remise au voyageur.
          </p>
        </div>
      )}

      {tx.status === 'in_transit' && role === 'traveler' && (
        <div className="card center">
          <h2 style={{ marginBottom: 12, justifyContent: 'center' }}><Icon name="qr" size={17} />À la livraison, montrez ce QR au destinataire</h2>
          <QrBlock code={tx.deliveryCode} caption="Sa validation libère votre paiement en quelques minutes." />
        </div>
      )}
      {tx.status === 'in_transit' && role === 'recipient' && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}><Icon name="package" size={17} />Réception du colis</h2>
          <div className="alert alert-warn">
            <Icon name="alert" size={17} />
            <span>Inspectez le colis et comparez-le à la vidéo de scellage ci-dessous avant de valider.</span>
          </div>
          <div className="field">
            <label>Code affiché sur le téléphone du voyageur</label>
            <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="ABC123" maxLength={6} />
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-delivery', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />Colis conforme — valider la livraison
          </button>
          <div className="field">
            <input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
              placeholder="Décrivez le problème (obligatoire pour contester)" />
          </div>
          <button className="btn btn-danger-ghost" onClick={() => act('dispute', { reason: disputeReason })}
            disabled={disputeReason.length < 10}>
            Contester (ouvre un litige, gèle l'escrow)
          </button>
        </div>
      )}
      {tx.status === 'in_transit' && role === 'sender' && (
        <div className="card">
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plane" size={16} />Colis en transit avec {tx.traveler?.name}.
          </p>
        </div>
      )}

      {tx.status === 'released' && (
        <div className="alert alert-teal">
          <Icon name="check" size={17} />
          <span>Livraison validée. {tx.escrow.travelerPay} € versés au voyageur (commission plateforme : {tx.escrow.commission} €).</span>
        </div>
      )}

      {tx.sealingVideo && ['sealed', 'in_transit', 'released', 'disputed'].includes(tx.status) && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}><Icon name="video" size={17} />Vidéo de scellage</h2>
          {tx.sealingVideo.dataUrl
            ? <video className="video-preview" src={tx.sealingVideo.dataUrl} controls />
            : <div className="alert alert-warn" style={{ marginBottom: 0 }}><Icon name="video" size={17} />Vidéo simulée (démo).</div>}
          <div className="muted mt" style={{ fontSize: 12 }}>
            Horodatée le {new Date(tx.sealingVideo.recordedAt).toLocaleString('fr-BE')} · code transaction {tx.id}
            {tx.sealingVideo.geo ? ` · ${tx.sealingVideo.geo}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}

// Caméra in-app exclusive (PRD §3.2) — pas d'upload galerie.
function SealingVideo({ tx, reload }) {
  const videoRef = useRef(null);
  const [recording, setRecording] = useState(false);
  const [stream, setStream] = useState(null);
  const [err, setErr] = useState('');
  const recRef = useRef(null);
  const chunksRef = useRef([]);

  const start = async () => {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      setStream(s);
      videoRef.current.srcObject = s;
      const rec = new MediaRecorder(s, { mimeType: 'video/webm' });
      chunksRef.current = [];
      rec.ondataavailable = (e) => chunksRef.current.push(e.data);
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        if (blob.size > 8 * 1024 * 1024) {
          setErr('Vidéo trop longue pour la démo (max ~8 Mo). Réessayez plus court.');
          return;
        }
        const dataUrl = await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.readAsDataURL(blob);
        });
        await api(`/transactions/${tx.id}/sealing-video`, { method: 'POST', body: { dataUrl } });
        reload();
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setErr("Caméra indisponible — utilisez la simulation ci-dessous.");
    }
  };

  const stop = () => {
    recRef.current?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  const simulate = async () => {
    await api(`/transactions/${tx.id}/sealing-video`, { method: 'POST', body: { simulated: true } });
    reload();
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="camera" size={17} />Filmez le scellage du colis</h2>
      <p className="muted mb" style={{ fontSize: 13 }}>
        Montrez le produit, l'emballage en cours de fermeture, et le code <b>{tx.id}</b> visible dans le cadre.
        La vidéo est horodatée et servira de preuve en cas de litige. Caméra in-app uniquement.
      </p>
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
      <video ref={videoRef} className="video-preview mb" autoPlay muted playsInline style={{ display: recording ? 'block' : 'none', maxHeight: 240 }} />
      {!recording
        ? <button className="btn btn-primary mb" onClick={start}><Icon name="camera" size={18} />Démarrer l'enregistrement</button>
        : <button className="btn btn-danger-ghost mb" onClick={stop}>Terminer et envoyer</button>}
      <button className="btn btn-ghost" onClick={simulate}>Simuler la vidéo (démo)</button>
    </div>
  );
}

function CustomsRecap({ txId, status }) {
  const [recap, setRecap] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (open && !recap) api(`/transactions/${txId}/customs-recap`).then((d) => setRecap(d.recap));
  }, [open, recap, txId]);

  return (
    <div className="card">
      <div className="list-row" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <Icon name="fileText" size={19} />
        <div className="grow"><b>Récapitulatif douane</b>
          <div className="muted" style={{ fontSize: 12 }}>À montrer en cas de contrôle — accessible hors ligne.</div>
        </div>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </div>
      {open && recap && (
        <div className="mt" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          <div className="divider" />
          <b>Transaction :</b> {recap.txId}<br />
          <b>Produit :</b> {recap.product} ({recap.category})<br />
          <b>Description :</b> {recap.description}<br />
          <b>Valeur déclarée :</b> {recap.valueEur} € · <b>Poids :</b> {recap.weightKg} kg<br />
          <b>Expéditeur :</b> {recap.sender?.name} (identité vérifiée)<br />
          <b>Voyageur :</b> {recap.traveler?.name} (identité vérifiée)<br />
          {recap.sealedAt && <><b>Scellé le :</b> {new Date(recap.sealedAt).toLocaleString('fr-BE')}<br /></>}
          <b>Franchise :</b> {recap.corridor.franchise}
        </div>
      )}
    </div>
  );
}

function Chat({ txId, userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [warning, setWarning] = useState('');
  const boxRef = useRef(null);

  const load = useCallback(() => {
    api(`/transactions/${txId}/messages`).then((d) => setMessages(d.messages));
  }, [txId]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    boxRef.current?.scrollTo(0, boxRef.current.scrollHeight);
  }, [messages.length]);

  const send = async () => {
    if (!text.trim()) return;
    const d = await api(`/transactions/${txId}/messages`, { method: 'POST', body: { text } });
    setWarning(d.warning || '');
    setText('');
    load();
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="chat" size={17} />Messagerie</h2>
      <p className="muted mb" style={{ fontSize: 12 }}>
        Organisez le rendez-vous (lieu public conseillé). Les coordonnées restent masquées : tout se passe dans l'app.
      </p>
      <div className="chat-box" ref={boxRef}>
        {messages.map((m) => (
          <div key={m.id} className={`msg ${m.from === userId ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''}`}>
            {m.text}
            {m.flagged && <span className="msg-warn">Coordonnées détectées — échange hors app non couvert.</span>}
          </div>
        ))}
        {messages.length === 0 && <div className="muted center">Aucun message.</div>}
      </div>
      {warning && <div className="alert alert-danger"><Icon name="alert" size={17} />{warning}</div>}
      <div className="row">
        <input className="chat-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre message…"
          onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn btn-primary btn-sm" style={{ flex: '0 0 auto' }} onClick={send} aria-label="Envoyer">
          <Icon name="send" size={17} />
        </button>
      </div>
    </div>
  );
}

function Rating({ tx, user, reload }) {
  const targets = [
    { id: tx.senderId, label: 'Expéditeur', u: tx.sender },
    { id: tx.travelerId, label: 'Voyageur', u: tx.traveler },
    { id: tx.recipientId, label: 'Destinataire', u: tx.recipient },
  ].filter((t, i, arr) => t.id !== user.id && arr.findIndex((x) => x.id === t.id) === i);

  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}><Icon name="star" size={17} />Notez vos partenaires</h2>
      {targets.map((t) => <RateRow key={t.id} tx={tx} target={t} reload={reload} />)}
    </div>
  );
}

function RateRow({ tx, target, reload }) {
  const [stars, setStars] = useState(0);
  const already = tx.ratings?.some((r) => r.target === target.id && r.by !== target.id && tx.myRole && r.by === (tx.myRole === 'sender' ? tx.senderId : tx.myRole === 'traveler' ? tx.travelerId : tx.recipientId));

  const rate = async (n) => {
    setStars(n);
    try {
      await api(`/transactions/${tx.id}/rate`, { method: 'POST', body: { targetId: target.id, stars: n } });
      reload();
    } catch { /* déjà noté */ }
  };

  return (
    <div className="list-row mb">
      <Avatar name={target.u?.name} size={38} />
      <div className="grow">
        <b>{target.u?.name}</b>
        <div className="muted" style={{ fontSize: 12 }}>{target.label}</div>
      </div>
      {already ? <span className="pill pill-teal"><Icon name="check" size={13} />Noté</span> : <Stars value={stars} onChange={rate} />}
    </div>
  );
}
