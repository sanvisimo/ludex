import { Children } from 'react';
import { Text, XStack, createStyledContext, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * La variante viaggia per **contesto** dal contenitore al testo: il colore
 * del testo dipende dal fondo, e chi scrive `<Badge variant="outline">` non
 * deve ripeterlo sul figlio.
 */
const BadgeContext = createStyledContext<{
  variant: 'default' | 'secondary' | 'outline';
}>({ variant: 'default' });

/**
 * Le varianti sono le tre che le schermate usano: `secondary` quattro volte,
 * `default` e `outline` una. Le altre tre di shadcn — `destructive`, `ghost`,
 * `link` — nessuno le ha mai usate, e restano fuori per la stessa ragione
 * scritta sul Button.
 *
 * I colori sono quelli del Button, e non per pigrizia: sono le stesse coppie
 * fondo/testo già misurate lì (`$accent9` con testo scuro, `$color9` per un
 * bordo che si veda in entrambi i temi).
 */
const BadgeFrame = styled(XStack, {
  name: 'Badge',
  context: BadgeContext,

  height: 20,
  px: 8,
  gap: 4,
  rounded: 999,
  items: 'center',
  self: 'flex-start',
  borderWidth: 1,
  borderColor: 'transparent',

  variants: {
    variant: {
      default: { bg: '$accent9' },
      secondary: { bg: '$color6' },
      outline: { bg: 'transparent', borderColor: '$color9' },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
});

const BadgeText = styled(Text, {
  name: 'BadgeText',
  context: BadgeContext,

  fontSize: 12,
  lineHeight: 16,
  fontWeight: '500',
  whiteSpace: 'nowrap',

  variants: {
    variant: {
      default: { color: '$black1' },
      secondary: { color: '$color12' },
      outline: { color: '$color12' },
    },
  } as const,
});

export type BadgeProps = GetProps<typeof BadgeFrame>;

/**
 * L'etichetta: piattaforme, tag, tipo di gioco.
 *
 * Il testo passato come figlio viene avvolto da sé in un `Text`: su React
 * Native una stringa dentro un `View` è un errore, non uno stile sbagliato.
 * Gli altri figli restano come sono, ed è ciò che serve a `ownership-badges`,
 * che mette la x di rimozione **dentro** il badge.
 */
export function Badge({ children, ...props }: BadgeProps) {
  return (
    <BadgeFrame {...props}>
      {Children.map(children, (child) =>
        typeof child === 'string' || typeof child === 'number' ? (
          <BadgeText>{child}</BadgeText>
        ) : (
          child
        ),
      )}
    </BadgeFrame>
  );
}
