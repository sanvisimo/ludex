import { useEffect, useRef, useState, type RefObject } from 'react';

import { reanchorPage } from '@/lib/page-size';

/**
 * Le colonne della griglia del backlog. Una stringa sola, per la griglia vera e
 * per quella che le conta: se divergono, il numero per pagina non corrisponde
 * più a quello che si vede.
 */
export const GRID_TEMPLATE = 'repeat(auto-fill, minmax(152px, 1fr))';

/**
 * Quante colonne ha la griglia, **misurate** dal browser e non ricalcolate: la
 * formula di `auto-fill` rifatta in JavaScript si scollegherebbe dal CSS al
 * primo ritocco.
 *
 * Si misura su un elemento vuoto (`GridProbe`) e non sulla griglia vera, perché
 * questa compare solo con la prima risposta, e la risposta dipende proprio da
 * quanti giochi chiedere. Un contenitore `auto-fill` senza figli ha comunque le
 * sue colonne. `null` finché non si è misurato: chi chiede i giochi aspetta.
 */
export function useGridColumns() {
  const ref = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<number | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const measure = () => {
      const tracks = getComputedStyle(node).gridTemplateColumns;
      setColumns(Math.max(1, tracks.split(' ').filter(Boolean).length));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return { ref, columns };
}

/**
 * L'elemento che si misura: invisibile, senza altezza e fuori dal flusso, così
 * non occupa un posto (né uno spazio fra gli elementi) nella colonna dove sta.
 * Va dentro un contenitore `position: relative` largo come la lista.
 */
export function GridProbe({
  probeRef,
}: {
  probeRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={probeRef}
      aria-hidden
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 0,
        overflow: 'hidden',
        visibility: 'hidden',
        display: 'grid',
        gridTemplateColumns: GRID_TEMPLATE,
        gap: 12,
      }}
    />
  );
}

/**
 * Quando il numero per pagina cambia **da solo** — le colonne sono cambiate
 * perché la finestra si è allargata, o perché si è cambiata vista — porta la
 * pagina a quella che tiene in vista il primo gioco di prima. Senza, la pagina 3
 * da 14 e la pagina 3 da 15 mostrano giochi diversi.
 *
 * Aspetta `ready`: finché le colonne non sono misurate il numero è provvisorio,
 * e passare da quello a quello vero non è un cambiamento di chi guarda. Una
 * scelta dal menu non passa di qui: riporta già a pagina 1, e da 1 non si sposta.
 * Costa una richiesta in più, quella con la pagina vecchia e il numero nuovo,
 * prima di quella giusta: capita ridimensionando, non a ogni apertura.
 */
export function useReanchorPage({
  size,
  ready,
  page,
  onChange,
}: {
  size: number;
  ready: boolean;
  page: number;
  onChange: (page: number) => void;
}) {
  const previous = useRef<number | null>(null);
  // Gli ultimi valori senza farli entrare fra le dipendenze: l'effetto deve
  // partire quando cambia il numero, non quando cambia la pagina.
  const latest = useRef({ page, onChange });
  useEffect(() => {
    latest.current = { page, onChange };
  });

  useEffect(() => {
    if (!ready) return;
    const before = previous.current;
    previous.current = size;
    if (before === null || before === size) return;
    const next = reanchorPage(latest.current.page, before, size);
    if (next !== latest.current.page) latest.current.onChange(next);
  }, [size, ready]);
}
