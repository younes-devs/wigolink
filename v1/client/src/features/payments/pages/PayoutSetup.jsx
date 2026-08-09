import { useCallback, useEffect, useRef, useState } from 'react';
import { loadConnectAndInitialize } from '@stripe/connect-js';
import {
  ConnectAccountOnboarding,
  ConnectComponentsProvider,
} from '@stripe/react-connect-js';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../core/api.js';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { getLang, t, useLang } from '../../../i18n.js';

const COUNTRIES = [
  ['MA', 'Maroc'], ['BE', 'Belgique'], ['FR', 'France'], ['NL', 'Pays-Bas'], ['DE', 'Allemagne'],
  ['ES', 'Espagne'], ['IT', 'Italie'], ['PT', 'Portugal'], ['GB', 'Royaume-Uni'],
  ['CH', 'Suisse'], ['CA', 'Canada'], ['US', 'Etats-Unis'],
];

export default function PayoutSetup() {
  useLang();
  const navigate = useNavigate();
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturn(params.get('retour'));
  const stripeReturn = params.get('stripe');
  const [country, setCountry] = useState('MA');
  const [mode, setMode] = useState(null);
  const [payout, setPayout] = useState(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [bank, setBank] = useState({
    holderName: '', bankName: '', accountIdentifier: '', bic: '', phone: '',
  });
  const [connectInstance, setConnectInstance] = useState(null);
  const [busy, setBusy] = useState(false);
  const [embeddedError, setEmbeddedError] = useState(false);
  const initialSecret = useRef(null);

  const refreshStatus = useCallback(async ({ finish = false, refresh = false } = {}) => {
    const data = await api(`/payouts/status${refresh ? '?refresh=1' : ''}`);
    setMode(data.mode);
    setPayout(data.payout);
    if (data.payout?.country) setCountry(data.payout.country);
    if (finish && data.payout?.ready) navigate(returnTo, { replace: true });
    return data.payout;
  }, [navigate, returnTo]);

  const saveManualAccount = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const data = await api('/payouts/account', {
        method: 'PUT',
        body: { country, ...bank },
      });
      setPayout(data.payout);
      setEditingAccount(false);
      setBank({ holderName: '', bankName: '', accountIdentifier: '', bic: '', phone: '' });
      toast.success(t('payments.payout.manual.saved'));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshStatus({ finish: stripeReturn === 'return', refresh: !!stripeReturn })
      .catch((error) => toast.error(error.message));
  }, [refreshStatus, stripeReturn]);

  const requestClientSecret = useCallback(async () => {
    if (initialSecret.current) {
      const secret = initialSecret.current;
      initialSecret.current = null;
      return secret;
    }
    const data = await api('/stripe/connect/account-session', {
      method: 'POST',
      body: { country },
    });
    return data.clientSecret;
  }, [country]);

  const startEmbeddedOnboarding = async () => {
    setBusy(true);
    setEmbeddedError(false);
    try {
      const bootstrap = await api('/stripe/connect/account-session', {
        method: 'POST',
        body: { country },
      });
      initialSecret.current = bootstrap.clientSecret;
      const dark = document.documentElement.dataset.theme === 'dark';
      const instance = loadConnectAndInitialize({
        publishableKey: bootstrap.publishableKey,
        fetchClientSecret: requestClientSecret,
        locale: getLang(),
        appearance: {
          overlays: 'dialog',
          variables: {
            colorPrimary: '#0874f9',
            colorBackground: dark ? '#171b23' : '#ffffff',
            colorText: dark ? '#f4f7fb' : '#171a21',
            colorDanger: '#dc2626',
            borderRadius: '8px',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          },
        },
      });
      setConnectInstance(instance);
    } catch (error) {
      setEmbeddedError(true);
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const openSecureFallback = async () => {
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

  const finishOnboarding = async () => {
    setBusy(true);
    try {
      const next = await refreshStatus({ finish: true, refresh: true });
      if (!next?.ready) toast.info(t('payments.payout.reviewPending'));
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  let content;
  if (mode === 'manual' && payout?.ready && !editingAccount) {
    content = <section className="payout-setup-content payout-complete-panel">
      <div className="payout-ready"><Icon name="shieldCheck" size={23} /><div><b>{t('payments.payout.manual.ready')}</b><p>{t('payments.payout.manual.readyHelp', { country: payout.country, last4: payout.accountLast4 })}</p></div></div>
      <div className="payout-manual-actions">
        <button className="btn btn-secondary" type="button" onClick={() => setEditingAccount(true)}><Icon name="edit" size={17} />{t('payments.payout.manual.change')}</button>
        <button className="btn btn-primary" onClick={() => navigate(returnTo, { replace: true })}><Icon name="check" size={17} />{t('payments.payout.finish')}</button>
      </div>
    </section>;
  } else if (mode === 'manual') {
    const isMorocco = country === 'MA';
    content = <form className="payout-setup-content payout-manual-form" onSubmit={saveManualAccount}>
      <div className="payout-inline-intro"><span className="payout-inline-icon"><Icon name="bank" size={22} /></span><div><h2>{t('payments.payout.manual.bankTitle')}</h2><p>{t('payments.payout.manual.bankIntro')}</p></div></div>
      <label className="field"><span>{t('payments.payout.country')}</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{COUNTRIES.filter(([code]) => ['MA', 'BE', 'FR'].includes(code)).map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <label className="field"><span>{t('payments.payout.manual.holder')}</span><input value={bank.holderName} maxLength={120} autoComplete="name" onChange={(event) => setBank((current) => ({ ...current, holderName: event.target.value }))} placeholder={t('payments.payout.manual.holderPlaceholder')} required /></label>
      <label className="field"><span>{t('payments.payout.manual.bank')}</span><input value={bank.bankName} maxLength={100} onChange={(event) => setBank((current) => ({ ...current, bankName: event.target.value }))} placeholder={t('payments.payout.manual.bankPlaceholder')} required /></label>
      <label className="field"><span>{t(isMorocco ? 'payments.payout.manual.rib' : 'payments.payout.manual.iban')}</span><input value={bank.accountIdentifier} maxLength={34} inputMode={isMorocco ? 'numeric' : 'text'} autoCapitalize="characters" onChange={(event) => setBank((current) => ({ ...current, accountIdentifier: event.target.value }))} placeholder={t(isMorocco ? 'payments.payout.manual.ribPlaceholder' : 'payments.payout.manual.ibanPlaceholder')} required /></label>
      {!isMorocco && <label className="field"><span>{t('payments.payout.manual.bic')}</span><input value={bank.bic} maxLength={11} autoCapitalize="characters" onChange={(event) => setBank((current) => ({ ...current, bic: event.target.value }))} placeholder={t('payments.payout.manual.bicPlaceholder')} /></label>}
      {isMorocco && <label className="field"><span>{t('payments.payout.manual.phone')}</span><input value={bank.phone} maxLength={20} type="tel" autoComplete="tel" onChange={(event) => setBank((current) => ({ ...current, phone: event.target.value }))} placeholder="+212 6 00 00 00 00" required /></label>}
      <p className="payout-country-note">{t('payments.payout.manual.security')}</p>
      <button className="btn btn-primary payout-start-btn" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t('payments.payout.manual.save')}</button>
    </form>;
  } else if (payout?.ready) {
    content = <section className="payout-setup-content payout-complete-panel">
      <div className="payout-ready"><Icon name="shieldCheck" size={23} /><div><b>{t('payments.payout.ready')}</b><p>{t('payments.payout.readyHelp')}</p></div></div>
      <button className="btn btn-primary" onClick={() => navigate(returnTo, { replace: true })}><Icon name="check" size={17} />{t('payments.payout.finish')}</button>
    </section>;
  } else if (connectInstance) {
    content = <section className="payout-embedded-shell">
      <div className="payout-embedded-heading">
        <div><span>{t('payments.payout.embeddedStep')}</span><h2>{t('payments.payout.embeddedTitle')}</h2></div>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => setConnectInstance(null)}>{t('common.back')}</button>
      </div>
      <ConnectComponentsProvider connectInstance={connectInstance}>
        <ConnectAccountOnboarding
          collectionOptions={{ fields: 'eventually_due', futureRequirements: 'include' }}
          fullTermsOfServiceUrl={`${window.location.origin}/${getLang()}/cgu`}
          privacyPolicyUrl={`${window.location.origin}/${getLang()}/confidentialite`}
          onExit={finishOnboarding}
          onLoadError={() => setEmbeddedError(true)}
        />
      </ConnectComponentsProvider>
      {embeddedError && <FallbackPanel busy={busy} onFallback={openSecureFallback} />}
      <div className="payout-security"><Icon name="shieldCheck" size={18} /><p>{t('payments.payout.security')}</p></div>
    </section>;
  } else {
    content = <section className="payout-setup-content">
      <div className="payout-inline-intro"><span className="payout-inline-icon"><Icon name="bank" size={22} /></span><div><h2>{t('payments.payout.bankTitle')}</h2><p>{t('payments.payout.bankIntro')}</p></div></div>
      <label className="field"><span>{t('payments.payout.country')}</span><select value={country} onChange={(event) => setCountry(event.target.value)} disabled={payout?.configured}>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{name}</option>)}</select></label>
      <p className="payout-country-note">{t('payments.payout.countryHelp')}</p>
      <button className="btn btn-primary payout-start-btn" onClick={startEmbeddedOnboarding} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="bank" size={17} />}{payout?.configured ? t('payments.payout.resume') : t('payments.payout.continue')}</button>
      {embeddedError && <FallbackPanel busy={busy} onFallback={openSecureFallback} />}
      <div className="payout-security"><Icon name="shieldCheck" size={18} /><p>{t('payments.payout.security')}</p></div>
    </section>;
  }

  return <main className="focus-flow payout-setup-page">
    <header className="focus-flow-header">
      <Link to={returnTo} className="icon-btn" aria-label={t('common.close')}><Icon name="close" size={21} /></Link>
      <div><span>{t('payments.payout.eyebrow')}</span><h1>{t('payments.payout.title')}</h1><p>{t('payments.payout.intro')}</p></div>
    </header>

    {content}
  </main>;
}

function FallbackPanel({ busy, onFallback }) {
  return <div className="payout-fallback" role="alert">
    <div><b>{t('payments.payout.loadError')}</b><p>{t('payments.payout.loadErrorHelp')}</p></div>
    <button className="btn btn-secondary btn-sm" type="button" disabled={busy} onClick={onFallback}><Icon name="externalLink" size={15} />{t('payments.payout.fallback')}</button>
  </div>;
}

function safeReturn(value) {
  const path = String(value || '/en-cours');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/en-cours';
}
