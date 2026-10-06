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

/**
 * La cornice dell'admin (11a), con la forma di quella dell'account: il menu
 * delle sezioni e, accanto, la sezione aperta.
 *
 * Chi non è admin viene rimandato al catalogo. È comodità, non sicurezza: la
 * sicurezza vera la fa il middleware `admin` sul server, che risponde 403 a
 * ogni procedura `admin.*`. Qui si evita solo di mostrare una pagina vuota di
 * errori.
 */
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
    // Più larga dell'account: le sezioni sono tabelle.
    // «Apri un gioco» sta nell'intestazione: c'è da qualunque sezione, perché
    // un collegamento sbagliato che nessuno ha segnalato si trova così.
    <Page title={t('title')} maxW={1200} actions={<CatalogFinder />}>
      <XStack
        gap={24}
        items="flex-start"
        $max-md={{ flexDirection: 'column', items: 'stretch' }}
      >
        <AdminNav />
        <YStack flex={1} minW={0} gap={24} $max-md={{ flexBasis: 'auto' }}>
          <Outlet />
        </YStack>
      </XStack>
    </Page>
  );
}
