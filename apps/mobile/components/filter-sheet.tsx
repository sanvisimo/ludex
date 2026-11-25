import type { BacklogFilterOptions, BacklogStatus } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
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
import { DURATION_MAX_HOURS, emptyFilter } from '../lib/backlog-filter';
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

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={14} fontWeight="600" color="color12">
        {title}
      </Text>
      <XStack flexWrap="wrap" gap={8}>
        {children}
      </XStack>
    </YStack>
  );
}

export function FilterSheet({
  open,
  onOpenChange,
  filter,
  onChange,
  options,
  total,
  fetching,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filter: MobileFilter;
  onChange: (filter: MobileFilter) => void;
  options: BacklogFilterOptions | undefined;
  total: number | undefined;
  fetching: boolean;
}) {
  const t = useTranslations('filters');
  const tStatus = useTranslations('status');
  const tStore = useTranslations('store');
  const tSubscription = useTranslations('subscription');
  const [min, max] = filter.durationHours;
  const insets = useSafeAreaInsets();
  useBackToClose(open, () => onOpenChange(false));

  return (
    <Sheet open={open} onOpenChange={onOpenChange} label={t('title')}>
      <Text fontSize={18} fontWeight="700" color="color12">
        {t('title')}
      </Text>
      <ScrollView maxH={480}>
        <YStack gap={20} pb={8}>
          <Section title={t('status')}>
            {backlogStatusValues.map((status: BacklogStatus) => (
              <Chip
                key={status}
                label={tStatus(status)}
                selected={filter.status.includes(status)}
                onPress={() =>
                  onChange({ ...filter, status: toggle(filter.status, status) })
                }
              />
            ))}
          </Section>

          {options && options.platforms.length > 0 ? (
            <Section title={t('platforms')}>
              {options.platforms.map((platform) => (
                <Chip
                  key={platform.slug}
                  label={platform.name}
                  selected={filter.platforms.includes(platform.slug)}
                  onPress={() =>
                    onChange({
                      ...filter,
                      platforms: toggle(filter.platforms, platform.slug),
                    })
                  }
                />
              ))}
            </Section>
          ) : null}

          <YStack gap={8}>
            <XStack justify="space-between">
              <Text fontSize={14} fontWeight="600" color="color12">
                {t('duration')}
              </Text>
              <Text fontSize={14} color="color11">
                {max >= DURATION_MAX_HOURS
                  ? min > 0
                    ? t('durationFrom', { min })
                    : t('durationAny')
                  : t('durationRange', { min, max })}
              </Text>
            </XStack>
            <YStack px={12}>
              <Slider
                min={0}
                max={DURATION_MAX_HOURS}
                step={1}
                value={[min, max]}
                onValueChange={(value: number[]) =>
                  onChange({
                    ...filter,
                    durationHours: [
                      value[0] ?? 0,
                      value[1] ?? DURATION_MAX_HOURS,
                    ],
                  })
                }
                thumbLabels={[t('durationMin'), t('durationMax')]}
              />
            </YStack>
          </YStack>

          {options && options.stores.length > 0 ? (
            <Section title={t('stores')}>
              {options.stores.map((store) => (
                <Chip
                  key={store}
                  label={tStore(store)}
                  selected={filter.stores.includes(store)}
                  onPress={() =>
                    onChange({
                      ...filter,
                      stores: toggle(filter.stores, store),
                    })
                  }
                />
              ))}
            </Section>
          ) : null}

          {options && options.subscriptions.length > 0 ? (
            <Section title={t('subscriptions')}>
              {options.subscriptions.map((subscription) => (
                <Chip
                  key={subscription}
                  label={tSubscription(subscription)}
                  selected={filter.subscriptions.includes(subscription)}
                  onPress={() =>
                    onChange({
                      ...filter,
                      subscriptions: toggle(filter.subscriptions, subscription),
                    })
                  }
                />
              ))}
            </Section>
          ) : null}
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
