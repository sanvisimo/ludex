import { Fragment, type ReactNode } from 'react';
import { Text, XStack, styled } from 'tamagui';

import { ChevronLeft, ChevronRight } from '../icons';

/**
 * Le pagine da mostrare: la prima, l'ultima, quella aperta con le due
 * vicine, e `null` dove ne mancano. Un buco di una pagina sola si riempie con
 * la pagina, perché «…» al posto di un numero solo occupa lo stesso spazio e
 * dice meno.
 *
 *     pageRange(1, 40)  → 1 2 3 … 40
 *     pageRange(20, 40) → 1 … 19 20 21 … 40
 */
export function pageRange(page: number, count: number): (number | null)[] {
  const wanted = new Set(
    [1, page - 1, page, page + 1, count].filter((n) => n >= 1 && n <= count),
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  const range: (number | null)[] = [];
  for (const n of sorted) {
    const last = range.at(-1);
    if (typeof last === 'number' && n - last === 2) range.push(last + 1);
    else if (typeof last === 'number' && n - last > 2) range.push(null);
    range.push(n);
  }
  return range;
}

const PageFrame = styled(XStack, {
  name: 'PaginationItem',

  height: 32,
  minW: 32,
  px: 8,
  gap: 4,
  items: 'center',
  justify: 'center',
  rounded: 8,

  variants: {
    interactive: {
      true: {
        cursor: 'pointer',
        hoverStyle: { bg: '$color4' },
        pressStyle: { bg: '$color5' },
        focusVisibleStyle: {
          outlineColor: '$outlineColor',
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineOffset: 2,
        },
      },
      false: { opacity: 0.5 },
    },
    current: {
      true: {
        bg: '$color6',
        hoverStyle: { bg: '$color6' },
      },
    },
  } as const,
});

const PageText = styled(Text, {
  name: 'PaginationText',
  fontSize: 14,
  lineHeight: 20,
  color: '$color11',

  variants: {
    current: {
      true: { color: '$color12', fontWeight: '500' },
    },
  } as const,
});

export type PaginationProps = {
  /** La pagina aperta, da 1. */
  page: number;
  pageCount: number;
  /** Dove porta ogni pagina: sul web diventa un `<a href>` vero. */
  href: (page: number) => string;
  /**
   * Il clic su una pagina. È qui che l'app prende la navigazione per sé,
   * come fa con `NavItem`: `@repo/ui` non conosce il router.
   */
  onNavigate?: (page: number, event: unknown) => void;
  /** Il nome della navigazione: «Pagine». */
  label: string;
  previousLabel: string;
  nextLabel: string;
};

/**
 * La paginazione numerata: il backlog, dove «carica altri» non reggeva una
 * libreria da duemila giochi.
 *
 * Ogni pagina è un **link**, non un bottone: la pagina aperta sta nell'URL,
 * quindi «apri in una nuova scheda» e il tasto centrale devono funzionare. Il
 * contenitore è un `nav` col suo nome, e la pagina aperta porta
 * `aria-current="page"`. Precedente e successiva, agli estremi, restano a
 * vista ma spente: un bottone che sparisce sposta tutti gli altri sotto il
 * mouse.
 *
 * Con una pagina sola non disegna niente.
 */
export function Pagination({
  page,
  pageCount,
  href,
  onNavigate,
  label,
  previousLabel,
  nextLabel,
}: PaginationProps) {
  if (pageCount <= 1) return null;

  const link = (target: number, content: ReactNode, extra: object = {}) => (
    <PageFrame
      render="a"
      interactive
      current={target === page}
      {...({
        href: href(target),
        style: { textDecoration: 'none' },
        ...extra,
      } as object)}
      onClick={(event) => onNavigate?.(target, event)}
    >
      {content}
    </PageFrame>
  );

  const edge = (
    target: number,
    enabled: boolean,
    text: string,
    icon: ReactNode,
    iconFirst: boolean,
  ) => {
    const content = (
      <>
        {iconFirst && icon}
        <PageText>{text}</PageText>
        {!iconFirst && icon}
      </>
    );
    return enabled ? (
      link(target, content)
    ) : (
      <PageFrame interactive={false} aria-disabled>
        {content}
      </PageFrame>
    );
  };

  return (
    <XStack
      render="nav"
      aria-label={label}
      gap={4}
      items="center"
      flexWrap="wrap"
      justify="center"
      self="center"
    >
      {edge(
        page - 1,
        page > 1,
        previousLabel,
        <ChevronLeft size={16} color="$color11" />,
        true,
      )}
      {pageRange(page, pageCount).map((n, index) =>
        n === null ? (
          <PageFrame key={`gap-${index}`} aria-hidden>
            <PageText>…</PageText>
          </PageFrame>
        ) : (
          <Fragment key={n}>
            {link(n, <PageText current={n === page}>{n}</PageText>, {
              'aria-current': n === page ? 'page' : undefined,
            })}
          </Fragment>
        ),
      )}
      {edge(
        page + 1,
        page < pageCount,
        nextLabel,
        <ChevronRight size={16} color="$color11" />,
        false,
      )}
    </XStack>
  );
}
