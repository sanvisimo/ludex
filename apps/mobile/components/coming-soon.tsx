import { EmptyState, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

export function ComingSoon({ title }: { title: string }) {
  const t = useTranslations('soon');
  return (
    <YStack flex={1} bg="background" p={20} justify="center">
      <EmptyState title={title} description={t('text')} />
    </YStack>
  );
}
