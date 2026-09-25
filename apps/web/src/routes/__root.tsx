import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router';
import { IntlProvider } from 'use-intl';

import { Providers } from '@/components/providers';
import messages from '@/messages/it.json';

import globals from '../../app/globals.css?url';

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: messages.app.title },
      { name: 'description', content: messages.app.description },
    ],
    links: [{ rel: 'stylesheet', href: globals }],
  }),
  shellComponent: RootDocument,
  component: () => <Outlet />,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` è richiesto da next-themes: la classe del tema
    // la scrive uno script prima dell'idratazione, quindi il markup del server
    // non può combaciare. Vale solo per questo elemento, non per i figli.
    //
    // Niente Geist: su Next lo caricava `next/font` ma non si vedeva più,
    // coperto dal carattere di Tamagui. Il font si sceglie con l'aspetto
    // dell'app (vedi il piano del 12a).
    <html lang="it" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        {/* Passo 1 del 12b: lingua fissa. La scelta vera, cookie e poi
            Accept-Language, arriva al passo 2. */}
        <IntlProvider locale="it" messages={messages} timeZone="Europe/Rome">
          <Providers>{children}</Providers>
        </IntlProvider>
        <Scripts />
      </body>
    </html>
  );
}
