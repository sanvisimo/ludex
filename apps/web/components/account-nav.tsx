import { NavItem, YStack } from '@repo/ui';
import { EyeOff, Library, ListChecks, User } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useMatchRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { api } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

type AccountSection =
  | '/account/profile'
  | '/account/libraries'
  | '/account/needs-attention'
  | '/account/hidden';

export function useAccountCounts() {
  const { data } = useQuery(api.imports.counts.queryOptions());
  return { toFix: data?.toFix, hidden: data?.hidden };
}

export function AccountNav() {
  const t = useTranslations('account.nav');
  const { toFix, hidden } = useAccountCounts();

  return (
    <YStack
      render="nav"
      aria-label={t('label')}
      width={200}
      shrink={0}
      gap={4}
      $max-md={{ width: '100%', flexDirection: 'row' }}
      // Sul telefono la riga scorre, e **senza barra**: `overflow: scroll` su
      // Windows disegna sempre i nastri grigi, anche quando non servono. Su
      // desktop, in colonna, non c'è niente che sfori e lo stile non fa niente.
      {...({
        style: {
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        },
      } as object)}
    >
      <SectionLink to="/account/profile" icon={<User size={16} />}>
        {t('profile')}
      </SectionLink>
      <SectionLink to="/account/libraries" icon={<Library size={16} />}>
        {t('libraries')}
      </SectionLink>
      <SectionLink
        to="/account/needs-attention"
        icon={<ListChecks size={16} />}
        count={toFix}
      >
        {t('toFix')}
      </SectionLink>
      <SectionLink
        to="/account/hidden"
        icon={<EyeOff size={16} />}
        count={hidden}
      >
        {t('hidden')}
      </SectionLink>
    </YStack>
  );
}

function SectionLink({
  to,
  icon,
  count,
  children,
}: {
  to: AccountSection;
  icon: ReactNode;
  count?: number;
  children: string;
}) {
  const router = useRouter();
  const matchRoute = useMatchRoute();

  return (
    <NavItem
      href={to}
      active={matchRoute({ to }) !== false}
      icon={icon}
      // Zero non si scrive: il numero serve a dire che c'è qualcosa.
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
