import { Avatar as AvatarBase, Text } from 'tamagui';

export type AvatarProps = {
  /** Il nome della persona: da qui le iniziali, e il testo alternativo. */
  name: string;
  /** L'immagine, quando c'è. Better Auth non ne dà una, quindi di solito no. */
  src?: string | null;
  /** Il lato, in pixel. */
  size?: number;
};

/** Le prime lettere delle prime due parole: «Simone Rossi» → «SR». */
export function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
}

/**
 * Chi è collegato, in fondo alla barra.
 *
 * Quasi sempre sono le **iniziali**: l'utente di Better Auth un'immagine non
 * ce l'ha, e un cerchio grigio vuoto direbbe meno di due lettere. Quando
 * l'immagine c'è, le iniziali restano sotto finché non è arrivata.
 *
 * Il colore è l'accento tenue (`$accent5`) con il testo al passo 12: lo
 * stesso accoppiamento di fondo e testo delle superfici colorate, che regge il
 * contrasto in tutti e due i temi.
 */
export function Avatar({ name, src, size = 32 }: AvatarProps) {
  return (
    <AvatarBase circular width={size} height={size}>
      {src ? (
        <AvatarBase.Image src={src} alt={name} width={size} height={size} />
      ) : null}
      <AvatarBase.Fallback bg="$accent5" items="center" justify="center">
        {/* Il nome lo dice già chi sta accanto all'avatar: le iniziali per un
            lettore di schermo sarebbero solo due lettere ripetute. */}
        <Text
          aria-hidden
          fontSize={Math.round(size * 0.4)}
          fontWeight="600"
          color="$accent12"
        >
          {initials(name)}
        </Text>
      </AvatarBase.Fallback>
    </AvatarBase>
  );
}
