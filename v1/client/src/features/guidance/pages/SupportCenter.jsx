import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../core/api.js';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { StatusPill } from '../../../components.jsx';
import { SkeletonList } from '../../../shared/ui/Skeleton.jsx';
import { t, useLang, dateLocale } from '../../../i18n.js';

const ACTION_ICON = {
  add_evidence: 'alert',
  follow_dispute: 'clock',
  open_dispute: 'alert',
  seal_first: 'video',
  organize_handoff: 'chat',
  read_rules: 'fileText',
};

export default function SupportCenter() {
  useLang();
  const [support, setSupport] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api('/support-center').then((d) => setSupport(d.support));
  }, []);

  const cases = support?.cases || [];
  const visibleCases = cases.filter((c) => {
    if (filter === 'all') return true;
    if (filter === 'disputes') return c.dispute;
    if (filter === 'possible') return c.canOpenDispute;
    return c.action.priority === 'high';
  });

  return (
    <div className="support-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('support.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('support.sub')}</p>
        </div>
        <a href="mailto:support@wigofly.app" className="btn btn-ghost btn-sm"><Icon name="mail" size={15} />{t('support.mail')}</a>
      </div>

      {!support && <SkeletonList count={3} />}
      {support && (
        <>
          <section className="support-hero">
            <SupportMetric icon="alert" label={t('support.metric.urgent')} value={support.totals.urgent} danger={support.totals.urgent > 0} />
            <SupportMetric icon="shield" label={t('support.metric.disputes')} value={support.totals.openDisputes} />
            <SupportMetric icon="repeat" label={t('support.metric.possible')} value={support.totals.canOpenDispute} />
            <SupportMetric icon="package" label={t('support.metric.cases')} value={support.totals.cases} />
          </section>

          <section className="support-links">
            <Link to="/documents"><Icon name="fileText" size={17} /><span>{t('support.link.docs')}</span><Icon name="arrowRight" size={15} /></Link>
            <Link to="/finance"><Icon name="euro" size={17} /><span>{t('support.link.finance')}</span><Icon name="arrowRight" size={15} /></Link>
            <Link to="/confiance"><Icon name="shieldCheck" size={17} /><span>{t('support.link.trust')}</span><Icon name="arrowRight" size={15} /></Link>
          </section>

          {support.urgent?.length > 0 && (
            <section className="support-actions">
              <div className="section-head">
                <h2>{t('support.actions.title')}</h2>
                <span>{support.urgent.length}</span>
              </div>
              <div className="support-action-list">
                {support.urgent.map((a) => (
                  <Link key={a.id} to={a.action.href} className={`support-action ${a.action.priority}`}>
                    <Icon name={ACTION_ICON[a.action.id] || 'alert'} size={17} />
                    <div className="grow">
                      <b>{t(`support.action.${a.action.id}`)}</b>
                      <span>{a.title}</span>
                    </div>
                    <Icon name="arrowRight" size={15} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="support-guide">
            {support.guide.map((g) => (
              <Link to={g.href} key={g.id} className="support-guide-item">
                <Icon name="shieldCheck" size={16} />
                <div>
                  <b>{t(`support.guide.${g.id}.title`)}</b>
                  <span>{t(`support.guide.${g.id}.body`)}</span>
                </div>
              </Link>
            ))}
          </section>

          <div className="tabs support-tabs">
            {['all', 'urgent', 'disputes', 'possible'].map((id) => (
              <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>
                {t(`support.filter.${id}`)}
              </button>
            ))}
          </div>

          {visibleCases.length === 0 && (
            <div className="card center empty-state">
              <Icon name="shieldCheck" size={36} />
              <p className="muted">{t('support.empty')}</p>
            </div>
          )}

          <div className="support-cases">
            {visibleCases.map((c) => <SupportCase item={c} key={c.txId} />)}
          </div>
        </>
      )}
    </div>
  );
}

function SupportMetric({ icon, label, value, danger = false }) {
  return (
    <div className={`support-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function SupportCase({ item }) {
  return (
    <article className={`support-case ${item.action.priority === 'high' ? 'hot' : ''}`}>
      <div className="support-case-head">
        <CategoryIcon categoryId={item.listing?.categoryId} />
        <div className="grow">
          <b>{item.listing?.title || item.txId}</b>
          <span>{item.listing ? `${item.listing.from} -> ${item.listing.to}` : item.txId}</span>
        </div>
        <StatusPill status={item.status} />
      </div>
      <div className="support-case-body">
        <div>
          <span className="mini-label">{t('support.case.next')}</span>
          <b>{t(`support.action.${item.action.id}`)}</b>
          <p>{t(`support.action.${item.action.id}.body`)}</p>
        </div>
        <Link to={item.action.href} className="btn btn-primary btn-sm"><Icon name="arrowRight" size={15} />{t('support.case.open')}</Link>
      </div>
      {item.dispute && (
        <div className="support-dispute-note">
          <Icon name="alert" size={15} />
          <span>{t('support.case.dispute', { date: new Date(item.dispute.evidenceDeadline).toLocaleDateString(dateLocale()) })}</span>
        </div>
      )}
    </article>
  );
}
