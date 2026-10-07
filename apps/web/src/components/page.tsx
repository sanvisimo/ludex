import { Text, XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

/**
 * Il contenitore di una pagina: la larghezza massima, il respiro, e
 * l'intestazione quando la pagina ne ha una semplice.
 *
 * Sostituisce le copie di `mx-auto grid max-w-4xl gap-6 p-6` scritte a mano
 * in ogni pagina. Una pagina con un'intestazione sua — il gioco, con la
 * copertina accanto al titolo — non passa `title` e la scrive dentro.
 *
 * `hero` sta sopra, larga quanto la finestra e senza respiro: è l'immagine
 * del gioco, che va da un bordo all'altro.
 */
export function Page({
  eyebrow,
  title,
  subtitle,
  actions,
  maxW = 896,
  hero,
  children,
}: {
  /** Una riga sopra il titolo: il link per tornare alla pagina di prima. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  subtitle?: ReactNode;
  /** I bottoni a destra del titolo; un `false` non disegna niente. */
  actions?: ReactNode;
  maxW?: number;
  hero?: ReactNode;
  children: ReactNode;
}) {
  return (
    <YStack render="main" width="100%">
      {hero}
      <YStack width="100%" maxW={maxW} mx="auto" p={24} gap={24}>
        {title !== undefined && (
          <XStack
            render="header"
            flexWrap="wrap"
            items="flex-end"
            justify="space-between"
            gap={16}
          >
            <YStack gap={4} shrink={1}>
              {eyebrow}
              <Text
                render="h1"
                fontFamily="$heading"
                fontSize={24}
                lineHeight={32}
                fontWeight="700"
                color="$color12"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text fontSize={14} lineHeight={20} color="$color11">
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {actions ? (
              <XStack flexWrap="wrap" items="center" gap={8}>
                {actions}
              </XStack>
            ) : null}
          </XStack>
        )}
        {children}
      </YStack>
    </YStack>
  );
}
