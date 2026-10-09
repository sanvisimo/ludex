import type { StoreAccount } from '@repo/contracts';
import {
  Button,
  EmptyState,
  Skeleton,
  Text,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { Library } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { AddStoreAccount } from '@/components/add-store-account';
import { AutoSyncSettings } from '@/components/auto-sync-settings';
import { RenameAccountDialog } from '@/components/rename-account-dialog';
import { StoreAccountCard } from '@/components/store-account-card';
import { UnlinkAccountDialog } from '@/components/unlink-account-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

export const Route = createFileRoute('/_app/account/libraries')({
  component: LibrariesSection,
});

function LibrariesSection() {
  const t = useTranslations('account');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  // Scollegare è una domanda con due risposte diverse, non un bottone: il
  // dialogo la fa, dopo aver contato cosa porta via.
  const [unlinking, setUnlinking] = useState<StoreAccount | null>(null);
  const [renaming, setRenaming] = useState<StoreAccount | null>(null);

  // Durante l'import la pagina si aggiorna da sola, e anche dopo: a dirle
  // quando rileggere sono gli eventi del guscio (`useLiveUpdates`).
  const accounts = useQuery(api.accounts.list.queryOptions());
  const settings = useQuery(api.settings.get.queryOptions());

  // Basta che UN negozio stia importando perché il bottone «aggiorna tutti»
  // resti spento: la pagina non deve sapere quale.
  const syncing = accounts.data?.some((row) => row.syncing) ?? false;

  const syncAll = useMutation({
    mutationFn: () => client.accounts.syncAll(),
    onSuccess: async ({ queued, needsReauth }) => {
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      // Un account da ricollegare non ferma gli altri, ma va detto: la sua
      // scheda lo segnala già, il toast dice perché non è partito.
      if (queued > 0 || needsReauth === 0)
        toast.success(t('store.syncAllStarted', { count: queued }));
      if (needsReauth > 0)
        toast.warning(t('store.syncAllNeedsReauth', { count: needsReauth }));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('store.syncAllFailed') })),
  });

  const loading = accounts.isPending || settings.isPending;
  const rows = accounts.data ?? [];

  return (
    <>
      <XStack items="center" justify="space-between" gap={12} flexWrap="wrap">
        <Text
          render="h2"
          fontFamily="$heading"
          fontSize={18}
          lineHeight={24}
          fontWeight="600"
          color="$color12"
        >
          {t('libraries.title')}
        </Text>
        {/* Con un account solo farebbe la stessa cosa del bottone sulla sua
            scheda. Spento mentre qualcosa importa: la coda deduplica per
            account, ma un bottone che non fa niente è peggio di uno spento. */}
        {rows.length >= 2 && (
          <Button
            variant="outline"
            onClick={() => syncAll.mutate()}
            disabled={syncing || syncAll.isPending}
          >
            {t('store.syncAll')}
          </Button>
        )}
      </XStack>

      {loading ? (
        <YStack gap={16}>
          <Skeleton height={48} width="100%" rounded={12} />
          <Skeleton height={192} width="100%" rounded={12} />
        </YStack>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Library size={24} color="$color11" />}
          title={t('libraries.emptyTitle')}
          description={t('libraries.emptyDescription')}
          action={<AddStoreAccount variant="default" />}
        />
      ) : (
        <>
          {settings.data && (
            <AutoSyncSettings
              settings={settings.data}
              hasPsn={rows.some((row) => row.store === 'psn')}
            >
              <AddStoreAccount />
            </AutoSyncSettings>
          )}

          {/* Tante colonne quante ne stanno, da 240 px l'una: tre nel desktop
              largo, due in uno stretto, una sul telefono. Una griglia vera e
              non una fila che va a capo: l'ultima riga non allarga le schede
              che ha. */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
              gap: 16,
            }}
          >
            {rows.map((account) => (
              <StoreAccountCard
                key={account.id}
                account={account}
                busy={syncing}
                autoSyncLibrary={settings.data?.autoSyncLibrary ?? true}
                onRename={() => setRenaming(account)}
                onUnlink={() => setUnlinking(account)}
              />
            ))}
          </div>
        </>
      )}

      <RenameAccountDialog
        account={renaming}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      />

      <UnlinkAccountDialog
        account={unlinking}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
      />
    </>
  );
}
