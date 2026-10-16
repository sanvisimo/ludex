import type { RandomFilter } from '@repo/contracts';
import { Button, toast, Tooltip } from '@repo/ui';
import { Dices } from '@repo/ui/icons';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useRouterState } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import type { BacklogSearch } from '@/lib/backlog-filter';
import {
  newSeed,
  randomSearch,
  toRandomFilter,
  validateBacklogSearch,
  validateRandomSearch,
} from '@/lib/backlog-filter';
import { client } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

/** Un tiro: da dove si pesca, il mazzo, e la scheda su cui si è. */
type Draw = {
  search: BacklogSearch;
  filter: RandomFilter | undefined;
  seed: string;
  after: string | undefined;
};

/**
 * Il dado (15c): fisso in basso a destra, nel guscio, e apre la scheda di un
 * gioco a caso. Da dove pesca lo dice la pagina:
 *
 * - su `/backlog`, dal filtro della pagina, con un mazzo nuovo;
 * - sulla scheda di un gioco pescato (c'è `seed` nell'URL), il successivo
 *   dello stesso giro;
 * - altrove, da tutto il backlog con un mazzo nuovo.
 *
 * Da anonimi il server pesca dal catalogo e il filtro non conta. Nella vista
 * dei nascosti non c'è: lì il filtro non è quello che il dado userebbe.
 *
 * Il seme si inventa al clic e non al render, o server e browser ne
 * scriverebbero due diversi. E al clic si legge anche dove si è, dalla
 * `location` del router e non dalle rotte montate: un secondo tiro mentre la
 * scheda di prima carica ancora deve proseguire il suo giro, e le rotte
 * montate sarebbero ancora quelle della pagina da cui si è partiti.
 */
export function RandomGameDice() {
  const t = useTranslations('backlog');
  const router = useRouter();
  const errorMessage = useApiErrorMessage();
  const { data: session, isPending } = useSession();
  const inHidden = useRouterState({
    select: (state) =>
      state.location.pathname === '/backlog' &&
      validateBacklogSearch(state.location.search).hidden === true,
  });

  const pick = useMutation({
    mutationFn: (draw: Draw) =>
      client.games.random({
        filter: draw.filter,
        seed: draw.seed,
        after: draw.after,
      }),
    onSuccess: (result, draw) => {
      if (!result) {
        toast(draw.after ? t('randomOnlyOne') : t('randomEmpty'));
        return;
      }
      void router.navigate({
        to: '/games/$slug',
        params: { slug: result.slug },
        search: randomSearch(draw.search, draw.seed),
      });
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('randomFailed') })),
  });

  // Finché la sessione non si sa, non si sa nemmeno da dove pescare.
  if (isPending) return null;
  if (inHidden) return null;

  const roll = () => {
    const { pathname, search: raw } = router.state.location;
    const slug = /^\/games\/([^/]+)$/.exec(pathname)?.[1];
    // Sulla scheda di un gioco pescato, il giro che c'è nell'URL.
    const giro = slug ? validateRandomSearch(raw) : {};
    const search: BacklogSearch =
      pathname === '/backlog' ? validateBacklogSearch(raw) : giro;
    pick.mutate({
      search,
      filter: session ? toRandomFilter(search) : undefined,
      seed: giro.seed ?? newSeed(),
      after: giro.seed && slug ? decodeURIComponent(slug) : undefined,
    });
  };

  return (
    <Tooltip content={t('random')} placement="left">
      <Button
        size="icon"
        aria-label={t('random')}
        disabled={pick.isPending}
        onPress={roll}
      >
        <Dices size={16} color="$black1" />
      </Button>
    </Tooltip>
  );
}
