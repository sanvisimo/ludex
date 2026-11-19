import {
  adminMismatchesDefaultSort,
  AdminMismatchesSortSchema,
  type AdminMismatchesSort,
} from '@repo/contracts';
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';

import { adminPageParam } from '@/components/admin/admin-pagination';
import { PlatformMismatches } from '@/components/admin/platform-mismatches';

type Search = {
  view?: 'accepted';
  page?: number;
} & Partial<AdminMismatchesSort>;

export const Route = createFileRoute('/_app/admin/platforms')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...AdminMismatchesSortSchema.safeParse(search).data,
    view: search.view === 'accepted' ? 'accepted' : undefined,
    page: adminPageParam(search.page),
  }),
  component: PlatformsPage,
});

function PlatformsPage() {
  const {
    view,
    page = 1,
    sort = adminMismatchesDefaultSort.sort,
    direction = adminMismatchesDefaultSort.direction,
  } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const router = useRouter();
  const pageSearch = (target: number) => (prev: Search) => ({
    ...prev,
    page: adminPageParam(target),
  });

  return (
    <PlatformMismatches
      dismissed={view === 'accepted'}
      onDismissedChange={(dismissed) =>
        void navigate({
          search: (prev) => ({
            ...prev,
            view: dismissed ? 'accepted' : undefined,
            page: undefined,
          }),
        })
      }
      sorting={{ sort, direction }}
      onSortChange={(next) =>
        void navigate({
          search: (prev) => ({ ...prev, ...next, page: undefined }),
        })
      }
      paging={{
        page,
        href: (target) =>
          router.buildLocation({
            from: Route.fullPath,
            to: Route.fullPath,
            search: pageSearch(target),
          }).href,
        onPageChange: (target, replace) =>
          void navigate({ search: pageSearch(target), replace }),
      }}
    />
  );
}
