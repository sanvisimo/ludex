import { Button, Sheet, Text, YStack } from '@repo/ui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackToClose } from '../lib/use-back-to-close';

export type SheetAction = {
  key: string;
  label: string;
  destructive?: boolean;
  onPress: () => void;
};

/** Il menu ⋯ di una lista: un foglio con un bottone per azione. */
export function ActionsSheet({
  open,
  title,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  useBackToClose(open, onClose);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      label={title}
    >
      <YStack gap={8} pb={16 + insets.bottom}>
        <Text fontSize={18} fontWeight="700" color="color12" numberOfLines={2}>
          {title}
        </Text>
        {actions.map((action) => (
          <Button
            key={action.key}
            variant={action.destructive ? 'destructive' : 'outline'}
            justify="flex-start"
            onPress={() => {
              onClose();
              action.onPress();
            }}
          >
            {action.label}
          </Button>
        ))}
      </YStack>
    </Sheet>
  );
}
