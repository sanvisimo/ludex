import { XStack, YStack } from '@repo/ui';
import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { ThemeToggle } from '@/components/theme-toggle';
import { HomeLink } from '@/src/components/app-shell';
import { LocaleSwitcher } from '@/src/components/locale-switcher';
import { hasSession } from '@/src/session';

// Accesso e registrazione: fuori dal guscio, perché da anonimo una barra con
// una voce sola non porterebbe da nessuna parte. Restano il nome, che riporta
// al catalogo, e tema e lingua. Da loggato non hanno senso: si va al backlog.
export const Route = createFileRoute('/_guest')({
  beforeLoad: async () => {
    if (await hasSession()) throw redirect({ to: '/backlog' });
  },
  component: GuestLayout,
});

function GuestLayout() {
  return (
    <YStack minH="100vh" bg="$background">
      <XStack
        render="header"
        items="center"
        justify="space-between"
        px={12}
        py={8}
      >
        <HomeLink />
        <XStack gap={4}>
          <ThemeToggle />
          <LocaleSwitcher />
        </XStack>
      </XStack>
      <Outlet />
    </YStack>
  );
}
