import { Icon } from '../../../Icons.jsx';
import { t } from '../../../i18n.js';

export function normalizeTransportMode(value) {
  return value === 'car' ? 'car' : 'plane';
}

export function transportIconName(value) {
  return normalizeTransportMode(value) === 'car' ? 'car' : 'plane';
}

export function transportLabel(value) {
  return t(normalizeTransportMode(value) === 'car' ? 'trips.transport.car' : 'trips.transport.plane');
}

export function TripTransportIcon({ mode, size = 20, className = '' }) {
  const normalized = normalizeTransportMode(mode);
  return (
    <span className={`trip-transport-icon ${className}`.trim()} title={transportLabel(normalized)} aria-label={transportLabel(normalized)}>
      <Icon name={transportIconName(normalized)} size={size} />
    </span>
  );
}

export function TransportModePicker({ value, onChange, className = '' }) {
  const selected = normalizeTransportMode(value);
  return (
    <fieldset className={`transport-mode-field ${className}`.trim()}>
      <legend>{t('trips.transport.question')}</legend>
      <div className="transport-mode-picker">
        {['plane', 'car'].map((mode) => (
          <button
            key={mode}
            type="button"
            className={selected === mode ? 'active' : ''}
            aria-pressed={selected === mode}
            onClick={() => onChange(mode)}
          >
            <Icon name={transportIconName(mode)} size={20} />
            <span>
              <b>{transportLabel(mode)}</b>
              <small>{t(mode === 'car' ? 'trips.transport.car.hint' : 'trips.transport.plane.hint')}</small>
            </span>
            <span className="transport-mode-check"><Icon name="check" size={13} /></span>
          </button>
        ))}
      </div>
    </fieldset>
  );
}
