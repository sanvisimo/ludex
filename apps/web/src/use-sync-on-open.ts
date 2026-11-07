import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { api, client } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

/**
 * Le librerie si aggiornano quando apri Ludex: il gioco comprato stamattina è
 * nel backlog stasera, senza aspettare la spazzata della settimana.
 *
 * Si chiede al server all'apertura e **ogni volta che la scheda torna in primo
 * piano**: chi tiene Ludex aperto sul telefono e ci torna la sera non ricarica
 * la pagina. Chiamare spesso non costa: quanto è vecchio un account, e che
 * l'apertura non accodi più di un giro all'ora, lo decide il server
 * (`enqueueImportsOnOpen`).
 *
 * Gli import accodati fanno comparire il segnale in `/backlog` (gli account
 * diventano `syncing`), e i giochi nuovi arrivano da soli con
 * `useLiveUpdates`.
 */
export function useSyncOnOpen() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const userId = session?.user.id;

  useEffect(() => {
    if (!userId) return;

    const sync = () => {
      void client.accounts
        .syncOnOpen()
        .then(({ queued }) => {
          if (queued > 0)
            void queryClient.invalidateQueries({
              queryKey: api.accounts.key(),
            });
        })
        // Un aggiornamento che non parte non è un errore da mostrare: la
        // spazzata e il sync a mano restano lì.
        .catch(() => undefined);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync();
    };

    sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [userId, queryClient]);
}
