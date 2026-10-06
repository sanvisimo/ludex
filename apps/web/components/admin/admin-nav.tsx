import { NavItem, YStack } from '@repo/ui';
import { Database, Gamepad2, Inbox, Users } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { useMatchRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { api } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';

type AdminSection =
  | '/admin/mancanti'
  | '/admin/scarti'
  | '/admin/giochi'
  | '/admin/utenti';

/**
 * Il menu delle sezioni admin, con la stessa forma di quello dell'account:
 * una colonna da `$md`, una riga che scorre sotto.
 *
 * I numeri dicono dove c'è lavoro: le chiavi degli scarti ancora da
 * sistemare e le segnalazioni aperte. Una riga sola per lista: serve il
 * totale, non l'elenco.
 */
export function AdminNav() {
  const t = useTranslations('admin.nav');
  const scarti = useQuery(
    api.admin.unresolved.list.queryOptions({ input: { limit: 1 } }),
  );
  const segnalazioni = useQuery(
    api.admin.reports.list.queryOptions({ input: { limit: 1 } }),
  );

  return (
    <YStack
      render="nav"
      aria-label={t('label')}
      width={200}
      shrink={0}
      gap={4}
      $max-md={{ width: '100%', flexDirection: 'row' }}
      {...({
        style: {
          overflowX: 'auto',
          overflowY: 'hidden',
          scrollbarWidth: 'none',
        },
      } as object)}
    >
      <SectionLink to="/admin/mancanti" icon={<Database size={16} />}>
        {t('missing')}
      </SectionLink>
      <SectionLink
        to="/admin/scarti"
        icon={<Inbox size={16} />}
        count={scarti.data?.total}
      >
        {t('unresolved')}
      </SectionLink>
      <SectionLink
        to="/admin/giochi"
        icon={<Gamepad2 size={16} />}
        count={segnalazioni.data?.total}
      >
        {t('games')}
      </SectionLink>
      <SectionLink to="/admin/utenti" icon={<Users size={16} />}>
        {t('users')}
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
  to: AdminSection;
  icon: ReactNode;
  count?: number;
  children: string;
}) {
  const router = useRouter();
  const matchRoute = useMatchRoute();

  return (
    <NavItem
      href={to}
      // `fuzzy`: la scheda di un gioco (`/admin/giochi/toki`) accende Giochi.
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
