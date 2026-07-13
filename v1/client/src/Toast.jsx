import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Icon } from './Icons.jsx';

const ToastCtx = createContext(null);
export const useToast = () => useContext(ToastCtx);

const ICONS = { success: 'check', error: 'alert', info: 'shieldCheck' };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback((message, type = 'info', duration = 3200, action = null) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, message, type, action }]);
    if (duration) setTimeout(() => dismiss(id), duration);
    return id;
  }, [dismiss]);

  const toast = {
    success: (m, d) => push(m, 'success', d),
    error: (m, d) => push(m, 'error', d ?? 4200),
    info: (m, d) => push(m, 'info', d),
    // Toast avec bouton d'action (PRD UI/UX U17 : « Annuler » sur une action réversible).
    action: (m, label, onAction, d = 5000) => push(m, 'info', d, { label, onAction }),
    dismiss,
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.type}`} onClick={() => !t.action && dismiss(t.id)}>
            <Icon name={ICONS[t.type]} size={16} />
            <span>{t.message}</span>
            {t.action && (
              <button className="toast-action" onClick={(e) => { e.stopPropagation(); t.action.onAction(); dismiss(t.id); }}>
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
