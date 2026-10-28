import { createFileRoute } from '@tanstack/react-router';

import { AccountData } from '@/components/account-data';
import { ActiveSessions } from '@/components/active-sessions';
import { ChangePassword } from '@/components/change-password';
import { ProfileDetails } from '@/components/profile-details';

export const Route = createFileRoute('/_app/account/profile')({
  // I link del cambio email riportano qui (`?emailChange=1`), con `error`
  // quando il link è scaduto o non valido: lo aggiunge Better Auth.
  validateSearch: (
    search: Record<string, unknown>,
  ): { emailChange?: true; error?: string } => ({
    emailChange: search.emailChange ? true : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  component: ProfileSection,
});

function ProfileSection() {
  const { emailChange, error } = Route.useSearch();

  return (
    <>
      <ProfileDetails
        emailLink={emailChange ? (error ? 'failed' : 'opened') : undefined}
      />
      <ChangePassword />
      <ActiveSessions />
      <AccountData />
    </>
  );
}
