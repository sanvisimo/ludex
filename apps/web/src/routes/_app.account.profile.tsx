import { Card, Text, YStack } from '@repo/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';
import { AccountSectionHeader } from '@/components/account-section';
import { AccountData } from '@/components/account-data';
import { ActiveSessions } from '@/components/active-sessions';
import { ChangePassword } from '@/components/change-password';
import { ProfileDetails } from '@/components/profile-details';

export const Route = createFileRoute('/_app/account/profile')({
  component: ProfileSection,
});
function ProfileSection() {
  const t = useTranslations('account.review');
  return (
    <>
      <AccountSectionHeader
        title={t('profileTitle')}
        description={t('profileDescription')}
      />
      <ProfileDetails />
      <YStack gap={12}>
        <Text
          render="h3"
          m={0}
          fontFamily="$heading"
          fontSize={18}
          fontWeight="600"
          color="$color12"
        >
          {t('security')}
        </Text>
        <Card gap={0} py={0} overflow="hidden">
          <ChangePassword embedded />
          <YStack borderTopWidth={1} borderColor="$borderColor">
            <ActiveSessions embedded />
          </YStack>
        </Card>
      </YStack>
      <YStack gap={12}>
        <Text
          render="h3"
          m={0}
          fontFamily="$heading"
          fontSize={18}
          fontWeight="600"
          color="$color12"
        >
          {t('dataManagement')}
        </Text>
        <AccountData />
      </YStack>
    </>
  );
}
