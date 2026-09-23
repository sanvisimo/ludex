import { Text, YStack, createStyledContext, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * La variante passa per contesto dal riquadro ai testi, come nel Badge: su
 * `destructive` titolo e descrizione diventano rossi senza ripeterlo.
 */
const AlertContext = createStyledContext<{
  variant: 'default' | 'destructive';
}>({ variant: 'default' });

/**
 * L'avviso in linea: oggi solo l'errore di login e registrazione.
 *
 * `role="alert"` è la metà che conta: il lettore di schermo legge il
 * messaggio appena compare, senza che il focus ci debba arrivare.
 *
 * L'icona a sinistra e `AlertAction` di shadcn non li usava nessuno e restano
 * fuori.
 */
export const Alert = styled(YStack, {
  name: 'Alert',
  context: AlertContext,
  role: 'alert',

  gap: 2,
  px: 10,
  py: 8,
  rounded: 8,
  borderWidth: 1,
  bg: '$color2',

  variants: {
    variant: {
      default: { borderColor: '$borderColor' },
      destructive: { borderColor: '$red6' },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
  },
});

export const AlertTitle = styled(Text, {
  name: 'AlertTitle',
  context: AlertContext,

  fontSize: 14,
  lineHeight: 20,
  fontWeight: '500',

  variants: {
    variant: {
      default: { color: '$color12' },
      destructive: { color: '$red11' },
    },
  } as const,
});

export const AlertDescription = styled(Text, {
  name: 'AlertDescription',
  context: AlertContext,

  fontSize: 14,
  lineHeight: 20,

  variants: {
    variant: {
      default: { color: '$color11' },
      destructive: { color: '$red11' },
    },
  } as const,
});

export type AlertProps = GetProps<typeof Alert>;
