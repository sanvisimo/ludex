import { Badge, type BadgeProps } from '@repo/ui';
import { useRouter } from '@tanstack/react-router';

import { takeLinkClick } from '@/src/link-click';

/**
 * Un badge che porta a un'altra pagina: `<a href>` vero, navigazione del
 * router. È il `ButtonLink` dei badge, e per la stessa ragione sta qui e non in
 * `@repo/ui`: conosce il router.
 *
 * Non va dentro un altro link: nelle card di `/backlog` i badge stanno nel
 * link della card, e lì restano semplici.
 */
export function BadgeLink({
  href,
  ...props
}: Omit<BadgeProps, 'render' | 'onPress'> & { href: string }) {
  const router = useRouter();

  return (
    <Badge
      {...props}
      render="a"
      // Come in `ButtonLink`: `href` arriva all'`<a>`, ma i tipi della view
      // non lo conoscono.
      {...({
        href,
        style: { textDecoration: 'none' },
      } as object)}
      cursor="pointer"
      hoverStyle={{ borderColor: '$color11' }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: 2,
      }}
      onClick={(event) => {
        if (takeLinkClick(event)) void router.navigate({ href });
      }}
    />
  );
}
