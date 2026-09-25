import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { hasSession } from '@/src/session';

// Accesso e registrazione non hanno senso da loggato: si va al backlog.
export const Route = createFileRoute('/_guest')({
  beforeLoad: async () => {
    if (await hasSession()) throw redirect({ href: '/backlog' });
  },
  component: Outlet,
});
