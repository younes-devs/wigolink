import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../app/authContext.jsx';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { useToast } from '../../../Toast.jsx';
import { Stepper } from '../../../components.jsx';
import {
  TripTransportIcon,
  TransportModePicker,
  transportIconName,
  transportLabel,
} from '../components/TripTransport.jsx';
import { LocationInput } from '../components/LocationInput.jsx';
import { dateLocale, t, useLang } from '../../../i18n.js';

const DRAFT_KEY = 'wigolink:trip-draft:v1';

function defaultDraft() {
  return {
    transportMode: 'plane',
    from: '',
    fromLocationId: '',
    fromCountryCode: '',
    to: '',
    toLocationId: '',
    toCountryCode: '',
    date: '',
    capacityKg: 6,
    price: 25,
    description: t('trips.publish.description.default'),
    conditions: t('trips.publish.conditions.default'),
  };
}

function readDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY));
    return saved && typeof saved === 'object' ? { ...defaultDraft(), ...saved } : defaultDraft();
  } catch {
    return defaultDraft();
  }
}

export default function CreateTrip() {
  useLang();
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(readDraft);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [createdTrip, setCreatedTrip] = useState(null);
  const today = dateInputValue(new Date());
  const steps = [
    t('trips.wizard.step.transport'),
    t('trips.wizard.step.route'),
    t('trips.wizard.step.date'),
    t('trips.wizard.step.capacity'),
    t('trips.wizard.step.details'),
    t('trips.wizard.step.review'),
  ];

  useEffect(() => {
    if (createdTrip) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
    } catch {
      // La publication reste utilisable si le stockage local est indisponible.
    }
  }, [form, createdTrip]);

  const update = (field, value) => {
    setError('');
    setForm((current) => ({ ...current, [field]: value }));
  };

  const validationMessage = (targetStep = step) => {
    if (targetStep === 0 && !['plane', 'car'].includes(form.transportMode)) return t('trips.wizard.error.transport');
    if (targetStep === 1) {
      if (!form.from.trim() || !form.to.trim()) return t('trips.wizard.error.route');
      if (
        (form.fromLocationId && form.fromLocationId === form.toLocationId)
        || form.from.trim().toLocaleLowerCase() === form.to.trim().toLocaleLowerCase()
      ) return t('trips.wizard.error.sameCity');
    }
    if (targetStep === 2) {
      if (!form.date) return t('trips.wizard.error.date');
      if (form.date < today) return t('trips.wizard.error.pastDate');
    }
    if (targetStep === 3 && (!Number(form.capacityKg) || Number(form.capacityKg) < 1 || Number(form.capacityKg) > 30)) {
      return t('trips.wizard.error.capacity');
    }
    if (targetStep === 4) {
      if (!Number(form.price) || Number(form.price) < 1) return t('trips.wizard.error.price');
      if (form.description.trim().length < 10) return t('trips.wizard.error.description');
      if (form.conditions.trim().length < 5) return t('trips.wizard.error.conditions');
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
    setStep((current) => Math.max(0, current - 1));
  };

  const submit = async () => {
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
      const data = await api('/trips', { method: 'POST', body: form });
      try {
        localStorage.removeItem(DRAFT_KEY);
      } catch {
        // Le trajet est publié même si le nettoyage du brouillon échoue.
      }
      setCreatedTrip(data.trip);
      toast.success(t('trips.toast.published'));
    } catch (submitError) {
      toast.error(submitError.message);
      setError(submitError.message);
    } finally {
      setBusy(false);
    }
  };

  const resetDraft = () => {
    try {
      localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Le formulaire peut quand même être remis à zéro.
    }
    setForm(defaultDraft());
    setStep(0);
    setError('');
  };

  if (user?.kycStatus !== 'verified') {
    return (
      <main className="trip-publish-wizard wizard-kyc-gate">
        <button className="wizard-close" type="button" onClick={() => navigate('/trajets')} aria-label={t('common.close')}>
          <Icon name="x" size={19} />
        </button>
        <div className="wizard-success-mark"><Icon name="shieldCheck" size={30} /></div>
        <span className="wizard-eyebrow">{t('trips.wizard.kyc.eyebrow')}</span>
        <h1>{t('trips.wizard.kyc.title')}</h1>
        <p>{t('trips.wizard.kyc.text')}</p>
        <Link className="btn btn-primary" to="/verification">
          {t('trips.wizard.kyc.action')} <Icon name="arrowRight" size={17} />
        </Link>
      </main>
    );
  }

  if (createdTrip) {
    return (
      <main className="trip-publish-wizard trip-publish-success">
        <div className="wizard-success-mark"><Icon name="check" size={30} /></div>
        <span className="wizard-eyebrow">{t('trips.wizard.success.eyebrow')}</span>
        <h1>{t('trips.wizard.success.title')}</h1>
        <p>{t('trips.wizard.success.text')}</p>
        <TripPreview trip={createdTrip} />
        <div className="wizard-success-actions">
          <Link className="btn btn-primary" to={`/trajets/${createdTrip.id}`}>
            {t('trips.wizard.success.view')} <Icon name="arrowRight" size={17} />
          </Link>
          <button className="btn btn-ghost" type="button" onClick={() => navigate('/trajets')}>
            {t('trips.wizard.success.back')}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="trip-publish-wizard">
      <header className="wizard-header">
        <button className="wizard-close" type="button" onClick={() => navigate('/trajets')} aria-label={t('common.close')}>
          <Icon name="x" size={19} />
        </button>
        <div className="wizard-heading">
          <span className="wizard-eyebrow">{t('trips.wizard.eyebrow')}</span>
          <h1>{t('trips.wizard.title')}</h1>
          <p>{t('trips.wizard.saved')}</p>
        </div>
        <button className="wizard-reset" type="button" onClick={resetDraft}>{t('trips.wizard.reset')}</button>
      </header>

      <Stepper labels={steps} current={step} onGo={(target) => { setError(''); setStep(target); }} />

      <form className="wizard-form" onSubmit={(event) => event.preventDefault()}>
        <section className="wizard-stage" aria-labelledby={`wizard-step-${step}`}>
          <WizardIntro step={step} />

          {step === 0 && (
            <TransportModePicker
              className="wizard-transport-picker"
              value={form.transportMode}
              onChange={(transportMode) => update('transportMode', transportMode)}
            />
          )}

          {step === 1 && (
            <div className="wizard-route-fields">
              <div className="field">
                <LocationInput
                  id="trip-from"
                  label={t('trips.from')}
                  withIcon
                  value={form.from}
                  locationId={form.fromLocationId}
                  countryCode={form.fromCountryCode}
                  placeholder={t('trips.wizard.route.fromPlaceholder')}
                  onChange={({ value, locationId, countryCode }) => {
                    setError('');
                    setForm((current) => ({
                      ...current,
                      from: value,
                      fromLocationId: locationId,
                      fromCountryCode: countryCode,
                    }));
                  }}
                />
              </div>
              <button className="wizard-swap" type="button" onClick={() => setForm((current) => ({
                ...current,
                from: current.to,
                fromLocationId: current.toLocationId,
                fromCountryCode: current.toCountryCode,
                to: current.from,
                toLocationId: current.fromLocationId,
                toCountryCode: current.fromCountryCode,
              }))} aria-label={t('trips.wizard.route.swap')}>
                <Icon name="repeat" size={18} />
              </button>
              <div className="field">
                <LocationInput
                  id="trip-to"
                  label={t('trips.to')}
                  withIcon
                  value={form.to}
                  locationId={form.toLocationId}
                  countryCode={form.toCountryCode}
                  placeholder={t('trips.wizard.route.toPlaceholder')}
                  onChange={({ value, locationId, countryCode }) => {
                    setError('');
                    setForm((current) => ({
                      ...current,
                      to: value,
                      toLocationId: locationId,
                      toCountryCode: countryCode,
                    }));
                  }}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="wizard-date-choice">
              <div className="wizard-date-icon"><Icon name="calendar" size={26} /></div>
              <div className="field">
                <label htmlFor="trip-date">{t('trips.ticketDate')}</label>
                <input id="trip-date" type="date" min={today} value={form.date} onChange={(event) => update('date', event.target.value)} />
              </div>
              <div className="wizard-date-presets">
                {[
                  { days: 1, label: t('trips.wizard.date.tomorrow') },
                  { days: 7, label: t('trips.wizard.date.inDays', { count: 7 }) },
                  { days: 30, label: t('trips.wizard.date.inDays', { count: 30 }) },
                ].map((choice) => {
                  const value = dateAfter(choice.days);
                  return (
                    <button key={choice.days} type="button" className={form.date === value ? 'active' : ''}
                      onClick={() => update('date', value)}>{choice.label}</button>
                  );
                })}
              </div>
              {form.date && <p>{formatFullDate(form.date)}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="wizard-capacity-choice">
              <div className="wizard-capacity-value">
                <span>{form.capacityKg}</span>
                <small>kg</small>
              </div>
              <label htmlFor="trip-capacity">{t('trips.wizard.capacity.label')}</label>
              <input id="trip-capacity" type="range" min="1" max="30" step="1" value={form.capacityKg}
                onChange={(event) => update('capacityKg', Number(event.target.value))} />
              <div className="wizard-range-labels">
                <span>{t('trips.wizard.capacity.kg', { value: 1 })}</span>
                <span>{t('trips.wizard.capacity.kg', { value: 30 })}</span>
              </div>
              <div className="wizard-capacity-presets">
                {[2, 5, 10, 20].map((value) => (
                  <button key={value} type="button" className={Number(form.capacityKg) === value ? 'active' : ''}
                    onClick={() => update('capacityKg', value)}>{t('trips.wizard.capacity.kg', { value })}</button>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="wizard-details-fields">
              <div className="field wizard-price-field">
                <label htmlFor="trip-price">{t('trips.proposedPrice')}</label>
                <div className="wizard-price-input">
                  <input id="trip-price" type="number" min="1" inputMode="decimal" value={form.price}
                    onChange={(event) => update('price', event.target.value)} />
                  <span>EUR</span>
                </div>
                <small>{t('trips.wizard.price.hint')}</small>
              </div>
              <div className="field">
                <label htmlFor="trip-description">{t('common.description')}</label>
                <textarea id="trip-description" rows="3" maxLength="700" value={form.description}
                  onChange={(event) => update('description', event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="trip-conditions">{t('trips.conditions')}</label>
                <textarea id="trip-conditions" rows="3" maxLength="700" value={form.conditions}
                  onChange={(event) => update('conditions', event.target.value)} />
              </div>
            </div>
          )}

          {step === 5 && <TripPreview trip={form} />}

          {error && <div className="wizard-error" role="alert"><Icon name="alert" size={17} />{error}</div>}
        </section>

        <footer className="wizard-actions">
          <button className="btn btn-ghost" type="button" onClick={previous} disabled={step === 0 || busy}>
            <Icon name="arrowLeft" size={17} />{t('common.back')}
          </button>
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" type="button" onClick={next}>
              {t('common.continue')}<Icon name="arrowRight" size={17} />
            </button>
          ) : (
            <button className="btn btn-primary" type="button" onClick={submit} disabled={busy}>
              {busy ? <span className="spinner" /> : <Icon name={transportIconName(form.transportMode)} size={18} />}
              {t('trips.publish.submit')}
            </button>
          )}
        </footer>
      </form>
    </main>
  );
}

function WizardIntro({ step }) {
  const titles = [
    t('trips.wizard.transport.title'),
    t('trips.wizard.route.title'),
    t('trips.wizard.date.title'),
    t('trips.wizard.capacity.title'),
    t('trips.wizard.details.title'),
    t('trips.wizard.review.title'),
  ];
  const descriptions = [
    t('trips.wizard.transport.text'),
    t('trips.wizard.route.text'),
    t('trips.wizard.date.text'),
    t('trips.wizard.capacity.text'),
    t('trips.wizard.details.text'),
    t('trips.wizard.review.text'),
  ];
  return (
    <div className="wizard-stage-intro">
      <span>{t('trips.wizard.progress', { current: step + 1, total: titles.length })}</span>
      <h2 id={`wizard-step-${step}`}>{titles[step]}</h2>
      <p>{descriptions[step]}</p>
    </div>
  );
}

function TripPreview({ trip }) {
  return (
    <article className="wizard-trip-preview">
      <div className="wizard-preview-label"><Icon name="eye" size={16} />{t('trips.wizard.preview')}</div>
      <div className="trip-post-route">
        <div><b>{trip.from || t('trips.from')}</b><span>{t('trips.from')}</span></div>
        <TripTransportIcon mode={trip.transportMode} size={21} />
        <div><b>{trip.to || t('trips.to')}</b><span>{t('trips.to')}</span></div>
      </div>
      <div className="wizard-preview-meta">
        <span><Icon name="calendar" size={16} /><b>{formatFullDate(trip.departureDate || trip.date)}</b></span>
        <span><Icon name="luggage" size={16} /><b>{trip.capacityKg} kg</b></span>
        <span><Icon name="euro" size={16} /><b>{trip.price} EUR</b></span>
      </div>
      <div className="wizard-preview-copy">
        <span className="pill pill-teal"><Icon name={transportIconName(trip.transportMode)} size={13} />{transportLabel(trip.transportMode)}</span>
        <p>{trip.description}</p>
        <small>{trip.conditions}</small>
      </div>
    </article>
  );
}

function formatFullDate(value) {
  if (!value) return t('trips.date.pending');
  return new Intl.DateTimeFormat(dateLocale(), {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${String(value).slice(0, 10)}T12:00:00`));
}

function dateAfter(days) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return dateInputValue(value);
}

function dateInputValue(value) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
