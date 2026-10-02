import { XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

/**
 * La cornice di una riga di lista con la copertina a sinistra: gli scarti
 * d'import e i giochi nascosti stanno nelle stesse liste, e devono sembrare la
 * stessa riga.
 *
 * `cover` è già della sua misura; la colonna a destra prende il resto e può
 * restringersi (`minW={0}`), o un nome lungo spinge i bottoni fuori dalla riga.
 */
export function RowFrame({
  cover,
  children,
}: {
  cover: ReactNode;
  children: ReactNode;
}) {
  return (
    <XStack
      render="li"
      gap={12}
      p={8}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      items="flex-start"
    >
      {cover}
      <YStack gap={6} flex={1} minW={0}>
        {children}
      </YStack>
    </XStack>
  );
}
