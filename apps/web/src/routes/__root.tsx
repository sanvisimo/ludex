import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { IntlProvider } from 'use-intl';

import { Providers } from '@/components/providers';
import { SiteNav } from '@/src/components/site-nav';
import { getI18n } from '@/src/i18n';

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
    links: [{ rel: 'stylesheet', href: globals }],
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
    // Niente Geist: su Next lo caricava `next/font` ma non si vedeva più,
    // coperto dal carattere di Tamagui. Il font si sceglie con l'aspetto
    // dell'app (vedi il piano del 12a).
    <html lang={locale} suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <IntlProvider locale={locale} messages={messages} timeZone={timeZone}>
          <Providers>
            <SiteNav />
            {children}
          </Providers>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  );
}
