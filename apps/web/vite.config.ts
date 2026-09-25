import path from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import { tamaguiPlugin } from '@tamagui/vite-plugin';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

// Il `.env` sta alla radice del repo, come per tutti i workspace.
const envDir = path.resolve(import.meta.dirname, '../..');

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, envDir, '');

  return {
    envDir,
    server: { port: 8085, strictPort: true },
    resolve: {
      // I gemelli `.web.*` prima degli altri, come fanno Metro e webpack.
      extensions: [
        '.web.tsx',
        '.web.ts',
        '.web.mjs',
        '.web.js',
        '.tsx',
        '.ts',
        '.mjs',
        '.js',
        '.json',
      ],
      alias: [
        // Il `@/*` del tsconfig.
        { find: /^@\//, replacement: `${import.meta.dirname}/` },
        // Il design system importa `react-native`: sul web è
        // `react-native-web`.
        { find: /^react-native$/, replacement: 'react-native-web' },
        // Le icone disegnano in SVG: sul web basta quello del DOM. Vedi il
        // commento in `packages/ui/.storybook/main.ts`.
        {
          find: /^react-native-svg$/,
          replacement: '@tamagui/react-native-svg',
        },
        // Passo 1 del 12b: i componenti condivisi con Next importano ancora
        // `next-intl`, che fuori da Next è `use-intl` con la stessa API. Esce
        // al passo 2, quando cambiano gli import.
        { find: /^next-intl$/, replacement: 'use-intl' },
      ],
    },
    ssr: {
      // Sul server Vite lascia a Node le librerie in node_modules, e Node gli
      // alias non li vede: il `react-native` che i pacchetti di Tamagui
      // importano diventava quello vero, in Flow, e il render moriva su un
      // `typeof` che Node non sa leggere. Passandole da Vite l'alias verso
      // `react-native-web` vale anche lì. Lui invece resta a Node: passato da
      // Vite si rompe sull'interop di `inline-style-prefixer`.
      noExternal: [/tamagui/],
    },
    define: {
      // Letta da `lib/orpc.ts` e da `packages/auth`: sostituita qui a build,
      // così nessuno dei due deve sapere di Vite.
      'process.env.NEXT_PUBLIC_API_URL': JSON.stringify(
        env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3005',
      ),
    },
    plugins: [
      tanstackStart(),
      viteReact(),
      tamaguiPlugin({
        // Gli alias li scriviamo sopra: i suoi puntano ai pacchetti per nome
        // risolto, cioè ai build CommonJS, e sul server passati da Vite non
        // trovano più `module` (è ciò che succedeva all'SVG delle icone).
        disableResolveConfig: true,
        config: '../../packages/ui/src/config.ts',
        components: ['@repo/ui'],
      }),
      tailwindcss(),
    ],
  };
});
