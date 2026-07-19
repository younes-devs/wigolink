import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import { CategoryIcon, Icon } from '../Icons.jsx';
import { SkeletonList } from '../Skeleton.jsx';
import { t, useLang, dateLocale } from '../i18n.js';

const DOC_ICON = {
  customs: 'fileText',
  sealing: 'video',
  escrow: 'lock',
  dispute: 'alert',
};

export default function DocumentsCenter() {
  useLang();
  const [data, setData] = useState(null);
  const [exported, setExported] = useState(false);

  useEffect(() => {
    api('/documents-center').then((d) => setData(d.documents));
  }, []);

  const exportData = async () => {
    const res = await fetch('/api/profile/export', { headers: { Authorization: `Bearer ${getToken()}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wigofly-donnees.json';
    a.click();
    URL.revokeObjectURL(url);
    setExported(true);
  };

  return (
    <div className="docs-page">
      <div className="list-row mb">
        <div className="grow">
          <h1 className="page-title">{t('docs.title')}</h1>
          <p className="page-sub" style={{ marginBottom: 0 }}>{t('docs.sub')}</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={exportData}>
          <Icon name={exported ? 'check' : 'fileText'} size={15} />
          {exported ? t('privacy.export.done') : t('docs.export')}
        </button>
      </div>

      {!data && <SkeletonList count={3} />}
      {data && (
        <>
          <section className="docs-metrics">
            <DocMetric icon="package" label={t('docs.metric.dossiers')} value={data.totals.dossiers} />
            <DocMetric icon="check" label={t('docs.metric.ready')} value={data.totals.ready} />
            <DocMetric icon="alert" label={t('docs.metric.actions')} value={data.totals.actions} danger={data.totals.actions > 0} />
            <DocMetric icon="shieldCheck" label={t('docs.metric.kyc')} value={data.totals.kyc} />
          </section>

          <section className="docs-privacy">
            <div>
              <b>{t('docs.privacy.title')}</b>
              <p>{t('docs.privacy.sub')}</p>
            </div>
            <Link to="/parametres" className="btn btn-ghost btn-sm"><Icon name="settings" size={15} />{t('settings.title')}</Link>
          </section>

          {data.dossiers.length === 0 && (
            <div className="card center empty-state">
              <Icon name="fileText" size={36} />
              <p className="muted">{t('docs.empty')}</p>
            </div>
          )}

          <div className="docs-dossiers">
            {data.dossiers.map((dossier) => <DossierCard dossier={dossier} key={dossier.txId} />)}
          </div>
        </>
      )}
    </div>
  );
}

function DocMetric({ icon, label, value, danger = false }) {
  return (
    <div className={`docs-metric ${danger ? 'danger' : ''}`}>
      <Icon name={icon} size={18} />
      <span>{label}</span>
      <b>{value}</b>
    </div>
  );
}

function DossierCard({ dossier }) {
  const listing = dossier.listing;
  return (
    <article className="docs-card">
      <div className="docs-card-head">
        <CategoryIcon categoryId={listing?.categoryId} />
        <div className="grow">
          <b>{listing?.title || dossier.txId}</b>
          <span>{listing ? `${listing.from} -> ${listing.to} · ${listing.valueEur} €` : dossier.txId}</span>
        </div>
        <Link to={`/transactions/${dossier.txId}`} className="btn btn-ghost btn-sm">{t('docs.open')}</Link>
      </div>
      <div className="docs-list">
        {dossier.docs.map((doc) => (
          <Link to={doc.href} className={`docs-item ${doc.status}`} key={doc.id}>
            <Icon name={DOC_ICON[doc.id] || 'fileText'} size={17} />
            <div className="grow">
              <b>{t(`docs.doc.${doc.id}`)}</b>
              <span>{docLabel(doc)}</span>
            </div>
            <Icon name="arrowRight" size={15} />
          </Link>
        ))}
      </div>
    </article>
  );
}

function docLabel(doc) {
  if (doc.id === 'sealing' && doc.meta?.recordedAt) {
    return t('docs.status.recorded', { date: new Date(doc.meta.recordedAt).toLocaleDateString(dateLocale()) });
  }
  if (doc.id === 'dispute' && doc.meta) {
    return t('docs.status.dispute', { n: doc.meta.evidenceCount });
  }
  return t(`docs.status.${doc.status}`);
}
