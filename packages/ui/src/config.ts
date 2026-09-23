import { defaultConfig } from '@tamagui/config/v5';
import { animations } from '@tamagui/config/v5-css';
import { createTamagui } from '@tamagui/core';

import { themes } from './themes';

/**
 * La configurazione del design system: token, temi, tipografia, breakpoint.
 *
 * Di `defaultConfig` si tiene tutto tranne i temi, che sono i nostri: le scale
 * di spazio, dimensione e raggio di Tamagui sono già coerenti fra loro e
 * rifarle a mano non porterebbe niente, mentre i colori sono l'identità e
 * quella è roba nostra.
 *
 * Le animazioni `v5` non le porta: vanno scelte. `v5-css` usa le transizioni
 * CSS sul web e ripiega su quelle di React Native sul telefono (il file
 * `.native` accanto), cioè il driver più leggero su entrambe le piattaforme e
 * senza reanimated da installare. Servono a Skeleton, Dialog, Toast.
 *
 * Vive in `packages/ui` perché è l'unica cosa che web e mobile condividono
 * davvero: `apps/web` e `apps/mobile` montano lo stesso oggetto, e un colore
 * cambiato qui cambia su entrambe.
 */
export const config = createTamagui({
  ...defaultConfig,
  animations,
  themes,
});

export type AppConfig = typeof config;

// Insegna a TypeScript quali sono i *nostri* token: senza, `$background` e
// `$color` sarebbero stringhe qualunque e un token inesistente passerebbe il
// typecheck per finire a schermo come niente.
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}
