import type { GameAttribute } from '@repo/contracts';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
  XStack,
} from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';

import { EditEntryDialog } from '@/components/edit-entry-dialog';
import { EntryTags } from '@/components/entry-tags';
import { CriticScores } from '@/components/critic-scores';
import { GameCover } from '@/components/game-cover';
import { GameTypeBadge } from '@/components/game-type-badge';
import { HltbTimes } from '@/components/hltb-times';
import { OwnershipBadges } from '@/components/ownership-badges';
import { RatingValue } from '@/components/rating-value';
import { useSetEntryHidden } from '@/lib/hide-entry';
import { useStatusLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { ButtonLink } from '@/src/components/button-link';

const KIND_ORDER: GameAttribute['kind'][] = [
  'genre',
  'theme',
  'game_mode',
  'player_perspective',
];

function AttributeGroups({ attributes }: { attributes: GameAttribute[] }) {
  const t = useTranslations('attributeKind');

  return (
    <div className="grid gap-3">
      {KIND_ORDER.map((kind) => {
        const items = attributes.filter((a) => a.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="grid gap-1">
            <span className="text-muted-foreground">{t(kind)}</span>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <Badge key={`${item.kind}-${item.igdbId}`} variant="secondary">
                  {item.name}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pagina auth/no-auth: il gioco si vede sempre, `entry` arriva popolata solo se
// chi guarda è autenticato e ce l'ha nel backlog.
export const Route = createFileRoute('/games/$id')({ component: GamePage });

function GamePage() {
  const t = useTranslations('game');
  const tHidden = useTranslations('hidden');
  const statusLabels = useStatusLabels();
  const setHidden = useSetEntryHidden();

  const { id } = Route.useParams();
  const { data, isPending, error } = useQuery(
    api.games.byId.queryOptions({ input: { id } }),
  );

  // Solo un interruttore: la riga da passare al dialog è sempre quella fresca
  // della query, non una copia congelata al momento del click.
  const [editing, setEditing] = useState(false);

  if (isPending) {
    return (
      <main className="mx-auto grid max-w-3xl gap-4 p-6">
        <Skeleton height={36} width={256} />
        <Skeleton height={192} width="100%" rounded={12} />
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto grid max-w-3xl gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('notFoundTitle')}
        </h1>
        <p className="text-muted-foreground">{t('notFoundHint')}</p>
        <ButtonLink variant="outline" width="max-content" href="/">
          {t('backToCatalog')}
        </ButtonLink>
      </main>
    );
  }

  const { game, entry } = data;
  const year = game.firstReleaseDate?.getFullYear() ?? null;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="flex flex-wrap gap-6">
        <GameCover
          imageId={game.coverImageId}
          name={game.name}
          size="cover_big"
        />

        <div className="grid flex-1 content-start gap-3">
          <div className="grid gap-1">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
              {game.name}
              <GameTypeBadge type={game.gameType} />
            </h1>
            {year && <p className="text-muted-foreground">{year}</p>}
          </div>

          {game.summary && (
            <p className="whitespace-pre-line">{game.summary}</p>
          )}

          {/* Il campo distingue "non ha generi" da "non ancora arricchito": senza,
              una scheda vuota sembrerebbe un gioco senza metadati. */}
          {game.igdbSyncedAt === null && (
            <p className="text-muted-foreground">
              {game.igdbId === null ? t('notLinked') : t('notEnriched')}
            </p>
          )}
        </div>
      </header>

      {game.attributes.length > 0 && (
        <Card>
          <CardContent>
            <AttributeGroups attributes={game.attributes} />
          </CardContent>
        </Card>
      )}

      <CriticScores game={game} />

      <HltbTimes game={game} />

      <Card>
        <CardHeader>
          <XStack flexWrap="wrap" items="center" gap={8}>
            <CardTitle>{entry ? t('inBacklog') : t('notInBacklog')}</CardTitle>
            {entry?.hiddenAt && (
              <Badge variant="secondary">{tHidden('badge')}</Badge>
            )}
          </XStack>
        </CardHeader>
        <CardContent gap={12}>
          {entry ? (
            <>
              {/* Ci si arriva da una ricerca o da un link: senza, il gioco
                  sembrerebbe in lista e in lista non si trova. */}
              {entry.hiddenAt && (
                <p className="text-muted-foreground">{t('hiddenNotice')}</p>
              )}
              <p>
                {t.rich('statusLine', {
                  status: statusLabels[entry.status],
                  value: (chunks) => (
                    <span className="font-medium">{chunks}</span>
                  ),
                })}
              </p>
              <RatingValue value={entry.rating} />
              {entry.notes && (
                <p className="whitespace-pre-line">{entry.notes}</p>
              )}
              <EntryTags tags={entry.tags} />
              <OwnershipBadges ownerships={entry.ownerships} />
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setEditing(true)}>
                  {t('edit')}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() =>
                    setHidden.mutate({
                      id: entry.id,
                      hidden: entry.hiddenAt === null,
                    })
                  }
                  disabled={setHidden.isPending}
                >
                  {entry.hiddenAt === null
                    ? tHidden('hide')
                    : tHidden('unhide')}
                </Button>
                <ButtonLink variant="ghost" href="/backlog">
                  {t('goToBacklog')}
                </ButtonLink>
              </div>
            </>
          ) : (
            <p className="text-muted-foreground">{t('notInBacklogHint')}</p>
          )}
        </CardContent>
      </Card>

      <EditEntryDialog
        entry={editing ? entry : null}
        onOpenChange={setEditing}
      />
    </main>
  );
}
