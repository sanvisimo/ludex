/**
 * L'iconografia: **lucide**, la stessa che `apps/web` già usava con
 * `lucide-react`.
 *
 * Tamagui 3 non ha più un pacchetto di icone: si generano solo quelle che si
 * usano, un file per icona in `src/lucide/`, col `themed` di
 * `@tamagui/helpers-icon` e `react-native-svg` sotto, così rendono su
 * entrambe le piattaforme. Quei file non si modificano a mano: un'icona nuova
 * si aggiunge con `pnpm --filter @repo/ui icons:add NomeIcona`, che riscrive
 * anche l'indice.
 *
 * L'icona prende `size`, `color`, `fill` e `strokeWidth`, ma non è più un
 * componente di stile: media query, stati e trasformazioni (`rotate`, `$sm`,
 * `hoverStyle`) vanno su un `View` intorno.
 */
export * from './lucide';
export type { IconProps } from '@tamagui/helpers-icon';
