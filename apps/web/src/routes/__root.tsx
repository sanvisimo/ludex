import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { IntlProvider } from 'use-intl';

import { Providers } from '@/components/providers';
import { getI18n } from '@/src/i18n';

import inter from '@fontsource-variable/inter/index.css?url';
import spaceGrotesk from '@fontsource-variable/space-grotesk/index.css?url';

import globals from '../globals.css?url';

export const Route = createRootRoute({
  // La lingua si decide una volta e poi resta: navigando non cambia, e senza
  // questo ogni cambio di pagina la richiederebbe al server. A cambiarla è
  // `router.invalidate()`, dopo che il selettore ha scritto il cookie.
  loader: () => getI18n(),
  staleTime: Infinity,
  head: ({ loaderData }) => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: loaderData?.messages.app.title },
      { name: 'description', content: loaderData?.messages.app.description },
    ],
    // I caratteri li serve l'app, non Google: `@fontsource` li mette nel
    // bundle. Ogni file è diviso per alfabeto (`unicode-range`), e il browser
    // scarica solo quello che la pagina usa.
    links: [
      // Il simbolo: l'SVG per i browser che lo leggono, l'`.ico` (16, 32 e
      // 48) per gli altri, e per iOS un PNG su fondo pieno, che lì le icone
      // trasparenti diventano nere.
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png' },
      { rel: 'stylesheet', href: inter },
      { rel: 'stylesheet', href: spaceGrotesk },
      { rel: 'stylesheet', href: globals },
    ],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { locale, messages, timeZone } = Route.useLoaderData();

  return (
    // `suppressHydrationWarning` è richiesto da next-themes: la classe del tema
    // la scrive uno script prima dell'idratazione, quindi il markup del server
    // non può combaciare. Vale solo per questo elemento, non per i figli.
    //
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Il colore della barra del browser su mobile: il fondo dell'app,
            uno per tema. Stanno qui e non in `head()` perché il router tiene
            una sola `meta` per `name` e la seconda sparirebbe. Seguono il
            tema del sistema e non quello scelto nell'app: il browser le
            legge prima di qualunque nostro script. */}
        <meta
          name="theme-color"
          content="#f9f9fb"
          media="(prefers-color-scheme: light)"
        />
        <meta
          name="theme-color"
          content="#18191b"
          media="(prefers-color-scheme: dark)"
        />
      </head>
      <body className="font-sans antialiased">
        <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
          <Providers>{children}</Providers>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  );
}
