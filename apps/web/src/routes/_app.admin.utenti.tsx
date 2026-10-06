import { EmptyState } from '@repo/ui';
import { createFileRoute } from '@tanstack/react-router';

// Segnaposto: la sezione arriva in un pezzo successivo del passo 8 (11a).
export const Route = createFileRoute('/_app/admin/utenti')({
  component: () => <EmptyState title="Utenti" description="…" />,
});
