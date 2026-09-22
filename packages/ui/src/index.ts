/**
 * Il design system, **universale**: gli stessi componenti per `apps/web` e
 * `apps/mobile`.
 *
 * Regola di confine, e non è una formalità: qui dentro non entrano né
 * `next/*`, né `@repo/contracts`, né `@repo/db`. Un componente che conoscesse
 * il tipo `BacklogEntry` smetterebbe di essere un pezzo di design system e
 * diventerebbe una schermata — e su React Native un import di `next/image`
 * romperebbe il bundle. La regola è scritta in `packages/eslint-config` al
 * passo 6, ma vale da adesso.
 *
 * I componenti di Tamagui si ri-esportano da qui, così le app importano da un
 * posto solo e il giorno che un pezzo va sostituito con una versione nostra
 * cambia questo file, non le schermate.
 */
export * from 'tamagui';

export { config } from './config';
export type { AppConfig } from './config';

export { themes } from './themes';
export { accenti, accentoPredefinito, base, stati } from './palettes';
export type { Accento } from './palettes';
