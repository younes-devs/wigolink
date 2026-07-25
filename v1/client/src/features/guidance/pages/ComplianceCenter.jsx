import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../../core/api.js';
import { CategoryIcon, Icon } from '../../../Icons.jsx';
import { SkeletonList } from '../../../shared/ui/Skeleton.jsx';
import { t, useLang } from '../../../i18n.js';

export default function ComplianceCenter() {
  useLang();
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('allowed');

  useEffect(() => {
    api('/compliance-center').then((d) => setData(d.compliance));
  }, []);

  return (
    <div className="compliance-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('compliance.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('compliance.sub')}</p>
        </div>
        <Link to="/envois/nouveau" className="btn btn-primary btn-sm"><Icon name="plus" size={15} />{t('ship.new')}</Link>
      </div>

      {!data && <SkeletonList count={3} />}
      {data && (
        <>
          <section className="compliance-metrics">
            <Metric icon="package" label={t('compliance.metric.listings')} value={data.totals.listings} />
            <Metric icon="clock" label={t('compliance.metric.review')} value={data.totals.reviewPending} danger={data.totals.reviewPending > 0} />
            <Metric icon="alert" label={t('compliance.metric.customs')} value={data.totals.overFranchise} danger={data.totals.overFranchise > 0} />
            <Metric icon="check" label={t('compliance.metric.allowed')} value={data.totals.allowedCategories} />
          </section>

          {data.actions.length > 0 && (
            <section className="compliance-actions">
              <div className="section-head">
                <h2>{t('compliance.actions.title')}</h2>
                <span>{data.actions.length}</span>
              </div>
              <div className="compliance-action-list">
                {data.actions.map((a) => (
                  <Link to={a.action.href} key={a.id} className="compliance-action">
                    <Icon name={a.action.id === 'wait_review' ? 'clock' : 'alert'} size={17} />
                    <div className="grow">
                      <b>{t(`compliance.action.${a.action.id}`)}</b>
                      <span>{a.title} · {a.categoryLabel}</span>
                    </div>
                    <Icon name="arrowRight" size={15} />
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="compliance-corridors">
            {data.corridors.map((c) => (
              <article key={c.id} className="compliance-corridor">
                <div className="compliance-corridor-head">
                  <Icon name="plane" size={18} />
                  <div>
                    <b>{c.label}</b>
                    <span>{c.franchise}</span>
                  </div>
                </div>
                <ul>
                  {c.rules.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </article>
            ))}
          </section>

          <div className="tabs compliance-tabs">
            <button className={tab === 'allowed' ? 'active' : ''} onClick={() => setTab('allowed')}>{t('compliance.tab.allowed')}</button>
            <button className={tab === 'forbidden' ? 'active' : ''} onClick={() => setTab('forbidden')}>{t('compliance.tab.forbidden')}</button>
          </div>

          <section className="compliance-catalogue">
            {(tab === 'allowed' ? data.catalogue.allowed : data.catalogue.forbidden).map((cat) => (
              <div className={`compliance-category ${tab === 'forbidden' ? 'forbidden' : ''}`} key={cat.id}>
                {tab === 'allowed' ? <CategoryIcon categoryId={cat.id} size={18} /> : <Icon name="x" size={17} />}
                <div className="grow">
                  <b>{cat.label}</b>
                  <span>{tab === 'allowed' ? t('compliance.max', { q: cat.maxQty }) : cat.reason}</span>
                </div>
              </div>
            ))}
          </section>

          {data.items.length > 0 && (
            <section className="compliance-listings">
              <div className="section-head">
                <h2>{t('compliance.items.title')}</h2>
                <span>{data.items.length}</span>
              </div>
              {data.items.slice(0, 6).map((item) => (
                <Link to={item.action.href} className={`compliance-listing ${item.overFranchise || item.reviewPending ? 'warn' : ''}`} key={item.listing.id}>
                  <CategoryIcon categoryId={item.listing.categoryId} size={17} />
                  <div className="grow">
                    <b>{item.listing.title}</b>
                    <span>{item.listing.valueEur} € · {t(`compliance.action.${item.action.id}`)}</span>
                  </div>
                  <Icon name="arrowRight" size={15} />
                </Link>
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Metric({ icon, label, value, danger = false }) {
  return (
    <div className={`compliance-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}
