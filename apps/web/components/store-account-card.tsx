import type { LinkableStore, Store, StoreAccount } from '@repo/contracts';
import { linkableStoreValues, storeAccountName } from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Label,
  Spinner,
  Switch,
  Text,
  Tooltip,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { EllipsisVertical, RefreshCw } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { RemoveSteamLoginDialog } from '@/components/remove-steam-login-dialog';
import { SteamLink } from '@/components/steam-link';
import { StoreLinkForm } from '@/components/store-link-form';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { STORE_BRAND } from '@/lib/store-brand';
import { api, client } from '@/lib/orpc';

/**
 * Un account collegato, in una scheda della griglia.
 *
 * Una scheda per **account** e non per negozio: due account Amazon sono un caso
 * vero — per il motore decisionale sono la stessa cosa, «ci posso giocare
 * stasera» non cambia, ma per lanciare il gioco bisogna essere collegati a
 * quello giusto. Finché la scheda era una per negozio, il secondo collegamento
 * sovrascriveva il primo senza dirlo.
 *
 * Sulla scheda stanno i gesti di ogni giorno: aggiornare e l'interruttore
 * dell'aggiornamento automatico. Quelli rari — dare un nome, scollegare,
 * ricollegare — stanno nel menu, e aprono un dialogo ciascuno.
 *
 * Il modulo per **aggiungere** un account non è qui, è `add-store-account`.
 * Qui il modulo compare solo per ricollegare, perché è esattamente ciò che
 * rimette a posto un `needs_reauth`.
 */
const isLinkable = (store: Store): store is LinkableStore =>
  (linkableStoreValues as readonly string[]).includes(store);

export function StoreAccountCard({
  account,
  busy,
  autoSyncLibrary,
  onRename,
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
  onRename: () => void;
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
  const [relinking, setRelinking] = useState(false);
  // Steam: aggiungere il login a un account che aveva solo il profilo, e
  // toglierlo. Il ricollegamento di un login scaduto passa da `relinking`, come
  // per gli altri negozi, ma con il QR al posto del modulo.
  const [loggingIn, setLoggingIn] = useState(false);
  const [removingLogin, setRemovingLogin] = useState(false);
  const tSteam = useTranslations('account.steamLogin');
  const isSteam = account.store === 'steam';

  const syncing = account.syncing;
  // Ricollegare si può solo dove c'è un collegamento da rifare. `store` sul
  // contratto è l'insieme largo — comprende i negozi da cui un gioco *proviene*,
  // scritti a mano su un possesso — e non tutti si collegano.
  const relinkStore =
    account.status === 'needs_reauth' && isLinkable(account.store)
      ? account.store
      : null;
  const brand = STORE_BRAND[account.store];

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
    <Card width="100%">
      {/* `grow` e `mt="auto"` sulla riga in fondo: la griglia allunga le
          schede di una riga alla più alta, e senza questo i bottoni di
          aggiornamento stavano ad altezze diverse da una scheda all'altra. */}
      <CardContent gap={12} grow={1}>
        <XStack items="flex-start" justify="space-between" gap={8}>
          <XStack items="center" gap={12} shrink={1} minW={0}>
            {brand ? (
              <BrandIcon
                brand={brand}
                size={40}
                label={storeLabels[account.store]}
              />
            ) : null}
            <YStack shrink={1} minW={0}>
              <Text fontWeight="600" color="$color12">
                {storeLabels[account.store]}
              </Text>
              <Text
                fontSize={13}
                lineHeight={18}
                color="$color11"
                numberOfLines={1}
              >
                {storeAccountName(account)}
              </Text>
              {/* Il nome del negozio accanto all'etichetta: serve a ritrovare
                  quale account è, quando l'etichetta gliel'hai data tu. */}
              {account.label && account.displayName && (
                <Text
                  fontSize={12}
                  lineHeight={16}
                  color="$color11"
                  numberOfLines={1}
                >
                  {account.displayName}
                </Text>
              )}
            </YStack>
          </XStack>

          <DropdownMenu align="end">
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t('menu', {
                    name: storeAccountName(account),
                  })}
                >
                  <EllipsisVertical size={16} color="$color12" />
                </Button>
              }
            />
            <DropdownMenuContent width={192}>
              <DropdownMenuItem onClick={onRename}>
                {account.label ? t('renameEdit') : t('renameAdd')}
              </DropdownMenuItem>
              {relinkStore && (
                <DropdownMenuItem onClick={() => setRelinking(true)}>
                  {t('reconnect')}
                </DropdownMenuItem>
              )}
              {/* Le due voci nuove del 9f: sono due modi della stessa riga, e
                  l'una esclude l'altra — si offre quella che manca. */}
              {isSteam && !account.hasLogin && (
                <DropdownMenuItem onClick={() => setLoggingIn(true)}>
                  {tSteam('signIn')}
                </DropdownMenuItem>
              )}
              {isSteam && account.hasLogin && (
                <DropdownMenuItem
                  onClick={() => setRemovingLogin(true)}
                  disabled={busy || syncing}
                >
                  {tSteam('removeLogin')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onUnlink} disabled={busy || syncing}>
                {t('unlink')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </XStack>

        {/* Tutto ciò che sta sotto l'intestazione è ancorato in fondo, stato
            compreso. La griglia allunga le schede di una riga alla più alta:
            con lo stato in alto e solo i gesti in fondo, fra i due restava un
            vuoto di altezza diversa da una scheda all'altra. */}
        <YStack gap={12} mt="auto">
          {/* Su Steam la scheda dice **come** è collegato l'account: col login
              (e allora c'è la famiglia) o col solo profilo, dove il login si
              offre lì accanto. Con il login scaduto non si dice «attivo»: il
              badge rosso di sotto dice già cosa fare. */}
          {isSteam &&
            (account.hasLogin ? (
              <XStack items="center" gap={8} flexWrap="wrap">
                <Badge
                  variant={
                    account.status === 'needs_reauth' ? 'secondary' : 'success'
                  }
                >
                  {account.status === 'needs_reauth'
                    ? tSteam('badgeDead')
                    : tSteam('badgeOn')}
                </Badge>
                <Text fontSize={13} color="$color11">
                  · {tSteam('familyIncluded')}
                </Text>
              </XStack>
            ) : (
              <XStack items="center" gap={8} flexWrap="wrap">
                <Badge variant="secondary">{tSteam('badgeProfileOnly')}</Badge>
                {/* Senza il rientro del bottone: accanto al badge deve stare in
                    una riga sola, e allineato al suo bordo. */}
                <Button
                  variant="ghost"
                  size="sm"
                  px={0}
                  onClick={() => setLoggingIn(true)}
                >
                  {tSteam('signIn')}
                </Button>
              </XStack>
            ))}

          {/* Lo stato in una riga: da ricollegare, in corso, o quando è stata
            l'ultima volta. Da ricollegare vince sul resto: finché non si
            rimette a posto niente si aggiorna. */}
          {account.status === 'needs_reauth' ? (
            <YStack gap={4}>
              <Badge variant="error" self="flex-start">
                {t('needsReauthBadge')}
              </Badge>
              <Text fontSize={13} lineHeight={18} color="$color11">
                {t('needsReauth')}
              </Text>
            </YStack>
          ) : syncing ? (
            <Badge variant="warning" self="flex-start">
              {t('syncing')}
            </Badge>
          ) : (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {account.lastSyncAt
                ? t('lastSync', {
                    when: format.relativeTime(account.lastSyncAt, now),
                  })
                : t('neverSynced')}
            </Text>
          )}

          {/* Una riga sola: a sinistra il gesto, a destra l'interruttore.
            «Aggiorna» è la sola icona, col suo nome nel suggerimento e
            nell'`aria-label`; «Ricollega» resta a parole, perché è il gesto da
            fare e non va nascosto. L'interruttore tiene «Auto» scritto: il
            suggerimento non compare su un telefono, e senza una parola
            accanto lo switch non direbbe cosa fa. */}
          <XStack items="center" justify="space-between" gap={8}>
            {relinkStore ? (
              <Button onClick={() => setRelinking(true)}>
                {t('reconnect')}
              </Button>
            ) : (
              <Tooltip content={t('sync')}>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label={t('sync')}
                  onClick={() => sync.mutate()}
                  disabled={busy || syncing || sync.isPending}
                >
                  {/* Gira mentre quell'account importa: il bottone resta spento
                    e dice «Aggiorna», lo Spinner è solo il movimento. */}
                  <Spinner spinning={syncing}>
                    <RefreshCw size={16} color="$color12" />
                  </Spinner>
                </Button>
              </Tooltip>
            )}

            <XStack items="center" gap={8}>
              <Label htmlFor={autoSyncId}>{t('autoSyncShort')}</Label>
              <Tooltip content={t('autoSync')}>
                <Switch
                  id={autoSyncId}
                  aria-label={t('autoSync')}
                  checked={autoSyncChecked}
                  onCheckedChange={(value) => autoSync.mutate(value)}
                  disabled={!autoSyncLibrary || autoSync.isPending}
                />
              </Tooltip>
            </XStack>
          </XStack>

          {!autoSyncLibrary ? (
            <Text fontSize={13} lineHeight={18} color="$color11">
              {t('autoSyncOffGlobally')}
            </Text>
          ) : (
            // Solo PSN: sugli altri negozi spegnerlo vuol dire una libreria
            // meno fresca, qui vuol dire un collegamento che muore.
            account.store === 'psn' &&
            !autoSyncChecked && (
              <Text fontSize={13} lineHeight={18} color="$red11">
                {t('autoSyncPsnWarning')}
              </Text>
            )
          )}
        </YStack>
      </CardContent>

      {/* Il dialogo si chiude da sé quando il ricollegamento riesce: lo stato
          torna `ok`, `relinkStore` diventa nullo e `open` con lui. */}
      <Dialog
        open={relinking && relinkStore !== null}
        onOpenChange={setRelinking}
      >
        <DialogContent maxW={512}>
          <DialogHeader>
            <DialogTitle>
              {t('reconnectTitle', { store: storeLabels[account.store] })}
            </DialogTitle>
            <DialogDescription>{t('needsReauth')}</DialogDescription>
          </DialogHeader>
          {relinkStore === 'steam' ? (
            // Un account Steam da ricollegare ha un login scaduto: si rifà il
            // QR, non si incolla il profilo, che di credenziale non ne ha.
            <SteamLink
              loginOnly
              accountId={account.id}
              onLinked={() => setRelinking(false)}
            />
          ) : (
            relinkStore && (
              <StoreLinkForm
                store={relinkStore}
                accountId={account.id}
                submitLabel={t('reconnect')}
                onLinked={() => setRelinking(false)}
              />
            )
          )}
        </DialogContent>
      </Dialog>

      {/* Aggiungere il login a un account che aveva solo il profilo: lo stesso
          QR, sulla stessa riga. Il server rifiuta un login fatto con un altro
          account Steam. */}
      {isSteam && (
        <Dialog open={loggingIn} onOpenChange={setLoggingIn}>
          <DialogContent maxW={512}>
            <DialogHeader>
              <DialogTitle>{tSteam('title')}</DialogTitle>
              <DialogDescription>{tSteam('description')}</DialogDescription>
            </DialogHeader>
            {loggingIn && (
              <SteamLink
                loginOnly
                accountId={account.id}
                onLinked={() => setLoggingIn(false)}
              />
            )}
          </DialogContent>
        </Dialog>
      )}

      {isSteam && (
        <RemoveSteamLoginDialog
          account={removingLogin ? account : null}
          onOpenChange={setRemovingLogin}
        />
      )}
    </Card>
  );
}
