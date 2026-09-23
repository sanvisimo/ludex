/**
 * Il design system, **universale**: gli stessi componenti per `apps/web` e
 * `apps/mobile`.
 *
 * Regola di confine, e non è una formalità: qui dentro non entrano né
 * `next/*`, né `@repo/contracts`, né `@repo/db`. Un componente che conoscesse
 * il tipo `BacklogEntry` smetterebbe di essere un pezzo di design system e
 * diventerebbe una schermata — e su React Native un import di `next/image`
 * romperebbe il bundle.
 *
 * **Niente `export * from 'tamagui'`**, ed è una scelta e non una dimenticanza:
 * Tamagui esporta `Button`, `Card`, `Dialog`, `Input`, `Label`, `Select`,
 * `Switch` e `TextArea`, cioè otto dei nostri quindici nomi. Con l'export
 * generico `@repo/ui` ne esporterebbe due per ciascuno e a vincere sarebbe
 * l'ultima riga del file — un modo eccellente di usare per mesi un componente
 * diverso da quello che si crede. Qui si esporta **un** `Button`: il nostro.
 * Chi ha bisogno del pezzo grezzo lo importa da `tamagui` *dentro* questo
 * package, mai dalle app.
 */

// I primitivi di Tamagui che le app usano così come sono.
export * from './primitives';

// I nostri componenti.
export {
  Alert,
  AlertDescription,
  AlertTitle,
  type AlertProps,
} from './components/alert';
export { Badge, type BadgeProps } from './components/badge';
export { Button, type ButtonProps } from './components/button';
export {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  type CardProps,
} from './components/card';
export { Label, type LabelProps } from './components/label';
export { Skeleton, type SkeletonProps } from './components/skeleton';

// Le icone stanno in `@repo/ui/icons`, non qui: sono oltre millecinquecento
// nomi e affogherebbero i componenti nell'autocompletamento.

// Token, temi e configurazione.
export { config } from './config';
export type { AppConfig } from './config';
export { themes } from './themes';
export { accents, defaultAccent, base, states } from './palettes';
export type { Accent } from './palettes';
