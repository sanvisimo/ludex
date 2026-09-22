import { defaultConfig } from '@tamagui/config/v5';
import { createTamagui } from '@tamagui/core';

/**
 * La configurazione del design system: token, temi, tipografia.
 *
 * Per ora è quella di partenza di Tamagui. I token nostri — la scala dei
 * colori, i due temi e la densità — sono il **passo 2** del 12a: qui si
 * stabilisce solo che esiste un punto solo da cui vengono, e che quel punto è
 * questo package e non le app.
 *
 * Vive in `packages/ui` perché è l'unica cosa che web e mobile condividono
 * davvero: `apps/web` e `apps/mobile` montano lo stesso oggetto, e un colore
 * cambiato qui cambia su entrambe.
 */
export const config = createTamagui(defaultConfig);

export type AppConfig = typeof config;

// Insegna a TypeScript quali sono i *nostri* token: senza, `$background` e
// `$color` sarebbero stringhe qualunque e un token inesistente passerebbe il
// typecheck per finire a schermo come niente.
declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppConfig {}
}
