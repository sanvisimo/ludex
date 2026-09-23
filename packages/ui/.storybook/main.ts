import type { StorybookConfig } from '@storybook/react-native-web-vite';
import { tamaguiAliases } from '@tamagui/vite-plugin';

/**
 * Il banco di lavoro del design system.
 *
 * Sta in `packages/ui` e non in `apps/web` perché è qui che i componenti
 * vivono: un banco montato sull'app web non si aprirebbe senza Next, cioè
 * chiederebbe al design system universale esattamente la dipendenza che non
 * deve avere.
 *
 * Il framework è `react-native-web-vite`: le storie girano in
 * react-native-web, quindi **un solo** Storybook mostra i componenti che web e
 * mobile condividono, invece di due banchi che mostrano due verità.
 */
const config: StorybookConfig = {
  stories: ['../src/**/*.stories.tsx'],

  addons: [
    // Controlla ogni storia con axe. Con `addon-vitest` acceso non è un
    // pannello da guardare: è un test che fallisce.
    '@storybook/addon-a11y',
    // Il selettore chiaro/scuro in barra. I due temi sono i nostri, non quelli
    // di Storybook: vedi `preview.tsx`.
    '@storybook/addon-themes',
    // Porta le storie dentro vitest, in un Chromium vero.
    '@storybook/addon-vitest',
    // Visual test: confronta i pixel fra una build e l'altra. È l'altra metà
    // rispetto ad `addon-vitest`, che verifica comportamento e accessibilità
    // ma non si accorgerebbe mai di un bottone diventato storto.
    '@chromatic-com/storybook',
    // La pagina di documentazione generata da ogni storia.
    '@storybook/addon-docs',
  ],

  framework: {
    name: '@storybook/react-native-web-vite',
    options: {},
  },

  // Accesa di default: manda a Storybook quali addon e quale framework usiamo.
  // Non è un dato che questo progetto abbia motivo di spedire fuori.
  core: { disableTelemetry: true },

  /**
   * `react-native-svg` su Vite: lo risolve Tamagui, non noi.
   *
   * Le icone disegnano in SVG, che su React Native non esiste e lo porta
   * `react-native-svg` — una libreria scritta per i telefoni. Sul web quella
   * libreria **non va usata affatto**, perché il browser l'SVG ce l'ha già, ed
   * è esattamente ciò che fa `svg: true`: sostituisce l'intero pacchetto con
   * `@tamagui/react-native-svg`, che disegna SVG del DOM.
   *
   * Vale la pena sapere cosa succede senza, perché l'errore non nomina né le
   * icone né l'SVG. `react-native-svg` tiene la sua versione per il browser in
   * file gemelli (`ReactNativeSVG.web.js` accanto a `ReactNativeSVG.js`), e
   * Vite — al contrario di Metro e webpack — non sa che sul web va preso il
   * gemello: carica quello per telefoni, che chiede a React Native un registro
   * di immagini inesistente nel browser. Dirglielo a mano non basta: **Vite 8
   * prepara le librerie con rolldown**, che ignora sia `resolve.alias` sia
   * `resolve.extensions`. E spegnere quella preparazione scopre il difetto
   * gemello — dentro il pacchetto c'è un parser in CommonJS in mezzo a file
   * ESM, e a tradurlo era proprio ciò che si è spento.
   */
  viteFinal: async (config) => {
    config.resolve = config.resolve ?? {};
    const alias = config.resolve.alias;
    config.resolve.alias = [
      ...tamaguiAliases({ svg: true }),
      ...(Array.isArray(alias)
        ? alias
        : Object.entries(alias ?? {}).map(([find, replacement]) => ({
            find,
            replacement: replacement as string,
          }))),
    ];
    return config;
  },
};

export default config;
