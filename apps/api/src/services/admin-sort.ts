import type { SortDirection } from '@repo/contracts';
import { sql, type SQLWrapper } from '@repo/db/orm';

export function adminOrderBy(column: SQLWrapper, direction: SortDirection) {
  return direction === 'asc'
    ? sql`${column} asc nulls last`
    : sql`${column} desc nulls last`;
}
