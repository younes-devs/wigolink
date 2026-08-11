import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../../core/api.js';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { getLang, t, useLang } from '../../../i18n.js';

const COUNTRIES = [
  ['MA', 'Maroc'], ['BE', 'Belgique'], ['FR', 'France'],
];

export default function PayoutSetup() {
  useLang();
  const regionNames = new Intl.DisplayNames([getLang()], { type: 'region' });
  const countryName = (code, fallback = code) => regionNames.of(code) || fallback;
  const navigate = useNavigate();
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const returnTo = safeReturn(params.get('retour'));
  const [country, setCountry] = useState('MA');
  const [payout, setPayout] = useState(null);
  const [editingAccount, setEditingAccount] = useState(false);
  const [bank, setBank] = useState({
    holderName: '', bankName: '', accountIdentifier: '', bic: '', phone: '',
  });
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    const data = await api('/payouts/status');
    setPayout(data.payout);
    if (data.payout?.country) setCountry(data.payout.country);
    return data.payout;
  }, []);

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
      navigate(returnTo, { replace: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    refreshStatus().catch((error) => toast.error(error.message));
  }, [refreshStatus]);

  let content;
  if (payout?.ready && !editingAccount) {
    content = <section className="payout-setup-content payout-complete-panel">
      <div className="payout-ready"><Icon name="shieldCheck" size={23} /><div><b>{t('payments.payout.manual.ready')}</b><p>{t('payments.payout.manual.readyHelp', { country: countryName(payout.country), last4: payout.accountLast4 })}</p></div></div>
      <div className="payout-manual-actions">
        <button className="btn btn-secondary" type="button" onClick={() => setEditingAccount(true)}><Icon name="edit" size={17} />{t('payments.payout.manual.change')}</button>
        <button className="btn btn-primary" onClick={() => navigate(returnTo, { replace: true })}><Icon name="check" size={17} />{t('payments.payout.finish')}</button>
      </div>
    </section>;
  } else {
    const isMorocco = country === 'MA';
    content = <form className="payout-setup-content payout-manual-form" onSubmit={saveManualAccount}>
      <div className="payout-inline-intro"><span className="payout-inline-icon"><Icon name="bank" size={22} /></span><div><h2>{t('payments.payout.manual.bankTitle')}</h2><p>{t('payments.payout.manual.bankIntro')}</p></div></div>
      <label className="field"><span>{t('payments.payout.country')}</span><select value={country} onChange={(event) => setCountry(event.target.value)}>{COUNTRIES.map(([code, name]) => <option key={code} value={code}>{countryName(code, name)}</option>)}</select></label>
      <label className="field"><span>{t('payments.payout.manual.holder')}</span><input value={bank.holderName} maxLength={120} autoComplete="name" onChange={(event) => setBank((current) => ({ ...current, holderName: event.target.value }))} placeholder={t('payments.payout.manual.holderPlaceholder')} required /></label>
      <label className="field"><span>{t('payments.payout.manual.bank')}</span><input value={bank.bankName} maxLength={100} onChange={(event) => setBank((current) => ({ ...current, bankName: event.target.value }))} placeholder={t('payments.payout.manual.bankPlaceholder')} required /></label>
      <label className="field"><span>{t(isMorocco ? 'payments.payout.manual.rib' : 'payments.payout.manual.iban')}</span><input value={bank.accountIdentifier} maxLength={34} inputMode={isMorocco ? 'numeric' : 'text'} autoCapitalize="characters" onChange={(event) => setBank((current) => ({ ...current, accountIdentifier: event.target.value }))} placeholder={t(isMorocco ? 'payments.payout.manual.ribPlaceholder' : 'payments.payout.manual.ibanPlaceholder')} required /></label>
      {!isMorocco && <label className="field"><span>{t('payments.payout.manual.bic')}</span><input value={bank.bic} maxLength={11} autoCapitalize="characters" onChange={(event) => setBank((current) => ({ ...current, bic: event.target.value }))} placeholder={t('payments.payout.manual.bicPlaceholder')} /></label>}
      {isMorocco && <label className="field"><span>{t('payments.payout.manual.phone')}</span><input value={bank.phone} maxLength={20} type="tel" autoComplete="tel" onChange={(event) => setBank((current) => ({ ...current, phone: event.target.value }))} placeholder="+212 6 00 00 00 00" required /></label>}
      <p className="payout-country-note">{t('payments.payout.manual.security')}</p>
      <div className="payout-form-actions">
        <button className="btn btn-primary payout-start-btn" type="submit" disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t('payments.payout.manual.save')}</button>
        <Link className="btn btn-secondary" to={returnTo}><Icon name="arrowLeft" size={17} />{t('common.back')}</Link>
      </div>
    </form>;
  }

  return <main className="focus-flow payout-setup-page">
    <header className="focus-flow-header">
      <Link to={returnTo} className="focus-flow-back" aria-label={t('common.back')}><Icon name="arrowLeft" size={19} /><span>{t('common.back')}</span></Link>
      <div><span>{t('payments.payout.eyebrow')}</span><h1>{t('payments.payout.title')}</h1><p>{t('payments.payout.intro')}</p></div>
    </header>

    {content}
  </main>;
}

function safeReturn(value) {
  const path = String(value || '/en-cours');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/en-cours';
}
