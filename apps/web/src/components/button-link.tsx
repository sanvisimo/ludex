import { Button, type ButtonProps } from '@repo/ui';
import { useRouter } from '@tanstack/react-router';

import { takeLinkClick } from '@/src/link-click';

/**
 * Un bottone che porta a un'altra pagina: `<a href>` vero, navigazione del
 * router.
 *
 * Con shadcn era `<Button render={<Link />}>`. Su Tamagui quella forma non
 * regge: il nostro `Button` è uno `styled()` sopra il Button di Tamagui, e un
 * `render` con un **componente** (non un tag) lo intercetta il livello esterno,
 * che passa a `Link` le props di stile grezze invece delle classi. Il link esce
 * nudo e React si lamenta di `borderWidth` sul DOM. Con un tag, `render="a"`,
 * le classi arrivano.
 *
 * Quindi l'`<a>` lo disegna Tamagui e la navigazione la fa il router, con la
 * stessa regola sui modificatori di `Link` (vedi `takeLinkClick`).
 *
 * Sta qui e non in `@repo/ui` perché conosce il router, che il design system
 * non deve importare. `href` è una stringa e non una rotta tipizzata: il router
 * la accetta così com'è, e un bottone porta anche a indirizzi con la query.
 */
export function ButtonLink({
  href,
  ...props
}: Omit<ButtonProps, 'render' | 'onPress'> & { href: string }) {
  const router = useRouter();

  return (
    <Button
      {...props}
      render="a"
      // `href` arriva all'`<a>`, ma i tipi del Button non lo conoscono: sono
      // quelli di un bottone, anche quando è reso come link.
      {...({ href } as object)}
      onClick={(event) => {
        if (takeLinkClick(event)) void router.navigate({ href });
      }}
    />
  );
}
