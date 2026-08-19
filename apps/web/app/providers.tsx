'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import { useState } from 'react';

export function Providers({ children }: { children: React.ReactNode }) {
  // Creato dentro lo stato e non a livello di modulo: a livello di modulo un
  // solo QueryClient verrebbe condiviso fra le richieste sul server.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // I 401 e i 404 non migliorano riprovando.
            retry: false,
          },
        },
      }),
  );

  return (
    // `attribute="class"` perché globals.css definisce lo scuro come
    // `@custom-variant dark (&:is(.dark *))`: serve la classe, non un data-attr.
    // `disableTransitionOnChange` evita che al cambio tema ogni transizione CSS
    // della pagina parta insieme, con l'effetto di una dissolvenza generale.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        {/* nuqs tiene lo stato dei filtri (step 7) nella query string. L'adapter
            è ciò che lo lega al router di Next: senza, gli hook non sanno come
            scrivere nell'URL. Sta qui e non nel layout perché quello è un
            componente server. */}
        <NuqsAdapter>{children}</NuqsAdapter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
