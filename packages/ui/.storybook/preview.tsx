import '@tamagui/core/reset.css';

import { withThemeFromJSXProvider } from '@storybook/addon-themes';
import type { Preview, ReactRenderer } from '@storybook/react-native-web-vite';
import type { ReactNode } from 'react';

import { config } from '../src/config';
import { TamaguiProvider, YStack } from '../src/primitives';

/**
 * `addon-themes` passa al provider un **oggetto** tema, non un nome: è fatto
 * per i provider stile styled-components, dove il tema è la tavolozza intera.
 * Per Tamagui il tema è una stringa, quindi ce la portiamo dentro un oggetto.
 */
type Tema = { nome: 'dark' | 'light' };

/**
 * Il contenitore di ogni storia.
 *
 * Monta lo **stesso** `TamaguiProvider` che monteranno `apps/web` e
 * `apps/mobile`: se un componente ha bisogno di qualcosa che qui non c'è, è un
 * problema del componente e non del banco.
 *
 * Lo sfondo è `$background` e non il bianco di Storybook, o metà dei
 * componenti sembrerebbe giusta nel tema scuro solo perché nessuno ha mai
 * visto il loro vero fondale.
 */
function Banco({ theme, children }: { theme: Tema; children: ReactNode }) {
  return (
    <TamaguiProvider config={config} defaultTheme={theme.nome}>
      <YStack bg="$background" p="$4" gap="$3" items="flex-start" minH="100vh">
        {children}
      </YStack>
    </TamaguiProvider>
  );
}

const preview: Preview = {
  tags: ['autodocs'],
  parameters: {
    // Il decoratore disegna già il suo fondale: il padding di Storybook
    // lascerebbe una cornice bianca intorno al tema scuro.
    layout: 'fullscreen',

    // `error` e non `todo`: una violazione di accessibilità **rompe** il test.
    // È l'unico modo perché la regola valga anche il giorno che si ha fretta.
    a11y: { test: 'error' },
  },

  decorators: [
    withThemeFromJSXProvider<ReactRenderer>({
      themes: {
        scuro: { nome: 'dark' },
        chiaro: { nome: 'light' },
      } satisfies Record<string, Tema>,
      defaultTheme: 'scuro',
      Provider: Banco,
    }),
  ],
};

export default preview;
