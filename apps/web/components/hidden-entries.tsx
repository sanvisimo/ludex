'use client';

import { Button, Card, CardContent, CardHeader, CardTitle } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { GameTypeBadge } from '@/components/game-type-badge';
import { OwnershipBadges } from '@/components/ownership-badges';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { api } from '@/lib/orpc';

// Quanti se ne elencano qui: oltre, si va nella vista del backlog, che ha i
// filtri e la ricerca. Questa è una finestra, non un secondo backlog.
const QUANTI = 20;

/**
 * I giochi nascosti, accanto agli scarti nascosti.
 *
 * Sono due mucchi diversi — un gioco vero che non si vuole in lista, e una
 * voce d'import che un gioco non è — ma il gesto che li ha messi lì è lo
 * stesso, e chi li cerca li cerca insieme: «cosa ho tolto di mezzo?» è una
 * domanda sola. La vista dentro il backlog resta, ed è quella che serve
 * quando i nascosti sono tanti; questa è il posto dove ripensarci senza
 * sapere già dove guardare.
 */
export function HiddenEntries() {
  const t = useTranslations('account.hiddenEntries');
  const tHidden = useTranslations('hidden');
  const setHidden = useSetEntryHidden();

  const hidden = useQuery(
    api.backlog.list.queryOptions({
      input: { hidden: true, limit: QUANTI },
    }),
  );

  const entries = hidden.data?.entries ?? [];
  const total = hidden.data?.total ?? 0;
  if (total === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title', { count: total })}</CardTitle>
      </CardHeader>
      <CardContent gap={12}>
        <p className="text-muted-foreground">{t('description')}</p>
        <ul className="grid gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-foreground/10"
            >
              <div className="grid flex-1 gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/games/${entry.game.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {entry.game.name}
                  </Link>
                  <GameTypeBadge type={entry.game.gameType} />
                </span>
                {/* Il possesso è la ragione per cui la riga è ancora qui:
                    nascondere non è dire «non ce l'ho». */}
                <OwnershipBadges ownerships={entry.ownerships} />
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setHidden.mutate({ id: entry.id, hidden: false })
                }
                disabled={setHidden.isPending}
              >
                {tHidden('unhide')}
              </Button>
            </li>
          ))}
        </ul>
        {total > entries.length && (
          <Link
            href="/backlog?hidden=true"
            className="text-muted-foreground underline-offset-4 hover:underline"
          >
            {t('showAll', { count: total })}
          </Link>
        )}
      </CardContent>
    </Card>
  );
}
