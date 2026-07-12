import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { QrBlock, QrScanner, Stars, StatusPill } from '../components.jsx';
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
      {tx.status === 'disputed' && <DisputePanel txId={tx.id} />}
      {!['cancelled'].includes(tx.status) && <CustomsRecap txId={tx.id} status={tx.status} />}
      {!['cancelled', 'released', 'refunded'].includes(tx.status) && <Chat tx={tx} userId={user.id} />}
      {tx.status === 'released' && <Rating tx={tx} user={user} reload={load} />}
    </div>
  );
}

function StepAction({ tx, user, reload }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [scanning, setScanning] = useState(false);
  const role = tx.myRole;

  const act = async (path, body = {}) => {
    setErr('');
    try {
      await api(`/transactions/${tx.id}/${path}`, { method: 'POST', body });
      reload();
    } catch (e) { setErr(e.message); }
  };

  // Mode test : récupère le code que l'autre partie devrait présenter.
  const autofillCode = async (which) => {
    const d = await api(`/dev/tx-codes/${tx.id}`);
    setCode(which === 'pickup' ? d.pickupCode : d.deliveryCode);
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
  // Le détail du litige (motif, preuves, échéances) est affiché par <DisputePanel> plus bas.

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
          <button type="button" className="btn btn-ghost mb" onClick={() => setScanning(true)}>
            <Icon name="qr" size={18} />Scanner le QR de l'expéditeur
          </button>
          <div className="field">
            <label>Ou saisir le code manuellement</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
            <button type="button" className="autofill-btn" style={{ marginTop: 7 }} onClick={() => autofillCode('pickup')}>
              <Icon name="sparkles" size={13} />Code auto (test)
            </button>
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-pickup', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />J'ai vérifié le contenu — prendre en charge
          </button>
          <button className="btn btn-danger-ghost" onClick={() => act('refuse', { reason: 'Contenu non conforme' })}>
            Refuser sans pénalité
          </button>
          {scanning && (
            <QrScanner onClose={() => setScanning(false)}
              onDetected={(c) => { setCode(c); setScanning(false); }} />
          )}
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
          <button type="button" className="btn btn-ghost mb" onClick={() => setScanning(true)}>
            <Icon name="qr" size={18} />Scanner le QR du voyageur
          </button>
          <div className="field">
            <label>Ou saisir le code manuellement</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
            <button type="button" className="autofill-btn" style={{ marginTop: 7 }} onClick={() => autofillCode('delivery')}>
              <Icon name="sparkles" size={13} />Code auto (test)
            </button>
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-delivery', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />Colis conforme — valider la livraison
          </button>
          {scanning && (
            <QrScanner onClose={() => setScanning(false)}
              onDetected={(c) => { setCode(c); setScanning(false); }} />
          )}
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

const DAY_FMT = new Intl.DateTimeFormat('fr-BE', { weekday: 'long', day: 'numeric', month: 'long' });
const TIME_FMT = new Intl.DateTimeFormat('fr-BE', { hour: '2-digit', minute: '2-digit' });

function Chat({ tx, userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [warning, setWarning] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);

  const participants = {
    [tx.senderId]: { ...tx.sender, role: 'Expéditeur' },
    [tx.travelerId]: { ...tx.traveler, role: 'Voyageur' },
    [tx.recipientId]: { ...tx.recipient, role: 'Destinataire' },
  };

  const load = useCallback(() => {
    api(`/transactions/${tx.id}/messages`).then((d) => setMessages(d.messages));
  }, [tx.id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length]);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const d = await api(`/transactions/${tx.id}/messages`, { method: 'POST', body: { text: t } });
      setWarning(d.warning || '');
      setText('');
      load();
    } finally {
      setSending(false);
    }
  };

  // Groupes : messages consécutifs du même auteur à moins de 5 min d'écart
  const groups = [];
  for (const m of messages) {
    const last = groups[groups.length - 1];
    if (last && last.from === m.from && m.at - last.msgs[last.msgs.length - 1].at < 5 * 60e3) last.msgs.push(m);
    else groups.push({ from: m.from, msgs: [m] });
  }

  let lastDay = '';

  return (
    <div className="card chat-card">
      <div className="chat-header">
        <div className="grow">
          <b>Messagerie</b>
          <div className="chat-sub"><Icon name="lock" size={11} /> Chiffré côté plateforme · coordonnées masquées</div>
        </div>
        <span className="chat-presence" title="Rendez-vous en lieu public conseillé">
          <Icon name="mapPin" size={13} />Lieu public conseillé
        </span>
      </div>

      <div className="chat-box" ref={boxRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <Icon name="chat" size={26} />
            <p>Ouvrez la conversation pour organiser le rendez-vous de remise.</p>
          </div>
        )}
        {groups.map((g, gi) => {
          const mine = g.from === userId;
          const p = participants[g.from];
          const day = DAY_FMT.format(new Date(g.msgs[0].at));
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <div key={gi}>
              {showDay && <div className="chat-day"><span>{day}</span></div>}
              <div className={`msg-group ${mine ? 'mine' : 'theirs'}`}>
                {!mine && <Avatar name={p?.name} photo={p?.photoUrl} size={28} />}
                <div className="msg-col">
                  {!mine && <div className="msg-author">{p?.name} · {p?.role}</div>}
                  {g.msgs.map((m, mi) => (
                    <div key={m.id} className={`msg ${mine ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''} ${mi === g.msgs.length - 1 ? 'tail' : ''}`}>
                      {m.text}
                      {m.flagged && (
                        <span className="msg-warn"><Icon name="alert" size={11} /> Coordonnées détectées — échange hors app non couvert</span>
                      )}
                    </div>
                  ))}
                  <div className="msg-time">{TIME_FMT.format(new Date(g.msgs[g.msgs.length - 1].at))}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {warning && <div className="alert alert-danger"><Icon name="alert" size={17} />{warning}</div>}

      <div className="chat-composer">
        <input
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Écrire un message…"
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="chat-send" onClick={send} disabled={!text.trim() || sending} aria-label="Envoyer">
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
      <Avatar name={target.u?.name} photo={target.u?.photoUrl} size={38} />
      <div className="grow">
        <b>{target.u?.name}</b>
        <div className="muted" style={{ fontSize: 12 }}>{target.label}</div>
      </div>
      {already ? <span className="pill pill-teal"><Icon name="check" size={13} />Noté</span> : <Stars value={stars} onChange={rate} />}
    </div>
  );
}

const SLA_FMT = new Intl.DateTimeFormat('fr-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function timeLeftLabel(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return 'Délai dépassé';
  const h = Math.floor(ms / 3600e3);
  if (h < 24) return `${h} h restantes`;
  return `${Math.floor(h / 24)} j restants`;
}

function DisputePanel({ txId }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  const load = useCallback(() => {
    api(`/transactions/${txId}/dispute`).then((r) => setD(r.dispute)).catch((e) => setError(e.message));
  }, [txId]);

  useEffect(() => { load(); }, [load]);

  const onPhotoPick = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 640 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      setPhoto(canvas.toDataURL('image/jpeg', 0.8));
      URL.revokeObjectURL(img.src);
    };
    img.src = URL.createObjectURL(file);
    e.target.value = '';
  };

  const submit = async () => {
    if (!text.trim() && !photo) return;
    setBusy(true);
    setError('');
    try {
      await api(`/disputes/${d.id}/evidence`, { method: 'POST', body: { text: text.trim(), photo } });
      setText(''); setPhoto(null);
      load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!d) return null;

  const evidenceOpen = Date.now() < d.evidenceDeadline;

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="alert" size={17} />Dossier du litige</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}><b>Motif initial :</b> {d.reason}</p>

      <div className="sla-row">
        <div className={`sla-chip ${evidenceOpen ? '' : 'sla-chip-over'}`}>
          <Icon name="clock" size={13} />
          Preuves : {timeLeftLabel(d.evidenceDeadline)}
        </div>
        <div className="sla-chip">
          <Icon name="clock" size={13} />
          Résolution visée : {SLA_FMT.format(d.resolutionTarget)}
        </div>
      </div>

      {d.evidence.length > 0 && (
        <div className="evidence-list">
          {d.evidence.map((e, i) => (
            <div className="evidence-item" key={i}>
              {e.photo && <img src={e.photo} alt="Preuve" />}
              {e.text && <p>{e.text}</p>}
              <span className="evidence-time">{SLA_FMT.format(e.at)}</span>
            </div>
          ))}
        </div>
      )}

      {evidenceOpen ? (
        <div className="mt">
          {photo && (
            <div className="photo-thumb mb">
              <img src={photo} alt="Aperçu" />
              <button type="button" onClick={() => setPhoto(null)} aria-label="Retirer"><Icon name="x" size={12} /></button>
            </div>
          )}
          <div className="field">
            <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)}
              placeholder="Ajouter un commentaire ou une précision…" />
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPick} />
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={15} />Ajouter une photo
            </button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || (!text.trim() && !photo)}>
              {busy ? '…' : 'Envoyer la preuve'}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12.5 }}>Le délai de soumission des preuves est dépassé — le dossier est entre les mains de notre équipe.</p>
      )}
    </div>
  );
}
