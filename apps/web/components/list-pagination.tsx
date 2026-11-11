import { Pagination, Text, XStack } from '@repo/ui';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { PageSizeSelect } from '@/components/page-size-select';
import { takeLinkClick } from '@/src/link-click';

export function ListPagination({
  page,
  pageCount,
  href,
  onPageChange,
  pageSize,
  summary,
}: {
  page: number;
  pageCount: number;
  href: (page: number) => string;
  onPageChange: (page: number) => void;
  pageSize?: {
    value: number;
    options: number[];
    onChange: (size: number) => void;
  };
  summary?: ReactNode;
}) {
  const t = useTranslations('backlog');
  if (pageCount <= 1 && !pageSize && !summary) return null;
  return (
    <XStack
      flexWrap="wrap"
      items="center"
      justify="center"
      $sm={{ justify: 'space-between' }}
      gap={16}
    >
      {(pageSize || summary) && (
        <XStack flexWrap="wrap" items="center" gap={16}>
          {pageSize && (
            <PageSizeSelect
              value={pageSize.value}
              options={pageSize.options}
              onChange={pageSize.onChange}
            />
          )}
          {summary && (
            <Text fontSize={13} color="$color11">
              {summary}
            </Text>
          )}
        </XStack>
      )}
      <Pagination
        page={page}
        pageCount={pageCount}
        href={href}
        onNavigate={(next, event) => {
          if (takeLinkClick(event)) onPageChange(next);
        }}
        label={t('pages')}
        previousLabel={t('previousPage')}
        nextLabel={t('nextPage')}
        goToLabel={t('goToPage')}
        onGoTo={onPageChange}
      />
    </XStack>
  );
}
