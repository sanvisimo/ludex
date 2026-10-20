import type {
  LinkableStore,
  Store,
  StoreAccount,
  Wishlist,
} from '@repo/contracts';
import {
  isOneShotStore,
  linkableStoreValues,
  storeAccountName,
  wishlistStoreValues,
} from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  Button,
  Card,
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
import {
  Download,
  EllipsisVertical,
  Heart,
  KeyRound,
  Link2,
  LogIn,
  LogOut,
  Pencil,
  RefreshCw,
  SlidersHorizontal,
  Unlink,
} from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { useFormatter, useNow, useTranslations } from 'use-intl';

import { RemoveSteamLoginDialog } from '@/components/remove-steam-login-dialog';
import { SteamLink } from '@/components/steam-link';
import { StoreWishlistRow } from '@/components/store-wishlist-row';
import { useSyncWishlist } from '@/components/use-sync-wishlist';
import { StoreLinkForm } from '@/components/store-link-form';
import { XboxLink } from '@/components/xbox-link';
import { XboxSettingsDialog } from '@/components/xbox-settings-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { STORE_BRAND } from '@/lib/store-brand';
import { api, client } from '@/lib/orpc';

/**
 * Quante righe della griglia occupa una scheda: i suoi sei posti. La griglia
 * della pagina lo usa per `grid-row`, e la scheda per la sua `subgrid`.
 */
const CARD_SLOTS = 6;

/**
 * Uno dei posti sotto l'intestazione. C'è sempre, anche vuoto, perché tiene la
 * sua riga della griglia; lo spazio sopra solo quando ha qualcosa, o una riga
 * di schede in cui nessuno lo usa avrebbe un buco.
 */
function Slot({ children }: { children?: ReactNode }) {
  const filled = children != null && children !== false;
  return (
    <div style={{ minWidth: 0, paddingTop: filled ? 12 : 0 }}>{children}</div>
  );
}

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
 *
 * **EA si importa una volta sola** (9c, `isOneShotStore`): il token dura
 * quattro ore e non si rinnova. Al posto di «Aggiorna» c'è «Importa di nuovo»,
 * che apre lo stesso modulo del ricollegamento sulla stessa riga, e
 * l'interruttore dell'aggiornamento automatico non c'è, perché non conterebbe.
 */
const isLinkable = (store: Store): store is LinkableStore =>
  (linkableStoreValues as readonly string[]).includes(store);

export function StoreAccountCard({
  account,
  wishlist,
  busy,
  autoSyncLibrary,
  onRename,
  onUnlink,
}: {
  account: StoreAccount;
  /** La wishlist importata di questo account, se c'è già (15e). */
  wishlist?: Wishlist;
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
  const tXbox = useTranslations('account.xbox');
  // Xbox (9e): «Cambia piattaforme», senza un login.
  const [changingXbox, setChangingXbox] = useState(false);
  const isXbox = account.store === 'xbox';
  const tWishlist = useTranslations('wishlist.store');
  const isSteam = account.store === 'steam';
  // Il token del browser, scaduto: vedi il badge più sotto.
  const tokenExpired =
    account.loginKind === 'token' &&
    account.loginExpiresAt != null &&
    account.loginExpiresAt.getTime() <= now.getTime();

  const syncing = account.syncing;
  // Ricollegare si può solo dove c'è un collegamento da rifare. `store` sul
  // contratto è l'insieme largo — comprende i negozi da cui un gioco *proviene*,
  // scritti a mano su un possesso — e non tutti si collegano.
  const relinkStore =
    account.status === 'needs_reauth' && isLinkable(account.store)
      ? account.store
      : null;
  // Reimportare EA è incollare un token nuovo: lo stesso modulo, un altro nome.
  const reimportStore = isOneShotStore(account.store) ? account.store : null;
  const brand = STORE_BRAND[account.store];

  const autoSync = useMutation({
    mutationFn: (value: boolean) =>
      client.accounts.setAutoSync({ accountId: account.id, autoSync: value }),
    // La riga che torna è già quella giusta: si scrive nella lista invece di
    // ricaricarla, così l'interruttore non torna indietro per un istante.
    // Sopra la riga di prima: quella che torna non ha ciò che la lista ricava
    // dal credenziale (il login Steam, le scelte Xbox), e lo perderebbe.
    onSuccess: (saved) =>
      queryClient.setQueryData(
        api.accounts.list.queryKey(),
        (rows: StoreAccount[] | undefined) =>
          rows?.map((row) =>
            row.id === saved.id ? { ...row, ...saved } : row,
          ),
      ),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('autoSyncFailed') })),
  });
  // Come per l'interruttore generale: durante la richiesta mostra già la
  // scelta nuova, o sembrerebbe che il clic non sia arrivato.
  const autoSyncChecked = autoSync.isPending
    ? (autoSync.variables ?? account.autoSync)
    : account.autoSync;

  // La wishlist del negozio (15e): solo dove se ne legge una, e solo a mano.
  const hasWishlist = (wishlistStoreValues as readonly string[]).includes(
    account.store,
  );
  const syncWishlist = useSyncWishlist(account.id);

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

  // `StoreWishlistRow` non dice niente su una wishlist mai importata: il suo
  // posto deve restare senza spazio sopra, come quelli vuoti.
  const showWishlistRow =
    hasWishlist &&
    (account.wishlistSyncing || account.wishlistError != null || !!wishlist);

  return (
    // Sei posti fissi — intestazione, login Steam, stato, wishlist, gesti,
    // nota — sulle sei righe che la griglia della pagina dà a ogni scheda
    // (`subgrid`). Ogni posto è alto quanto il più alto della stessa riga della
    // griglia: lo stato, la wishlist e i bottoni stanno alla stessa altezza in
    // tutte le schede, anche dove una ha la wishlist e quella accanto no. Un
    // posto vuoto non ha spazio sopra, così una riga in cui nessuno lo usa non
    // lascia buchi.
    <Card
      width="100%"
      gap={0}
      px={16}
      style={{
        display: 'grid',
        gridRow: `span ${CARD_SLOTS}`,
        gridTemplateRows: 'subgrid',
        rowGap: 0,
      }}
    >
      <XStack items="flex-start" justify="space-between" gap={8} minW={0}>
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
            <DropdownMenuItem icon={<Pencil size={16} />} onClick={onRename}>
              {account.label ? t('renameEdit') : t('renameAdd')}
            </DropdownMenuItem>
            {relinkStore && (
              <DropdownMenuItem
                icon={<Link2 size={16} />}
                onClick={() => setRelinking(true)}
              >
                {t('reconnect')}
              </DropdownMenuItem>
            )}
            {/* Le due voci nuove del 9f: sono due modi della stessa riga, e
                  l'una esclude l'altra — si offre quella che manca. */}
            {isSteam && !account.hasLogin && (
              <DropdownMenuItem
                icon={<LogIn size={16} />}
                onClick={() => setLoggingIn(true)}
              >
                {tSteam('signIn')}
              </DropdownMenuItem>
            )}
            {isSteam && account.loginKind === 'token' && (
              <DropdownMenuItem
                icon={<KeyRound size={16} />}
                onClick={() => setLoggingIn(true)}
              >
                {tSteam('newToken')}
              </DropdownMenuItem>
            )}
            {isXbox && account.status === 'ok' && (
              <DropdownMenuItem
                icon={<SlidersHorizontal size={16} />}
                onClick={() => setChangingXbox(true)}
                disabled={busy || syncing}
              >
                {tXbox('changeSettings')}
              </DropdownMenuItem>
            )}
            {isSteam && account.hasLogin && (
              <DropdownMenuItem
                icon={<LogOut size={16} />}
                onClick={() => setRemovingLogin(true)}
                disabled={busy || syncing}
              >
                {tSteam('removeLogin')}
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              icon={<Unlink size={16} />}
              onClick={onUnlink}
              disabled={busy || syncing}
            >
              {t('unlink')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </XStack>

      {/* Su Steam la scheda dice **come** è collegato l'account: col login
            (e allora c'è la famiglia) o col solo profilo, dove il login si
            offre lì accanto. Con il login scaduto non si dice «attivo»: il
            badge rosso di sotto dice già cosa fare. */}
      <Slot>
        {isSteam &&
          (account.hasLogin ? (
            <XStack items="center" gap={8} flexWrap="wrap">
              {tokenExpired ? (
                // Il token del browser dura 24 ore e non si rinnova: la
                // famiglia resta com'era all'ultimo import, il profilo
                // continua da solo. Non è un account da ricollegare.
                <>
                  <Badge variant="secondary">
                    {tSteam('badgeTokenExpired')}
                  </Badge>
                  <Text fontSize={13} color="$color11">
                    · {tSteam('familyFrozen')}
                  </Text>
                  <Button
                    variant="ghost"
                    size="sm"
                    px={0}
                    onClick={() => setLoggingIn(true)}
                  >
                    {tSteam('newToken')}
                  </Button>
                </>
              ) : (
                <>
                  <Badge
                    variant={
                      account.status === 'needs_reauth'
                        ? 'secondary'
                        : 'success'
                    }
                  >
                    {account.status === 'needs_reauth'
                      ? tSteam('badgeDead')
                      : tSteam('badgeOn')}
                  </Badge>
                  <Text fontSize={13} color="$color11">
                    · {tSteam('familyIncluded')}
                    {account.loginKind === 'token' &&
                      ` · ${tSteam('tokenKind')}`}
                  </Text>
                </>
              )}
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
        {/* Xbox dice le scelte fatte al collegamento: su cosa importa, e se
            il Game Pass è attivo. Si cambiano dal menu. */}
        {isXbox && account.xbox && (
          <XStack items="center" gap={8} flexWrap="wrap">
            <Badge variant="secondary">
              {account.xbox.platforms
                .map((platform) => tXbox(`platforms.${platform}`))
                .join(' · ')}
            </Badge>
            <Text fontSize={13} color="$color11">
              {account.xbox.gamePassActive
                ? tXbox('gamePassOn')
                : tXbox('gamePassOff')}
            </Text>
          </XStack>
        )}
      </Slot>

      {/* Lo stato in una riga: da ricollegare, in corso, o quando è stata
            l'ultima volta. Da ricollegare vince sul resto: finché non si
            rimette a posto niente si aggiorna. */}
      <Slot>
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
      </Slot>

      <Slot>
        {showWishlistRow && (
          <StoreWishlistRow account={account} list={wishlist} />
        )}
      </Slot>

      {/* Una riga sola: a sinistra il gesto, a destra l'interruttore.
            «Aggiorna» è la sola icona, col suo nome nel suggerimento e
            nell'`aria-label`; «Ricollega» resta a parole, perché è il gesto da
            fare e non va nascosto. L'interruttore tiene «Auto» scritto: il
            suggerimento non compare su un telefono, e senza una parola
            accanto lo switch non direbbe cosa fa. */}
      <Slot>
        <XStack items="center" gap={8}>
          {relinkStore ? (
            <Button onClick={() => setRelinking(true)}>
              <Link2 size={16} color="$black1" />
              {t('reconnect')}
            </Button>
          ) : reimportStore ? (
            // A parole e non a icona come ↻: non è il gesto di sempre ma uno
            // che chiede di rifare i passi, e deve dirlo prima del clic.
            <Button
              variant="outline"
              onClick={() => setRelinking(true)}
              disabled={busy || syncing}
            >
              <Spinner spinning={syncing}>
                <Download size={16} color="$color12" />
              </Spinner>
              {t('reimport')}
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

          {/* Il cuore accanto al ↻: importa la wishlist del negozio, o la
                aggiorna se c'è. Solo dove se ne legge una, e non da
                ricollegare. Gira mentre quell'account la importa. */}
          {hasWishlist && !relinkStore && (
            <Tooltip
              content={wishlist ? tWishlist('refresh') : tWishlist('import')}
            >
              <Button
                variant="outline"
                size="icon"
                aria-label={
                  wishlist ? tWishlist('refresh') : tWishlist('import')
                }
                onClick={() => syncWishlist.mutate()}
                disabled={account.wishlistSyncing || syncWishlist.isPending}
              >
                <Spinner spinning={account.wishlistSyncing}>
                  <Heart size={16} color="$color12" />
                </Spinner>
              </Button>
            </Tooltip>
          )}

          {!reimportStore && (
            <XStack items="center" gap={8} ml="auto">
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
          )}
        </XStack>
      </Slot>

      <Slot>
        {reimportStore ? null : !autoSyncLibrary ? (
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
      </Slot>

      {/* Il dialogo si chiude da sé quando il ricollegamento riesce: lo stato
          torna `ok`, `relinkStore` diventa nullo e `open` con lui. */}
      <Dialog
        open={relinking && (relinkStore !== null || reimportStore !== null)}
        onOpenChange={setRelinking}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {reimportStore
                ? t('reimportTitle', { store: storeLabels[account.store] })
                : t('reconnectTitle', { store: storeLabels[account.store] })}
            </DialogTitle>
            <DialogDescription>
              {reimportStore ? t('reimportDescription') : t('needsReauth')}
            </DialogDescription>
          </DialogHeader>
          {reimportStore ? (
            // Sulla stessa riga: il server controlla che il token sia dello
            // stesso account EA, e l'import parte da sé.
            <StoreLinkForm
              store={reimportStore}
              accountId={account.id}
              submitLabel={t('reimport')}
              onLinked={() => setRelinking(false)}
            />
          ) : relinkStore === 'xbox' ? (
            // Un codice nuovo, con le scelte di adesso già spuntate: il server
            // rifiuta un login fatto con un altro account Xbox.
            <XboxLink
              accountId={account.id}
              initial={account.xbox}
              onLinked={() => setRelinking(false)}
            />
          ) : relinkStore === 'steam' ? (
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
          <DialogContent>
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

      {isXbox && (
        <XboxSettingsDialog
          account={changingXbox ? account : null}
          onOpenChange={setChangingXbox}
        />
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
