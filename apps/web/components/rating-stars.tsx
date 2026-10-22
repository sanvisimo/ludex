import { Text, XStack } from '@repo/ui';
import { Star, X } from '@repo/ui/icons';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

const POSITIONS = [1, 2, 3, 4, 5];

/**
 * Voto da mezza stella a cinque.
 *
 * Ogni stella è due bersagli: la metà sinistra vale `n - 0.5`, la destra `n`.
 * È il motivo per cui non è un `input[type=range]` — con dieci valori discreti
 * uno slider costringe a mirare, le stelle no.
 *
 * Ricliccare il valore già scelto lo toglie: "non votato" è uno stato a cui si
 * deve poter tornare, ed è diverso da "votato mezza stella". Nel dialogo c'è
 * anche una × accanto al voto.
 *
 * Due misure: `md` nel dialogo di modifica, col testo «4 su 5» accanto; `sm`
 * nel pannello della pagina del gioco, dove si vota al volo e c'è solo il
 * numero, a sinistra. Le stelle ci sono sempre, vuote se non c'è voto.
 */
export function RatingStars({
  value,
  onChange,
  size = 'md',
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  size?: 'sm' | 'md';
}) {
  const t = useTranslations('editEntry');
  const [hovered, setHovered] = useState<number | null>(null);

  // In hover si mostra il voto che si otterrebbe cliccando, non quello salvato.
  const shown = hovered ?? value ?? 0;
  const px = size === 'sm' ? 18 : 28;

  // Il numero, nel pannello, sta **a sinistra**: il pannello allinea a destra,
  // e un numero a destra che cambia larghezza (o sparisce, togliendo il voto)
  // spostava le stelle sotto il puntatore — il secondo clic cadeva su un'altra
  // mezza stella.
  const numero = size === 'sm' && value !== null && (
    <Text fontSize={14} lineHeight={20} color="$color11" aria-hidden>
      {value}
    </Text>
  );

  return (
    <XStack items="center" gap={size === 'sm' ? 6 : 8}>
      {numero}
      <XStack onMouseLeave={() => setHovered(null)}>
        {POSITIONS.map((position) => (
          <XStack key={position} position="relative" width={px} height={px}>
            <Star size={px} color="$color8" />

            {/* La stella piena ritagliata: 0%, 50% o 100% di larghezza. Dentro,
                un contenitore largo quanto la stella intera: senza, l'icona si
                stringeva alla larghezza del taglio invece di farsi tagliare,
                e mezza stella era una stella piccola. */}
            <XStack
              position="absolute"
              t={0}
              l={0}
              b={0}
              width={`${Math.min(Math.max(shown - position + 1, 0), 1) * 100}%`}
              overflow="hidden"
              pointerEvents="none"
            >
              <XStack width={px} height={px}>
                <Star size={px} color="$accent9" fill="currentColor" />
              </XStack>
            </XStack>

            {[position - 0.5, position].map((candidate) => (
              <XStack
                key={candidate}
                render="button"
                aria-label={t('ratingValue', { value: candidate })}
                aria-pressed={value === candidate}
                onMouseEnter={() => setHovered(candidate)}
                onPress={() => {
                  // Via l'anteprima: dopo il clic si vede il voto salvato, o
                  // le stelle vuote se l'hai tolto, senza dover spostare il
                  // mouse.
                  setHovered(null);
                  onChange(value === candidate ? null : candidate);
                }}
                position="absolute"
                t={0}
                b={0}
                {...(candidate === position ? { r: 0 } : { l: 0 })}
                width="50%"
                bg="transparent"
                borderWidth={0}
                p={0}
                cursor="pointer"
                focusVisibleStyle={{
                  outlineColor: '$outlineColor',
                  outlineStyle: 'solid',
                  outlineWidth: 2,
                }}
              />
            ))}
          </XStack>
        ))}
      </XStack>

      {size === 'md' && (
        <Text color="$color11">
          {value === null ? t('noRating') : t('ratingOf', { value })}
        </Text>
      )}
      {/* Nel dialogo il voto si toglie anche con la ×, che si vede: il secondo
          clic sulla stessa mezza stella resta, ma non lo indovina nessuno. Nel
          pannello no, per restare una riga sola accanto allo stato. */}
      {size === 'md' && value !== null && (
        <XStack
          render="button"
          aria-label={t('clearRating')}
          onPress={() => onChange(null)}
          bg="transparent"
          borderWidth={0}
          p={0}
          cursor="pointer"
          opacity={0.5}
          hoverStyle={{ opacity: 1 }}
          focusVisibleStyle={{
            opacity: 1,
            outlineColor: '$outlineColor',
            outlineStyle: 'solid',
            outlineWidth: 2,
          }}
        >
          <X size={16} color="$color12" />
        </XStack>
      )}
    </XStack>
  );
}
