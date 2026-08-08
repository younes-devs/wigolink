import { useEffect, useRef } from 'react';
import { EMAIL_CODE_LENGTH, insertEmailCode, normalizeEmailCode } from './emailCode.js';

export default function EmailCodeInput({
  value,
  onChange,
  onComplete,
  label,
  disabled = false,
  autoFocus = true,
  length = EMAIL_CODE_LENGTH,
}) {
  const inputs = useRef([]);
  const completedCode = useRef('');
  const focusedOnce = useRef(false);
  const code = normalizeEmailCode(value, length);

  useEffect(() => {
    if (!autoFocus || disabled || focusedOnce.current) return undefined;
    focusedOnce.current = true;
    const frame = requestAnimationFrame(() => inputs.current[Math.min(code.length, length - 1)]?.focus());
    return () => cancelAnimationFrame(frame);
  }, [autoFocus, code.length, disabled, length]);

  useEffect(() => {
    if (code.length < length) {
      completedCode.current = '';
      return;
    }
    if (disabled || !onComplete || completedCode.current === code) return;
    completedCode.current = code;
    onComplete(code);
  }, [code, disabled, length, onComplete]);

  const focus = (index) => inputs.current[Math.max(0, Math.min(index, length - 1))]?.focus();
  const updateAt = (index, rawValue) => {
    const digits = normalizeEmailCode(rawValue, length);
    onChange(insertEmailCode(code, index, rawValue, length));
    if (digits) requestAnimationFrame(() => focus(index + digits.length));
  };

  return (
    <div className="email-code-field">
      {label && <span className="email-code-label">{label}</span>}
      <div className={`email-code-inputs ${disabled ? 'is-busy' : ''}`} role="group" aria-label={label} aria-busy={disabled}>
        {Array.from({ length }, (_, index) => (
          <input
            key={index}
            ref={(element) => { inputs.current[index] = element; }}
            className={`email-code-input ${code[index] ? 'is-filled' : ''}`}
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            value={code[index] || ''}
            maxLength={length}
            disabled={disabled}
            aria-label={`${label || 'Code'} ${index + 1}/${length}`}
            onFocus={(event) => {
              if (index > code.length) focus(code.length);
              else event.currentTarget.select();
            }}
            onChange={(event) => updateAt(index, event.target.value)}
            onPaste={(event) => {
              const pasted = normalizeEmailCode(event.clipboardData.getData('text'), length);
              if (!pasted) return;
              event.preventDefault();
              updateAt(index, pasted);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Backspace') {
                event.preventDefault();
                const target = code[index] ? index : index - 1;
                onChange(code.slice(0, Math.max(0, target)));
                requestAnimationFrame(() => focus(target));
              } else if (event.key === 'ArrowLeft') {
                event.preventDefault();
                focus(index - 1);
              } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                focus(index + 1);
              }
            }}
          />
        ))}
      </div>
    </div>
  );
}
