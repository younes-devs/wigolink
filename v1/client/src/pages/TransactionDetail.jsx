import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../App.jsx';
import { QrBlock, QrScanner, Stars, StatusPill } from '../components.jsx';
import { Avatar, CategoryIcon, Icon } from '../Icons.jsx';
import { SkeletonCard } from '../Skeleton.jsx';
import { useToast } from '../Toast.jsx';
import { t, useLang, dateLocale } from '../i18n.js';

const STEPS = ['accepted', 'sealed', 'in_transit', 'released'];
const ORDER = ['accepted', 'sealed', 'in_transit', 'released'];
// Événement qui marque l'entrée dans chaque étape (PRD UI/UX U10) — pour dater la timeline.
const STEP_EVENT = { accepted: 'accepted', sealed: 'sealed', in_transit: 'in_transit', released: 'delivered_and_released' };

// Durée écoulée compacte (« 2 min », « 3 h », « 5 j »), unités neutres FR/AR.
function sinceText(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t('tx.time.moments');
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  return `${Math.floor(h / 24)} j`;
}
// Temps relatif (« à l'instant », « il y a 2 h »).
function relativeTime(ts) {
  if (!ts) return '';
  const s = Math.floor((Date.now() - ts) / 1000);
  return s < 60 ? t('tx.time.now') : t('tx.time.ago', { d: sinceText(ts) });
}

export default function TransactionDetail() {
  useLang();
  const { id } = useParams();
  const location = useLocation();
  const { user } = useAuth();
  const [tx, setTx] = useState(null);
  const [error, setError] = useState('');

  const [celebrate, setCelebrate] = useState(false);
  const prevStatus = useRef(null);

  const load = useCallback(() => {
    api(`/transactions/${id}`).then((d) => setTx(d.transaction)).catch((e) => setError(e.message));
  }, [id]);

  useEffect(() => {
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
  }, [load]);

  useEffect(() => {
    if (!tx || !location.hash) return;
    const target = document.getElementById(location.hash.slice(1));
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [tx, location.hash]);

  // Moment de gratification (PRD UI/UX U16) : célébration à la libération de l'escrow —
  // uniquement sur la transition (pas à chaque visite d'une transaction déjà livrée).
  useEffect(() => {
    if (!tx) return;
    if (prevStatus.current && prevStatus.current !== 'released' && tx.status === 'released') {
      setCelebrate(true);
      setTimeout(() => setCelebrate(false), 2800);
    }
    prevStatus.current = tx.status;
  }, [tx?.status]);

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!tx) return <SkeletonCard lines={3} />;

  const stepIdx = ORDER.indexOf(tx.status);
  const nextAction = getNextAction(tx);
  const eventAt = (type) => tx.events?.find((e) => e.type === type)?.at || null;
  // Depuis quand on attend sur l'étape courante (dernier événement enregistré).
  const lastEventAt = tx.events?.length ? tx.events[tx.events.length - 1].at : tx.createdAt;

  return (
    <div>
      {celebrate && <Celebration />}
      <div className="tx-hero">
        <CategoryIcon categoryId={tx.listing?.categoryId} />
        <div className="grow">
          <h1 style={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.3px' }}>{tx.listing?.title}</h1>
          <StatusPill status={tx.status} />
        </div>
        <span className="tx-role">{t(`role.${tx.myRole}`)}</span>
      </div>

      <div className="tx-next">
        <span className="tx-next-icon"><Icon name={nextAction.icon} size={18} /></span>
        <div className="grow">
          <b>{t(nextAction.title)}</b>
          <span>{t(nextAction.desc)}</span>
        </div>
        <a href={`#${nextAction.target}`} className="btn btn-sm btn-ghost">{t('tx.nav.go')}</a>
      </div>

      <div className="tx-section-nav">
        <a href="#suivi"><Icon name="clock" size={14} />{t('tx.nav.tracking')}</a>
        <a href="#actions"><Icon name="check" size={14} />{t('tx.nav.actions')}</a>
        <a href="#douane"><Icon name="fileText" size={14} />{t('tx.nav.customs')}</a>
        {!['cancelled', 'released', 'refunded'].includes(tx.status) && <a href="#messages"><Icon name="chat" size={14} />{t('tx.nav.messages')}</a>}
        {tx.status === 'disputed' && <a href="#litige"><Icon name="alert" size={14} />{t('tx.nav.dispute')}</a>}
      </div>

      <div className="card tx-section" id="suivi">
        <div className="timeline">
          {STEPS.map((key, i) => {
            const done = stepIdx > i || tx.status === 'released';
            const current = stepIdx === i && tx.status !== 'released';
            const doneAt = done ? eventAt(STEP_EVENT[key]) : null;
            return (
              <div key={key} className={`tl-step ${done ? 'done' : current ? 'current' : ''}`}>
                <div className="dot" />
                <div className="tl-title">
                  {t(`tx.step.${key}.t`)}
                  {doneAt && <span className="tl-time">{relativeTime(doneAt)}</span>}
                  {current && <span className="tl-time tl-time-wait">{t('tx.waiting.since', { d: sinceText(lastEventAt) })}</span>}
                </div>
                <div className="tl-desc">{t(`tx.step.${key}.d`)}</div>
              </div>
            );
          })}
        </div>
        <div className="list-row" style={{ justifyContent: 'space-between' }}>
          <span className="muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="lock" size={15} />{t('tx.escrow')}
          </span>
          <b>{tx.escrow.amount} € — {t(`tx.escrow.${tx.escrow.state}`)}</b>
        </div>
      </div>

      <section id="actions" className="tx-section"><StepAction tx={tx} user={user} reload={load} /></section>
      {tx.status === 'disputed' && <section id="litige" className="tx-section"><DisputePanel txId={tx.id} /></section>}
      {!['cancelled'].includes(tx.status) && <section id="douane" className="tx-section"><CustomsRecap txId={tx.id} status={tx.status} /></section>}
      {!['cancelled', 'released', 'refunded'].includes(tx.status) && <section id="messages" className="tx-section"><Chat tx={tx} userId={user.id} /></section>}
      {tx.status === 'released' && <Rating tx={tx} user={user} reload={load} />}
    </div>
  );
}

const ACTION_TOASTS = {
  'confirm-pickup': ['success', 'tx.toast.pickup'],
  'confirm-delivery': ['success', 'tx.toast.delivery'],
  refuse: ['info', 'tx.toast.refuse'],
  dispute: ['info', 'tx.toast.dispute'],
};

function getNextAction(tx) {
  const role = tx.myRole;
  if (tx.status === 'accepted' && role === 'sender')
    return { icon: 'camera', title: 'tx.next.seal.title', desc: 'tx.next.seal.desc', target: 'actions' };
  if (tx.status === 'accepted')
    return { icon: 'clock', title: 'tx.next.waitSeal.title', desc: 'tx.next.waitSeal.desc', target: 'suivi' };
  if (tx.status === 'sealed' && role === 'traveler')
    return { icon: 'qr', title: 'tx.next.pickup.title', desc: 'tx.next.pickup.desc', target: 'actions' };
  if (tx.status === 'sealed')
    return { icon: 'package', title: 'tx.next.waitPickup.title', desc: 'tx.next.waitPickup.desc', target: 'suivi' };
  if (tx.status === 'in_transit' && role === 'recipient')
    return { icon: 'qr', title: 'tx.next.delivery.title', desc: 'tx.next.delivery.desc', target: 'actions' };
  if (tx.status === 'in_transit')
    return { icon: 'plane', title: 'tx.next.waitDelivery.title', desc: 'tx.next.waitDelivery.desc', target: 'messages' };
  if (tx.status === 'disputed')
    return { icon: 'alert', title: 'tx.next.dispute.title', desc: 'tx.next.dispute.desc', target: 'litige' };
  if (tx.status === 'released')
    return { icon: 'star', title: 'tx.next.rate.title', desc: 'tx.next.rate.desc', target: 'actions' };
  return { icon: 'info', title: 'tx.next.closed.title', desc: 'tx.next.closed.desc', target: 'suivi' };
}

function StepAction({ tx, user, reload }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [scanning, setScanning] = useState(false);
  const role = tx.myRole;
  const toast = useToast();

  const act = async (path, body = {}) => {
    setErr('');
    try {
      await api(`/transactions/${tx.id}/${path}`, { method: 'POST', body });
      reload();
      const at = ACTION_TOASTS[path];
      if (at) toast[at[0]](t(at[1]));
    } catch (e) { setErr(e.message); }
  };

  // Mode test : récupère le code que l'autre partie devrait présenter.
  if (tx.status === 'cancelled')
    return <div className="alert alert-warn"><Icon name="alert" size={17} />{t('tx.cancelled')}</div>;
  if (tx.status === 'refunded')
    return <div className="alert alert-teal"><Icon name="check" size={17} />{t('tx.refunded')}</div>;
  if (tx.status === 'disputed')
    return (
      <div className="alert alert-danger">
        <Icon name="alert" size={17} />
        <span>{t('tx.disputed')}</span>
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
            <Icon name="clock" size={16} />{t('tx.wait.sealing')}
          </p>
          {role === 'traveler' && (
            <div className="alert alert-warn mt">
              <Icon name="alert" size={17} />
              <span>{t('tx.golden.rule')}</span>
            </div>
          )}
        </div>
      )}

      {tx.status === 'sealed' && role === 'sender' && (
        <div className="card center">
          <h2 style={{ marginBottom: 12, justifyContent: 'center' }}><Icon name="qr" size={17} />{t('tx.qr.show.pickup')}</h2>
          <QrBlock code={tx.pickupCode} caption={t('tx.qr.show.pickup.cap')} />
        </div>
      )}
      {tx.status === 'sealed' && role === 'traveler' && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}><Icon name="qr" size={17} />{t('tx.pickup.title')}</h2>
          <div className="alert alert-warn">
            <Icon name="alert" size={17} />
            <span>{t('tx.pickup.warn')}</span>
          </div>
          <button type="button" className="btn btn-ghost mb" onClick={() => setScanning(true)}>
            <Icon name="qr" size={18} />{t('tx.scan.sender')}
          </button>
          <div className="field">
            <label>{t('tx.code.manual')}</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-pickup', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />{t('tx.pickup.confirm')}
          </button>
          <button className="btn btn-danger-ghost" onClick={() => act('refuse', { reason: 'Contenu non conforme' })}>
            {t('tx.refuse')}
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
            <Icon name="package" size={16} />{t('tx.sealed.wait')}
          </p>
        </div>
      )}

      {tx.status === 'in_transit' && role === 'traveler' && (
        <div className="card center">
          <h2 style={{ marginBottom: 12, justifyContent: 'center' }}><Icon name="qr" size={17} />{t('tx.qr.show.delivery')}</h2>
          <QrBlock code={tx.deliveryCode} caption={t('tx.qr.show.delivery.cap')} />
        </div>
      )}
      {tx.status === 'in_transit' && role === 'recipient' && (
        <div className="card">
          <h2 style={{ marginBottom: 8 }}><Icon name="package" size={17} />{t('tx.delivery.title')}</h2>
          <div className="alert alert-warn">
            <Icon name="alert" size={17} />
            <span>{t('tx.delivery.warn')}</span>
          </div>
          <button type="button" className="btn btn-ghost mb" onClick={() => setScanning(true)}>
            <Icon name="qr" size={18} />{t('tx.scan.traveler')}
          </button>
          <div className="field">
            <label>{t('tx.code.manual')}</label>
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ABC123" maxLength={6} />
          </div>
          <button className="btn btn-teal mb" onClick={() => act('confirm-delivery', { code })} disabled={code.length !== 6}>
            <Icon name="check" size={18} />{t('tx.delivery.confirm')}
          </button>
          {scanning && (
            <QrScanner onClose={() => setScanning(false)}
              onDetected={(c) => { setCode(c); setScanning(false); }} />
          )}
          <div className="field">
            <input value={disputeReason} onChange={(e) => setDisputeReason(e.target.value)}
              placeholder={t('tx.dispute.ph')} />
          </div>
          <button className="btn btn-danger-ghost" onClick={() => act('dispute', { reason: disputeReason })}
            disabled={disputeReason.length < 10}>
            {t('tx.dispute.open')}
          </button>
        </div>
      )}
      {tx.status === 'in_transit' && role === 'sender' && (
        <div className="card">
          <p className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="plane" size={16} />{t('tx.transit.with', { name: tx.traveler?.name })}
          </p>
        </div>
      )}

      {tx.status === 'released' && (
        <div className="alert alert-teal">
          <Icon name="check" size={17} />
          <span>{t('tx.released.msg', { pay: tx.escrow.travelerPay, c: tx.escrow.commission })}</span>
        </div>
      )}

      {tx.sealingVideo && ['sealed', 'in_transit', 'released', 'disputed'].includes(tx.status) && (
        <div className="card">
          <h2 style={{ marginBottom: 10 }}><Icon name="video" size={17} />{t('tx.video.title')}</h2>
          {tx.sealingVideo.dataUrl
            ? <video className="video-preview" src={tx.sealingVideo.dataUrl} controls />
            : <div className="alert alert-warn" style={{ marginBottom: 0 }}><Icon name="video" size={17} />{t('tx.video.simulated')}</div>}
          <div className="muted mt" style={{ fontSize: 12 }}>
            {t('tx.video.meta', { date: new Date(tx.sealingVideo.recordedAt).toLocaleString(dateLocale()), id: tx.id })}
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
  const [geoStatus, setGeoStatus] = useState('idle'); // idle | locating | ok | denied
  const recRef = useRef(null);
  const chunksRef = useRef([]);
  const geoRef = useRef(null);

  // Demandée en parallèle de la caméra, au même clic (PRD §3.2 : horodatage +
  // géolocalisation). Best-effort : un refus ou un délai dépassé ne bloque jamais
  // le scellage, la position n'est qu'une preuve supplémentaire, pas une condition.
  const captureGeo = () => new Promise((resolve) => {
    if (!navigator.geolocation) { setGeoStatus('denied'); resolve(null); return; }
    setGeoStatus('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const g = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)} (±${Math.round(pos.coords.accuracy)} m)`;
        geoRef.current = g;
        setGeoStatus('ok');
        resolve(g);
      },
      () => { setGeoStatus('denied'); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  });

  const start = async () => {
    setErr('');
    captureGeo();
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
          setErr(t('seal.too.long'));
          return;
        }
        const dataUrl = await new Promise((ok) => {
          const r = new FileReader();
          r.onload = () => ok(r.result);
          r.readAsDataURL(blob);
        });
        await api(`/transactions/${tx.id}/sealing-video`, { method: 'POST', body: { dataUrl, geo: geoRef.current } });
        reload();
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setErr(t('seal.no.camera'));
    }
  };

  const stop = () => {
    recRef.current?.stop();
    stream?.getTracks().forEach((t) => t.stop());
    setRecording(false);
  };

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="camera" size={17} />{t('seal.title')}</h2>
      <p className="muted mb" style={{ fontSize: 13 }}>{t('seal.help', { id: tx.id })}</p>
      {err && <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>}
      <video ref={videoRef} className="video-preview mb" autoPlay muted playsInline style={{ display: recording ? 'block' : 'none', maxHeight: 240 }} />
      {geoStatus !== 'idle' && (
        <div className="geo-status">
          <Icon name="mapPin" size={13} />
          {geoStatus === 'locating' && t('seal.geo.locating')}
          {geoStatus === 'ok' && t('seal.geo.ok', { geo: geoRef.current })}
          {geoStatus === 'denied' && t('seal.geo.denied')}
        </div>
      )}
      {!recording
        ? <button className="btn btn-primary mb" onClick={start}><Icon name="camera" size={18} />{t('seal.start')}</button>
        : <button className="btn btn-danger-ghost mb" onClick={stop}>{t('seal.stop')}</button>}
    </div>
  );
}

const recapCacheKey = (txId) => `wigofly_recap_${txId}`;

function CustomsRecap({ txId, status }) {
  const [recap, setRecap] = useState(null);
  const [open, setOpen] = useState(false);
  const [fromCache, setFromCache] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const toast = useToast();

  // Partage du récap (PRD UI/UX U13) : partage natif si dispo (mobile), sinon copie
  // du texte dans le presse-papier — pratique pour l'envoyer au voyageur avant le vol.
  const shareRecap = async () => {
    if (!recap) return;
    const text = [
      'Récapitulatif douane Wigofly',
      `Produit : ${recap.product} (${recap.category})`,
      `Valeur déclarée : ${recap.valueEur} € · Poids : ${recap.weightKg} kg`,
      `Expéditeur : ${recap.sender?.name} (identité vérifiée)`,
      `Voyageur : ${recap.traveler?.name} (identité vérifiée)`,
      `Franchise : ${recap.corridor.franchise}`,
      `Transaction : ${recap.txId}`,
    ].join('\n');
    if (navigator.share) {
      try { await navigator.share({ title: 'Récapitulatif douane Wigofly', text }); }
      catch { /* partage annulé par l'utilisateur — rien à faire */ }
      return;
    }
    // Pas de partage natif (desktop) : repli sur le presse-papier, avec retour explicite.
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('recap.share.copied'));
    } catch {
      toast.error(t('recap.share.failed'));
    }
  };

  // Mise en cache proactive dès que le colis est scellé : le récapitulatif reste
  // consultable sans réseau (contrôle douanier en zone blanche, avion, etc.).
  useEffect(() => {
    api(`/transactions/${txId}/customs-recap`)
      .then((d) => {
        setRecap(d.recap);
        setFromCache(false);
        try { localStorage.setItem(recapCacheKey(txId), JSON.stringify(d.recap)); } catch { /* stockage plein, tant pis */ }
      })
      .catch(() => {
        const cached = localStorage.getItem(recapCacheKey(txId));
        if (cached) { setRecap(JSON.parse(cached)); setFromCache(true); }
      });
  }, [txId, status]);

  const downloadPdf = async () => {
    if (!recap) return;
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const left = 48;
      let y = 56;

      doc.setFont('helvetica', 'bold'); doc.setFontSize(16);
      doc.text('Wigofly — Récapitulatif douane', left, y); y += 22;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(110);
      doc.text(`Généré le ${new Date().toLocaleString('fr-BE')} · Transaction ${recap.txId}`, left, y); y += 28;
      doc.setDrawColor(220); doc.line(left, y, 547, y); y += 24;

      const row = (label, value) => {
        doc.setTextColor(90); doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
        doc.text(label, left, y);
        doc.setTextColor(20); doc.setFont('helvetica', 'normal'); doc.setFontSize(11);
        const lines = doc.splitTextToSize(String(value), 380);
        doc.text(lines, left + 150, y);
        y += 18 * lines.length + 6;
      };

      row('Produit', `${recap.product} (${recap.category})`);
      row('Description', recap.description || '—');
      row('Valeur déclarée', `${recap.valueEur} €`);
      row('Poids', `${recap.weightKg} kg`);
      row('Expéditeur', `${recap.sender?.name} — identité vérifiée`);
      row('Voyageur', `${recap.traveler?.name} — identité vérifiée`);
      if (recap.sealedAt) row('Scellé le', new Date(recap.sealedAt).toLocaleString('fr-BE'));
      row('Corridor', recap.corridor.label);
      row('Franchise applicable', recap.corridor.franchise);

      y += 8; doc.setDrawColor(220); doc.line(left, y, 547, y); y += 20;
      doc.setFontSize(9); doc.setTextColor(130);
      doc.text(doc.splitTextToSize(
        "Ce document atteste d'une transaction enregistrée sur la plateforme Wigofly, avec identités vérifiées " +
        'des deux parties et preuve vidéo de scellage. Il ne constitue pas une déclaration en douane officielle.',
        499
      ), left, y);

      doc.save(`wigofly-douane-${recap.txId}.pdf`);
    } finally {
      setPdfBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="list-row" onClick={() => setOpen(!open)} style={{ cursor: 'pointer' }}>
        <Icon name="fileText" size={19} />
        <div className="grow"><b>{t('recap.title')}</b>
          <div className="muted" style={{ fontSize: 12 }}>
            {recap ? (fromCache ? t('recap.sub.offline') : t('recap.sub.ready')) : t('recap.sub.plain')}
          </div>
        </div>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} />
      </div>
      {open && recap && (
        <div className="mt" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
          <div className="divider" />
          {fromCache && (
            <div className="alert alert-warn" style={{ marginBottom: 12 }}>
              <Icon name="alert" size={16} />
              <span>{t('recap.offline.warn')}</span>
            </div>
          )}
          <b>{t('recap.f.tx')}</b> {recap.txId}<br />
          <b>{t('recap.f.product')}</b> {recap.product} ({recap.category})<br />
          <b>{t('recap.f.desc')}</b> {recap.description}<br />
          <b>{t('recap.f.value')}</b> {recap.valueEur} € · <b>{t('recap.f.weight')}</b> {recap.weightKg} kg<br />
          <b>{t('recap.f.sender')}</b> {recap.sender?.name} {t('recap.verified')}<br />
          <b>{t('recap.f.traveler')}</b> {recap.traveler?.name} {t('recap.verified')}<br />
          {recap.sealedAt && <><b>{t('recap.f.sealed')}</b> {new Date(recap.sealedAt).toLocaleString(dateLocale())}<br /></>}
          <b>{t('recap.f.franchise')}</b> {recap.corridor.franchise}
          <div className="row mt" style={{ gap: 8 }}>
            <button className="btn btn-ghost btn-sm" onClick={downloadPdf} disabled={pdfBusy}>
              <Icon name="fileText" size={15} />{pdfBusy ? t('recap.generating') : 'PDF'}
            </button>
            <button className="btn btn-ghost btn-sm" onClick={shareRecap}>
              <Icon name="share" size={15} />{t('recap.share')}
            </button>
          </div>
        </div>
      )}
      {open && !recap && <p className="muted mt">{t('recap.none')}</p>}
    </div>
  );
}

const dayFmt = () => new Intl.DateTimeFormat(dateLocale(), { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = () => new Intl.DateTimeFormat(dateLocale(), { hour: '2-digit', minute: '2-digit' });

function Chat({ tx, userId }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [warning, setWarning] = useState('');
  const [sending, setSending] = useState(false);
  const boxRef = useRef(null);

  const participants = {
    [tx.senderId]: { ...tx.sender, role: t('role.sender') },
    [tx.travelerId]: { ...tx.traveler, role: t('role.traveler') },
    [tx.recipientId]: { ...tx.recipient, role: t('role.recipient') },
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
          <b>{t('chat.title')}</b>
          <div className="chat-sub"><Icon name="lock" size={11} /> {t('chat.sub')}</div>
        </div>
        <span className="chat-presence" title={t('chat.public.place')}>
          <Icon name="mapPin" size={13} />{t('chat.public.place')}
        </span>
      </div>
      <div className="chat-participants">
        {Object.entries(participants).filter(([id]) => id !== userId).map(([id, p]) => (
          <div key={id} className="chat-participant">
            <Avatar name={p?.name} photo={p?.photoUrl} size={26} />
            <span>{p?.name}</span>
            <small>{p?.role}</small>
          </div>
        ))}
      </div>

      <div className="chat-box" ref={boxRef}>
        {messages.length === 0 && (
          <div className="chat-empty">
            <Icon name="chat" size={26} />
            <p>{t('chat.empty')}</p>
          </div>
        )}
        {groups.map((g, gi) => {
          const mine = g.from === userId;
          const p = participants[g.from];
          const day = dayFmt().format(new Date(g.msgs[0].at));
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
                        <span className="msg-warn"><Icon name="alert" size={11} /> {t('chat.flagged')}</span>
                      )}
                    </div>
                  ))}
                  <div className="msg-time">{timeFmt().format(new Date(g.msgs[g.msgs.length - 1].at))}</div>
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
          placeholder={t('chat.ph')}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="chat-send" onClick={send} disabled={!text.trim() || sending} aria-label={t('chat.send')}>
          <Icon name="send" size={17} />
        </button>
      </div>
    </div>
  );
}

function Rating({ tx, user, reload }) {
  const targets = [
    { id: tx.senderId, label: t('role.sender'), u: tx.sender },
    { id: tx.travelerId, label: t('role.traveler'), u: tx.traveler },
    { id: tx.recipientId, label: t('role.recipient'), u: tx.recipient },
  ].filter((t, i, arr) => t.id !== user.id && arr.findIndex((x) => x.id === t.id) === i);

  return (
    <div className="card">
      <h2 style={{ marginBottom: 12 }}><Icon name="star" size={17} />{t('rate.title')}</h2>
      {targets.map((t) => <RateRow key={t.id} tx={tx} target={t} reload={reload} />)}
    </div>
  );
}

function RateRow({ tx, target, reload }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const already = tx.ratings?.some((r) => r.target === target.id && r.by !== target.id && tx.myRole && r.by === (tx.myRole === 'sender' ? tx.senderId : tx.myRole === 'traveler' ? tx.travelerId : tx.recipientId));

  const send = async () => {
    setSending(true);
    try {
      await api(`/transactions/${tx.id}/rate`, { method: 'POST', body: { targetId: target.id, stars, comment } });
      reload();
    } catch { setSending(false); /* déjà noté */ }
  };

  return (
    <div className="mb">
      <div className="list-row">
        <Avatar name={target.u?.name} photo={target.u?.photoUrl} size={38} />
        <div className="grow">
          <b>{target.u?.name}</b>
          <div className="muted" style={{ fontSize: 12 }}>{target.label}</div>
        </div>
        {already ? <span className="pill pill-teal"><Icon name="check" size={13} />{t('rate.done')}</span> : <Stars value={stars} onChange={setStars} />}
      </div>
      {!already && stars > 0 && (
        <div className="mt" style={{ marginLeft: 50 }}>
          <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)}
            placeholder={t('rate.comment.ph')} maxLength={400} />
          <button className="btn btn-primary btn-sm mt" onClick={send} disabled={sending}>
            {sending ? <span className="spinner" /> : t('rate.submit')}
          </button>
        </div>
      )}
    </div>
  );
}

const slaFmt = () => new Intl.DateTimeFormat(dateLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

function timeLeftLabel(deadline) {
  const ms = deadline - Date.now();
  if (ms <= 0) return t('dispute.deadline.over');
  const h = Math.floor(ms / 3600e3);
  if (h < 24) return t('dispute.hours.left', { h });
  return t('dispute.days.left', { d: Math.floor(h / 24) });
}

function DisputePanel({ txId }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const toast = useToast();

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
      toast.success(t('dispute.evidence.sent'));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  if (error) return <div className="alert alert-danger"><Icon name="alert" size={17} />{error}</div>;
  if (!d) return null;

  const evidenceOpen = Date.now() < d.evidenceDeadline;

  return (
    <div className="card">
      <h2 style={{ marginBottom: 8 }}><Icon name="alert" size={17} />{t('dispute.title')}</h2>
      <p style={{ fontSize: 13.5, lineHeight: 1.5, marginBottom: 10 }}><b>{t('dispute.reason')}</b> {d.reason}</p>

      <div className="sla-row">
        <div className={`sla-chip ${evidenceOpen ? '' : 'sla-chip-over'}`}>
          <Icon name="clock" size={13} />
          {t('dispute.evidence.left', { d: timeLeftLabel(d.evidenceDeadline) })}
        </div>
        <div className="sla-chip">
          <Icon name="clock" size={13} />
          {t('dispute.resolution', { date: slaFmt().format(d.resolutionTarget) })}
        </div>
      </div>

      {d.evidence.length > 0 && (
        <div className="evidence-list">
          {d.evidence.map((e, i) => (
            <div className="evidence-item" key={i}>
              {e.photo && <img src={e.photo} alt="Preuve" />}
              {e.text && <p>{e.text}</p>}
              <span className="evidence-time">{slaFmt().format(e.at)}</span>
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
              placeholder={t('dispute.comment.ph')} />
          </div>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onPhotoPick} />
          <div className="row">
            <button className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="image" size={15} />{t('dispute.photo.add')}
            </button>
            <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || (!text.trim() && !photo)}>
              {busy ? <span className="spinner" /> : t('dispute.evidence.send')}
            </button>
          </div>
        </div>
      ) : (
        <p className="muted" style={{ fontSize: 12.5 }}>{t('dispute.window.closed')}</p>
      )}
    </div>
  );
}

// Célébration à la libération de l'escrow (PRD UI/UX U16) — coche animée + confettis.
// Respecte prefers-reduced-motion (voir styles.css : animations neutralisées).
const CONFETTI = Array.from({ length: 14 });
function Celebration() {
  return (
    <div className="celebrate" aria-hidden="true">
      <div className="celebrate-burst">
        {CONFETTI.map((_, i) => (
          <span key={i} className="confetti" style={{ '--i': i, '--n': CONFETTI.length }} />
        ))}
      </div>
      <div className="celebrate-check"><Icon name="check" size={40} /></div>
      <div className="celebrate-text">{t('tx.celebrate')}</div>
    </div>
  );
}
