'use client';

import type { LinkableStore, Store, StoreAccount } from '@repo/contracts';
import { linkableStoreValues, storeAccountName } from '@repo/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { StoreLinkForm } from '@/components/store-link-form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

/**
 * Un account collegato.
 *
 * Una scheda per **account** e non per negozio: due account Amazon sono un caso
 * vero — per il motore decisionale sono la stessa cosa, «ci posso giocare
 * stasera» non cambia, ma per lanciare il gioco bisogna essere collegati a
 * quello giusto. Finché la scheda era una per negozio, il secondo collegamento
 * sovrascriveva il primo senza dirlo.
 *
 * Il modulo per collegare non sta più qui: quello è `add-store-account`, perché
 * aggiungere un account e guardarne uno collegato sono due gesti diversi. Qui
 * ricompare solo quando il credenziale è scaduto, dove ricollegare è esattamente
 * ciò che rimette a posto un `needs_reauth`.
 */
const isLinkable = (store: Store): store is LinkableStore =>
  (linkableStoreValues as readonly string[]).includes(store);

export function StoreAccountCard({
  account,
  onUnlink,
}: {
  account: StoreAccount;
  onUnlink: () => void;
}) {
  const t = useTranslations('account.store');
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const storeLabels = useStoreLabels();
  const queryClient = useQueryClient();

  // `null` = non si sta rinominando. Stringa vuota è un valore legittimo: è
  // l'etichetta cancellata, che è un gesto e non un errore.
  const [label, setLabel] = useState<string | null>(null);

  const syncing = account.syncing;
  // Ricollegare si può solo dove c'è un collegamento da rifare. `store` sul
  // contratto è l'insieme largo — comprende i negozi da cui un gioco *proviene*,
  // scritti a mano su un possesso — e non tutti si collegano.
  const relinkStore =
    account.status === 'needs_reauth' && isLinkable(account.store)
      ? account.store
      : null;

  const rename = useMutation({
    mutationFn: () =>
      client.accounts.rename({ accountId: account.id, label: label ?? null }),
    onSuccess: async () => {
      setLabel(null);
      await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
      // Il nome dell'account compare anche sui possessi, nella scheda del gioco.
      await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('renameFailed') })),
  });

  const sync = useMutation({
    mutationFn: () => client.accounts.sync({ accountId: account.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>{storeLabels[account.store]}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{storeAccountName(account)}</Badge>
          {/* Il nome del negozio accanto all'etichetta: serve a ritrovare quale
              account è, quando l'etichetta gliel'hai data tu. */}
          {account.label && account.displayName && (
            <span className="text-muted-foreground">{account.displayName}</span>
          )}
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

        {relinkStore ? (
          <>
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
              {t('needsReauth')}
            </p>
            <StoreLinkForm store={relinkStore} submitLabel={t('reconnect')} />
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

        {label === null ? (
          <Button
            variant="ghost"
            onClick={() => setLabel(account.label ?? '')}
            className="justify-self-start"
          >
            {account.label ? t('renameEdit') : t('renameAdd')}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Input
              className="min-w-48 flex-1"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={t('labelPlaceholder')}
              maxLength={60}
              autoFocus
            />
            <Button onClick={() => rename.mutate()} disabled={rename.isPending}>
              {t('renameSave')}
            </Button>
            <Button variant="ghost" onClick={() => setLabel(null)}>
              {t('renameCancel')}
            </Button>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={onUnlink}
          className="justify-self-start"
        >
          {t('unlink')}
        </Button>
      </CardContent>
    </Card>
  );
}
