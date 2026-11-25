import type {
  BacklogFilterOptions,
  BacklogStatus,
  ScoreSource,
  UserTag,
} from '@repo/contracts';
import {
  attributeKindValues,
  backlogStatusValues,
  durationBasisValues,
} from '@repo/contracts';
import {
  Button,
  ScrollView,
  Sheet,
  Slider,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import type { ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslations } from 'use-intl';

import type { MobileFilter } from '../lib/backlog-filter';
import {
  DURATION_MAX_HOURS,
  RATING_MAX,
  RATING_MIN,
  RELEASED_MAX,
  RELEASED_MIN,
  emptyFilter,
} from '../lib/backlog-filter';
import { useBackToClose } from '../lib/use-back-to-close';

function toggle<T>(list: T[], value: T) {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Button
      size="sm"
      variant={selected ? 'selection' : 'outline'}
      aria-pressed={selected}
      onPress={onPress}
    >
      {label}
    </Button>
  );
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: ReactNode;
}) {
  return (
    <YStack gap={8}>
      <XStack justify="space-between" gap={8}>
        <Text fontSize={14} fontWeight="600" color="color12">
          {title}
        </Text>
        {aside ? (
          <Text fontSize={14} color="color11">
            {aside}
          </Text>
        ) : null}
      </XStack>
      {children}
    </YStack>
  );
}

function Chips({ children }: { children: ReactNode }) {
  return (
    <XStack flexWrap="wrap" gap={8}>
      {children}
    </XStack>
  );
}

function Range({
  min,
  max,
  step,
  value,
  onChange,
  thumbLabels,
}: {
  min: number;
  max: number;
  step: number;
  value: number[];
  onChange: (value: number[]) => void;
  thumbLabels: string[];
}) {
  return (
    // Le maniglie sporgono dal binario: senza margine il bordo le taglia.
    <YStack px={12} py={4}>
      <Slider
        min={min}
        max={max}
        step={step}
        value={value}
        onValueChange={onChange}
        thumbLabels={thumbLabels}
      />
    </YStack>
  );
}

/**
 * I filtri del pannello del web, nello stesso ordine. I testi si calcolano qui,
 * fuori dal foglio: dentro, su native, il contesto di use-intl non arriva.
 */
export function FilterSheet({
  open,
  onOpenChange,
  filter,
  onChange,
  options,
  vocabulary,
  total,
  fetching,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: MobileFilter;
  onChange: (filter: MobileFilter) => void;
  options: BacklogFilterOptions | undefined;
  vocabulary: UserTag[] | undefined;
  total: number | undefined;
  fetching: boolean;
}) {
  const t = useTranslations('filters');
  const tStatus = useTranslations('status');
  const tStore = useTranslations('store');
  const tSubscription = useTranslations('subscription');
  const tMedium = useTranslations('medium');
  const tGameType = useTranslations('gameType');
  const tAttributeKind = useTranslations('attributeKind');
  const tHltb = useTranslations('hltb');
  const tCritic = useTranslations('critic');
  const insets = useSafeAreaInsets();
  useBackToClose(open, () => onOpenChange(false));

  const set = (patch: Partial<MobileFilter>) =>
    onChange({ ...filter, ...patch });
  const range = (
    [low, high]: [number, number],
    min: number,
    max: number,
    unit = (value: number) => String(value),
  ) =>
    low <= min && high >= max
      ? t('any')
      : high >= max
        ? t('rangeMin', { min: unit(low) })
        : low <= min
          ? t('rangeMax', { max: unit(high) })
          : t('rangeBoth', { min: unit(low), max: unit(high) });
  const hours = (value: number) => t('hoursValue', { value });
  const criticSources: (ScoreSource | null)[] = [
    null,
    'metacritic',
    ...(options?.showOpenCritic ? (['opencritic'] as const) : []),
    'igdb',
  ];

  return (
    <Sheet open={open} onOpenChange={onOpenChange} label={t('title')}>
      <Text fontSize={18} fontWeight="700" color="color12">
        {t('title')}
      </Text>
      <ScrollView maxH={520}>
        <YStack gap={20} pb={8}>
          <Chips>
            <Chip
              label={t('neverPlayed')}
              selected={filter.neverPlayed}
              onPress={() => set({ neverPlayed: !filter.neverPlayed })}
            />
          </Chips>

          <Section title={t('status')}>
            <Chips>
              {backlogStatusValues.map((status: BacklogStatus) => (
                <Chip
                  key={status}
                  label={tStatus(status)}
                  selected={filter.status.includes(status)}
                  onPress={() => set({ status: toggle(filter.status, status) })}
                />
              ))}
            </Chips>
          </Section>

          {options && options.platforms.length > 0 ? (
            <Section title={t('platforms')}>
              <Chips>
                {options.platforms.map((platform) => (
                  <Chip
                    key={platform.slug}
                    label={platform.name}
                    selected={filter.platforms.includes(platform.slug)}
                    onPress={() =>
                      set({
                        platforms: toggle(filter.platforms, platform.slug),
                      })
                    }
                  />
                ))}
              </Chips>
            </Section>
          ) : null}

          {options && options.stores.length > 0 ? (
            <Section title={t('stores')}>
              <Chips>
                {options.stores.map((store) => (
                  <Chip
                    key={store}
                    label={tStore(store)}
                    selected={filter.stores.includes(store)}
                    onPress={() =>
                      set({ stores: toggle(filter.stores, store) })
                    }
                  />
                ))}
              </Chips>
            </Section>
          ) : null}

          {options && options.media.length > 0 ? (
            <Section title={t('media')}>
              <Chips>
                {options.media.map((medium) => (
                  <Chip
                    key={medium}
                    label={tMedium(medium)}
                    selected={filter.media.includes(medium)}
                    onPress={() => set({ media: toggle(filter.media, medium) })}
                  />
                ))}
              </Chips>
            </Section>
          ) : null}

          {options && options.subscriptions.length > 0 ? (
            <Section title={t('subscriptions')}>
              <Text fontSize={13} color="color11">
                {t('includeSubscriptions')}
              </Text>
              <Chips>
                {options.subscriptions.map((subscription) => (
                  <Chip
                    key={subscription}
                    label={tSubscription(subscription)}
                    selected={filter.subscriptions.includes(subscription)}
                    onPress={() =>
                      set({
                        subscriptions: toggle(
                          filter.subscriptions,
                          subscription,
                        ),
                        excludeSubscriptions:
                          filter.excludeSubscriptions.filter(
                            (item) => item !== subscription,
                          ),
                      })
                    }
                  />
                ))}
              </Chips>
              <Text fontSize={13} color="color11">
                {t('excludeSubscriptions')}
              </Text>
              <Chips>
                {options.subscriptions.map((subscription) => (
                  <Chip
                    key={subscription}
                    label={tSubscription(subscription)}
                    selected={filter.excludeSubscriptions.includes(
                      subscription,
                    )}
                    onPress={() =>
                      set({
                        excludeSubscriptions: toggle(
                          filter.excludeSubscriptions,
                          subscription,
                        ),
                        subscriptions: filter.subscriptions.filter(
                          (item) => item !== subscription,
                        ),
                      })
                    }
                  />
                ))}
              </Chips>
            </Section>
          ) : null}

          {options && options.gameTypes.length > 0 ? (
            <Section title={t('gameTypes')}>
              <Chips>
                {options.gameTypes.map((gameType) => (
                  <Chip
                    key={gameType}
                    label={tGameType(gameType)}
                    selected={filter.gameTypes.includes(gameType)}
                    onPress={() =>
                      set({ gameTypes: toggle(filter.gameTypes, gameType) })
                    }
                  />
                ))}
              </Chips>
            </Section>
          ) : null}

          {attributeKindValues.map((kind) => {
            const attributes = (options?.attributes ?? []).filter(
              (attribute) => attribute.kind === kind,
            );
            if (attributes.length === 0) return null;
            return (
              <Section key={kind} title={tAttributeKind(kind)}>
                <Chips>
                  {attributes.map((attribute) => (
                    <Chip
                      key={attribute.id}
                      label={attribute.name}
                      selected={filter.attributes.includes(attribute.id)}
                      onPress={() =>
                        set({
                          attributes: toggle(filter.attributes, attribute.id),
                        })
                      }
                    />
                  ))}
                </Chips>
              </Section>
            );
          })}

          {(['category', 'tag'] as const).map((kind) => {
            const tags = (vocabulary ?? []).filter((tag) => tag.kind === kind);
            if (tags.length === 0) return null;
            return (
              <Section
                key={kind}
                title={t(kind === 'tag' ? 'tags' : 'categories')}
              >
                <Chips>
                  {tags.map((tag) => (
                    <Chip
                      key={tag.id}
                      label={tag.name}
                      selected={filter.tags.includes(tag.id)}
                      onPress={() => set({ tags: toggle(filter.tags, tag.id) })}
                    />
                  ))}
                </Chips>
              </Section>
            );
          })}

          <Section
            title={t('duration')}
            aside={range(filter.durationHours, 0, DURATION_MAX_HOURS, hours)}
          >
            <Chips>
              {durationBasisValues.map((basis) => (
                <Chip
                  key={basis}
                  label={tHltb(basis)}
                  selected={filter.durationBasis === basis}
                  onPress={() => set({ durationBasis: basis })}
                />
              ))}
            </Chips>
            <Range
              min={0}
              max={DURATION_MAX_HOURS}
              step={1}
              value={filter.durationHours}
              onChange={([low, high]) =>
                set({
                  durationHours: [low ?? 0, high ?? DURATION_MAX_HOURS],
                })
              }
              thumbLabels={[t('durationMin'), t('durationMax')]}
            />
            <Chips>
              <Chip
                label={t('noDuration')}
                selected={filter.noDuration}
                onPress={() => set({ noDuration: !filter.noDuration })}
              />
            </Chips>
          </Section>

          <Section
            title={t('rating')}
            aside={range(filter.rating, RATING_MIN, RATING_MAX)}
          >
            <Range
              min={RATING_MIN}
              max={RATING_MAX}
              step={0.5}
              value={filter.rating}
              onChange={([low, high]) =>
                set({ rating: [low ?? RATING_MIN, high ?? RATING_MAX] })
              }
              thumbLabels={[t('ratingMin'), t('ratingMax')]}
            />
          </Section>

          <Section
            title={t('critic')}
            aside={
              filter.criticMin > 0
                ? t('rangeMin', { min: filter.criticMin })
                : t('any')
            }
          >
            <Chips>
              {criticSources.map((source) => (
                <Chip
                  key={source ?? 'shown'}
                  label={source ? tCritic(source) : t('criticSourceShown')}
                  selected={filter.criticSource === source}
                  onPress={() => set({ criticSource: source })}
                />
              ))}
            </Chips>
            <Range
              min={0}
              max={100}
              step={1}
              value={[filter.criticMin]}
              onChange={([low]) => set({ criticMin: low ?? 0 })}
              thumbLabels={[t('criticMin')]}
            />
          </Section>

          <Section
            title={t('released')}
            aside={range(filter.released, RELEASED_MIN, RELEASED_MAX)}
          >
            <Range
              min={RELEASED_MIN}
              max={RELEASED_MAX}
              step={1}
              value={filter.released}
              onChange={([low, high]) =>
                set({
                  released: [low ?? RELEASED_MIN, high ?? RELEASED_MAX],
                })
              }
              thumbLabels={[t('releasedMin'), t('releasedMax')]}
            />
          </Section>
        </YStack>
      </ScrollView>

      <XStack gap={12} pt={8} pb={insets.bottom}>
        <Button variant="outline" onPress={() => onChange(emptyFilter)}>
          {t('reset')}
        </Button>
        <Button
          flex={1}
          disabled={fetching}
          onPress={() => onOpenChange(false)}
        >
          {fetching || total === undefined
            ? t('updating')
            : total === 1
              ? t('showOne')
              : t('showOther', { count: total })}
        </Button>
      </XStack>
    </Sheet>
  );
}
