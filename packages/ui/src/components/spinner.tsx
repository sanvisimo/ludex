import type { CSSProperties } from 'react';
import { View } from 'tamagui';

import { LoaderCircle } from '../icons';
import type { SpinnerProps } from './spinner-props';

export type { SpinnerProps } from './spinner-props';

// Il `@keyframes` e la regola che lo applica. Stanno in un `<style>` accanto
// all'elemento e non in un foglio di stile del progetto: `@repo/ui` non ne ha
// uno, e così lo Spinner funziona dovunque venga montato, anche in Storybook.
// Il testo è statico, quindi server e browser scrivono la stessa cosa e
// l'idratazione torna. Più Spinner nella pagina ripetono la regola, ed è
// innocuo.
const CSS = `
@keyframes ludex-spin { to { transform: rotate(360deg); } }
.ludex-spin { animation: ludex-spin var(--ludex-spin-duration, 1s) linear infinite; }
@media (prefers-reduced-motion: reduce) { .ludex-spin { animation: none; } }
`;

/**
 * Fa girare ciò che contiene: l'icona «aggiorna» mentre un account importa, o
 * il cerchio di caricamento da solo.
 *
 * **Questa è la versione web**, una rotazione CSS; quella di React Native è
 * `spinner.native.tsx`, con `Animated`. Si dividono per piattaforma perché
 * `Animated` sul web non si può usare: importarlo da `react-native` sul server
 * trascina tutto lo `StyleSheet` di react-native-web, che nel rendering lato
 * server di Vite si rompe (`inline-style-prefixer`), e la pagina risponde 500.
 * E un `@keyframes` su React Native non esiste. Lo `Skeleton` ha aggirato lo
 * stesso limite con un'opacità che si alterna; per una rotazione continua
 * quella strada va a scatti.
 *
 * Chi ha chiesto meno movimento al sistema lo vede fermo, ed è il CSS a deciderlo
 * (`prefers-reduced-motion`): niente JavaScript che legga la preferenza, quindi
 * niente primo render diverso dal secondo.
 *
 * È **decorativo**: il nome di ciò che sta succedendo — «Aggiorna», «importazione
 * in corso» — lo porta chi lo usa, sul bottone o accanto.
 */
export function Spinner({
  spinning = true,
  children,
  duration = 1000,
}: SpinnerProps) {
  return (
    <>
      <style>{CSS}</style>
      <View
        className={spinning ? 'ludex-spin' : undefined}
        style={
          spinning
            ? ({ '--ludex-spin-duration': `${duration}ms` } as CSSProperties)
            : undefined
        }
      >
        {children ?? <LoaderCircle size={16} color="$color11" />}
      </View>
    </>
  );
}
