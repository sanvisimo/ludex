import { XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';

export const ROW_COVER_WIDTH = 44;
const ROW_GAP = 12;

export function RowFrame({
  cover,
  children,
  actions,
}: {
  cover: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <XStack
      render="li"
      gap={ROW_GAP}
      p={12}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      bg="$surface"
      items="center"
      flexWrap="wrap"
    >
      {cover}
      <YStack gap={6} grow={1} shrink={1} flexBasis={0} minW={0}>
        {children}
      </YStack>
      {actions && (
        <XStack
          gap={8}
          flexWrap="wrap"
          items="center"
          justify="flex-end"
          maxW="50%"
          $max-lg={{
            width: '100%',
            maxW: '100%',
            justify: 'flex-start',
            pl: ROW_COVER_WIDTH + ROW_GAP,
          }}
        >
          {actions}
        </XStack>
      )}
    </XStack>
  );
}
