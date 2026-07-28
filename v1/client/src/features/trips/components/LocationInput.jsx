import { useEffect, useId, useRef, useState } from 'react';
import { api } from '../../../api';
import { Icon } from '../../../Icons.jsx';
import { t } from '../../../i18n.js';

const MIN_QUERY_LENGTH = 2;
const SUGGESTION_DELAY_MS = 180;

export function LocationInput({
  id,
  value,
  locationId = '',
  countryCode = '',
  onChange,
  placeholder,
  label,
  className = '',
  inputClassName = '',
  withIcon = false,
}) {
  const generatedId = useId();
  const inputId = id || `location-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const requestRef = useRef(0);
  const blurTimerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeIndex, setActiveIndex] = useState(-1);
  const trimmedValue = String(value || '').trim();

  useEffect(() => () => clearTimeout(blurTimerRef.current), []);

  useEffect(() => {
    if (!open || trimmedValue.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setActiveIndex(-1);
      return undefined;
    }

    const requestId = ++requestRef.current;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const data = await api(`/locations/suggest?q=${encodeURIComponent(trimmedValue)}&country=MA&limit=6`);
        if (requestId !== requestRef.current) return;
        setSuggestions(data.locations || []);
        setActiveIndex(-1);
      } catch {
        if (requestId === requestRef.current) setSuggestions([]);
      } finally {
        if (requestId === requestRef.current) setLoading(false);
      }
    }, SUGGESTION_DELAY_MS);

    return () => clearTimeout(timer);
  }, [open, trimmedValue]);

  const emitText = (nextValue) => {
    onChange({
      value: nextValue,
      locationId: '',
      countryCode: '',
    });
  };

  const select = (location) => {
    onChange({
      value: location.name,
      locationId: location.id,
      countryCode: location.countryCode,
    });
    setOpen(false);
    setSuggestions([]);
    setActiveIndex(-1);
  };

  const onKeyDown = (event) => {
    if (event.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (!open || !suggestions.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((current) => (current + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => (current <= 0 ? suggestions.length - 1 : current - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      select(suggestions[activeIndex]);
    }
  };

  const input = (
    <input
      id={inputId}
      className={inputClassName}
      value={value}
      autoComplete="off"
      spellCheck="false"
      placeholder={placeholder}
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={open}
      aria-controls={listId}
      aria-activedescendant={activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
      onFocus={() => setOpen(true)}
      onChange={(event) => {
        emitText(event.target.value);
        setOpen(true);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        blurTimerRef.current = setTimeout(() => {
          setOpen(false);
          setActiveIndex(-1);
        }, 120);
      }}
    />
  );

  return (
    <div className={`location-input${className ? ` ${className}` : ''}`}>
      {label && <label htmlFor={inputId}>{label}</label>}
      {withIcon ? (
        <div className="wizard-input-icon">
          <Icon name="mapPin" size={18} />
          {input}
        </div>
      ) : input}

      {open && trimmedValue.length >= MIN_QUERY_LENGTH && (
        <div id={listId} className="location-suggestions" role="listbox" aria-label={t('locations.suggestions')}>
          {loading && <div className="location-suggestion-state">{t('locations.searching')}</div>}
          {!loading && suggestions.map((location, index) => (
            <button
              id={`${listId}-${index}`}
              className={`location-suggestion${activeIndex === index ? ' active' : ''}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              key={location.id}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => select(location)}
            >
              <span className="location-suggestion-pin"><Icon name="mapPin" size={16} /></span>
              <span>
                <b>{location.name}</b>
                <small>
                  {location.matchedAlias && location.matchedAlias.toLocaleLowerCase() !== location.name.toLocaleLowerCase()
                    ? t('locations.correctedFrom', { value: location.matchedAlias })
                    : t('locations.country.ma')}
                </small>
              </span>
              {location.id === locationId && countryCode === location.countryCode && <Icon name="check" size={16} />}
            </button>
          ))}
          {!loading && suggestions.length === 0 && (
            <div className="location-suggestion-state">
              <b>{t('locations.noResult')}</b>
              <span>{t('locations.keepText')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
