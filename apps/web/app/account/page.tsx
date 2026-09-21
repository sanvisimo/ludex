'use client';

import { useSession } from '@repo/auth/client';
import type { StoreAccount, UnresolvedImport } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { AddStoreAccount } from '@/components/add-store-account';
import { AutoSyncSettings } from '@/components/auto-sync-settings';
import { ResolveImportDialog } from '@/components/resolve-import-dialog';
import { StoreAccountCard } from '@/components/store-account-card';
import { UnresolvedImports } from '@/components/unresolved-imports';
import { UnlinkAccountDialog } from '@/components/unlink-account-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

export default function AccountPage() {
  const t = useTranslations('account');
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: session, isPending: sessionPending } = useSession();
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);
  // Scollegare è una domanda con due risposte diverse, non un bottone: il
  // dialogo la fa, dopo aver contato cosa porta via.
  const [unlinking, setUnlinking] = useState<StoreAccount | null>(null);

  const accounts = useQuery({
    ...api.accounts.list.queryOptions(),
    // Durante l'import la pagina si aggiorna da sola: il job dura decine di
    // secondi e lasciare l'utente a premere F5 sarebbe scortese.
    refetchInterval: (query) =>
      query.state.data?.some((row) => row.syncing) ? 3000 : false,
  });

  const unresolved = useQuery(api.imports.unresolved.queryOptions());
  const settings = useQuery(api.settings.get.queryOptions());

  // Basta che UN negozio stia importando perché backlog e scarti cambino sotto
  // i piedi: la pagina non deve sapere quale.
  const syncing = accounts.data?.some((row) => row.syncing) ?? false;

  // Finito l'import, backlog e scarti sono cambiati sotto i piedi.
  useEffect(() => {
    if (syncing) return;
    void queryClient.invalidateQueries({
      queryKey: api.imports.unresolved.key(),
    });
    void queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
  }, [syncing, queryClient]);

  const syncAll = useMutation({
    mutationFn: () => client.accounts.syncAll(),
    onSuccess: async ({ queued, needsReauth }) => {
      await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
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

  // La pagina non ha senso da anonimo: parla dell'account di chi la guarda.
  useEffect(() => {
    if (!sessionPending && !session) router.replace('/login');
  }, [sessionPending, session, router]);

  if (sessionPending || !session) {
    return (
      <main className="mx-auto grid max-w-4xl gap-6 p-6">
        <Skeleton className="h-32 w-full rounded-xl" />
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        {/* Con un account solo farebbe la stessa cosa del bottone sulla sua
            scheda. Spento mentre qualcosa importa: la coda deduplica per
            account, ma un bottone che non fa niente è peggio di uno spento. */}
        {(accounts.data?.length ?? 0) >= 2 && (
          <Button
            variant="outline"
            onClick={() => syncAll.mutate()}
            disabled={syncing || syncAll.isPending}
          >
            {t('store.syncAll')}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('profile.title')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p className="font-medium">{session.user.name}</p>
          <p className="text-muted-foreground">{session.user.email}</p>
        </CardContent>
      </Card>

      {/* Solo con qualcosa da aggiornare: senza account è un interruttore che
          non accende niente. */}
      {settings.data && (accounts.data?.length ?? 0) > 0 && (
        <AutoSyncSettings
          settings={settings.data}
          hasPsn={accounts.data?.some((row) => row.store === 'psn') ?? false}
        />
      )}

      {accounts.isPending || settings.isPending ? (
        <Skeleton className="h-32 w-full rounded-xl" />
      ) : (
        accounts.data?.map((account) => (
          <StoreAccountCard
            key={account.id}
            account={account}
            busy={syncing}
            autoSyncLibrary={settings.data?.autoSyncLibrary ?? true}
            onUnlink={() => setUnlinking(account)}
          />
        ))
      )}

      <AddStoreAccount />

      <UnresolvedImports
        entries={unresolved.data ?? []}
        onResolve={setResolving}
      />

      <UnlinkAccountDialog
        account={unlinking}
        onOpenChange={(open) => {
          if (!open) setUnlinking(null);
        }}
      />

      <ResolveImportDialog
        entry={resolving}
        onOpenChange={(open) => {
          if (!open) setResolving(null);
        }}
      />
    </main>
  );
}
