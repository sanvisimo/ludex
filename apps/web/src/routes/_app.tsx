import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '@/src/components/app-shell';

// Tutte le pagine dentro il guscio: tutte tranne accesso e registrazione.
export const Route = createFileRoute('/_app')({
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
