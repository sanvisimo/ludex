import type { MissingRow } from '@repo/contracts';
import type { ManualSource } from '@repo/contracts/vocabulary';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { useApiErrorMessage } from '@/lib/api-error';
import { client } from '@/lib/orpc';

/** Una fonte su cui si scrive l'id: la riga di «Dati mancanti» o della scheda. */
export type SourceToSet = Pick<
  MissingRow,
  'gameId' | 'name' | 'status' | 'reason' | 'error'
> & { source: ManualSource };

/**
 * I candidati che il match ha scartato, ricavati dal testo di `error`:
 * «nessun candidato convincente per "X": Nome (5913, 0.37); Altro (12)».
 * Il testo è per chi legge, quindi qui si prova e basta: se la forma non torna
 * non c'è niente da proporre, e l'id si scrive a mano.
 */
export function rejectedCandidates(error: string | null) {
  const elenco = error?.split('": ').slice(1).join('": ');
  if (!elenco) return [];
  return elenco
    .split('; ')
    .map((voce) => voce.match(/^(.*) \((\d+)(?:, ([\d.]+))?\)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map(([, name, id, score]) => ({ name: name!, id: id!, score }));
}

/**
 * «Inserisci id» (11a, frame 2 del wireframe): l'id lo decide l'admin, e il
 * match per nome non si rifà. Mentre si scrive l'api dice di chi è già quell'id:
 * si può salvare lo stesso — l'id scritto a mano è esente dall'unicità — ma lo
 * si fa sapendolo.
 */
export function SetSourceIdDialog({
  row,
  onOpenChange,
  onSaved,
}: {
  row: SourceToSet | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<unknown>;
}) {
  const t = useTranslations('admin');
  const errorMessage = useApiErrorMessage();
  const [value, setValue] = useState('');
  const [asked, setAsked] = useState('');

  useEffect(() => setValue(''), [row]);
  // Si chiede all'api solo quando si smette di scrivere.
  useEffect(() => {
    const timer = setTimeout(() => setAsked(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);

  const lookup = useQuery({
    queryKey: ['admin', 'sources', 'lookup', row?.gameId, row?.source, asked],
    queryFn: () =>
      client.admin.sources.lookup({
        gameId: row!.gameId,
        source: row!.source,
        externalId: asked,
      }),
    enabled: row !== null && asked !== '',
    retry: false,
  });

  const save = useMutation({
    mutationFn: () =>
      client.admin.sources.setExternalId({
        gameId: row!.gameId,
        source: row!.source,
        externalId: value.trim(),
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success(t('setId.saved'));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('setId.failed') })),
  });

  const sourceName = row ? t(`source.${row.source}`) : '';
  const candidates = rejectedCandidates(row?.error ?? null);
  const invalid = asked !== '' && lookup.isError;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={560}>
        <DialogHeader>
          <DialogTitle>{t('setId.title', { source: sourceName })}</DialogTitle>
          <DialogDescription>{row?.name ?? ''}</DialogDescription>
        </DialogHeader>

        <YStack gap={16}>
          {row ? (
            <Text fontSize={13} color="$color11">
              {t('setId.state', {
                status: row.reason
                  ? `${t(`status.${row.status}`)} · ${t(`reason.${row.reason}`)}`
                  : t(`status.${row.status}`),
              })}
            </Text>
          ) : null}

          {candidates.length > 0 ? (
            <YStack gap={6}>
              <Text fontSize={13} fontWeight="500">
                {t('setId.candidates')}
              </Text>
              <YStack
                gap={6}
                p={8}
                rounded={8}
                borderWidth={1}
                borderColor="$borderColor"
              >
                {candidates.map((candidate) => (
                  <XStack key={candidate.id} items="center" gap={8}>
                    <Text flex={1} minW={0} fontSize={13} numberOfLines={1}>
                      {candidate.name} · {candidate.id}
                      {candidate.score ? ` · ${candidate.score}` : ''}
                    </Text>
                    <Button
                      size="sm"
                      variant="outline"
                      onPress={() => setValue(candidate.id)}
                    >
                      {t('setId.use')}
                    </Button>
                  </XStack>
                ))}
              </YStack>
            </YStack>
          ) : null}

          <YStack gap={6}>
            <Label htmlFor="source-id">{t('setId.label')}</Label>
            <Input
              id="source-id"
              value={value}
              onChangeText={setValue}
              autoFocus
            />
          </YStack>

          {invalid ? (
            <Text fontSize={13} color="$red11">
              {t('setId.invalid', { source: sourceName })}
            </Text>
          ) : lookup.data?.owner ? (
            <Alert>
              <AlertDescription>
                {t('setId.taken', {
                  id: lookup.data.externalId,
                  game: lookup.data.owner.name,
                })}
              </AlertDescription>
            </Alert>
          ) : null}

          <Text fontSize={12} color="$color11">
            {t('setId.after')}
          </Text>
        </YStack>

        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            {t('setId.cancel')}
          </Button>
          <Button
            onPress={() => save.mutate()}
            disabled={value.trim() === '' || invalid || save.isPending}
          >
            {t('setId.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
