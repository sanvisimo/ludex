import { Image, YStack } from 'tamagui';

export type PlatformIconProps = {
  /** L'indirizzo dell'immagine: dove stanno i file lo decide l'app. */
  src: string;
  /** Il nome della piattaforma, per il lettore di schermo e al passaggio. */
  label: string;
  /** Il lato del cerchio, in pixel. */
  size?: number;
};

/**
 * L'icona di una piattaforma: il disegno dell'hardware su un cerchio chiaro.
 *
 * Il cerchio è **chiaro fisso**, come i colori di `Logo` e di `BrandIcon`:
 * le icone sono immagini a colori, e alcune — il pad della PS4, la Xbox One —
 * sono scure, e su un fondo scuro sparirebbero.
 */
export function PlatformIcon({ src, label, size = 24 }: PlatformIconProps) {
  return (
    <YStack
      role="img"
      aria-label={label}
      {...({ title: label } as object)}
      width={size}
      height={size}
      shrink={0}
      rounded={999}
      items="center"
      justify="center"
      style={{ backgroundColor: '#f1f1f3' }}
    >
      <Image
        src={src}
        alt=""
        aria-hidden
        width={Math.round(size * 0.78)}
        height={Math.round(size * 0.78)}
        objectFit="contain"
      />
    </YStack>
  );
}
