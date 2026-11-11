import { Badge, Button, EmptyState, Text, XStack, YStack } from '@repo/ui';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { ListPagination } from '@/components/list-pagination';

export const ACCOUNT_PAGE_SIZE = 10;
export const ACCOUNT_PAGE_SIZES = [5, 10, 25, 50, 100];
export function readAccountPage(value: unknown) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 1 ? page : undefined;
}
export function readAccountPageSize(value: unknown) {
  const size = Number(value);
  return ACCOUNT_PAGE_SIZES.includes(size) && size !== ACCOUNT_PAGE_SIZE
    ? size
    : undefined;
}
export function AccountSectionHeader({
  title,
  description,
  count,
  actions,
}: {
  title: string;
  description: string;
  count?: number;
  actions?: ReactNode;
}) {
  return (
    <XStack items="flex-start" justify="space-between" gap={16} flexWrap="wrap">
      <YStack gap={6} grow={1} shrink={1} minW={0}>
        <XStack items="center" gap={10}>
          <Text
            render="h2"
            m={0}
            fontFamily="$heading"
            fontSize={24}
            lineHeight={30}
            fontWeight="600"
            color="$color12"
          >
            {title}
          </Text>
          {count !== undefined && <Badge variant="secondary">{count}</Badge>}
        </XStack>
        <Text fontSize={14} lineHeight={21} color="$color11">
          {description}
        </Text>
      </YStack>
      {actions && (
        <XStack items="center" gap={8} flexWrap="wrap">
          {actions}
        </XStack>
      )}
    </XStack>
  );
}
export function AccountListFooter({
  page,
  total,
  path,
  search,
  onPage,
  groups = false,
  pageSize,
  onPageSizeChange,
}: {
  groups?: boolean;
  pageSize: number;
  onPageSizeChange: (size: number) => void;
  page: number;
  total: number;
  path: string;
  search: Record<string, string | number | undefined>;
  onPage: (page: number) => void;
}) {
  const tAccount = useTranslations('account.review');
  if (!total) return null;
  const href = (next: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries({
      ...search,
      page: next === 1 ? undefined : next,
    })) {
      if (value !== undefined) params.set(key, String(value));
    }
    return `${path}${params.size ? `?${params}` : ''}`;
  };
  return (
    <ListPagination
      page={page}
      pageCount={Math.ceil(total / pageSize)}
      href={href}
      onPageChange={onPage}
      pageSize={{
        value: pageSize,
        options: ACCOUNT_PAGE_SIZES,
        onChange: onPageSizeChange,
      }}
      summary={tAccount(groups ? 'groupRange' : 'range', {
        from: (page - 1) * pageSize + 1,
        to: Math.min(page * pageSize, total),
        total,
      })}
    />
  );
}
export function AccountListError({ retry }: { retry: () => void }) {
  const t = useTranslations('account.review');
  return (
    <EmptyState
      title={t('loadFailed')}
      action={
        <Button variant="outline" onPress={retry}>
          {t('retry')}
        </Button>
      }
    />
  );
}
