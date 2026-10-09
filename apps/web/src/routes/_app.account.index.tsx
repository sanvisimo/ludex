import { createFileRoute, redirect } from '@tanstack/react-router';

// `/account` da solo non è una sezione: porta al profilo. Il link «Account»
// del menu dell'avatar resta quello di prima.
export const Route = createFileRoute('/_app/account/')({
  beforeLoad: () => {
    throw redirect({ to: '/account/profile', replace: true });
  },
});
