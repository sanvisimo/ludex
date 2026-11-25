import { Button, Input, Sheet, Text, XStack, YStack } from '@repo/ui';
import { useEffect, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBackToClose } from '../lib/use-back-to-close';

export type NameSheetLabels = {
  title: string;
  placeholder: string;
  save: string;
  cancel: string;
};

/**
 * Un nome da scrivere: nuova playlist, rinomina, salva come playlist. I testi
 * arrivano da fuori, come per gli altri fogli.
 */
export function NameSheet({
  open,
  initial = '',
  labels,
  pending = false,
  error,
  onSave,
  onClose,
}: {
  open: boolean;
  initial?: string;
  labels: NameSheetLabels;
  pending?: boolean;
  error?: string | null;
  onSave: (name: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial);
  const insets = useSafeAreaInsets();
  useBackToClose(open, onClose);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onClose()}
      label={labels.title}
    >
      <YStack gap={12} pb={16 + insets.bottom}>
        <Text fontSize={18} fontWeight="700" color="color12">
          {labels.title}
        </Text>
        <Input
          value={name}
          onChangeText={setName}
          placeholder={labels.placeholder}
          autoFocus
          maxLength={80}
        />
        {error ? (
          <Text fontSize={13} color="red11">
            {error}
          </Text>
        ) : null}
        <XStack gap={12}>
          <Button variant="outline" onPress={onClose}>
            {labels.cancel}
          </Button>
          <Button
            flex={1}
            disabled={pending || name.trim() === ''}
            onPress={() => onSave(name.trim())}
          >
            {labels.save}
          </Button>
        </XStack>
      </YStack>
    </Sheet>
  );
}
