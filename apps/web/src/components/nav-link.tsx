import { NavItem } from '@repo/ui';
import { useMatchRoute, useRouter } from '@tanstack/react-router';
import type { ReactNode } from 'react';

import { takeLinkClick } from '@/src/link-click';

/** Le pagine che la barra conosce. */
export type NavTarget = '/' | '/backlog' | '/account';

/**
 * Una voce della barra, legata al router: `NavItem` di `@repo/ui` non lo
 * conosce, e qui gli si dice dov'è attivo e come si naviga.
 *
 * Il catalogo è attivo solo su `/` esatto, o lo sarebbe su ogni pagina; le
 * altre anche sotto di sé. La pagina di un gioco non accende nessuna voce: ci
 * si arriva dal catalogo come dal backlog, e scegliere sarebbe mentire.
 */
export function NavLink({
  to,
  icon,
  children,
  onNavigate,
}: {
  to: NavTarget;
  icon: ReactNode;
  children: string;
  /** Dopo la navigazione: il foglio sulle finestre strette si chiude. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const matchRoute = useMatchRoute();
  const active = matchRoute({ to, fuzzy: to !== '/' }) !== false;

  return (
    <NavItem
      href={to}
      active={active}
      icon={icon}
      onClick={(event) => {
        if (!takeLinkClick(event)) return;
        void router.navigate({ to });
        onNavigate?.();
      }}
    >
      {children}
    </NavItem>
  );
}
