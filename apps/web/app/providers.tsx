'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
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
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </ThemeProvider>
  );
}
