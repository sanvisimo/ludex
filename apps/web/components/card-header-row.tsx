import { CardDescription, CardHeader, CardTitle, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

/**
 * L'intestazione di una scheda con un gesto: titolo e descrizione a sinistra, il
 * bottone a destra sulla stessa riga.
 *
 * Il testo parte da base 0 con un minimo di 220 px: la riga va a capo, e manda
 * il bottone sotto, solo quando il minimo e il bottone non ci stanno insieme.
 * Con la base automatica andrebbe a capo appena la descrizione, scritta tutta
 * su una riga, supera lo spazio — anche con un bottone che ci starebbe.
 */
export function CardHeaderRow({
  title,
  description,
  note,
  action,
}: {
  title: string;
  description?: string;
  /** Una riga in più sotto la descrizione, a sinistra: «Disponibile a breve». */
  note?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <CardHeader
      flexDirection="row"
      flexWrap="wrap"
      items="center"
      justify="space-between"
      gap={12}
    >
      <YStack gap={4} flexBasis={0} grow={1} shrink={1} minW={220}>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
        {note}
      </YStack>
      {action}
    </CardHeader>
  );
}
