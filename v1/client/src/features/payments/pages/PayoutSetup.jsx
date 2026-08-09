import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../core/api.js';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { t, useLang } from '../../../i18n.js';

const COUNTRIES = [
  ['BE', 'Belgique'], ['FR', 'France'], ['NL', 'Pays-Bas'], ['DE', 'Allemagne'],
  ['ES', 'Espagne'], ['IT', 'Italie'], ['PT', 'Portugal'], ['GB', 'Royaume-Uni'],
  ['CH', 'Suisse'], ['CA', 'Canada'], ['US', 'Etats-Unis'],
];

export default function PayoutSetup() {
  useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturn(params.get('retour'));
  const [country, setCountry] = useState('BE');
  const [payout, setPayout] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/stripe/connect/status${params.get('stripe') ? '?refresh=1' : ''}`)
      .then((data) => {
        setPayout(data.payout);
        if (data.payout?.country) setCountry(data.payout.country);
        if (data.payout?.ready && params.get('stripe') === 'return') navigate(returnTo, { replace: true });
      })
      .catch((error) => toast.error(error.message));
  }, []);

  const continueOnStripe = async () => {
    setBusy(true);
    try {
      const data = await api('/stripe/connect/onboarding-link', {
        method: 'POST',
        body: { country, returnPath: returnTo },
      });
      window.location.assign(data.url);
    } catch (error) {
      toast.error(error.message);
      setBusy(false);
    }
  };

  return <main className="focus-flow payout-setup-page">
    <header className="focus-flow-header">
      <Link to={returnTo} className="icon-btn" aria-label={t('common.close')}><Icon name="close" size={21} /></Link>
      <div><span>{t('payments.payout.eyebrow')}</span><h1>{t('payments.payout.title')}</h1><p>{t('payments.payout.intro')}</p></div>
    </header>
    <section className="payout-setup-content">
      {payout?.ready ? <div className="payout-ready"><Icon name="shieldCheck" size={23} /><div><b>{t('payments.payout.ready')}</b><p>{t('payments.payout.readyHelp')}</p></div></div> : <>
        <label className="field"><span>{t('payments.payout.country')}</span><select value={country} onChange={(event) => setCountry(event.target.value)} disabled={payout?.configured}>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
        <p className="payout-country-note">{t('payments.payout.countryHelp')}</p>
        <button className="btn btn-primary" onClick={continueOnStripe} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="arrowRight" size={17} />}{t('payments.payout.continue')}</button>
      </>}
      <div className="payout-security"><Icon name="shieldCheck" size={18} /><p>{t('payments.payout.security')}</p></div>
    </section>
  </main>;
}

function safeReturn(value) {
  const path = String(value || '/en-cours');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/en-cours';
}
