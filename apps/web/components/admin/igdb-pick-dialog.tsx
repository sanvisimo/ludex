import type { IgdbSearchHit } from '@repo/contracts';
import {
  Button,
  ClearableInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Skeleton,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { Check, Search } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { PlatformCombobox } from '@/components/platform-combobox';
import { useGameTypeLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

/**
 * Scegliere una scheda IGDB: «Collega per tutti», «Collega a IGDB», «Non è
 * questo gioco» (11a). La stessa ricerca del dialogo dell'account — per nome,
 * per id o per URL della scheda — ma scritta in Tamagui: quello è ancora in
 * Tailwind, e Tailwind non si estende a schermate nuove.
 *
 * È una sezione, non un dialogo: il dettaglio di uno scarto la mette sotto i
 * dati della voce, così si sceglie il gioco con la voce sotto gli occhi. Chi
 * non ha altro da mostrare usa `IgdbPickDialog`.
 *
 * Si cerca premendo «Cerca», non mentre si scrive: IGDB regge quattro richieste
 * al secondo per tutto il server. La prima ricerca parte da sola, col nome
 * della voce: è quasi sempre quella giusta.
 *
 * La piattaforma filtra su IGDB, non sulla lista: dei 20 risultati di un titolo
 * comune la scheda giusta può non far parte. Sceglierla rilancia la ricerca col
 * testo già cercato, una richiesta per scelta come «Cerca».
 */
export function IgdbPicker({
  initialQuery,
  pending = false,
  onPick,
}: {
  initialQuery: string;
  pending?: boolean;
  onPick: (hit: IgdbSearchHit) => void;
}) {
  const t = useTranslations('admin.igdbPick');
  const tSearch = useTranslations('search');
  const gameTypeLabels = useGameTypeLabels();
  const [query, setQuery] = useState(initialQuery);
  const [submitted, setSubmitted] = useState<string | null>(
    initialQuery.trim().length >= 2 ? initialQuery : null,
  );
  const [platform, setPlatform] = useState<string | null>(null);

  const search = useQuery({
    ...api.games.search.queryOptions({
      input: { query: submitted ?? '', platform: platform ?? undefined },
    }),
    enabled: submitted !== null && submitted.trim().length >= 2,
  });

  // Solo quelle che IGDB conosce: le altre non filtrerebbero niente.
  const platforms = useQuery(api.platforms.list.queryOptions());
  const filterable = useMemo(
    () => platforms.data?.filter((p) => p.igdbId !== null) ?? [],
    [platforms.data],
  );

  return (
    <YStack gap={12}>
      <YStack gap={8}>
        <Label htmlFor="igdb-pick">{t('label')}</Label>
        {/* Una riga sola dove c'è posto; su un telefono va a capo. */}
        <XStack gap={8} flexWrap="wrap">
          <YStack flex={1} minW={200}>
            <ClearableInput
              id="igdb-pick"
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => setSubmitted(query)}
              clearLabel={tSearch('clear')}
              autoFocus
            />
          </YStack>
          <YStack width={220}>
            <PlatformCombobox
              aria-label={t('platform')}
              platforms={filterable}
              value={platform}
              onValueChange={setPlatform}
              placeholder={t('allPlatforms')}
              clearLabel={t('clearPlatform')}
            />
          </YStack>
          <Button
            variant="outline"
            shrink={0}
            onPress={() => setSubmitted(query)}
          >
            <Search size={16} />
            {t('search')}
          </Button>
        </XStack>
        <Text fontSize={12} color="$color11">
          {t('hint')}
        </Text>
      </YStack>

      {submitted !== null ? (
        <YStack
          maxH={440}
          rounded={8}
          borderWidth={1}
          borderColor="$borderColor"
          p={4}
          gap={2}
          {...({ style: { overflowY: 'auto' } } as object)}
        >
          {search.isFetching ? (
            [0, 1, 2].map((index) => (
              <Skeleton key={index} height={48} width="100%" rounded={6} />
            ))
          ) : search.isError ? (
            <Text p={12} fontSize={13} color="$red11">
              {t('searchFailed')}
            </Text>
          ) : search.data?.length === 0 ? (
            <Text p={12} fontSize={13} color="$color11">
              {t('noResults')}
            </Text>
          ) : (
            search.data?.map((hit) => (
              <XStack
                key={hit.igdbId}
                items="center"
                gap={10}
                px={8}
                py={6}
                rounded={6}
                hoverStyle={{ bg: '$color3' }}
              >
                {/* Grande: è dalla copertina che si distinguono due schede
                    omonime, il Pulstar del 1995 da quello del 2014. */}
                <GameCover imageId={hit.cover} name={hit.name} width={72} />
                <YStack flex={1} minW={0}>
                  <Text
                    fontSize={14}
                    fontWeight="500"
                    {...({ style: { overflowWrap: 'break-word' } } as object)}
                  >
                    {hit.name}
                    {hit.releaseYear ? ` (${hit.releaseYear})` : ''}
                  </Text>
                  <Text fontSize={12} color="$color11" numberOfLines={1}>
                    {[
                      hit.gameType && hit.gameType !== 'main_game'
                        ? gameTypeLabels[hit.gameType]
                        : null,
                      hit.developer,
                      `IGDB ${hit.igdbId}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </Text>
                  {/* Su cosa è uscito: fra due schede dello stesso anno e
                      autore, l'originale e il port, decide la console. */}
                  {hit.platforms.length > 0 ? (
                    <Text fontSize={12} color="$color11">
                      {hit.platforms.join(', ')}
                    </Text>
                  ) : null}
                </YStack>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onPress={() => onPick(hit)}
                >
                  <Check size={14} />
                  {t('choose')}
                </Button>
              </XStack>
            ))
          )}
        </YStack>
      ) : null}
    </YStack>
  );
}

/** `IgdbPicker` da solo in un dialogo, per chi non ha altro da mostrare. */
export function IgdbPickDialog({
  open,
  onOpenChange,
  title,
  description,
  initialQuery,
  pending = false,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  initialQuery: string;
  pending?: boolean;
  onPick: (hit: IgdbSearchHit) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {/* Rimontato a ogni apertura: riparte dal nome, e lo cerca. */}
        {open ? (
          <IgdbPicker
            initialQuery={initialQuery}
            pending={pending}
            onPick={onPick}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
