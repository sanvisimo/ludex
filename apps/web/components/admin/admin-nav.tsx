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
import { useMatchRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
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

  return (
    <YStack
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
          count={scarti.data?.total}
        >
          {t('unresolved')}
        </SectionLink>
        <SectionLink
          to="/admin/reported"
          icon={<Flag size={16} />}
          count={segnalazioni.data?.total}
        >
          {t('reported')}
        </SectionLink>
        <SectionLink
          to="/admin/platforms"
          icon={<MonitorX size={16} />}
          count={piattaforme.data?.total}
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

  return (
    <NavItem
      height="auto"
      minH={40}
      py={8}
      shrink={0}
      outlineOffset="focus-visible:-2px"
      href={to}
      active={matchRoute({ to, fuzzy: true }) !== false}
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
