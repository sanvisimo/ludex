import { useEffect } from 'react';
import { useTranslations } from 'use-intl';

import { ListPagination } from '@/components/list-pagination';

export const ADMIN_PAGE_SIZE = 25;

export function adminPageParam(value: unknown) {
  return typeof value === 'number' &&
    value > 1 &&
    Number.isInteger(value) &&
    Number.isSafeInteger(value * ADMIN_PAGE_SIZE)
    ? value
    : undefined;
}

export type AdminPageNavigation = {
  page: number;
  href: (page: number) => string;
  onPageChange: (page: number, replace?: boolean) => void;
};

export function AdminPagination({
  page,
  total,
  pageSize = ADMIN_PAGE_SIZE,
  href,
  onPageChange,
}: AdminPageNavigation & { total: number | undefined; pageSize?: number }) {
  const t = useTranslations('admin');
  const pageCount = Math.max(1, Math.ceil((total ?? 0) / pageSize));
  useEffect(() => {
    if (total !== undefined && page > pageCount) onPageChange(pageCount, true);
  }, [onPageChange, page, pageCount, total]);

  if (!total || page > pageCount) return null;

  return (
    <ListPagination
      page={page}
      pageCount={pageCount}
      href={href}
      onPageChange={onPageChange}
      summary={
        <span role="status">
          {t('pageRange', {
            from: (page - 1) * pageSize + 1,
            to: Math.min(page * pageSize, total),
            total,
          })}
        </span>
      }
    />
  );
}
