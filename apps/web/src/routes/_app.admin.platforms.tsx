import { createFileRoute, useNavigate } from '@tanstack/react-router';

import { PlatformMismatches } from '@/components/admin/platform-mismatches';

type Search = { view?: 'accepted' };

export const Route = createFileRoute('/_app/admin/platforms')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    view: search.view === 'accepted' ? 'accepted' : undefined,
  }),
  component: PlatformsPage,
});

function PlatformsPage() {
  const { view } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  return (
    <PlatformMismatches
      dismissed={view === 'accepted'}
      onDismissedChange={(dismissed) =>
        void navigate({ search: { view: dismissed ? 'accepted' : undefined } })
      }
    />
  );
}
