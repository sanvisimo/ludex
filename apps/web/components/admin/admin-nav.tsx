import { NavItem, Text, YStack } from '@repo/ui';
import {
  ChartColumn,
  Database,
  Flag,
  Inbox,
  MonitorX,
  Users,
} from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useLocation, useMatchRoute, useRouter } from '@tanstack/react-router';
import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { api } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

type AdminSection =
  | '/admin/missing'
  | '/admin/unresolved'
  | '/admin/reported'
  | '/admin/platforms'
  | '/admin/users'
  | '/admin/usage';

export function AdminNav() {
  const t = useTranslations('admin.nav');
  const pathname = useLocation({ select: ({ pathname }) => pathname });
  const navRef = useRef<ComponentRef<typeof YStack>>(null);
  const scarti = useQuery(
    api.admin.unresolved.list.queryOptions({ input: { limit: 1 } }),
  );
  const segnalazioni = useQuery(
    api.admin.reports.list.queryOptions({ input: { limit: 1 } }),
  );
  const piattaforme = useQuery(
    api.admin.platformMismatches.list.queryOptions({
      input: { dismissed: false, limit: 1 },
    }),
  );

  const unresolvedCount = scarti.data?.total;
  const reportsCount = segnalazioni.data?.total;
  const platformsCount = piattaforme.data?.total;

  useEffect(() => {
    const nav = navRef.current;
    if (!(nav instanceof HTMLElement)) return;
    const link = nav.querySelector('a[aria-current="page"]');
    if (!link || nav.scrollWidth <= nav.clientWidth) return;
    const bounds = link.getBoundingClientRect();
    const viewport = nav.getBoundingClientRect();
    if (bounds.right > viewport.right) {
      nav.scrollLeft += bounds.right - viewport.right;
    } else if (bounds.left < viewport.left) {
      nav.scrollLeft += bounds.left - viewport.left;
    }
  }, [pathname, unresolvedCount, reportsCount, platformsCount]);

  return (
    <YStack
      ref={navRef}
      render="nav"
      aria-label={t('label')}
      width="208px max-md:100%"
      shrink={0}
      gap={20}
      pb="max-md:4px"
      flexDirection="max-md:row"
      style={{
        overflowX: 'auto',
        overflowY: 'hidden',
      }}
    >
      <NavGroup label={t('catalog')}>
        <SectionLink to="/admin/missing" icon={<Database size={16} />}>
          {t('missing')}
        </SectionLink>
        <SectionLink
          to="/admin/unresolved"
          icon={<Inbox size={16} />}
          count={unresolvedCount}
        >
          {t('unresolved')}
        </SectionLink>
        <SectionLink
          to="/admin/reported"
          icon={<Flag size={16} />}
          count={reportsCount}
        >
          {t('reported')}
        </SectionLink>
        <SectionLink
          to="/admin/platforms"
          icon={<MonitorX size={16} />}
          count={platformsCount}
        >
          {t('platforms')}
        </SectionLink>
      </NavGroup>
      <NavGroup label={t('management')}>
        <SectionLink to="/admin/users" icon={<Users size={16} />}>
          {t('users')}
        </SectionLink>
        <SectionLink to="/admin/usage" icon={<ChartColumn size={16} />}>
          {t('usage')}
        </SectionLink>
      </NavGroup>
    </YStack>
  );
}

function NavGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <YStack role="group" aria-label={label} gap={4} shrink={0}>
      <Text
        aria-hidden
        fontSize={12}
        lineHeight="16px"
        fontWeight="600"
        color="color11"
        px={12}
      >
        {label}
      </Text>
      <YStack gap={4} flexDirection="max-md:row">
        {children}
      </YStack>
    </YStack>
  );
}

function SectionLink({
  to,
  icon,
  count,
  children,
}: {
  to: AdminSection;
  icon: ReactNode;
  count?: number;
  children: string;
}) {
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to, fuzzy: true }) !== false;

  return (
    <NavItem
      height="auto"
      minH={40}
      py={8}
      shrink={0}
      outlineOffset="focus-visible:-2px"
      href={to}
      active={active}
      icon={icon}
      trailing={count ? String(count) : undefined}
      onClick={(event) => {
        if (!takeLinkClick(event)) return;
        void router.navigate({ to });
      }}
    >
      {children}
    </NavItem>
  );
}
