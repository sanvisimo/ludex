import type {
  Medium,
  OwnershipAccount,
  Store,
  Subscription,
} from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  PlatformIcon,
  Text,
  Tooltip,
  XStack,
  YStack,
} from '@repo/ui';
import { X } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import {
  useId,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from 'react';
import { useTranslations } from 'use-intl';

import { useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { platformIconUrl } from '@/lib/platform-icons';
import { STORE_BRAND } from '@/lib/store-brand';

export type DisplayedOwnership = {
  id?: string;
  platformSlug: string;
  store?: Store | null;
  storeAccount?: OwnershipAccount | null;
  subscription?: Subscription | null;
  medium?: Medium | null;
};

export function ownershipKey(ownership: DisplayedOwnership) {
  return `${ownership.platformSlug}|${ownership.store ?? ''}|${ownership.storeAccount?.id ?? ''}|${ownership.medium ?? ''}`;
}

type StoreGroup = {
  key: string;
  store?: Store | null;
  label: string;
  details: {
    key: string;
    label: string;
    platform: string;
    platformSlug: string;
    account?: string | null;
    extra: string[];
  }[];
};

function StoreGroupIcon({
  store,
  size,
}: {
  store?: Store | null;
  size: number;
}) {
  const brand = store ? STORE_BRAND[store] : undefined;
  return brand ? <BrandIcon brand={brand} size={size} /> : null;
}

function StoreTrigger({
  label,
  tooltip,
  groups,
  children,
  iconOnly,
}: {
  label: string;
  tooltip: ReactNode;
  groups: StoreGroup[];
  children: ReactNode;
  iconOnly: boolean;
}) {
  const t = useTranslations('game');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<ComponentRef<typeof Button>>(null);
  const dialogId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Tooltip content={tooltip}>
        <Button
          ref={triggerRef}
          variant="ghost"
          size={iconOnly ? 'icon' : 'sm'}
          height="auto"
          minH={32}
          maxW="100%"
          px={iconOnly ? 0 : 4}
          aria-label={label}
          aria-controls={open ? dialogId : undefined}
          // Il dialogo è il tooltip di chi non ha il mouse: dove il tooltip
          // c'è, il clic non aggiunge niente. Letto alla pressione e non al
          // rendering, che sul server non sa del dispositivo.
          onPress={() => {
            if (window.matchMedia('(hover: none)').matches) setOpen(true);
          }}
        >
          {children}
        </Button>
      </Tooltip>
      <DialogContent
        id={dialogId}
        size="compact"
        closeLabel={t('close')}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          triggerRef.current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('copies')}</DialogTitle>
        </DialogHeader>
        <YStack gap={14}>
          {groups.map((group) => (
            <YStack key={group.key} gap={12} p={14} rounded={14} bg="$color3">
              <XStack items="center" gap={10}>
                <StoreGroupIcon store={group.store} size={28} />
                <Text
                  fontSize={15}
                  lineHeight={22}
                  fontWeight="600"
                  color="$color12"
                  flex={1}
                >
                  {group.label}
                </Text>
              </XStack>
              <YStack gap={0}>
                {group.details.map((detail, index) => {
                  const icon = platformIconUrl(detail.platformSlug);
                  return (
                    <XStack
                      key={detail.key}
                      gap={10}
                      py={10}
                      items="flex-start"
                      borderTopWidth={index === 0 ? 0 : 1}
                      borderColor="$borderColor"
                    >
                      {icon && (
                        <PlatformIcon
                          src={icon}
                          label={detail.platform}
                          size={28}
                        />
                      )}
                      <YStack flex={1} minW={0} gap={3}>
                        <Text
                          fontSize={14}
                          lineHeight={20}
                          fontWeight="500"
                          color="$color12"
                        >
                          {detail.platform}
                        </Text>
                        {detail.account && (
                          <Text
                            fontSize={13}
                            lineHeight={20}
                            color="$color11"
                            style={{ overflowWrap: 'anywhere' }}
                          >
                            {detail.account}
                          </Text>
                        )}
                        {detail.extra.length > 0 && (
                          <XStack flexWrap="wrap" gap={4} pt={3}>
                            {detail.extra.map((extra) => (
                              <Badge key={extra} variant="secondary">
                                {extra}
                              </Badge>
                            ))}
                          </XStack>
                        )}
                      </YStack>
                    </XStack>
                  );
                })}
              </YStack>
            </YStack>
          ))}
        </YStack>
      </DialogContent>
    </Dialog>
  );
}

function OwnershipStore({
  group,
  groups,
}: {
  group: StoreGroup;
  groups: StoreGroup[];
}) {
  const brand = group.store ? STORE_BRAND[group.store] : undefined;

  return (
    <StoreTrigger
      label={group.label}
      tooltip={group.details.map((detail) => detail.label).join('\n')}
      groups={groups}
      iconOnly={!!brand}
    >
      {brand ? (
        <BrandIcon brand={brand} size={24} />
      ) : (
        <Text
          fontSize={12}
          lineHeight={16}
          color="$color11"
          shrink={1}
          numberOfLines={1}
        >
          {group.label}
        </Text>
      )}
    </StoreTrigger>
  );
}

function MoreStores({
  groups,
  hidden,
}: {
  groups: StoreGroup[];
  hidden: number;
}) {
  const t = useTranslations('game');

  return (
    <StoreTrigger
      label={t('moreStores', { count: hidden })}
      tooltip={
        <YStack gap={6} py={2}>
          {groups.map((group) => (
            <XStack key={group.key} items="center" gap={8}>
              <StoreGroupIcon store={group.store} size={16} />
              <Text fontSize={12} lineHeight={16} color="$color1">
                {group.label}
              </Text>
            </XStack>
          ))}
        </YStack>
      }
      groups={groups}
      iconOnly
    >
      <Text fontSize={13} lineHeight={16} fontWeight="600" color="$color11">
        +{hidden}
      </Text>
    </StoreTrigger>
  );
}

export function OwnershipBadges({
  ownerships,
  onRemove,
  compact,
  storesOnly,
  max,
}: {
  ownerships: DisplayedOwnership[];
  onRemove?: (ownership: DisplayedOwnership) => void;
  compact?: boolean;
  storesOnly?: boolean;
  max?: number;
}) {
  const t = useTranslations('editEntry');
  const tSubscription = useTranslations('subscription');
  const tMedium = useTranslations('medium');
  const storeLabels = useStoreLabels();
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  const labelFor = (
    ownership: DisplayedOwnership,
    account = ownership.storeAccount?.label,
  ) => {
    const platform =
      nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug;
    const store = ownership.store ? storeLabels[ownership.store] : null;
    return (
      platform +
      (store ? ` · ${store}` : '') +
      (account ? ` (${account})` : '') +
      (ownership.subscription
        ? ` · ${tSubscription(ownership.subscription)}`
        : '') +
      (ownership.medium === 'physical' ? ` · ${tMedium('physical')}` : '')
    );
  };

  if (storesOnly) {
    const groups = new Map<
      string,
      Omit<StoreGroup, 'details'> & {
        details: Map<string, StoreGroup['details'][number]>;
      }
    >();
    for (const ownership of ownerships) {
      const key = ownership.store ?? `platform:${ownership.platformSlug}`;
      const group = groups.get(key) ?? {
        key,
        store: ownership.store,
        label: ownership.store
          ? storeLabels[ownership.store]
          : (nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug),
        details: new Map(),
      };
      const account = ownership.storeAccount;
      const accountLabel =
        account?.label || account?.displayName || account?.externalAccountId;
      const label = labelFor(ownership, accountLabel);
      group.details.set(label, {
        key: label,
        label,
        platform:
          nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug,
        platformSlug: ownership.platformSlug,
        account: accountLabel,
        extra: [
          ownership.subscription ? tSubscription(ownership.subscription) : null,
          ownership.medium === 'physical' ? tMedium('physical') : null,
        ].filter((value): value is string => value !== null),
      });
      groups.set(key, group);
    }
    const all: StoreGroup[] = [...groups.values()].map((group) => ({
      ...group,
      details: [...group.details.values()],
    }));
    const overflow = max !== undefined && all.length > max;
    const shown = overflow ? all.slice(0, max - 1) : all;

    return (
      <XStack flexWrap="wrap" items="center" gap={4} minW={0} maxW="100%">
        {shown.map((group) => (
          <OwnershipStore key={group.key} group={group} groups={all} />
        ))}
        {overflow && (
          <MoreStores groups={all} hidden={all.length - shown.length} />
        )}
      </XStack>
    );
  }

  const storeNames = [
    ...new Set(
      ownerships.map((ownership) =>
        ownership.store
          ? storeLabels[ownership.store]
          : (nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug),
      ),
    ),
  ];

  const full = (
    <XStack
      flexWrap="wrap"
      gap={4}
      $max-sm={compact ? { display: 'none' } : undefined}
    >
      {ownerships.map((ownership) => {
        const label = labelFor(ownership);

        return (
          <Badge
            key={ownership.id ?? ownershipKey(ownership)}
            variant="secondary"
            pr={onRemove ? 4 : undefined}
            maxW="100%"
            overflow="hidden"
          >
            {label}
            {onRemove && (
              <XStack
                render="button"
                aria-label={t('removePlatform', { name: label })}
                onPress={() => onRemove(ownership)}
                bg="transparent"
                borderWidth={0}
                p={0}
                cursor="pointer"
                opacity={0.5}
                hoverStyle={{ opacity: 1 }}
                focusVisibleStyle={{
                  opacity: 1,
                  outlineColor: '$outlineColor',
                  outlineStyle: 'solid',
                  outlineWidth: 2,
                }}
              >
                <X size={12} color="$color12" />
              </XStack>
            )}
          </Badge>
        );
      })}
    </XStack>
  );

  if (!compact) return full;

  return (
    <>
      {full}
      <XStack flexWrap="wrap" gap={4} $sm={{ display: 'none' }}>
        {storeNames.map((name) => (
          <Badge key={name} variant="secondary" maxW="100%" overflow="hidden">
            {name}
          </Badge>
        ))}
      </XStack>
    </>
  );
}
