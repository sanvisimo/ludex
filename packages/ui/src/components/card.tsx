import { Text, YStack, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

/**
 * La scheda: un pannello rialzato con intestazione e contenuto.
 *
 * Porta i pezzi che le schermate usano — `Card`, `CardHeader`, `CardTitle`,
 * `CardDescription`, `CardContent` — con gli stessi nomi di prima. `CardFooter`,
 * `CardAction` e la taglia `sm` di shadcn non li usava nessuno e restano fuori.
 *
 * Non è la `Card` di Tamagui: quella porta con sé sfondo a strati e un tema di
 * componente, e qui serve un contenitore e nient'altro.
 */
export const Card = styled(YStack, {
  name: 'Card',

  gap: 16,
  py: 16,
  rounded: 12,
  overflow: 'hidden',
  bg: '$color2',
  borderWidth: 1,
  borderColor: '$borderColor',

  variants: {
    /**
     * La scheda che è un link — l'elenco dei giochi in home. Si schiarisce al
     * passaggio: è l'unico segno che si può cliccare.
     */
    interactive: {
      true: {
        cursor: 'pointer',
        transition: 'quick',
        hoverStyle: { bg: '$color3' },
        pressStyle: { bg: '$color4' },
      },
    },
  } as const,
});

export const CardHeader = styled(YStack, {
  name: 'CardHeader',

  gap: 4,
  px: 16,
});

export const CardTitle = styled(Text, {
  name: 'CardTitle',

  fontSize: 16,
  lineHeight: 22,
  fontWeight: '500',
  color: '$color12',
});

export const CardDescription = styled(Text, {
  name: 'CardDescription',

  fontSize: 14,
  lineHeight: 20,
  color: '$color11',
});

export const CardContent = styled(YStack, {
  name: 'CardContent',

  px: 16,
});

export type CardProps = GetProps<typeof Card>;
