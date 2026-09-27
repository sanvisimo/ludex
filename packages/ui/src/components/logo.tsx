import { Path, Rect, Svg } from 'react-native-svg';
import { Text, XStack } from 'tamagui';

export type LogoProps = {
  /** Il lato, in pixel. Il disegno sta in un quadrato 32×32. */
  size?: number;
};

/**
 * Il simbolo: una tessera con la «L», e dietro due copertine.
 *
 * I colori sono **fissi**, ed è l'unico componente che punta a dei valori
 * invece che a dei token: il simbolo è un'immagine, lo stesso disegno della
 * favicon e dell'icona dell'app, e non deve cambiare col tema. Le copertine
 * stanno due passi più scure della scala teal apposta, perché si vedano su
 * tutti e due i fondi. Se l'accento cambia, il simbolo resta teal finché non
 * si decide di ridisegnarlo — insieme ai file in `apps/web/public` e
 * `apps/mobile/assets`, che ne sono la copia.
 *
 * Da solo è decorativo: il nome lo porta chi gli sta accanto (`Wordmark`, o
 * il testo del link).
 */
export function Logo({ size = 32 }: LogoProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      {/* copertina in fondo: tealDark 7 */}
      <Rect x={13} y={1} width={17} height={19} rx={4} fill="#1c6961" />
      {/* copertina in mezzo: teal 11 */}
      <Rect x={8} y={4} width={19} height={21} rx={5} fill="#008573" />
      {/* la tessera: teal 9 */}
      <Rect x={2} y={8} width={22} height={23} rx={5.5} fill="#12a594" />
      {/* la «L»: slate 12 */}
      <Path d="M7.5 13h4v10h7.5v4H7.5z" fill="#1c2024" />
    </Svg>
  );
}

export type WordmarkProps = {
  /** Il lato del simbolo; il nome gli si adegua. */
  size?: number;
};

/**
 * Simbolo e nome, come stanno in cima alla barra.
 *
 * Il link che riporta alla home **non** è qui: è del router, e il router del
 * web in `@repo/ui` non entra. L'app lo avvolge.
 */
export function Wordmark({ size = 24 }: WordmarkProps) {
  return (
    <XStack items="center" gap={Math.round(size / 3)}>
      <Logo size={size} />
      <Text
        fontFamily="$heading"
        fontSize={Math.round(size * 0.75)}
        lineHeight={size}
        fontWeight="700"
        color="$color12"
      >
        Ludex
      </Text>
    </XStack>
  );
}
