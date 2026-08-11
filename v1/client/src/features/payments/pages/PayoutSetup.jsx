import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Stepper } from '../../../components.jsx';
import { api } from '../../../core/api.js';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { getLang, t, useLang } from '../../../i18n.js';

const COUNTRIES = [
  ['MA', 'Maroc'], ['BE', 'Belgique'], ['FR', 'France'],
];

const EMPTY_BANK = {
  holderName: '', bankName: '', accountIdentifier: '', bic: '', phone: '',
};

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
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [bank, setBank] = useState(EMPTY_BANK);
  const [busy, setBusy] = useState(false);
  const steps = [
    t('payments.payout.wizard.step.country'),
    t('payments.payout.wizard.step.identity'),
    t('payments.payout.wizard.step.bank'),
    t('payments.payout.wizard.step.review'),
  ];

  const refreshStatus = useCallback(async () => {
    const data = await api('/payouts/status');
    setPayout(data.payout);
    if (data.payout?.country) setCountry(data.payout.country);
    return data.payout;
  }, []);

  const updateBank = (field, value) => {
    setError('');
    setBank((current) => ({ ...current, [field]: value }));
  };

  const validationMessage = (targetStep = step) => {
    if (targetStep === 0 && !COUNTRIES.some(([code]) => code === country)) {
      return t('payments.payout.wizard.error.country');
    }
    if (targetStep === 1) {
      if (bank.holderName.trim().length < 3) return t('payments.payout.wizard.error.holder');
      if (bank.bankName.trim().length < 2) return t('payments.payout.wizard.error.bank');
    }
    if (targetStep === 2) {
      const account = normalizedAccount(bank.accountIdentifier);
      if (country === 'MA' && !/^\d{24}$/.test(account.replace(/\D/g, ''))) {
        return t('payments.payout.wizard.error.rib');
      }
      if (country !== 'MA' && !/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(account)) {
        return t('payments.payout.wizard.error.iban');
      }
      if (country === 'MA' && !/^\+?[0-9 ()-]{8,20}$/.test(bank.phone.trim())) {
        return t('payments.payout.wizard.error.phone');
      }
      const bic = bank.bic.trim().toUpperCase().replace(/\s+/g, '');
      if (bic && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(bic)) {
        return t('payments.payout.wizard.error.bic');
      }
    }
    return '';
  };

  const next = () => {
    const message = validationMessage();
    if (message) {
      setError(message);
      return;
    }
    setError('');
    setStep((current) => Math.min(current + 1, steps.length - 1));
  };

  const previous = () => {
    setError('');
    setStep((current) => Math.max(current - 1, 0));
  };

  const saveManualAccount = async () => {
    for (let current = 0; current < steps.length - 1; current += 1) {
      const message = validationMessage(current);
      if (message) {
        setStep(current);
        setError(message);
        return;
      }
    }
    setBusy(true);
    try {
      const data = await api('/payouts/account', {
        method: 'PUT',
        body: { country, ...bank },
      });
      setPayout(data.payout);
      setEditingAccount(false);
      setBank(EMPTY_BANK);
      setStep(0);
      toast.success(t('payments.payout.manual.saved'));
      navigate(returnTo, { replace: true });
    } catch (saveError) {
      toast.error(saveError.message);
      setError(saveError.message);
    } finally {
      setBusy(false);
    }
  };

  const beginEditing = () => {
    setBank(EMPTY_BANK);
    setStep(0);
    setError('');
    setEditingAccount(true);
  };

  useEffect(() => {
    refreshStatus().catch((statusError) => toast.error(statusError.message));
  }, [refreshStatus]);

  let content;
  if (payout?.ready && !editingAccount) {
    content = <section className="payout-setup-content payout-complete-panel">
      <div className="payout-ready"><Icon name="shieldCheck" size={23} /><div><b>{t('payments.payout.manual.ready')}</b><p>{t('payments.payout.manual.readyHelp', { country: countryName(payout.country), last4: payout.accountLast4 })}</p></div></div>
      <div className="payout-manual-actions">
        <button className="btn btn-secondary" type="button" onClick={beginEditing}><Icon name="edit" size={17} />{t('payments.payout.manual.change')}</button>
        <button className="btn btn-primary" type="button" onClick={() => navigate(returnTo, { replace: true })}><Icon name="check" size={17} />{t('payments.payout.finish')}</button>
      </div>
    </section>;
  } else {
    content = <PayoutWizard
      bank={bank}
      busy={busy}
      country={country}
      countryName={countryName}
      error={error}
      onCountryChange={(value) => { setCountry(value); setError(''); }}
      onGo={(target) => { setStep(target); setError(''); }}
      onNext={next}
      onPrevious={previous}
      onSave={saveManualAccount}
      onUpdateBank={updateBank}
      step={step}
      steps={steps}
    />;
  }

  return <main className="focus-flow payout-setup-page">
    <header className="focus-flow-header">
      <Link to={returnTo} className="focus-flow-back" aria-label={t('common.back')}><Icon name="arrowLeft" size={19} /><span>{t('common.back')}</span></Link>
      <div><span>{t('payments.payout.eyebrow')}</span><h1>{t('payments.payout.title')}</h1><p>{t('payments.payout.intro')}</p></div>
    </header>
    {content}
  </main>;
}

function PayoutWizard({ bank, busy, country, countryName, error, onCountryChange, onGo, onNext, onPrevious, onSave, onUpdateBank, step, steps }) {
  const isMorocco = country === 'MA';
  return <section className="payout-wizard-shell">
    <Stepper labels={steps} current={step} onGo={onGo} />
    <form className="payout-setup-content payout-manual-form" onSubmit={(event) => event.preventDefault()}>
      <PayoutStepIntro step={step} />

      {step === 0 && <div className="payout-country-grid" role="radiogroup" aria-label={t('payments.payout.country')}>
        {COUNTRIES.map(([code, fallback]) => <button
          className={`payout-country-choice${country === code ? ' active' : ''}`}
          key={code}
          type="button"
          role="radio"
          aria-checked={country === code}
          onClick={() => onCountryChange(code)}
        >
          <span className="payout-country-code">{code}</span>
          <span><b>{countryName(code, fallback)}</b><small>{t('payments.payout.wizard.country.available')}</small></span>
          <Icon name={country === code ? 'check' : 'arrowRight'} size={18} />
        </button>)}
        <p className="payout-expansion-note"><Icon name="info" size={17} />{t('payments.payout.wizard.country.expansion')}</p>
      </div>}

      {step === 1 && <div className="payout-fields-stack">
        <label className="field"><span>{t('payments.payout.manual.holder')}</span><input value={bank.holderName} maxLength={120} autoComplete="name" onChange={(event) => onUpdateBank('holderName', event.target.value)} placeholder={t('payments.payout.manual.holderPlaceholder')} /></label>
        <label className="field"><span>{t('payments.payout.manual.bank')}</span><input value={bank.bankName} maxLength={100} autoComplete="organization" onChange={(event) => onUpdateBank('bankName', event.target.value)} placeholder={t('payments.payout.manual.bankPlaceholder')} /></label>
        <p className="payout-country-note"><Icon name="shieldCheck" size={15} />{t('payments.payout.wizard.identity.help')}</p>
      </div>}

      {step === 2 && <div className="payout-fields-stack">
        <label className="field"><span>{t(isMorocco ? 'payments.payout.manual.rib' : 'payments.payout.manual.iban')}</span><input value={bank.accountIdentifier} maxLength={34} inputMode={isMorocco ? 'numeric' : 'text'} autoCapitalize="characters" autoComplete="off" onChange={(event) => onUpdateBank('accountIdentifier', event.target.value)} placeholder={t(isMorocco ? 'payments.payout.manual.ribPlaceholder' : 'payments.payout.manual.ibanPlaceholder')} /></label>
        {!isMorocco && <label className="field"><span>{t('payments.payout.manual.bic')}</span><input value={bank.bic} maxLength={11} autoCapitalize="characters" autoComplete="off" onChange={(event) => onUpdateBank('bic', event.target.value)} placeholder={t('payments.payout.manual.bicPlaceholder')} /></label>}
        {isMorocco && <label className="field"><span>{t('payments.payout.manual.phone')}</span><input value={bank.phone} maxLength={20} type="tel" inputMode="tel" autoComplete="tel" onChange={(event) => onUpdateBank('phone', event.target.value)} placeholder="+212 6 00 00 00 00" /></label>}
        <p className="payout-country-note"><Icon name="lock" size={15} />{t('payments.payout.manual.security')}</p>
      </div>}

      {step === 3 && <PayoutReview bank={bank} country={country} countryName={countryName} />}

      {error && <div className="wizard-error" role="alert"><Icon name="alert" size={17} />{error}</div>}
      <footer className="payout-wizard-actions">
        <button className="btn btn-ghost" type="button" onClick={onPrevious} disabled={step === 0 || busy}><Icon name="arrowLeft" size={17} />{t('common.back')}</button>
        {step < steps.length - 1
          ? <button className="btn btn-primary" type="button" onClick={onNext}>{t('common.continue')}<Icon name="arrowRight" size={17} /></button>
          : <button className="btn btn-primary" type="button" onClick={onSave} disabled={busy}>{busy ? <span className="spinner" /> : <Icon name="shieldCheck" size={17} />}{t('payments.payout.manual.save')}</button>}
      </footer>
    </form>
  </section>;
}

function PayoutStepIntro({ step }) {
  const icons = ['mapPin', 'user', 'bank', 'shieldCheck'];
  return <div className="payout-step-intro">
    <span className="payout-inline-icon"><Icon name={icons[step]} size={22} /></span>
    <div>
      <span>{t('payments.payout.wizard.progress', { current: step + 1, total: 4 })}</span>
      <h2>{t(`payments.payout.wizard.${step}.title`)}</h2>
      <p>{t(`payments.payout.wizard.${step}.help`)}</p>
    </div>
  </div>;
}

function PayoutReview({ bank, country, countryName }) {
  const account = normalizedAccount(bank.accountIdentifier);
  const last4 = account.slice(-4);
  return <div className="payout-review">
    <div className="payout-review-bank"><span><Icon name="bank" size={20} /></span><div><b>{bank.bankName}</b><small>{countryName(country)}</small></div><Icon name="shieldCheck" size={20} /></div>
    <dl>
      <div><dt>{t('payments.payout.manual.holder')}</dt><dd>{bank.holderName}</dd></div>
      <div><dt>{t(country === 'MA' ? 'payments.payout.manual.rib' : 'payments.payout.manual.iban')}</dt><dd>•••• •••• •••• {last4}</dd></div>
      {country === 'MA' && <div><dt>{t('payments.payout.manual.phone')}</dt><dd>{maskPhone(bank.phone)}</dd></div>}
      {country !== 'MA' && bank.bic && <div><dt>{t('payments.payout.manual.bic')}</dt><dd>{bank.bic.toUpperCase()}</dd></div>}
    </dl>
    <p><Icon name="lock" size={16} />{t('payments.payout.wizard.review.security')}</p>
  </div>;
}

function normalizedAccount(value) {
  return String(value || '').trim().toUpperCase().replace(/[\s-]+/g, '');
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  return phone.length > 4 ? `${'•'.repeat(Math.min(8, phone.length - 4))} ${phone.slice(-4)}` : phone;
}

function safeReturn(value) {
  const path = String(value || '/en-cours');
  return path.startsWith('/') && !path.startsWith('//') ? path : '/en-cours';
}
