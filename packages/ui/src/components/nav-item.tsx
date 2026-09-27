import type { ReactNode } from 'react';
import { Text, XStack, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

const NavItemFrame = styled(XStack, {
  name: 'NavItem',

  height: 36,
  px: 12,
  gap: 10,
  items: 'center',
  rounded: 8,
  cursor: 'pointer',

  hoverStyle: { bg: '$color4' },
  pressStyle: { bg: '$color5' },

  // Come sul Button: l'anello solo da tastiera.
  focusVisibleStyle: {
    outlineColor: '$outlineColor',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: 2,
  },

  variants: {
    active: {
      true: {
        bg: '$color5',
        hoverStyle: { bg: '$color5' },
      },
    },
  } as const,
});

const NavItemText = styled(Text, {
  name: 'NavItemText',

  fontSize: 14,
  lineHeight: 20,
  color: '$color11',

  variants: {
    active: {
      true: { color: '$color12', fontWeight: '500' },
    },
  } as const,
});

export type NavItemProps = Omit<
  GetProps<typeof NavItemFrame>,
  'active' | 'children'
> & {
  /** Dove porta: sul web diventa un `<a href>` vero. */
  href: string;
  /** La pagina in cui si è: evidenziata, e `aria-current="page"`. */
  active?: boolean;
  /** L'icona, già della misura giusta (16). */
  icon?: ReactNode;
  children: string;
};

/**
 * Una voce della navigazione: icona, etichetta, e quale pagina è aperta.
 *
 * **Non conosce il router**, e non può: `@repo/ui` gira anche su React Native.
 * Sul web è un `<a href>` vero — il tasto centrale e «apri in una nuova
 * scheda» funzionano — e la navigazione dentro l'app la fa chi lo monta,
 * intercettando il clic come fa `ButtonLink` in `apps/web`.
 */
export function NavItem({
  href,
  active = false,
  icon,
  children,
  ...props
}: NavItemProps) {
  return (
    <NavItemFrame
      render="a"
      // `href`, `aria-current` e il testo senza sottolineatura arrivano
      // all'`<a>`, ma i tipi della view non li conoscono: sono quelli di un
      // contenitore, anche quando è reso come link.
      {...({
        href,
        'aria-current': active ? 'page' : undefined,
        style: { textDecoration: 'none' },
      } as object)}
      active={active}
      {...props}
    >
      {icon}
      <NavItemText active={active}>{children}</NavItemText>
    </NavItemFrame>
  );
}
