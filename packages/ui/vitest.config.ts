import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

/**
 * Le storie come test.
 *
 * Gira in un **Chromium vero** e non in jsdom, e non è un lusso: ciò che va
 * verificato qui sono stili calcolati, focus da tastiera e contrasto, cioè
 * esattamente le cose che jsdom non calcola. È l'opposto di `apps/api`, che
 * gira in Node contro un Postgres vero per la ragione simmetrica.
 *
 * Non c'è né un file di test né un setup: ogni `*.stories.tsx` **è** il test,
 * e dalla 10.3 è `addon-vitest` ad applicare da sé i parametri di
 * `preview.tsx` — provider, temi, soglia a11y. Le storie senza
 * `play` verificano che il componente si monti e passi axe; quelle con `play`
 * verificano il comportamento.
 */
export default defineConfig({
  plugins: [storybookTest({ configDir: '.storybook' })],

  test: {
    name: 'ui',
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
    },
  },
});
