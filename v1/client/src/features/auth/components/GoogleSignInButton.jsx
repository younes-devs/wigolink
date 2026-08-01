import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api.js';
import { t } from '../../../i18n.js';

let googleSdkPromise;

function loadGoogleSdk() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google);
  if (googleSdkPromise) return googleSdkPromise;

  googleSdkPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-wigolink-google-auth]');
    const script = existing || document.createElement('script');
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.dataset.wigolinkGoogleAuth = 'true';
      document.head.appendChild(script);
    }
    script.addEventListener('load', () => resolve(window.google), { once: true });
    script.addEventListener('error', () => reject(new Error(t('auth.google.unavailable'))), { once: true });
  });
  return googleSdkPromise;
}

export default function GoogleSignInButton({
  disabled = false,
  onCredential,
  onError,
}) {
  const containerRef = useRef(null);
  const callbackRef = useRef(onCredential);
  const [clientId, setClientId] = useState('');

  callbackRef.current = onCredential;

  useEffect(() => {
    let active = true;
    api('/config')
      .then((config) => {
        if (active) setClientId(config.googleClientId || '');
      })
      .catch((error) => onError?.(error));
    return () => { active = false; };
  }, [onError]);

  useEffect(() => {
    if (!clientId || !containerRef.current) return undefined;
    let active = true;

    loadGoogleSdk()
      .then((google) => {
        if (!active || !containerRef.current || !google?.accounts?.id) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => callbackRef.current?.(credential),
          cancel_on_tap_outside: true,
        });
        containerRef.current.replaceChildren();
        google.accounts.id.renderButton(containerRef.current, {
          type: 'icon',
          theme: 'outline',
          size: 'large',
          shape: 'square',
          text: 'continue_with',
          locale: document.documentElement.lang || 'fr',
        });
      })
      .catch((error) => onError?.(error));

    return () => { active = false; };
  }, [clientId, onError]);

  if (!clientId) return null;

  return (
    <div className={`google-signin${disabled ? ' is-disabled' : ''}`} aria-disabled={disabled}>
      <div ref={containerRef} />
      {disabled && <span className="google-signin-guard" aria-hidden="true" />}
    </div>
  );
}
