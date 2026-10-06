import type {
  BacklogEntry,
  GameDetail,
  IgdbSearchHit,
  ReportTarget,
} from '@repo/contracts';
import type { ManualSource, Store } from '@repo/contracts/vocabulary';
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  Textarea,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { IgdbPicker } from '@/components/admin/igdb-pick-dialog';
import { useApiErrorMessage } from '@/lib/api-error';
import { useStoreLabels } from '@/lib/labels';
import { api, client } from '@/lib/orpc';

const SOURCES: ManualSource[] = ['hltb', 'opencritic', 'metacritic'];

/** La chiave di una cosa segnalabile, per le spunte. */
const keyOf = (target: ReportTarget) =>
  'store' in target ? `store:${target.store}` : `source:${target.source}`;

/**
 * «Segnala un errore» sulla pagina del gioco (11a, frame 8 del wireframe).
 *
 * Un collegamento sbagliato non lo vede nessun automatismo: lo vede solo chi
 * ha il gioco in libreria. L'utente lo segnala, un admin lo corregge per tutti.
 * Si segnala la copia di un negozio — solo se è tua — o una fonte, e si può
 * suggerire il gioco giusto: con la ricerca IGDB, che dà l'id, o col nome.
 *
 * Con una segnalazione aperta il link diventa «Segnalato il …»; risegnalare
 * la stessa cosa aggiorna quella aperta.
 */
export function ReportError({
  game,
  entry,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
}) {
  const t = useTranslations('game.report');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const reports = useQuery(
    api.reports.openForGame.queryOptions({ input: { gameId: game.id } }),
  );
  const last = reports.data?.at(-1);

  return (
    <>
      <XStack gap={8} items="center" flexWrap="wrap">
        {last ? (
          <Text fontSize={13} color="$color11">
            {t('sent', {
              date: format.dateTime(last.updatedAt, {
                day: '2-digit',
                month: '2-digit',
              }),
            })}
          </Text>
        ) : null}
        <Button size="sm" variant="ghost" onPress={() => setOpen(true)}>
          {last ? t('again') : t('open')}
        </Button>
      </XStack>
      {open ? (
        <ReportDialog
          game={game}
          entry={entry}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function ReportDialog({
  game,
  entry,
  onClose,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
  onClose: () => void;
}) {
  const t = useTranslations('game.report');
  const storeLabels = useStoreLabels();
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [suggested, setSuggested] = useState<IgdbSearchHit | null>(null);
  const [searching, setSearching] = useState(false);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  // Le copie si segnalano per negozio: le copie di uno stesso negozio sono un
  // collegamento solo. Senza negozio (inserite a mano) non c'è niente da
  // ripuntare.
  const stores = [
    ...new Set(
      (entry?.ownerships ?? [])
        .map((ownership) => ownership.store)
        .filter((store): store is Store => store !== null),
    ),
  ];
  const targets: { target: ReportTarget; label: string }[] = [
    ...stores.map((store) => ({
      target: { store },
      label: t('copy', { store: storeLabels[store] }),
    })),
    ...SOURCES.map((source) => ({
      target: { source },
      label: t(source),
    })),
  ];

  const send = useMutation({
    mutationFn: () =>
      client.reports.create({
        gameId: game.id,
        targets: targets
          .filter(({ target }) => checked.has(keyOf(target)))
          .map(({ target }) => target),
        suggestedIgdbId: suggested?.igdbId,
        // Scelto dalla ricerca, anche il nome: all'admin «IGDB 38045» da solo
        // non dice niente.
        suggestedName: suggested ? suggested.name : name.trim() || undefined,
        note: note.trim() || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: api.reports.openForGame.key(),
      });
      toast.success(t('thanks'));
      onClose();
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const toggle = (key: string, on: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  return (
    <Dialog open onOpenChange={(value) => !value && onClose()}>
      <DialogContent maxW={560}>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <YStack
          gap={16}
          maxH="60vh"
          {...({ style: { overflowY: 'auto' } } as object)}
        >
          <YStack gap={8}>
            <Text fontSize={13} fontWeight="500">
              {t('what')}
            </Text>
            {targets.map(({ target, label }) => {
              const key = keyOf(target);
              return (
                <XStack key={key} gap={8} items="center">
                  <Checkbox
                    id={`report-${key}`}
                    checked={checked.has(key)}
                    onCheckedChange={(value) => toggle(key, value === true)}
                  />
                  <Label htmlFor={`report-${key}`}>{label}</Label>
                </XStack>
              );
            })}
          </YStack>

          <YStack gap={8}>
            <Text fontSize={13} fontWeight="500">
              {t('suggest')}
            </Text>
            {suggested ? (
              <XStack
                gap={8}
                items="center"
                p={8}
                rounded={8}
                borderWidth={1}
                borderColor="$borderColor"
              >
                <Text flex={1} minW={0} fontSize={13} numberOfLines={1}>
                  {t('chosen', {
                    name: `${suggested.name}${suggested.releaseYear ? ` (${suggested.releaseYear})` : ''}`,
                    id: suggested.igdbId,
                  })}
                </Text>
                <Button
                  size="sm"
                  variant="ghost"
                  onPress={() => setSuggested(null)}
                >
                  {t('remove')}
                </Button>
              </XStack>
            ) : searching ? (
              <IgdbPicker
                initialQuery={game.name}
                onPick={(hit) => {
                  setSuggested(hit);
                  setSearching(false);
                }}
              />
            ) : (
              <>
                <Button
                  variant="outline"
                  self="flex-start"
                  onPress={() => setSearching(true)}
                >
                  {t('searchIgdb')}
                </Button>
                <YStack gap={6}>
                  <Label htmlFor="report-name">{t('orName')}</Label>
                  <Input
                    id="report-name"
                    value={name}
                    onChangeText={setName}
                    maxLength={200}
                  />
                </YStack>
              </>
            )}
          </YStack>

          <YStack gap={6}>
            <Label htmlFor="report-note">{t('note')}</Label>
            <Textarea
              id="report-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder={t('notePlaceholder')}
              maxLength={1000}
            />
          </YStack>
        </YStack>

        <DialogFooter>
          <Button variant="outline" onPress={onClose} disabled={send.isPending}>
            {t('cancel')}
          </Button>
          <Button
            onPress={() => send.mutate()}
            disabled={checked.size === 0 || send.isPending}
          >
            {t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
