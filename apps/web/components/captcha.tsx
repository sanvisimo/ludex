import { useTheme } from 'next-themes';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from '@repo/ui';
import { useLocale, useTranslations } from 'use-intl';

// Il CAPTCHA di accesso, registrazione e recupero password (rilascio):
// Cloudflare Turnstile. Il widget dà un token monouso che parte con la
// richiesta nell'intestazione `x-captcha-response`, e il plugin `captcha` di
// Better Auth lo verifica. Senza chiave pubblica non compare niente e i form
// funzionano come prima: in sviluppo, e finché il server non ha la segreta.
const siteKey = process.env.PUBLIC_TURNSTILE_SITE_KEY;

type Turnstile = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      theme: 'light' | 'dark';
      language: string;
      callback: (token: string) => void;
      'expired-callback': () => void;
      'error-callback': () => void;
    },
  ) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

// Lo script si carica una volta sola, alla prima pagina che ne ha bisogno, e
// non in tutte le altre: lì non ha niente da fare.
let loading: Promise<Turnstile> | null = null;

function loadTurnstile() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src =
      'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error());
    script.onerror = () => {
      loading = null;
      reject(new Error('Turnstile non caricato'));
    };
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Il widget e il suo token. `headers` va passato alla chiamata di Better
 * Auth; `ready` dice se si può inviare (sempre, se il CAPTCHA è spento).
 * Il token vale una volta: dopo ogni invio, riuscito o no, si chiama `reset`.
 */
export function useCaptcha() {
  const t = useTranslations('captcha');
  const locale = useLocale();
  const { resolvedTheme } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  // Lo script non arriva: un blocco del browser o della rete. Senza un
  // avviso il bottone resterebbe spento senza dire perché.
  const [unavailable, setUnavailable] = useState(false);
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const widgetId = useRef<string | null>(null);

  useEffect(() => {
    if (!siteKey || !container) return;
    let cancelled = false;
    loadTurnstile().then(
      (turnstile) => {
        if (cancelled) return;
        widgetId.current = turnstile.render(container, {
          sitekey: siteKey,
          theme: resolvedTheme === 'dark' ? 'dark' : 'light',
          language: locale,
          callback: setToken,
          'expired-callback': () => setToken(null),
          'error-callback': () => setToken(null),
        });
      },
      () => {
        if (!cancelled) setUnavailable(true);
      },
    );
    return () => {
      cancelled = true;
      if (widgetId.current) window.turnstile?.remove(widgetId.current);
      widgetId.current = null;
    };
    // Tema e lingua contano al primo disegno: cambiarli a metà modulo non
    // deve buttare via un token già preso.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [container]);

  const reset = useCallback(() => {
    if (!widgetId.current) return;
    setToken(null);
    window.turnstile?.reset(widgetId.current);
  }, []);

  return {
    // Un `div` e non uno `YStack`: Turnstile ci scrive dentro il suo iframe,
    // e vuole un nodo del DOM. 65 px è l'altezza del widget, così il modulo
    // non salta quando arriva.
    widget: siteKey ? (
      unavailable ? (
        <Text role="alert" fontSize={14} lineHeight={20} color="$red11">
          {t('unavailable')}
        </Text>
      ) : (
        <div ref={setContainer} className="min-h-[65px]" />
      )
    ) : null,
    ready: !siteKey || token !== null,
    headers: token ? { 'x-captcha-response': token } : undefined,
    reset,
  };
}
