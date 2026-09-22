/**
 * I pezzi di Tamagui che le app usano **grezzi**: layout, testo, temi.
 *
 * Sono qui e non importati direttamente da `tamagui` nelle schermate per la
 * stessa ragione per cui `index.ts` non fa `export *`: `@repo/ui` deve restare
 * l'unica porta. Il giorno che uno di questi va avvolto — un `Text` con la
 * nostra scala tipografica, per dire — cambia questo file e non trenta
 * schermate.
 *
 * Non c'è `Button`, `Card` o `Input`: quelli hanno una versione nostra in
 * `components/`, ed è quella che le app devono vedere.
 */
export {
  // layout
  XStack,
  YStack,
  ZStack,
  View,
  ScrollView,
  Spacer,
  Separator,
  // testo
  Text,
  Paragraph,
  SizableText,
  H1,
  H2,
  H3,
  H4,
  // tema e runtime
  Theme,
  TamaguiProvider,
  useTheme,
  useThemeName,
  useMedia,
  styled,
  // stato
  Spinner,
} from 'tamagui';

export type { GetProps, ThemeName } from 'tamagui';
