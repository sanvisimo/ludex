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

/**
 * I numeri accanto alle voci: quante cose aspettano in «da sistemare», e
 * quante ne hai tolte dalla vista.
 *
 * Nascosti conta **due mucchi insieme**, le voci d'import e i giochi nascosti
 * dal backlog, perché la sezione li mostra insieme. Prima che arrivino i dati
 * il numero è `undefined` e la voce resta senza: uno zero lampeggiante direbbe
 * «non c'è niente» a chi ha ventisei voci da guardare.
 */
export function useAccountCounts() {
  const unresolved = useQuery(api.imports.unresolved.queryOptions());
  // Una riga sola: serve il totale, non l'elenco.
  const hiddenGames = useQuery(
    api.backlog.list.queryOptions({ input: { hidden: true, limit: 1 } }),
  );

  const rows = unresolved.data;
  const toFix = rows?.filter((entry) => entry.hiddenKind === null).length;
  const hiddenEntries = rows?.filter((entry) => entry.hiddenKind !== null);
  const hidden =
    hiddenEntries && hiddenGames.data
      ? hiddenEntries.length + hiddenGames.data.total
      : undefined;

  return { toFix, hidden };
}

/**
 * Il menu delle sezioni dell'account: una colonna a sinistra da `$md`, una riga
 * che scorre sotto, dove una colonna mangerebbe lo schermo.
 *
 * Una struttura sola e le due forme le sceglie il CSS, su un `YStack` — non su
 * `NavItem`, che è di `@repo/ui` e una media query lì si risolve a runtime —
 * come fa il guscio. Le voci sono link veri e la navigazione la fa il router.
 */
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
