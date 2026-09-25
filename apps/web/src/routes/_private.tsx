import { createFileRoute, Outlet, redirect } from '@tanstack/react-router';

import { hasSession } from '@/src/session';

// Le pagine private: da anonimo si va all'accesso, e dopo si torna qui.
export const Route = createFileRoute('/_private')({
  beforeLoad: async ({ location }) => {
    if (!(await hasSession())) {
      throw redirect({ to: '/login', search: { next: location.pathname } });
    }
  },
  component: Outlet,
});
