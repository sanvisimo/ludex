import type { StorybookConfig } from '@storybook/react-native-web-vite';

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
};

export default config;
