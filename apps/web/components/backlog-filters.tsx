import type {
  BacklogStatus,
  GameType,
  PlaylistQuery,
  Store,
  Subscription,
  UserTagKind,
} from '@repo/contracts';
import { attributeKindValues, backlogStatusValues } from '@repo/contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Badge,
  Button,
  Checkbox,
  Label,
  ScrollView,
  Slider,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { SlidersHorizontal, X } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useFormatter, useTranslations } from 'use-intl';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { SearchInput, SortSelect } from '@/components/list-controls';
import { SavePlaylistButton } from '@/components/save-playlist-dialog';
import { statusIcons } from '@/components/status-icon';
import {
  type BacklogFilterState,
  defaultStatus,
  fromPlaylistQuery,
  toggle,
  useBacklogFilter,
  without,
} from '@/lib/backlog-filter';
import {
  useGameTypeLabels,
  useStatusLabels,
  useStoreLabels,
  useSubscriptionLabels,
} from '@/lib/labels';
import { api } from '@/lib/orpc';

/**
 * I filtri del backlog: la barra in alto e il pannello.
 *
 * Non tengono stato loro: leggono e scrivono quello dell'URL tramite
 * `useBacklogFilter`, lo stesso hook che usa la pagina per costruire la query.
 * Sono due letture della stessa cosa, non due copie da tenere allineate. Le
 * regole sono quelle dello step 7 e non cambiano col ridisegno: le spunte
 * dello stesso criterio in AND, stato e tipo in OR, i range nulli che non
 * filtrano.
 */

// I limiti degli slider. Una maniglia a un estremo vale «non filtrare», come
// prima la casella vuota: 100 ore in fondo alla durata è «nessun massimo».
const DURATION_MAX_HOURS = 100;
const RATING_MIN = 0.5;
const RATING_MAX = 5;
const RELEASED_MIN = 1970;
const RELEASED_MAX = new Date().getFullYear();

/**
 * La barra: ricerca, il bottone che apre il pannello, la vista, e sotto lo
 * stato e i filtri accesi a chip. L'ordinamento sta nel pannello (ritocchi
 * del 12c): su un telefono la barra con lui andava su tre righe.
 *
 * I chip ci sono perché il pannello, chiuso, non dice niente: prima l'unico
 * segno di un filtro acceso era il numero su «azzera».
 */
export function BacklogToolbar({
  onOpenFilters,
  view,
}: {
  onOpenFilters: () => void;
  /** La scelta della vista, messa dalla pagina in fondo alla prima riga. */
  view?: ReactNode;
}) {
  const t = useTranslations('filters');
  const statusLabels = useStatusLabels();
  const { filter, setFilter, activeCount } = useBacklogFilter();

  return (
    <YStack gap={12}>
      {/* Una riga sola anche su un telefono: la ricerca prende lo spazio che
          resta, fino a 320. */}
      <XStack items="center" gap={8}>
        <YStack flex={1} minW={0} maxW={320}>
          <SearchInput
            value={filter.q}
            onChange={(q) => void setFilter({ q: q || null })}
          />
        </YStack>
        <Button variant="outline" onClick={onOpenFilters}>
          <SlidersHorizontal size={16} color="$color12" />
          {t('filtersButton', { count: activeCount })}
        </Button>
        {/* Salvare i filtri in una playlist ha senso con almeno un filtro
            acceso: senza, la playlist sarebbe il backlog intero. */}
        {activeCount > 0 && <SavePlaylistButton />}
        {view && <XStack ml="auto">{view}</XStack>}
      </XStack>

      {/* Lo stato è l'unico criterio a valore singolo per riga: le spunte sono
          in OR fra loro, non in AND come tutto il resto del pannello.
          Togliere l'ultima rimette il default — tutti tranne "non mi
          interessa" — invece di lasciare una selezione vuota, che non
          mostrerebbe niente e sembrerebbe un guasto. */}
      {/* Le stesse icone del bottone di stato. Da `$sm` icona ed etichetta,
          sotto solo l'icona: sei etichette su un telefono andavano su due
          righe. Il nome del bottone è l'etichetta in tutti e due i casi. */}
      <XStack flexWrap="wrap" gap={4}>
        {backlogStatusValues.map((status) => {
          const active = filter.status.includes(status);
          const Icon = statusIcons[status];
          const color = active ? '$black1' : '$color12';
          return (
            <Button
              key={status}
              type="button"
              size="sm"
              variant={active ? 'default' : 'outline'}
              aria-pressed={active}
              aria-label={statusLabels[status]}
              onClick={() =>
                setFilter({
                  status: toggle<BacklogStatus>(filter.status, status),
                })
              }
            >
              <Icon size={14} color={color} />
              <XStack display="none" $sm={{ display: 'flex' }} aria-hidden>
                <Text fontSize={13} fontWeight="500" color={color}>
                  {statusLabels[status]}
                </Text>
              </XStack>
            </Button>
          );
        })}
      </XStack>

      <ActiveChips />
    </YStack>
  );
}

/**
 * L'ordinamento, in cima al pannello: criterio e direzione. Non è un filtro,
 * quindi sta fuori dalle sezioni e non conta fra i filtri accesi.
 */
function SortControl() {
  const t = useTranslations('filters');
  const { filter, setFilter } = useBacklogFilter();
  const id = useId();

  return (
    <YStack gap={8}>
      <Label htmlFor={id} color="$color11">
        {t('sortLabel')}
      </Label>
      <SortSelect
        id={id}
        sort={filter.sort}
        direction={filter.direction}
        onSortChange={(sort) => setFilter({ sort })}
        onDirectionChange={(direction) => setFilter({ direction })}
      />
    </YStack>
  );
}

/**
 * Le voci del pannello: solo quelle presenti nel backlog di chi guarda. Una
 * tendina con 96 piattaforme di cui ne possiedi tre nasconde le tre che
 * contano.
 */
function useFilterOptions() {
  const options = useQuery(api.backlog.filterOptions.queryOptions());
  const tags = useQuery(api.tags.list.queryOptions());
  return { options: options.data, tags: tags.data ?? [] };
}

/** Come si scrive un intervallo: «2–20 h», «da 2 h», «fino a 20 h». */
function useRangeText() {
  const t = useTranslations('filters');
  const format = useFormatter();
  return (
    min: number | null,
    max: number | null,
    unit: (value: string) => string = (value) => value,
  ) => {
    const n = (value: number) => unit(format.number(value));
    if (min !== null && max !== null)
      return t('rangeBoth', { min: n(min), max: n(max) });
    if (min !== null) return t('rangeMin', { min: n(min) });
    if (max !== null) return t('rangeMax', { max: n(max) });
    return t('any');
  };
}

const hours = (minutes: number | null) =>
  minutes === null ? null : Math.round((minutes / 60) * 10) / 10;

type Chip = {
  key: string;
  label: string;
  /** Cosa `setFilter` deve scrivere per spegnerlo: un dato, non un gesto. */
  clear: Parameters<ReturnType<typeof useBacklogFilter>['setFilter']>[0];
};

/**
 * I filtri accesi di uno stato, uno per chip. Una funzione dello stato e non
 * dell'URL, perché li disegnano due pagine: `/backlog`, dove ogni chip si
 * spegne, e la playlist, dove sono solo un riassunto.
 */
function useFilterChips(filter: BacklogFilterState): Chip[] {
  const t = useTranslations('filters');
  const storeLabels = useStoreLabels();
  const subscriptionLabels = useSubscriptionLabels();
  const gameTypeLabels = useGameTypeLabels();
  const range = useRangeText();
  const { options, tags } = useFilterOptions();

  const h = (value: string) => t('hoursValue', { value });
  const chips: Chip[] = [
    ...filter.platforms.map((slug) => ({
      key: `platform-${slug}`,
      label:
        options?.platforms.find((platform) => platform.slug === slug)?.name ??
        slug,
      clear: { platforms: toggle(filter.platforms, slug) },
    })),
    ...filter.stores.map((store) => ({
      key: `store-${store}`,
      label: storeLabels[store],
      clear: { stores: toggle(filter.stores, store) },
    })),
    ...filter.subscriptions.map((subscription) => ({
      key: `subscription-${subscription}`,
      label: subscriptionLabels[subscription],
      clear: { subscriptions: toggle(filter.subscriptions, subscription) },
    })),
    ...filter.excludeSubscriptions.map((subscription) => ({
      key: `exclude-subscription-${subscription}`,
      label: t('withoutSubscription', {
        label: subscriptionLabels[subscription],
      }),
      clear: {
        excludeSubscriptions: toggle(filter.excludeSubscriptions, subscription),
      },
    })),
    ...filter.gameTypes.map((type) => ({
      key: `type-${type}`,
      label: gameTypeLabels[type],
      clear: { gameTypes: toggle(filter.gameTypes, type) },
    })),
    ...filter.attributes.map((id) => ({
      key: `attribute-${id}`,
      label:
        options?.attributes.find((row) => row.id === id)?.name ?? String(id),
      clear: { attributes: toggle(filter.attributes, id) },
    })),
    ...filter.tags.map((id) => ({
      key: `tag-${id}`,
      label: tags.find((tag) => tag.id === id)?.name ?? id,
      clear: { tags: toggle(filter.tags, id) },
    })),
  ];
  if (filter.durationMin !== null || filter.durationMax !== null)
    chips.push({
      key: 'duration',
      label: `${t('durationShort')} ${range(hours(filter.durationMin), hours(filter.durationMax), h)}`,
      clear: { durationMin: null, durationMax: null },
    });
  if (filter.ratingMin !== null || filter.ratingMax !== null)
    chips.push({
      key: 'rating',
      label: `${t('ratingShort')} ${range(filter.ratingMin, filter.ratingMax)}`,
      clear: { ratingMin: null, ratingMax: null },
    });
  if (filter.releasedFrom !== null || filter.releasedTo !== null)
    chips.push({
      key: 'released',
      label: `${t('releasedShort')} ${range(filter.releasedFrom, filter.releasedTo, String)}`,
      clear: { releasedFrom: null, releasedTo: null },
    });
  if (filter.criticMin !== null)
    chips.push({
      key: 'critic',
      label: `${t('criticShort')} ${range(filter.criticMin, null)}`,
      clear: { criticMin: null },
    });
  if (filter.noDuration)
    chips.push({
      key: 'no-duration',
      label: t('noDuration'),
      clear: { noDuration: null },
    });
  if (filter.neverPlayed)
    chips.push({
      key: 'never-played',
      label: t('neverPlayed'),
      clear: { neverPlayed: null },
    });
  return chips;
}

/** I filtri accesi, uno per chip, ciascuno con la sua x. */
function ActiveChips() {
  const t = useTranslations('filters');
  const { filter, setFilter, reset, activeCount } = useBacklogFilter();
  const chips = useFilterChips(filter);

  // Il numero su «azzera» conta anche ricerca e stato, che hanno il loro
  // posto a vista e non un chip: il bottone resta anche senza chip.
  if (activeCount === 0) return null;

  return (
    <XStack flexWrap="wrap" items="center" gap={6}>
      {chips.map((chip) => (
        <Button
          key={chip.key}
          size="sm"
          variant="secondary"
          onClick={() => setFilter(chip.clear)}
          aria-label={t('removeChip', { label: chip.label })}
        >
          {chip.label}
          <X size={14} color="$color11" />
        </Button>
      ))}
      <Button size="sm" variant="ghost" onClick={() => void reset()}>
        {t('reset', { count: activeCount })}
      </Button>
    </XStack>
  );
}

/**
 * I filtri salvati di una playlist, in sola lettura: gli stessi chip di
 * `/backlog`, senza la x. Per cambiarli si apre il backlog.
 *
 * I tag stanno nella playlist per id: quelli che il vocabolario non ha più non
 * hanno un nome da mostrare, e li dice già l'avviso sopra. Si tolgono qui, ma
 * solo a vocabolario arrivato: prima, ogni tag sembrerebbe cancellato.
 */
export function PlaylistChips({ query }: { query: PlaylistQuery }) {
  const { tags } = useFilterOptions();
  const known = new Set(tags.map((tag) => tag.id));
  const filter = fromPlaylistQuery(query);
  const chips = useFilterChips({
    ...filter,
    tags: tags.length > 0 ? filter.tags.filter((id) => known.has(id)) : [],
  });
  // In `/backlog` lo stato ha i suoi bottoni sempre a vista e non un chip; qui
  // non ci sono, e una playlist che mostra solo i giochi «in corso» deve dirlo.
  // Le playlist senza stato, o con quello di default, non hanno niente da dire.
  const statusLabels = useStatusLabels();
  const sameAsDefault =
    query.status === undefined ||
    (query.status.length === defaultStatus.length &&
      defaultStatus.every((status) => query.status?.includes(status)));

  return (
    <XStack flexWrap="wrap" items="center" gap={6}>
      {/* In `/backlog` la ricerca ha il suo campo; qui il campo è un'altra
          cosa (la ricerca di chi guarda), e quella salvata nella playlist
          deve restare visibile. */}
      {query.q && <Badge variant="secondary">{`“${query.q}”`}</Badge>}
      {!sameAsDefault && (
        <Badge variant="secondary">
          {query.status?.map((status) => statusLabels[status]).join(', ')}
        </Badge>
      )}
      {chips.map((chip) => (
        <Badge key={chip.key} variant="secondary">
          {chip.label}
        </Badge>
      ))}
    </XStack>
  );
}

/**
 * Il pannello: l'ordinamento in cima, poi una sezione per criterio, con
 * quanti valori sono accesi accanto al titolo anche a sezione chiusa, e in
 * fondo «azzera». Sta nel `Drawer`, a ogni larghezza.
 *
 * Gli id delle spunte portano un prefisso suo (`useId`): è montato solo a
 * drawer aperto, ma due pannelli in pagina non devono scontrarsi.
 */
export function FilterPanel() {
  const t = useTranslations('filters');
  const storeLabels = useStoreLabels();
  const subscriptionLabels = useSubscriptionLabels();
  const gameTypeLabels = useGameTypeLabels();
  const attributeKindLabels = useTranslations('attributeKind');
  const range = useRangeText();
  const { filter, setFilter, reset, activeCount } = useBacklogFilter();
  const { options, tags } = useFilterOptions();
  const prefix = useId();

  const statusLabels = useStatusLabels();
  const statusFiltered =
    filter.status.length !== defaultStatus.length ||
    defaultStatus.some((status) => !filter.status.includes(status));

  const attributi = options?.attributes ?? [];
  const h = (value: string) => t('hoursValue', { value });
  const subscriptionItems = (options?.subscriptions ?? []).map(
    (subscription) => ({
      value: subscription,
      label: subscriptionLabels[subscription],
    }),
  );

  const sections: {
    value: string;
    label: string;
    active: number;
    body: ReactNode;
  }[] = [
    {
      // Gli stessi sei dei bottoni in barra, sulla stessa selezione: spuntare
      // qui o là è lo stesso gesto. Il numero compare solo se la selezione non
      // è il default, che nasconde `excluded`.
      value: 'status',
      label: t('statusSection'),
      active: statusFiltered ? filter.status.length : 0,
      body: (
        <CheckList
          prefix={`${prefix}-status`}
          items={backlogStatusValues.map((status) => ({
            value: status,
            label: statusLabels[status],
          }))}
          selected={filter.status}
          onToggle={(value) =>
            setFilter({
              status: toggle<BacklogStatus>(
                filter.status,
                value as BacklogStatus,
              ),
            })
          }
        />
      ),
    },
    {
      value: 'platforms',
      label: t('platformsLabel'),
      active: filter.platforms.length,
      body: (
        <CheckList
          prefix={`${prefix}-platforms`}
          hint={t('allOfThem')}
          items={(options?.platforms ?? []).map((platform) => ({
            value: platform.slug,
            label: platform.name,
          }))}
          selected={filter.platforms}
          onToggle={(value) =>
            setFilter({ platforms: toggle(filter.platforms, value) })
          }
          empty={t('noPlatforms')}
        />
      ),
    },
    {
      value: 'stores',
      label: t('storesLabel'),
      active: filter.stores.length,
      body: (
        <CheckList
          prefix={`${prefix}-stores`}
          hint={t('allOfThem')}
          items={(options?.stores ?? []).map((store) => ({
            value: store,
            label: storeLabels[store],
          }))}
          selected={filter.stores}
          onToggle={(value) =>
            setFilter({ stores: toggle<Store>(filter.stores, value as Store) })
          }
          empty={t('noStores')}
        />
      ),
    },
    {
      // A che titolo si ha la copia: la famiglia Steam, il PS Plus. Un gruppo
      // suo e non righe dentro «Store»: è un'altra colonna (`subscriptions`
      // contro `stores`), e il chip dice «Famiglia Steam» senza passare per un
      // posto che si chiama Store. Solo i valori che l'utente ha davvero.
      value: 'subscriptions',
      label: t('subscriptionsLabel'),
      active: filter.subscriptions.length + filter.excludeSubscriptions.length,
      body: (
        <YStack gap={10}>
          {/* Due liste degli stessi valori. Spuntare un valore in una lo toglie
              dall'altra: «ha una copia dal Plus» e «tienilo anche senza» non
              si possono chiedere insieme, e non si lasciano chiedere. */}
          <Text fontSize={13} fontWeight="600">
            {t('includeSubscriptions')}
          </Text>
          <CheckList
            prefix={`${prefix}-subscriptions`}
            hint={t('allOfThem')}
            items={subscriptionItems}
            selected={filter.subscriptions}
            onToggle={(value) =>
              setFilter({
                subscriptions: toggle<Subscription>(
                  filter.subscriptions,
                  value as Subscription,
                ),
                excludeSubscriptions: without(
                  filter.excludeSubscriptions,
                  value as Subscription,
                ),
              })
            }
            empty={t('noSubscriptions')}
          />
          {subscriptionItems.length > 0 && (
            <>
              <Text fontSize={13} fontWeight="600">
                {t('excludeSubscriptions')}
              </Text>
              <CheckList
                prefix={`${prefix}-exclude-subscriptions`}
                items={subscriptionItems}
                selected={filter.excludeSubscriptions}
                onToggle={(value) =>
                  setFilter({
                    excludeSubscriptions: toggle<Subscription>(
                      filter.excludeSubscriptions,
                      value as Subscription,
                    ),
                    subscriptions: without(
                      filter.subscriptions,
                      value as Subscription,
                    ),
                  })
                }
              />
            </>
          )}
        </YStack>
      ),
    },
    {
      // In OR, al contrario di tutto il resto del pannello: un gioco ha
      // esattamente un tipo, quindi «DLC e Espansione» non esiste.
      value: 'gameTypes',
      label: t('gameTypesLabel'),
      active: filter.gameTypes.length,
      body: (
        <CheckList
          prefix={`${prefix}-types`}
          hint={t('oneOfThem')}
          items={(options?.gameTypes ?? []).map((type) => ({
            value: type,
            label: gameTypeLabels[type],
          }))}
          selected={filter.gameTypes}
          onToggle={(value) =>
            setFilter({
              gameTypes: toggle<GameType>(filter.gameTypes, value as GameType),
            })
          }
          empty={t('noGameTypes')}
        />
      ),
    },
    ...attributeKindValues.flatMap((kind) => {
      const voci = attributi.filter((row) => row.kind === kind);
      if (voci.length === 0) return [];
      const ids = new Set(voci.map((row) => row.id));
      return [
        {
          value: `attribute-${kind}`,
          label: attributeKindLabels(kind),
          active: filter.attributes.filter((id) => ids.has(id)).length,
          body: (
            <CheckList
              prefix={`${prefix}-${kind}`}
              hint={t('allOfThem')}
              items={voci.map((row) => ({
                value: String(row.id),
                label: row.name,
              }))}
              selected={filter.attributes.map(String)}
              onToggle={(value) =>
                setFilter({
                  attributes: toggle(filter.attributes, Number(value)),
                })
              }
            />
          ),
        },
      ];
    }),
    ...(['category', 'tag'] as UserTagKind[]).flatMap((kind) => {
      const voci = tags.filter((tag) => tag.kind === kind);
      if (voci.length === 0) return [];
      const ids = new Set(voci.map((tag) => tag.id));
      return [
        {
          value: kind,
          label: t(kind === 'tag' ? 'tagsLabel' : 'categoriesLabel'),
          active: filter.tags.filter((id) => ids.has(id)).length,
          body: (
            <CheckList
              prefix={`${prefix}-${kind}`}
              hint={t('allOfThem')}
              items={voci.map((tag) => ({ value: tag.id, label: tag.name }))}
              selected={filter.tags}
              onToggle={(value) =>
                setFilter({ tags: toggle(filter.tags, value) })
              }
            />
          ),
        },
      ];
    }),
    {
      value: 'duration',
      label: t('durationShort'),
      active:
        filter.durationMin !== null ||
        filter.durationMax !== null ||
        filter.noDuration
          ? 1
          : 0,
      body: (
        <YStack gap={12}>
          <RangeFilter
            min={0}
            max={DURATION_MAX_HOURS}
            step={0.5}
            low={hours(filter.durationMin)}
            high={hours(filter.durationMax)}
            text={(low, high) => range(low, high, h)}
            thumbLabels={[t('durationMinThumb'), t('durationMaxThumb')]}
            help={t('durationLabel')}
            // Il filtro esclude chi una durata non ce l'ha, e chi una fine non
            // ce l'ha. Detto qui una volta, invece di lasciar credere che quei
            // giochi siano spariti.
            hint={t('durationHint')}
            disabled={filter.noDuration}
            onCommit={(low, high) =>
              setFilter({
                durationMin: low === null ? null : Math.round(low * 60),
                durationMax: high === null ? null : Math.round(high * 60),
              })
            }
          />
          <XStack gap={8} items="center">
            <Checkbox
              id={`${prefix}-no-duration`}
              checked={filter.noDuration}
              // Esclusivo con l'intervallo: accenderla lo azzera, o il chip e lo
              // slider direbbero due cose.
              onCheckedChange={(checked) =>
                setFilter({
                  noDuration: checked === true || null,
                  ...(checked === true && {
                    durationMin: null,
                    durationMax: null,
                  }),
                })
              }
            />
            <Label htmlFor={`${prefix}-no-duration`}>{t('noDuration')}</Label>
          </XStack>
        </YStack>
      ),
    },
    {
      value: 'rating',
      label: t('ratingShort'),
      active: filter.ratingMin !== null || filter.ratingMax !== null ? 1 : 0,
      body: (
        <RangeFilter
          min={RATING_MIN}
          max={RATING_MAX}
          step={0.5}
          low={filter.ratingMin}
          high={filter.ratingMax}
          text={(low, high) => range(low, high)}
          thumbLabels={[t('ratingMinThumb'), t('ratingMaxThumb')]}
          hint={t('ratingHint')}
          onCommit={(ratingMin, ratingMax) =>
            setFilter({ ratingMin, ratingMax })
          }
        />
      ),
    },
    {
      value: 'critic',
      label: t('criticShort'),
      active: filter.criticMin !== null ? 1 : 0,
      body: (
        <RangeFilter
          min={0}
          max={100}
          step={1}
          low={filter.criticMin}
          text={(low) => range(low, null)}
          thumbLabels={[t('criticMin')]}
          onCommit={(criticMin) => setFilter({ criticMin })}
        />
      ),
    },
    {
      value: 'released',
      label: t('releasedShort'),
      active:
        filter.releasedFrom !== null || filter.releasedTo !== null ? 1 : 0,
      body: (
        <RangeFilter
          min={RELEASED_MIN}
          max={RELEASED_MAX}
          step={1}
          low={filter.releasedFrom}
          high={filter.releasedTo}
          text={(low, high) => range(low, high, String)}
          thumbLabels={[t('releasedMinThumb'), t('releasedMaxThumb')]}
          onCommit={(releasedFrom, releasedTo) =>
            setFilter({ releasedFrom, releasedTo })
          }
        />
      ),
    },
  ];

  // Aperte all'inizio le sezioni che hanno qualcosa di acceso: chi apre il
  // pannello cerca per prima cosa quello che ha già scelto. Senza niente
  // acceso, le piattaforme — il filtro di «stasera ho la Switch accesa».
  const [open, setOpen] = useState(() => {
    const accese = sections.filter((s) => s.active > 0).map((s) => s.value);
    return accese.length > 0 ? accese : ['platforms'];
  });

  return (
    <YStack gap={16}>
      <SortControl />
      {/* Un sì o un no, non un elenco: fuori dalle sezioni. */}
      <XStack gap={8} items="center">
        <Checkbox
          id={`${prefix}-never-played`}
          checked={filter.neverPlayed}
          onCheckedChange={(checked) =>
            setFilter({ neverPlayed: checked === true || null })
          }
        />
        <Label htmlFor={`${prefix}-never-played`}>{t('neverPlayed')}</Label>
      </XStack>
      <Accordion value={open} onValueChange={setOpen}>
        {sections.map((section) => (
          <AccordionItem key={section.value} value={section.value}>
            <AccordionTrigger
              hint={
                section.active > 0 ? (
                  <Badge variant="secondary">{String(section.active)}</Badge>
                ) : undefined
              }
            >
              {section.label}
            </AccordionTrigger>
            <AccordionContent>{section.body}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
      {activeCount > 0 && (
        <XStack>
          <Button variant="outline" onClick={() => void reset()}>
            {t('reset', { count: activeCount })}
          </Button>
        </XStack>
      )}
    </YStack>
  );
}

/**
 * Una lista di spunte per un criterio multiplo.
 *
 * Stessa forma della scelta dei tag dello step 5, e per la stessa ragione:
 * dopo qualche settimana si sceglie molto più spesso di quanto si scriva.
 */
function CheckList({
  prefix,
  hint,
  items,
  selected,
  onToggle,
  empty,
}: {
  prefix: string;
  hint?: string;
  items: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty?: string;
}) {
  if (items.length === 0)
    return empty ? (
      <Text fontSize={13} color="$color11">
        {empty}
      </Text>
    ) : null;

  return (
    <YStack gap={6}>
      {/* Nel pannello, più spunte dello stesso criterio significano "tutte":
          due tag selezionati restringono ai giochi che hanno entrambi. */}
      {hint &&
        selected.filter((value) => items.some((i) => i.value === value))
          .length > 1 && (
          <Text fontSize={13} color="$color11">
            {hint}
          </Text>
        )}
      <ScrollView maxH={224}>
        <YStack gap={6} py={2} px={2}>
          {items.map((item, index) => {
            const id = `${prefix}-${index}`;
            return (
              <XStack key={item.value} gap={8} items="center">
                <Checkbox
                  id={id}
                  checked={selected.includes(item.value)}
                  onCheckedChange={() => onToggle(item.value)}
                />
                <Label htmlFor={id} fontSize={14} lineHeight={20}>
                  {item.label}
                </Label>
              </XStack>
            );
          })}
        </YStack>
      </ScrollView>
    </YStack>
  );
}

/**
 * Un intervallo su uno slider: una maniglia se c'è solo `low`, due se c'è
 * anche `high`.
 *
 * Ha uno stato locale per la stessa ragione del campo di ricerca: lo slider
 * risponde a ogni pixel, l'URL si scrive quando la mano si ferma. Una maniglia
 * all'estremo vale `null`, cioè «non filtrare».
 */
function RangeFilter({
  min,
  max,
  step,
  low,
  high,
  text,
  thumbLabels,
  help,
  hint,
  disabled = false,
  onCommit,
}: {
  min: number;
  max: number;
  step: number;
  low: number | null;
  high?: number | null;
  text: (low: number | null, high: number | null) => string;
  thumbLabels: string[];
  help?: string;
  hint?: string;
  disabled?: boolean;
  onCommit: (low: number | null, high: number | null) => void;
}) {
  const double = high !== undefined;
  const fromFilter = double ? [low ?? min, high ?? max] : [low ?? min];
  const [value, setValue] = useState(fromFilter);
  const key = fromFilter.join(',');

  // Riallinea quando il filtro cambia da fuori: il chip, «azzera», un URL.
  useEffect(() => setValue(key.split(',').map(Number)), [key]);

  // In un ref: la funzione è nuova a ogni render della pagina, e fra le
  // dipendenze farebbe ripartire l'attesa a ogni risposta del server.
  const commit = useRef(onCommit);
  commit.current = onCommit;

  useEffect(() => {
    if (value.join(',') === key) return;
    const timer = setTimeout(() => {
      const [a = min, b = max] = value;
      commit.current(a <= min ? null : a, double && b < max ? b : null);
    }, 300);
    return () => clearTimeout(timer);
  }, [value, key, min, max, double]);

  const [a = min, b = max] = value;
  const lowValue = a <= min ? null : a;
  const highValue = double && b < max ? b : null;

  // Lo slider solo nel browser: Tamagui calcola la posizione delle maniglie
  // misurando il binario, che sul server non c'è, e l'idratazione trovava
  // maniglie senza posizione. Al suo posto, lo stesso spazio vuoto.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <YStack gap={8}>
      {help && (
        <Text fontSize={13} color="$color11">
          {help}
        </Text>
      )}
      <Text fontSize={14} color="$color12">
        {text(lowValue, highValue)}
      </Text>
      {mounted ? (
        <Slider
          min={min}
          max={max}
          step={step}
          value={value}
          onValueChange={setValue}
          thumbLabels={thumbLabels}
          disabled={disabled}
          mx={8}
        />
      ) : (
        <YStack height={20} />
      )}
      {hint && (lowValue !== null || highValue !== null) && (
        <Text fontSize={13} color="$color11">
          {hint}
        </Text>
      )}
    </YStack>
  );
}
