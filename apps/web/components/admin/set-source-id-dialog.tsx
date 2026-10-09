import type { MissingRow } from '@repo/contracts';
import type { ManualSource } from '@repo/contracts/vocabulary';
import {
  Alert,
  AlertDescription,
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { hasErrorCode, useApiErrorMessage } from '@/lib/api-error';
import { client } from '@/lib/orpc';

/** Una fonte su cui si scrive l'id: la riga di «Dati mancanti» o della scheda. */
export type SourceToSet = Pick<
  MissingRow,
  'gameId' | 'name' | 'coverImageId' | 'status' | 'reason' | 'error'
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
 * match per nome non si rifà.
 *
 * Due bottoni, perché sono due gesti. **Aggiungi** salva l'id o l'indirizzo
 * della scheda così com'è, senza cercare niente; un nome lo rifiuta, ed è il
 * controllo che serve: «Bioshok remaster» non è un id. **Cerca** usa il testo
 * come nome sulla fonte e mostra i risultati, da scegliere. HLTB e Metacritic
 * non costano; OpenCritic sì, una delle 25 ricerche del giorno, e lo si dice
 * prima.
 *
 * Mentre si scrive un id, l'api dice di chi è già: si può salvare lo stesso —
 * l'id scritto a mano è esente dall'unicità — ma lo si fa sapendolo.
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
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    setValue(row?.name ?? '');
    setInvalid(false);
    search.reset();
    // `search` cambia a ogni render: qui conta solo la riga.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [row]);
  useEffect(() => {
    setInvalid(false);
    const timer = setTimeout(() => setAsked(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value]);

  // Di chi è già l'id. Su un nome l'api risponde che non è un id: qui non si
  // dice niente, lo si dice solo se si preme «Aggiungi».
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

  const search = useMutation({
    mutationFn: () =>
      client.admin.sources.search({ source: row!.source, query: value.trim() }),
  });

  const save = useMutation({
    mutationFn: (externalId: string) =>
      client.admin.sources.setExternalId({
        gameId: row!.gameId,
        source: row!.source,
        externalId,
      }),
    onSuccess: async () => {
      await onSaved();
      toast.success(t('setId.saved'));
      onOpenChange(false);
    },
    onError: (error) => {
      if (hasErrorCode(error, 'BAD_REQUEST')) setInvalid(true);
      else toast.error(errorMessage(error, { fallback: t('setId.failed') }));
    },
  });

  const sourceName = row ? t(`source.${row.source}`) : '';
  const candidates = rejectedCandidates(row?.error ?? null);
  const searchError = search.error
    ? hasErrorCode(search.error, 'TOO_MANY_REQUESTS')
      ? t('setId.quota')
      : hasErrorCode(search.error, 'PRECONDITION_FAILED')
        ? t('setId.disabled')
        : t('setId.searchFailed')
    : null;

  return (
    <Dialog open={row !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={600}>
        <DialogHeader>
          <DialogTitle>{t('setId.title', { source: sourceName })}</DialogTitle>
        </DialogHeader>

        <YStack gap={16}>
          {/* La copertina del gioco accanto ai dati, grande quanto quelle dei
              risultati: si sceglie confrontandole. */}
          {row ? (
            <XStack gap={12} items="flex-start">
              <GameCover
                imageId={row.coverImageId}
                name={row.name}
                width={72}
              />
              <YStack flex={1} minW={0} gap={4}>
                <Text fontSize={14} fontWeight="500">
                  {row.name}
                </Text>
                <Text fontSize={13} color="$color11">
                  {t('setId.state', {
                    status: row.reason
                      ? `${t(`status.${row.status}`)} · ${t(`reason.${row.reason}`)}`
                      : t(`status.${row.status}`),
                  })}
                </Text>
              </YStack>
            </XStack>
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
            <XStack gap={8}>
              <Input
                id="source-id"
                flex={1}
                value={value}
                onChangeText={setValue}
                autoFocus
              />
              <Button
                variant="outline"
                shrink={0}
                disabled={value.trim().length < 2 || search.isPending}
                onPress={() => search.mutate()}
              >
                {t('setId.search')}
              </Button>
              <Button
                shrink={0}
                disabled={value.trim() === '' || save.isPending}
                onPress={() => save.mutate(value.trim())}
              >
                {t('setId.add')}
              </Button>
            </XStack>
          </YStack>

          {row?.source === 'opencritic' ? (
            <Alert>
              <AlertDescription>
                {t('setId.cost')}
                {search.data?.searchesLeft !== null &&
                search.data?.searchesLeft !== undefined
                  ? ` ${t('setId.left', { count: search.data.searchesLeft })}`
                  : ''}
              </AlertDescription>
            </Alert>
          ) : null}

          {invalid ? (
            <Text fontSize={13} color="$red11">
              {t('setId.invalid')}
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

          {search.isPending ? (
            <YStack gap={4}>
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} height={36} width="100%" rounded={6} />
              ))}
            </YStack>
          ) : searchError ? (
            <Text fontSize={13} color="$red11">
              {searchError}
            </Text>
          ) : search.data ? (
            <YStack gap={6}>
              <Text fontSize={13} fontWeight="500">
                {t('setId.results')}
              </Text>
              <YStack
                maxH={440}
                gap={2}
                p={4}
                rounded={8}
                borderWidth={1}
                borderColor="$borderColor"
                {...({ style: { overflowY: 'auto' } } as object)}
              >
                {search.data.hits.length === 0 ? (
                  <Text p={8} fontSize={13} color="$color11">
                    {t('setId.noResults')}
                  </Text>
                ) : (
                  search.data.hits.map((hit) => (
                    <XStack
                      key={hit.id}
                      items="center"
                      gap={10}
                      px={8}
                      py={6}
                      rounded={6}
                      hoverStyle={{ bg: '$color3' }}
                    >
                      <SourceThumb src={hit.image} />
                      <YStack flex={1} minW={0}>
                        <Text fontSize={14} fontWeight="500" numberOfLines={1}>
                          {hit.name}
                          {hit.releaseYear ? ` (${hit.releaseYear})` : ''}
                        </Text>
                        <Text fontSize={12} color="$color11" numberOfLines={1}>
                          {hit.id}
                        </Text>
                      </YStack>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={save.isPending}
                        onPress={() => save.mutate(hit.id)}
                      >
                        {t('setId.choose')}
                      </Button>
                    </XStack>
                  ))
                )}
              </YStack>
            </YStack>
          ) : null}
        </YStack>

        <DialogFooter>
          <Button variant="outline" onPress={() => onOpenChange(false)}>
            {t('setId.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * La copertina di un risultato della fonte, alla misura di quelle IGDB: è da
 * lì che si distinguono due schede omonime. Dove la fonte non la dà
 * (OpenCritic) resta il riquadro, così le righe non cambiano altezza.
 */
function SourceThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed)
    return (
      <YStack width={72} height={96} shrink={0} rounded={6} bg="$color4" />
    );
  return (
    <img
      src={src}
      alt=""
      width={72}
      height={96}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{
        width: 72,
        height: 96,
        flexShrink: 0,
        objectFit: 'cover',
        borderRadius: 6,
        display: 'block',
      }}
    />
  );
}
