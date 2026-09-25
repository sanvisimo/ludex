import type { LinkableStore, Store, StoreAccount } from '@repo/contracts';
import { linkableStoreValues, storeAccountName } from '@repo/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Switch,
  XStack,
  toast,
} from '@repo/ui';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useFormatter, useNow, useTranslations } from 'use-intl';
import { useId, useState } from 'react';

import { StoreLinkForm } from '@/components/store-link-form';
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
  busy,
  autoSyncLibrary,
  onUnlink,
}: {
  account: StoreAccount;
  /**
   * C'è un import in corso su **un qualunque** account dell'utente. Spegne
   * «Aggiorna» e «Scollega» su tutte le schede, non solo su quella che importa:
   * dopo «Aggiorna tutti» i job aspettano in fila, e una scheda ancora in coda
   * sembrerebbe libera.
   */
  busy: boolean;
  /**
   * L'interruttore generale. Spento, quello della scheda non conta: resta
   * visibile ma fermo, così la scelta fatta su questo account non si perde e
   * torna com'era quando si riaccende quello generale.
   */
  autoSyncLibrary: boolean;
  onUnlink: () => void;
}) {
  const t = useTranslations('account.store');
  // Lo Switch sta accanto al Label e non dentro: serve un id per legarli, e
  // gli account in pagina sono più d'uno.
  const autoSyncId = useId();
  const format = useFormatter();
  // Il riferimento di «X fa» è esplicito e avanza da sé: la pagina resta aperta
  // mentre l'import gira, e un «3 minuti fa» fermo diventerebbe falso.
  const now = useNow({ updateInterval: 60_000 });
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
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      // Il nome dell'account compare anche sui possessi, nella scheda del gioco.
      await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('renameFailed') })),
  });

  const autoSync = useMutation({
    mutationFn: (value: boolean) =>
      client.accounts.setAutoSync({ accountId: account.id, autoSync: value }),
    // La riga che torna è già quella giusta: si scrive nella lista invece di
    // ricaricarla, così l'interruttore non torna indietro per un istante.
    onSuccess: (saved) =>
      queryClient.setQueryData(
        api.accounts.list.queryKey(),
        (rows: StoreAccount[] | undefined) =>
          rows?.map((row) => (row.id === saved.id ? saved : row)),
      ),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('autoSyncFailed') })),
  });
  // Come per l'interruttore generale: durante la richiesta mostra già la
  // scelta nuova, o sembrerebbe che il clic non sia arrivato.
  const autoSyncChecked = autoSync.isPending
    ? (autoSync.variables ?? account.autoSync)
    : account.autoSync;

  const sync = useMutation({
    mutationFn: () => client.accounts.sync({ accountId: account.id }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
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
      <CardContent gap={16}>
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
                    when: format.relativeTime(account.lastSyncAt, now),
                  })
                : t('neverSynced')}
          </span>
        </div>

        {relinkStore ? (
          <>
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
              {t('needsReauth')}
            </p>
            <StoreLinkForm
              store={relinkStore}
              accountId={account.id}
              submitLabel={t('reconnect')}
            />
          </>
        ) : (
          <Button
            onClick={() => sync.mutate()}
            disabled={busy || syncing || sync.isPending}
            width="max-content"
          >
            {t('sync')}
          </Button>
        )}

        <div className="grid gap-2">
          <XStack items="center" gap={12}>
            <Switch
              id={autoSyncId}
              checked={autoSyncChecked}
              onCheckedChange={(value) => autoSync.mutate(value)}
              disabled={!autoSyncLibrary || autoSync.isPending}
            />
            <Label htmlFor={autoSyncId}>{t('autoSync')}</Label>
          </XStack>
          {!autoSyncLibrary ? (
            <p className="text-muted-foreground">{t('autoSyncOffGlobally')}</p>
          ) : (
            // Solo PSN: sugli altri negozi spegnerlo vuol dire una libreria
            // meno fresca, qui vuol dire un collegamento che muore.
            account.store === 'psn' &&
            !autoSyncChecked && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-destructive">
                {t('autoSyncPsnWarning')}
              </p>
            )
          )}
        </div>

        {label === null ? (
          <Button
            variant="ghost"
            onClick={() => setLabel(account.label ?? '')}
            width="max-content"
          >
            {account.label ? t('renameEdit') : t('renameAdd')}
          </Button>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Input
              minW={192}
              flex={1}
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
          disabled={busy || syncing}
          width="max-content"
        >
          {t('unlink')}
        </Button>
      </CardContent>
    </Card>
  );
}
