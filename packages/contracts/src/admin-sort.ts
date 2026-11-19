import { z } from 'zod';

import { SortDirectionSchema, type SortDirection } from './schemas';

export type AdminSort<K extends string = string> = {
  sort: K;
  direction: SortDirection;
};

function sortSchema<const K extends readonly [string, ...string[]]>(keys: K) {
  return z.object({ sort: z.enum(keys), direction: SortDirectionSchema });
}

export const AdminUsersSortSchema = sortSchema([
  'account',
  'joined',
  'lastSeen',
  'games',
  'accounts',
  'state',
]);
export const AdminMissingSortSchema = sortSchema(['game', 'reason', 'users']);
export const AdminUnresolvedSortSchema = sortSchema([
  'name',
  'libraries',
  'hidden',
]);
export const AdminUnlinkedSortSchema = sortSchema(['game', 'users', 'added']);
export const AdminMismatchesSortSchema = sortSchema([
  'game',
  'copies',
  'igdb',
  'users',
]);
export const AdminReportsSortSchema = sortSchema([
  'report',
  'users',
  'suggested',
]);

export type AdminUsersSort = z.infer<typeof AdminUsersSortSchema>;
export type AdminMissingSort = z.infer<typeof AdminMissingSortSchema>;
export type AdminUnresolvedSort = z.infer<typeof AdminUnresolvedSortSchema>;
export type AdminUnlinkedSort = z.infer<typeof AdminUnlinkedSortSchema>;
export type AdminMismatchesSort = z.infer<typeof AdminMismatchesSortSchema>;
export type AdminReportsSort = z.infer<typeof AdminReportsSortSchema>;

export const adminUsersDefaultSort: AdminUsersSort = {
  sort: 'joined',
  direction: 'desc',
};
export const adminMissingDefaultSort: AdminMissingSort = {
  sort: 'users',
  direction: 'desc',
};
export const adminUnresolvedDefaultSort: AdminUnresolvedSort = {
  sort: 'libraries',
  direction: 'desc',
};
export const adminUnlinkedDefaultSort: AdminUnlinkedSort = {
  sort: 'users',
  direction: 'desc',
};
export const adminMismatchesDefaultSort: AdminMismatchesSort = {
  sort: 'users',
  direction: 'desc',
};
export const adminReportsDefaultSort: AdminReportsSort = {
  sort: 'users',
  direction: 'desc',
};
