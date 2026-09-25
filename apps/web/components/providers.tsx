import { config, TamaguiProvider, Toaster } from '@repo/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider, useTheme } from 'next-themes';
import { useState } from 'react';

/**
 * Tema, design system e react-query: ciò che serve a ogni pagina. Lo monta la
 * radice delle rotte.
 */
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
    // Un interruttore per due sistemi: next-themes scrive sull'`<html>` la
    // classe che Tamagui legge (`t_dark` / `t_light`), e globals.css fa seguire
    // la stessa a Tailwind con `@custom-variant dark (&:is(.t_dark *))`.
    // `disableTransitionOnChange` evita che al cambio tema ogni transizione CSS
    // della pagina parta insieme, con l'effetto di una dissolvenza generale.
    <ThemeProvider
      attribute="class"
      value={{ light: 't_light', dark: 't_dark' }}
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <DesignSystem>
        <QueryClientProvider client={queryClient}>
          {children}
        </QueryClientProvider>
        <Toaster />
      </DesignSystem>
    </ThemeProvider>
  );
}

/**
 * Il provider di `@repo/ui`, lo stesso che monta il banco di Storybook.
 *
 * Il tema glielo dice next-themes. Tamagui aggiunge anche lui `t_<tema>`
 * all'`<html>` e la toglie al cambio: è la stessa classe che next-themes ha
 * già scritto, quindi i due non si pestano. Sul server il tema non è noto e
 * vale `light`; nel frattempo i colori li decide comunque la classe che lo
 * script di next-themes ha messo prima del primo paint, perché i temi di
 * Tamagui sul web sono variabili CSS appese a quella classe.
 *
 * Il CSS dei temi lo inserisce il provider stesso, con un `<style>` che React
 * 19 porta nell'`<head>` già nell'HTML del server.
 */
function DesignSystem({ children }: { children: React.ReactNode }) {
  const { resolvedTheme } = useTheme();
  return (
    <TamaguiProvider
      config={config}
      defaultTheme={resolvedTheme === 'dark' ? 'dark' : 'light'}
    >
      {children}
    </TamaguiProvider>
  );
}
