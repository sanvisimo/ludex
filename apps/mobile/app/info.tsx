import { Button, ScrollView, Text, YStack } from '@repo/ui';
import { ExternalLink } from '@repo/ui/icons';
import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { useTranslations } from 'use-intl';

import { openOnWeb } from '../lib/web-links';

export default function Info() {
  const t = useTranslations('info');
  const tLegal = useTranslations('legal');
  const version = Constants.expoConfig?.version ?? '?';
  const versionCode = Constants.expoConfig?.android?.versionCode;

  return (
    <ScrollView
      flex={1}
      bg="background"
      contentContainerStyle={{ padding: 20 }}
    >
      <Stack.Screen options={{ title: t('title') }} />
      <YStack gap={24}>
        <YStack gap={4}>
          <Text fontSize={20} fontWeight="700" color="color12">
            PileCue
          </Text>
          <Text color="color11">
            {t('version', {
              version: versionCode ? `${version} (${versionCode})` : version,
            })}
          </Text>
        </YStack>

        <YStack gap={8}>
          <WebRow label={tLegal('privacy')} path="/privacy" />
          <WebRow label={tLegal('terms')} path="/terms" />
        </YStack>
      </YStack>
    </ScrollView>
  );
}

function WebRow({ label, path }: { label: string; path: string }) {
  return (
    <Button
      variant="outline"
      justify="space-between"
      onPress={() => openOnWeb(path)}
    >
      <Text color="color12">{label}</Text>
      <ExternalLink size={16} />
    </Button>
  );
}
