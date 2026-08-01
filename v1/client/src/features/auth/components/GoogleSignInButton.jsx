import { useEffect, useRef, useState } from 'react';
import { api } from '../../../api.js';
import { GoogleLogo, Icon } from '../../../Icons.jsx';
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
  const tokenClientRef = useRef(null);
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
    if (!clientId) return undefined;
    let active = true;

    loadGoogleSdk()
      .then((google) => {
        if (!active || !google?.accounts?.oauth2) return;
        tokenClientRef.current = google.accounts.oauth2.initTokenClient({
          client_id: clientId,
          scope: 'openid email profile',
          callback: (response) => {
            if (response?.error || !response?.access_token) {
              onError?.(new Error(t('auth.google.unavailable')));
              return;
            }
            callbackRef.current?.({ accessToken: response.access_token });
          },
        });
      })
      .catch((error) => onError?.(error));

    return () => { active = false; tokenClientRef.current = null; };
  }, [clientId, onError]);

  const startGoogle = () => {
    if (disabled) return;
    if (!tokenClientRef.current) {
      onError?.(new Error(t('auth.google.unavailable')));
      return;
    }
    tokenClientRef.current.requestAccessToken({ prompt: 'select_account' });
  };

  return (
    <button ref={containerRef} type="button" className="auth-method-card" onClick={startGoogle} disabled={disabled || !clientId}>
      <span className="auth-method-icon"><GoogleLogo size={25} /></span>
      <span>{t('auth.method.google')}</span>
      <Icon name="arrowRight" size={18} />
    </button>
  );
}
