import { createFileRoute, redirect } from '@tanstack/react-router';

// `/admin` da solo non è una sezione: porta ai dati mancanti.
export const Route = createFileRoute('/_app/admin/')({
  beforeLoad: () => {
    throw redirect({ to: '/admin/mancanti', replace: true });
  },
});
