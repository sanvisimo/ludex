import type { LiveEvent } from '@repo/contracts';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect } from 'react';

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

  useEffect(() => {
    if (!userId) return;

    const controller = new AbortController();
    const { signal } = controller;
    const invalidate = (queryKey: QueryKey) =>
      void queryClient.invalidateQueries({ queryKey });

    const importFinished = () => {
      invalidate(api.accounts.key());
      invalidate(api.backlog.key());
      invalidate(api.imports.key());
    };

    const gamesChanged = (gameIds?: string[]) => {
      invalidate(api.backlog.key());
      invalidate(api.games.latest.key());
      // Senza id vuol dire «tutte le schede aperte»: la riconnessione.
      if (!gameIds) invalidate(api.games.byId.key());
      else
        for (const id of gameIds)
          invalidate(api.games.byId.key({ input: { id } }));
    };

    function handle(event: LiveEvent) {
      if (event.type === 'games') return gamesChanged(event.gameIds);
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
