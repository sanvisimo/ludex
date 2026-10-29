import { createFileRoute } from '@tanstack/react-router';

import { AccountData } from '@/components/account-data';
import { ActiveSessions } from '@/components/active-sessions';
import { ChangePassword } from '@/components/change-password';
import { ProfileDetails } from '@/components/profile-details';

export const Route = createFileRoute('/_app/account/profile')({
  component: ProfileSection,
});

function ProfileSection() {
  return (
    <>
      <ProfileDetails />
      <ChangePassword />
      <ActiveSessions />
      <AccountData />
    </>
  );
}
