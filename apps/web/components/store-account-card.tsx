'use client';

import type { LinkableStore, StoreAccount } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

/**
 * Una scheda per negozio in `/account`.
 *
 * Un componente solo per tutti perché il gesto è lo stesso ovunque: si incolla
 * una stringa presa dal browser. Cambia **cosa** si incolla — per Steam
 * l'indirizzo del profilo, per GOG quello su cui si atterra dopo il login — e
 * cambia se prima c'è un login da aprire, che è quello che dice `loginUrl`.
 *
 * Il copia-incolla non è un ripiego provvisorio: nessuno dei negozi accetta un
 * `redirect_uri` nostro, quindi il codice non può tornarci da solo. Ma è un
 * gesto **solo**: da lì in poi il refresh token si rinnova da sé.
 */
export function StoreAccountCard({
  store,
  account,
  pending,
}: {
  store: LinkableStore;
  account: StoreAccount | null;
  pending: boolean;
}) {
  const t = useTranslations('account.store');
  const tStore = useTranslations(`account.stores.${store}`);
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const storeLabels = useStoreLabels();
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');

  // Solo per i negozi che hanno un login da aprire: Steam rende null, perché lì
  // l'utente ha già sottomano il proprio profilo.
  const loginUrl = useQuery(api.accounts.loginUrl.queryOptions({ input: { store } }));

  const syncing = account?.syncing ?? false;
  const needsReauth = account?.status === 'needs_reauth';

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
  }

  const link = useMutation({
    mutationFn: () => client.accounts.link({ store, value: value.trim() }),
    onSuccess: async () => {
      setValue('');
      await refreshAccounts();
      toast.success(t('linked'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('linkFailed') })),
  });

  const unlink = useMutation({
    mutationFn: () => client.accounts.unlink({ store }),
    onSuccess: async () => {
      await Promise.all([
        refreshAccounts(),
        queryClient.invalidateQueries({
          queryKey: api.imports.unresolved.key(),
        }),
      ]);
      toast.success(t('unlinked'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('unlinkFailed') })),
  });

  const sync = useMutation({
    mutationFn: () => client.accounts.sync({ store }),
    onSuccess: async () => {
      await refreshAccounts();
      toast.success(t('syncStarted'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('syncFailed'),
          // Lo stesso codice dice cose diverse a seconda di cosa si stava
          // facendo: qui un conflitto è "c'è già un import in corso".
          CONFLICT: t('alreadySyncing'),
        }),
      ),
  });

  // Il modulo di collegamento: si mostra quando l'account non c'è **e anche**
  // quando il credenziale è scaduto, perché ricollegare è esattamente il gesto
  // che rimette a posto un `needs_reauth`.
  const linkForm = (
    <div className="grid gap-3">
      {loginUrl.data?.url && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => window.open(loginUrl.data.url!, '_blank', 'noopener')}
        >
          {t('openLogin')}
        </Button>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`collega-${store}`}>
          {loginUrl.data?.url ? t('pasteStep') : tStore('inputLabel')}
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`collega-${store}`}
            className="min-w-64 flex-1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={tStore('placeholder')}
          />
          <Button
            onClick={() => link.mutate()}
            disabled={value.trim().length === 0 || link.isPending}
          >
            {needsReauth ? t('reconnect') : t('link')}
          </Button>
        </div>
      </div>

      <p className="text-muted-foreground">{tStore('hint')}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{storeLabels[store]}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        {pending ? (
          <Skeleton className="h-9 w-full rounded-lg" />
        ) : !account ? (
          linkForm
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">
                {account.displayName ?? account.externalAccountId}
              </Badge>
              <span className="text-muted-foreground">
                {syncing
                  ? t('syncing')
                  : account.lastSyncAt
                    ? t('lastSync', {
                        when: format.relativeTime(account.lastSyncAt),
                      })
                    : t('neverSynced')}
              </span>
            </div>

            {needsReauth ? (
              <>
                <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                  {t('needsReauth')}
                </p>
                {linkForm}
              </>
            ) : (
              <Button
                onClick={() => sync.mutate()}
                disabled={syncing || sync.isPending}
                className="justify-self-start"
              >
                {t('sync')}
              </Button>
            )}

            <Button
              variant="ghost"
              onClick={() => unlink.mutate()}
              disabled={unlink.isPending}
              className="justify-self-start"
            >
              {t('unlink')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
