import { Path, Svg } from 'react-native-svg';
import { isWeb, useTheme } from 'tamagui';

import {
  faviconShapes,
  iconBox,
  iconShapes,
  wordmarkBox,
  wordmarkShapes,
} from '../brand-artwork';

export type LogoProps = { size?: number };

/** P davanti alla pila; sotto 24 px usa la silhouette dedicata della favicon.
 * Decorativo: il testo accessibile appartiene al contenitore o al Wordmark.
 */
export function Logo({ size = 32 }: LogoProps) {
  const small = size < 24;
  return (
    <Svg
      width={size}
      height={size}
      viewBox={small ? '0 0 16 16' : `0 0 ${iconBox.width} ${iconBox.height}`}
      aria-hidden
    >
      {(small ? faviconShapes : iconShapes).map((shape, index) => (
        <Path key={index} {...shape} fillRule="evenodd" />
      ))}
    </Svg>
  );
}

export type WordmarkProps = {
  /** Altezza dell'intero marchio, incluse le custodie dietro la e finale. */
  size?: number;
};

/** Marchio esteso approvato: PileCue, una sola P, pila dalla e finale.
 * I tracciati non dipendono da font. Pile segue il tema, Cue resta viola.
 * Il link resta responsabilità dell'app e del suo router.
 */
export function Wordmark({ size = 28 }: WordmarkProps) {
  const theme = useTheme();
  // Sul web .get() conserva var(--color12): segue la classe impostata da
  // next-themes anche prima dell’idratazione. .val fissava il colore chiaro
  // del server in un attributo SVG; su native .get() restituisce il colore.
  return (
    <Svg
      width={Math.round((size * wordmarkBox.width) / wordmarkBox.height)}
      height={size}
      viewBox={`0 0 ${wordmarkBox.width} ${wordmarkBox.height}`}
      role="img"
      aria-label="PileCue"
      {...(!isWeb ? { accessibilityLabel: 'PileCue' } : {})}
    >
      {wordmarkShapes.map((shape, index) => (
        <Path
          key={index}
          {...shape}
          fill={shape.fill === 'ink' ? theme.color12.get() : shape.fill}
          fillRule="evenodd"
        />
      ))}
    </Svg>
  );
}
