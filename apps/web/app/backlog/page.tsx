'use client';

import type { BacklogEntry, BacklogStatus } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';

import { AddGameDialog } from '@/components/add-game-dialog';
import { EditEntryDialog } from '@/components/edit-entry-dialog';
import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { OwnershipBadges } from '@/components/ownership-badges';
import { RatingValue } from '@/components/rating-value';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStatusLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

export default function BacklogPage() {
  const t = useTranslations('backlog');
  const statusLabels = useStatusLabels();
  const errorMessage = useApiErrorMessage();

  const queryClient = useQueryClient();
  const backlog = useQuery(api.backlog.list.queryOptions());

  const [editing, setEditing] = useState<BacklogEntry | null>(null);

  // La riga in modifica si ripesca dalla lista fresca: dopo il salvataggio
  // `editing` sarebbe la copia vecchia, con i tag di prima.
  const editingEntry =
    editing === null
      ? null
      : (backlog.data?.find((row) => row.id === editing.id) ?? editing);

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
  }

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: refresh,
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('statusFailed') })),
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.backlog.remove({ id }),
    onSuccess: async () => {
      await refresh();
      toast.success(t('removed'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('removeFailed') })),
  });

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('title')}
          </h1>
          <p className="text-muted-foreground">
            {backlog.data ? t('count', { count: backlog.data.length }) : ' '}
          </p>
        </div>
        <AddGameDialog />
      </header>

      {backlog.error ? (
        <p className="text-destructive">{t('error')}</p>
      ) : backlog.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : backlog.data.length === 0 ? (
        <Card>
          <CardContent className="grid gap-2">
            <p className="font-medium">{t('emptyTitle')}</p>
            <p className="text-muted-foreground">{t('emptyHint')}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {backlog.data.map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex items-start gap-3">
                    <GameCover
                      imageId={entry.game.coverImageId}
                      name={entry.game.name}
                    />
                    <div className="flex flex-1 flex-wrap items-start justify-between gap-3">
                      <div className="grid gap-0.5">
                        <Link
                          href={`/games/${entry.game.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {entry.game.name}
                        </Link>
                        {entry.game.firstReleaseDate && (
                          <span className="text-muted-foreground">
                            {entry.game.firstReleaseDate.getFullYear()}
                          </span>
                        )}
                        <GameDuration game={entry.game} />
                        <RatingValue value={entry.rating} />
                      </div>
                      <OwnershipBadges ownerships={entry.ownerships} />
                    </div>
                  </div>

                  <EntryTags tags={entry.tags} />

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={statusLabels}
                      value={entry.status}
                      onValueChange={(next) =>
                        setStatus.mutate({
                          id: entry.id,
                          status: next as BacklogStatus,
                        })
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {backlogStatusValues.map((value) => (
                          <SelectItem key={value} value={value}>
                            {statusLabels[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="outline"
                      size="sm"
                      className="ml-auto"
                      onClick={() => setEditing(entry)}
                    >
                      {t('edit')}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => remove.mutate(entry.id)}
                      disabled={remove.isPending}
                    >
                      {t('remove')}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <EditEntryDialog
        entry={editingEntry}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      />
    </main>
  );
}
