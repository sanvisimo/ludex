import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';

export type EmptyStateProps = {
  /** L'icona, già della misura giusta (24). */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** La via d'uscita, quando c'è: «Azzera i filtri». */
  action?: ReactNode;
};

/**
 * Una lista vuota che dice perché, e cosa fare.
 *
 * Il backlog ne ha tre, e non sono la stessa cosa: non hai giochi, nessun
 * gioco passa i filtri, non hai nascosto niente. Solo la seconda ha un gesto
 * che la risolve, e per questo `action` è facoltativa.
 */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <YStack
      width="100%"
      items="center"
      gap={8}
      py={48}
      px={16}
      rounded={12}
      borderWidth={1}
      borderStyle="dashed"
      borderColor="$borderColor"
    >
      {icon && (
        <YStack
          width={48}
          height={48}
          rounded={999}
          bg="$color4"
          items="center"
          justify="center"
          mb={4}
        >
          {icon}
        </YStack>
      )}
      <Text fontSize={16} fontWeight="500" color="$color12" text="center">
        {title}
      </Text>
      {description && (
        <Text fontSize={14} color="$color11" text="center" maxW={420}>
          {description}
        </Text>
      )}
      {action && <YStack mt={8}>{action}</YStack>}
    </YStack>
  );
}
