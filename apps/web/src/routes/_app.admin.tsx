import { Skeleton, XStack, YStack } from '@repo/ui';
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import { AdminNav } from '@/components/admin/admin-nav';
import { CatalogFinder } from '@/components/admin/catalog-finder';
import { Page } from '@/src/components/page';
import { useSession } from '@/src/use-session';

export const Route = createFileRoute('/_app/admin')({
  component: AdminLayout,
});

// L’autorizzazione resta nel middleware admin del server.
function AdminLayout() {
  const t = useTranslations('admin');
  const navigate = useNavigate();
  const { data: session, isPending } = useSession();
  const isAdmin = session?.user.role === 'admin';

  useEffect(() => {
    if (isPending) return;
    if (!session) void navigate({ to: '/login', replace: true });
    else if (!isAdmin) void navigate({ to: '/', replace: true });
  }, [isPending, session, isAdmin, navigate]);

  if (isPending || !isAdmin) {
    return (
      <Page>
        <Skeleton height={128} width="100%" rounded={12} />
      </Page>
    );
  }

  return (
    <Page title={t('title')} maxW="100%" actions={<CatalogFinder />}>
      <XStack
        gap={24}
        items="flex-start max-md:stretch"
        flexDirection="max-md:column"
      >
        <AdminNav />
        <YStack flex={1} minW={0} gap={24} flexBasis="max-md:auto">
          <Outlet />
        </YStack>
      </XStack>
    </Page>
  );
}
