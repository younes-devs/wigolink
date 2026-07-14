import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { Icon } from '../Icons.jsx';
import { SkeletonCard } from '../Skeleton.jsx';
import { t, useLang, getLang } from '../i18n.js';

const pctFmt = () => new Intl.NumberFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { style: 'percent', maximumFractionDigits: 0 });
const dateFmt = () => new Intl.DateTimeFormat(getLang() === 'ar' ? 'ar-MA' : 'fr-BE', { day: 'numeric', month: 'short', year: 'numeric' });

export default function TrustCenter() {
  useLang();
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    api('/trust-center').then((d) => setData(d.trust)).catch((e) => setErr(e.message));
  }, []);

  if (err) return <div className="alert alert-danger"><Icon name="alert" size={17} />{err}</div>;
  if (!data) return <SkeletonCard lines={5} />;

  const progress = Math.round((data.limits.completedForUpgrade / data.limits.requiredForUpgrade) * 100);

  return (
    <div className="trust-page">
      <div className={`trust-hero trust-${data.level}`}>
        <div className="trust-score-ring" style={{ '--score': `${data.score}%` }}>
          <b>{data.score}</b>
          <span>/100</span>
        </div>
        <div className="grow">
          <h1>{t('trust.title')}</h1>
          <p>{t(`trust.level.${data.level}`)}</p>
        </div>
      </div>

      <div className="trust-stats">
        <Stat icon="check" value={data.stats.completed} label={t('trust.stat.completed')} />
        <Stat icon="star" value={data.stats.rating ?? t('dash.trust.new')} label={t('trust.stat.rating')} />
        <Stat icon="repeat" value={data.stats.active} label={t('trust.stat.active')} />
        <Stat icon="alert" value={pctFmt().format(data.stats.cancelRate)} label={t('trust.stat.cancel')} />
      </div>

      <section className="trust-section">
        <div className="trust-section-head">
          <h2><Icon name="sparkles" size={17} />{t('trust.actions.title')}</h2>
          <span>{data.actions.length}</span>
        </div>
        {data.actions.length === 0 ? (
          <div className="trust-empty"><Icon name="shieldCheck" size={24} />{t('trust.actions.empty')}</div>
        ) : (
          <div className="trust-action-list">
            {data.actions.map((a) => (
              <Link key={a.id} to={a.href} className={`trust-action trust-priority-${a.priority}`}>
                <Icon name={actionIcon(a.id)} size={18} />
                <span className="grow">
                  <b>{t(`trust.action.${a.id}.title`)}</b>
                  <small>{t(`trust.action.${a.id}.body`)}</small>
                </span>
                <Icon name="arrowRight" size={16} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="trust-section">
        <div className="trust-section-head">
          <h2><Icon name="lock" size={17} />{t('trust.limits.title')}</h2>
          <Link to="/profil">{t('nav.profile')}</Link>
        </div>
        <div className="trust-limit-grid">
          <div><span>{t('trust.limits.value')}</span><b>{data.limits.maxValue} €</b></div>
          <div><span>{t('trust.limits.active')}</span><b>{data.limits.active}/{data.limits.maxActive}</b></div>
        </div>
        <div className="trust-progress">
          <div><span style={{ width: `${progress}%` }} /></div>
          <p>{t('trust.limits.progress', { done: data.limits.completedForUpgrade, total: data.limits.requiredForUpgrade })}</p>
        </div>
      </section>

      <section className="trust-section">
        <div className="trust-section-head">
          <h2><Icon name="shieldCheck" size={17} />{t('trust.protections.title')}</h2>
        </div>
        <div className="trust-protection-grid">
          {data.protections.map((p) => (
            <div key={p.id} className={p.enabled ? 'on' : ''}>
              <Icon name={p.enabled ? 'check' : 'clock'} size={16} />
              <span>{t(`trust.protection.${p.id}`)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="trust-section">
        <div className="trust-section-head">
          <h2><Icon name="fileText" size={17} />{t('trust.incidents.title')}</h2>
        </div>
        {data.incidents.disputes.length === 0 && data.incidents.flaggedMessages.length === 0 ? (
          <div className="trust-empty compact"><Icon name="check" size={20} />{t('trust.incidents.empty')}</div>
        ) : (
          <div className="trust-incident-list">
            {data.incidents.disputes.map((d) => (
              <Link key={d.id} to={`/transactions/${d.txId}#litige`} className="trust-incident">
                <Icon name="alert" size={16} />
                <span className="grow">
                  <b>{t('trust.incident.dispute')}</b>
                  <small>{dateFmt().format(new Date(d.createdAt))} · {d.evidenceCount} {t('trust.incident.evidence')}</small>
                </span>
              </Link>
            ))}
            {data.incidents.flaggedMessages.map((m) => (
              <Link key={m.id} to={`/transactions/${m.txId}#messages`} className="trust-incident">
                <Icon name="chat" size={16} />
                <span className="grow">
                  <b>{t('trust.incident.message')}</b>
                  <small>{dateFmt().format(new Date(m.at))}</small>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ icon, value, label }) {
  return (
    <div className="trust-stat">
      <Icon name={icon} size={17} />
      <b>{value}</b>
      <span>{label}</span>
    </div>
  );
}

function actionIcon(id) {
  if (id === 'verify-identity') return 'shieldCheck';
  if (id === 'answer-dispute') return 'alert';
  if (id === 'keep-chat-in-app') return 'chat';
  if (id === 'active-limit') return 'lock';
  return 'star';
}
