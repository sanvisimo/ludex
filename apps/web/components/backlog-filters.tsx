'use client';

import type { BacklogStatus, Store, UserTagKind } from '@repo/contracts';
import { attributeKindValues, backlogStatusValues } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { debounce } from 'nuqs';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toggle, useBacklogFilter } from '@/lib/backlog-filter';
import { useStatusLabels, useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

/**
 * Il pannello dei filtri (step 7).
 *
 * Non tiene stato suo: legge e scrive quello dell'URL tramite
 * `useBacklogFilter`, lo stesso hook che usa la pagina per costruire la query.
 * Sono due letture della stessa cosa, non due copie da tenere allineate.
 */
export function BacklogFilters() {
  const t = useTranslations('filters');
  const statusLabels = useStatusLabels();
  const storeLabels = useStoreLabels();
  const attributeKindLabels = useTranslations('attributeKind');

  const { filter, setFilter, reset, activeCount } = useBacklogFilter();

  // Le voci del pannello sono quelle presenti nel backlog di chi guarda: una
  // tendina con 96 piattaforme di cui ne possiedi tre nasconde le tre che
  // contano.
  const options = useQuery(api.backlog.filterOptions.queryOptions());
  const tags = useQuery(api.tags.list.queryOptions());

  const attributi = options.data?.attributes ?? [];

  return (
    <section className="grid gap-3 rounded-xl border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchField />

        <div className="flex items-center gap-2">
          <Label htmlFor="sort" className="text-muted-foreground">
            {t('sortLabel')}
          </Label>
          <Select
            items={sortLabels(t)}
            value={filter.sort}
            onValueChange={(value) =>
              setFilter({ sort: value as keyof ReturnType<typeof sortLabels> })
            }
          >
            <SelectTrigger id="sort" className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(sortLabels(t)).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setFilter({
                direction: filter.direction === 'asc' ? 'desc' : 'asc',
              })
            }
            aria-label={t('directionLabel')}
          >
            {t(filter.direction === 'asc' ? 'ascending' : 'descending')}
          </Button>
        </div>

        {activeCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto"
            onClick={() => void reset()}
          >
            {t('reset', { count: activeCount })}
          </Button>
        )}
      </div>

      {/* Lo stato è l'unico criterio a valore singolo per riga: le spunte sono
          in OR fra loro, non in AND come tutto il resto del pannello.
          Togliere l'ultima rimette il default — tutti tranne "non mi
          interessa" — invece di lasciare una selezione vuota, che non
          mostrerebbe niente e sembrerebbe un guasto. */}
      <div className="flex flex-wrap gap-1">
        {backlogStatusValues.map((status) => (
          <Chip
            key={status}
            active={filter.status.includes(status)}
            onClick={() =>
              setFilter({
                status: toggle<BacklogStatus>(filter.status, status),
              })
            }
          >
            {statusLabels[status]}
          </Chip>
        ))}
      </div>

      <details className="grid gap-3">
        <summary className="cursor-pointer text-sm text-muted-foreground">
          {t('more')}
        </summary>

        <div className="grid gap-4 pt-3 sm:grid-cols-2">
          {/* Nel pannello, più spunte dello stesso criterio significano "tutte":
              due tag selezionati restringono ai giochi che hanno entrambi. */}
          <CheckList
            label={t('platformsLabel')}
            hint={t('allOfThem')}
            items={(options.data?.platforms ?? []).map((platform) => ({
              value: platform.slug,
              label: platform.name,
            }))}
            selected={filter.platforms}
            onToggle={(value) =>
              setFilter({ platforms: toggle(filter.platforms, value) })
            }
            empty={t('noPlatforms')}
          />

          <CheckList
            label={t('storesLabel')}
            hint={t('allOfThem')}
            items={(options.data?.stores ?? []).map((store) => ({
              value: store,
              label: storeLabels[store],
            }))}
            selected={filter.stores}
            onToggle={(value) =>
              setFilter({
                stores: toggle<Store>(filter.stores, value as Store),
              })
            }
            empty={t('noStores')}
          />

          {attributeKindValues.map((kind) => {
            const voci = attributi.filter((row) => row.kind === kind);
            if (voci.length === 0) return null;
            return (
              <CheckList
                key={kind}
                label={attributeKindLabels(kind)}
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
                empty=""
              />
            );
          })}

          {(['category', 'tag'] as UserTagKind[]).map((kind) => {
            const voci = (tags.data ?? []).filter((tag) => tag.kind === kind);
            if (voci.length === 0) return null;
            return (
              <CheckList
                key={kind}
                label={t(kind === 'tag' ? 'tagsLabel' : 'categoriesLabel')}
                hint={t('allOfThem')}
                items={voci.map((tag) => ({ value: tag.id, label: tag.name }))}
                selected={filter.tags}
                onToggle={(value) =>
                  setFilter({ tags: toggle(filter.tags, value) })
                }
                empty=""
              />
            );
          })}

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              {t('durationLabel')}
            </legend>
            <div className="flex items-center gap-2">
              <HoursField
                aria-label={t('durationMin')}
                placeholder={t('durationMin')}
                minutes={filter.durationMin}
                onChange={(durationMin) => setFilter({ durationMin })}
              />
              <span className="text-muted-foreground">–</span>
              <HoursField
                aria-label={t('durationMax')}
                placeholder={t('durationMax')}
                minutes={filter.durationMax}
                onChange={(durationMax) => setFilter({ durationMax })}
              />
            </div>
            {/* Il filtro esclude chi una durata non ce l'ha, e chi una fine non
                ce l'ha. Detto qui una volta, invece di lasciar credere che
                quei giochi siano spariti. */}
            {(filter.durationMin !== null || filter.durationMax !== null) && (
              <p className="text-muted-foreground">{t('durationHint')}</p>
            )}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('ratingLabel')}</legend>
            <div className="flex items-center gap-2">
              <NumberField
                aria-label={t('ratingMin')}
                placeholder={t('ratingMin')}
                value={filter.ratingMin}
                step={0.5}
                min={0.5}
                max={5}
                onChange={(ratingMin) => setFilter({ ratingMin })}
              />
              <span className="text-muted-foreground">–</span>
              <NumberField
                aria-label={t('ratingMax')}
                placeholder={t('ratingMax')}
                value={filter.ratingMax}
                step={0.5}
                min={0.5}
                max={5}
                onChange={(ratingMax) => setFilter({ ratingMax })}
              />
            </div>
            {(filter.ratingMin !== null || filter.ratingMax !== null) && (
              <p className="text-muted-foreground">{t('ratingHint')}</p>
            )}
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">
              {t('releasedLabel')}
            </legend>
            <div className="flex items-center gap-2">
              <NumberField
                aria-label={t('releasedFrom')}
                placeholder={t('releasedFrom')}
                value={filter.releasedFrom}
                min={1950}
                max={2100}
                onChange={(releasedFrom) => setFilter({ releasedFrom })}
              />
              <span className="text-muted-foreground">–</span>
              <NumberField
                aria-label={t('releasedTo')}
                placeholder={t('releasedTo')}
                value={filter.releasedTo}
                min={1950}
                max={2100}
                onChange={(releasedTo) => setFilter({ releasedTo })}
              />
            </div>
          </fieldset>

          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">{t('otherLabel')}</legend>
            <NumberField
              aria-label={t('criticMin')}
              placeholder={t('criticMin')}
              value={filter.criticMin}
              min={0}
              max={100}
              onChange={(criticMin) => setFilter({ criticMin })}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="size-4"
                checked={filter.neverPlayed}
                onChange={(event) =>
                  setFilter({ neverPlayed: event.target.checked || null })
                }
              />
              {t('neverPlayed')}
            </label>
          </fieldset>
        </div>
      </details>
    </section>
  );
}

function sortLabels(t: ReturnType<typeof useTranslations<'filters'>>) {
  return {
    addedAt: t('sortAddedAt'),
    name: t('sortName'),
    released: t('sortReleased'),
    duration: t('sortDuration'),
    rating: t('sortRating'),
    criticRating: t('sortCriticRating'),
    lastPlayed: t('sortLastPlayed'),
  };
}

/**
 * Il campo di ricerca.
 *
 * Ha uno stato locale perché lo stato dell'URL è **ritardato**: nuqs aggiorna
 * subito il valore ma può scrivere nell'URL più tardi, e qui serve il contrario
 * — la casella deve rispondere a ogni tasto, la ricerca no. Senza il ritardo si
 * partirebbe una richiesta per lettera.
 */
function SearchField() {
  const t = useTranslations('filters');
  const { filter, setFilter } = useBacklogFilter();
  const [text, setText] = useState(filter.q);

  // Riallinea quando il filtro cambia da fuori: il bottone che azzera tutto, o
  // un URL incollato. Senza, la casella resterebbe con dentro la vecchia parola.
  useEffect(() => setText(filter.q), [filter.q]);

  return (
    <Input
      value={text}
      onChange={(event) => {
        setText(event.target.value);
        void setFilter(
          { q: event.target.value || null },
          // Il ritardo è sulla scrittura: lo stato — e quindi la query — segue
          // l'URL, quindi ritardare l'uno ritarda l'altra.
          { limitUrlUpdates: debounce(350) },
        );
      }}
      placeholder={t('searchPlaceholder')}
      className="w-full sm:w-64"
      maxLength={100}
    />
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/**
 * Una lista di spunte per un criterio multiplo.
 *
 * Stessa forma della scelta dei tag dello step 5, e per la stessa ragione:
 * dopo qualche settimana si sceglie molto più spesso di quanto si scriva.
 */
function CheckList({
  label,
  hint,
  items,
  selected,
  onToggle,
  empty,
}: {
  label: string;
  hint: string;
  items: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
  empty: string;
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="text-sm font-medium">{label}</legend>
      {items.length === 0 ? (
        empty ? (
          <p className="text-muted-foreground">{empty}</p>
        ) : null
      ) : (
        <>
          {selected.length > 1 && (
            <p className="text-muted-foreground">{hint}</p>
          )}
          <ul className="max-h-40 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
            {items.map((item) => (
              <li key={item.value} className="px-2 py-1">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4"
                    checked={selected.includes(item.value)}
                    onChange={() => onToggle(item.value)}
                  />
                  {item.label}
                </label>
              </li>
            ))}
          </ul>
        </>
      )}
    </fieldset>
  );
}

/** Numero o niente: la casella vuota vale "non filtrare", non "zero". */
function NumberField({
  value,
  onChange,
  ...props
}: {
  value: number | null;
  onChange: (value: number | null) => void;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'>) {
  return (
    <Input
      {...props}
      type="number"
      value={value ?? ''}
      onChange={(event) => {
        const raw = event.target.value;
        onChange(raw === '' ? null : Number(raw));
      }}
    />
  );
}

/**
 * Ore in ingresso, minuti in uscita.
 *
 * L'utente pensa in ore ("stasera ne ho due"), la colonna è in minuti. La
 * conversione sta qui e non nel contratto: cambiare l'unità della UI non deve
 * toccare l'API.
 */
function HoursField({
  minutes,
  onChange,
  ...props
}: {
  minutes: number | null;
  onChange: (minutes: number | null) => void;
} & Omit<React.ComponentProps<'input'>, 'value' | 'onChange' | 'type'>) {
  return (
    <NumberField
      {...props}
      min={0}
      step={0.5}
      value={minutes === null ? null : Math.round((minutes / 60) * 10) / 10}
      onChange={(ore) => onChange(ore === null ? null : Math.round(ore * 60))}
    />
  );
}
