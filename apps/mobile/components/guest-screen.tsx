import { ScrollView, Text, Wordmark, XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import { openOnWeb } from '../lib/web-links';

export function GuestScreen({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations('legal');
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        flex={1}
        bg="background"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          px: 20,
          pt: insets.top + 40,
          pb: insets.bottom + 24,
        }}
      >
        <YStack gap={24} maxW={420} width="100%" self="center">
          <Wordmark />
          <Text fontSize={22} fontWeight="700" color="color12">
            {title}
          </Text>
          {children}
          <XStack gap={16} justify="center">
            <Text color="color11" onPress={() => openOnWeb('/privacy')}>
              {t('privacy')}
            </Text>
            <Text color="color11" onPress={() => openOnWeb('/terms')}>
              {t('terms')}
            </Text>
          </XStack>
        </YStack>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function TextLink({
  children,
  onPress,
}: {
  children: ReactNode;
  onPress: () => void;
}) {
  return (
    <Text
      color="accent11"
      textDecorationLine="underline"
      onPress={onPress}
      role="link"
    >
      {children}
    </Text>
  );
}
