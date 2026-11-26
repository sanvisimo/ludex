import { Button, Input, Text, XStack, YStack } from '@repo/ui';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Modal, Pressable } from 'react-native';

export type NameSheetLabels = {
  title: string;
  placeholder: string;
  save: string;
  cancel: string;
};

/**
 * Un nome da scrivere: nuova playlist, rinomina, salva come playlist. È un
 * `Modal` di React Native e non uno `Sheet` di Tamagui: su Android, all'aprirsi
 * della tastiera, il foglio si chiudeva e il testo finiva nel campo sotto.
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
  const input = useRef<{ focus?: () => void } | null>(null);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      // `autoFocus` dentro un Modal su Android non arriva: il fuoco resta al
      // campo che lo aveva sotto, e il testo finisce lì.
      onShow={() => {
        Keyboard.dismiss();
        setTimeout(() => input.current?.focus?.(), 50);
      }}
      statusBarTranslucent
    >
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <Pressable
          onPress={onClose}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 24,
            backgroundColor: 'rgba(0,0,0,0.5)',
          }}
        >
          <Pressable onPress={() => undefined}>
            <YStack
              bg="color2"
              rounded={16}
              p={20}
              gap={12}
              borderWidth={1}
              borderColor="borderColor"
            >
              <Text fontSize={18} fontWeight="700" color="color12">
                {labels.title}
              </Text>
              <Input
                ref={input as never}
                value={name}
                onChangeText={setName}
                placeholder={labels.placeholder}
                maxLength={80}
                onSubmitEditing={() => name.trim() && onSave(name.trim())}
              />
              {error ? (
                <Text fontSize={13} color="red11">
                  {error}
                </Text>
              ) : null}
              <XStack gap={12} justify="flex-end">
                <Button variant="outline" onPress={onClose}>
                  {labels.cancel}
                </Button>
                <Button
                  disabled={pending || name.trim() === ''}
                  onPress={() => onSave(name.trim())}
                >
                  {labels.save}
                </Button>
              </XStack>
            </YStack>
          </Pressable>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
}
