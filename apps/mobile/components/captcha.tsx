import { Text } from '@repo/ui';
import { useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { useLocale, useTranslations } from 'use-intl';

import { turnstileSiteKey, webUrl } from '../lib/env';
import { usePreferences } from '../lib/preferences';

// Turnstile non ha un SDK per React Native: il widget gira in una WebView, e
// la pagina dichiara come origine quella del sito (`baseUrl`), perché la
// chiave accetta solo i domini registrati su Cloudflare. Il token arriva con
// `postMessage` e parte nell'intestazione `x-captcha-response`, come sul web.
function page(siteKey: string, theme: 'light' | 'dark', language: string) {
  return `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>html,body{margin:0;background:transparent}</style>
<script>
function post(m){window.ReactNativeWebView.postMessage(JSON.stringify(m))}
var id;
function start(){
  id = turnstile.render('#w', {
    sitekey: ${JSON.stringify(siteKey)},
    theme: ${JSON.stringify(theme)},
    language: ${JSON.stringify(language)},
    callback: function(t){post({token:t})},
    'expired-callback': function(){post({token:null})},
    'error-callback': function(){post({token:null})}
  });
}
window.resetWidget = function(){ if (id !== undefined) turnstile.reset(id); post({token:null}); };
</script>
<script src="https://challenges.cloudflare.com/turnstile/v0/api.js?onload=start&render=explicit" async onerror="post({unavailable:true})"></script>
</head><body><div id="w"></div></body></html>`;
}

/**
 * Il widget e il suo token, con la stessa forma di `useCaptcha` del web:
 * `headers` va alla chiamata di Better Auth, `ready` dice se si può inviare
 * (sempre, se il CAPTCHA è spento), e dopo ogni invio si chiama `reset`.
 */
export function useCaptcha() {
  const t = useTranslations('captcha');
  const locale = useLocale();
  const { dark } = usePreferences();
  const [token, setToken] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const view = useRef<WebView>(null);

  if (!turnstileSiteKey)
    return { widget: null, headers: undefined, ready: true, reset: () => {} };

  const widget = unavailable ? (
    <Text color="$red11">{t('unavailable')}</Text>
  ) : (
    <WebView
      ref={view}
      source={{
        html: page(turnstileSiteKey, dark ? 'dark' : 'light', locale),
        baseUrl: webUrl,
      }}
      originWhitelist={['*']}
      scrollEnabled={false}
      style={{ width: 300, height: 70, backgroundColor: 'transparent' }}
      onMessage={(event) => {
        const message = JSON.parse(event.nativeEvent.data) as {
          token?: string | null;
          unavailable?: boolean;
        };
        if (message.unavailable) setUnavailable(true);
        else setToken(message.token ?? null);
      }}
    />
  );

  return {
    widget,
    headers: token ? { 'x-captcha-response': token } : undefined,
    ready: token !== null,
    reset: () => view.current?.injectJavaScript('resetWidget(); true;'),
  };
}
