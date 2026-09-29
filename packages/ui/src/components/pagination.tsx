import { Fragment, useId, useState, type ReactNode } from 'react';
import { Text, XStack, styled } from 'tamagui';

import { ChevronLeft, ChevronRight } from '../icons';
import { Input } from './input';
import { Label } from './label';

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
  /** I nomi delle frecce per i lettori di schermo: a vista non hanno testo. */
  previousLabel: string;
  nextLabel: string;
  /**
   * «Vai a pagina»: l'etichetta del campo. Con `onGoTo` accende il campo,
   * senza non c'è.
   */
  goToLabel?: string;
  /** La pagina scritta nel campo, già tenuta fra 1 e l'ultima. */
  onGoTo?: (page: number) => void;
};

/**
 * La paginazione numerata: il backlog, dove «carica altri» non reggeva una
 * libreria da duemila giochi.
 *
 * Ogni pagina è un **link**, non un bottone: la pagina aperta sta nell'URL,
 * quindi «apri in una nuova scheda» e il tasto centrale devono funzionare. Il
 * contenitore è un `nav` col suo nome, e la pagina aperta porta
 * `aria-current="page"`. Precedente e successiva sono solo frecce, col nome
 * in `aria-label`; agli estremi restano a vista ma spente, perché un bottone
 * che sparisce sposta tutti gli altri sotto il mouse. Spente sono nascoste ai
 * lettori di schermo: un link che non c'è non ha niente da dire.
 *
 * Con `goToLabel` e `onGoTo` c'è anche il campo «vai a pagina», per le
 * librerie dove la pagina che si cerca sta dietro l'ellissi.
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
  goToLabel,
  onGoTo,
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
  ) =>
    enabled ? (
      link(target, icon, { 'aria-label': text })
    ) : (
      <PageFrame interactive={false} aria-hidden>
        {icon}
      </PageFrame>
    );

  return (
    // `maxW`: le view di Tamagui non si restringono, e su un telefono il `nav`
    // restava largo quanto il suo contenuto invece di andare a capo — «vai a
    // pagina» usciva dallo schermo.
    <XStack
      render="nav"
      aria-label={label}
      maxW="100%"
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
      )}
      {goToLabel && onGoTo && (
        <GoToPage label={goToLabel} pageCount={pageCount} onGoTo={onGoTo} />
      )}
    </XStack>
  );
}

/**
 * Il campo «vai a pagina»: un numero e Invio.
 *
 * Il numero si tiene fra 1 e l'ultima invece di rifiutarlo: chi scrive 999 su
 * 42 pagine vuole l'ultima, non un errore. Un campo vuoto o non numerico non
 * fa niente. Dopo il salto il campo si svuota: la pagina aperta la dicono già
 * i numeri accanto.
 *
 * Un campo e non un `<form>`: `onSubmitEditing` è l'Invio sul web e il tasto
 * di invio della tastiera su mobile, e il form su React Native non esiste.
 */
function GoToPage({
  label,
  pageCount,
  onGoTo,
}: {
  label: string;
  pageCount: number;
  onGoTo: (page: number) => void;
}) {
  const id = useId();
  const [text, setText] = useState('');

  const go = () => {
    const value = Number.parseInt(text, 10);
    if (Number.isNaN(value)) return;
    onGoTo(Math.min(Math.max(value, 1), pageCount));
    setText('');
  };

  return (
    <XStack items="center" gap={8} ml={8}>
      <Label htmlFor={id} color="$color11" fontWeight="400">
        {label}
      </Label>
      <Input
        id={id}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onSubmitEditing={go}
        inputMode="numeric"
        enterKeyHint="go"
        width={64}
      />
    </XStack>
  );
}
