import { Button, Text } from '@repo/ui';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslations } from 'use-intl';

import { GuestScreen } from '../components/guest-screen';

export default function CheckEmail() {
  const t = useTranslations('checkEmail');
  const { email } = useLocalSearchParams<{ email: string }>();

  return (
    <GuestScreen title={t('title')}>
      <Text color="color12">{t('text', { email: email ?? '' })}</Text>
      <Text color="color11">{t('hint')}</Text>
      <Button onPress={() => router.replace('/login')}>{t('toLogin')}</Button>
    </GuestScreen>
  );
}
