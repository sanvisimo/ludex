import type { LiveEvent } from '@repo/contracts';
import { storeAccountName } from '@repo/contracts';
import { toast } from '@repo/ui';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'use-intl';

import { useWishlistErrorText } from '@/components/use-wishlist-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

/** Il primo tentativo dopo una caduta, poi raddoppia fino al tetto. */
const RETRY_MIN_MS = 1_000;
const RETRY_MAX_MS = 30_000;

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

/**
 * Gli aggiornamenti in push: finché la sessione c'è, una connessione aperta
 * col server che dice quali dati sono cambiati, e le query di quei dati si
 * rileggono. È ciò che fa comparire i giochi di un import su qualunque pagina,
 * e le copertine man mano che arriva l'enrichment.
 *
 * Una caduta — rete, server riavviato — si ripara da sola, con attese che
 * raddoppiano. E alla riconnessione si rilegge **tutto** ciò che gli eventi
 * coprono, perché quelli arrivati mentre era giù sono persi: il server non ne
 * tiene lo storico, e non serve.
 */
export function useLiveUpdates() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  const t = useTranslations('wishlist.store');
  const storeLabels = useStoreLabels();
  const errorText = useWishlistErrorText();

  // Cosa dire quando l'import di una wishlist finisce. Sta in un riferimento: i
  // testi cambiano con la lingua, e la connessione non deve rifarsi per questo.
  const wishlistFinished = useRef<(storeAccountId: string) => void>(
    () => undefined,
  );
  wishlistFinished.current = (storeAccountId) => {
    // L'esito sta sull'account, non nell'evento: si rilegge, saltando la cache.
    void queryClient
      .fetchQuery({ ...api.accounts.list.queryOptions(), staleTime: 0 })
      .then((accounts) => {
        const account = accounts.find((row) => row.id === storeAccountId);
        // Scollegato nel frattempo, o un tentativo fallito che BullMQ riprova:
        // l'account risulta ancora in importazione, e l'esito vero arriva dopo.
        if (!account || account.wishlistSyncing) return;
        const name = `${storeLabels[account.store]} · ${storeAccountName(account)}`;
        if (account.wishlistError) {
          toast.error(
            t('finishedFailed', {
              name,
              reason: errorText(account.wishlistError),
            }),
          );
        } else {
          toast.success(t('finished', { name }));
        }
      })
      .catch(() => undefined);
  };

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();
    const { signal } = controller;
    const invalidate = (queryKey: QueryKey) =>
      void queryClient.invalidateQueries({ queryKey });

    const importFinished = () => {
      invalidate(api.accounts.key());
      invalidate(api.backlog.key());
      invalidate(api.playlists.key());
      invalidate(api.imports.key());
    };

    const gamesChanged = (gameIds?: string[]) => {
      invalidate(api.backlog.key());
      invalidate(api.playlists.key());
      invalidate(api.games.home.key());
      // Senza id vuol dire «tutte le schede aperte»: la riconnessione. Gli
      // eventi parlano di id e le schede si aprono per slug: si riconoscono
      // dal gioco che hanno in cache.
      void queryClient.invalidateQueries({
        queryKey: api.games.bySlug.key(),
        predicate: (query) => {
          if (!gameIds) return true;
          const data = query.state.data as { game: { id: string } } | undefined;
          return data !== undefined && gameIds.includes(data.game.id);
        },
      });
    };

    // Lo stato di una fonte è cambiato: lo legge «Dati mancanti» dell'admin, e
    // una query non montata non si rilegge, quindi agli altri non costa niente.
    const sourcesChanged = () => invalidate(api.admin.missing.key());

    function handle(event: LiveEvent) {
      if (event.type === 'games') return gamesChanged(event.gameIds);
      if (event.type === 'sources') return sourcesChanged();
      if (event.type === 'wishlist') {
        // L'account porta `wishlistSyncing` e l'esito dell'ultimo import.
        invalidate(api.accounts.key());
        invalidate(api.wishlists.key());
        if (event.phase === 'finished')
          wishlistFinished.current(event.storeAccountId);
        return;
      }
      if (event.phase === 'started') return invalidate(api.accounts.key());
      importFinished();
    }

    void (async () => {
      let delay = RETRY_MIN_MS;
      let reconnecting = false;

      while (!signal.aborted) {
        try {
          const events = await client.events.subscribe(undefined, { signal });
          if (reconnecting) {
            importFinished();
            gamesChanged();
            sourcesChanged();
            invalidate(api.wishlists.key());
          }
          delay = RETRY_MIN_MS;
          for await (const event of events) handle(event);
        } catch {
          // La connessione è caduta, o la pagina l'ha chiusa: il ciclo decide.
        }
        if (signal.aborted) return;

        reconnecting = true;
        await wait(delay, signal);
        delay = Math.min(delay * 2, RETRY_MAX_MS);
      }
    })();

    return () => controller.abort();
  }, [userId, queryClient]);
}
