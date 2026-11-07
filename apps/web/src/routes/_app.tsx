import { createFileRoute, Outlet } from '@tanstack/react-router';

import { AppShell } from '@/src/components/app-shell';
import { useLiveUpdates } from '@/src/use-live-updates';
import { useSyncOnOpen } from '@/src/use-sync-on-open';

// Tutte le pagine dentro il guscio: tutte tranne accesso e registrazione.
export const Route = createFileRoute('/_app')({
  component: AppLayout,
});

function AppLayout() {
  // Qui e non in una pagina: i dati cambiano mentre si naviga, e chi li
  // aspetta è la pagina dove si è arrivati, non quella da cui si è partiti.
  useLiveUpdates();
  useSyncOnOpen();

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
