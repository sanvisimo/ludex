import { createFileRoute } from '@tanstack/react-router';

import { PlatformMismatches } from '@/components/admin/platform-mismatches';

export const Route = createFileRoute('/_app/admin/platforms')({
  component: PlatformMismatches,
});
