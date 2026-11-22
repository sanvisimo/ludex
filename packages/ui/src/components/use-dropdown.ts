import { useEffect, useRef } from 'react';
import { usePopperContext } from 'tamagui';
import type { TamaguiElement } from 'tamagui';

/**
 * Il comportamento che una tendina ancorata a un campo deve avere sul web
 * col dito, oltre che col mouse. Va sul `PopperContent` (`ref`), dentro il
 * `Popper` del campo. Due cose che Tamagui da solo non fa:
 *
 * - **un tocco su una voce non porta via il fuoco al campo**. Con
 *   `onMouseDown` di Tamagui non basta: lo collega al `touchstart`, dove il
 *   listener è passivo e `preventDefault` non vale, e ignora il `mousedown`
 *   che il browser emula dopo il tocco. Il campo perdeva il fuoco e chiudeva
 *   la tendina prima che il clic arrivasse alla voce. Serve un listener
 *   nativo.
 * - **la posizione segue la tastiera del telefono**. La tastiera restringe
 *   solo il viewport visuale, e l'aggiornamento automatico del Popper non lo
 *   ascolta: una tendina aperta prima che la tastiera salga restava sotto
 *   il campo, coperta.
 */
export function useDropdown() {
  const ref = useRef<TamaguiElement | null>(null);
  const { update } = usePopperContext();

  useEffect(() => {
    const node = ref.current;
    if (typeof HTMLElement === 'undefined' || !(node instanceof HTMLElement)) {
      return;
    }
    const keepFocus = (event: MouseEvent) => event.preventDefault();
    const viewport = window.visualViewport;
    node.addEventListener('mousedown', keepFocus);
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    return () => {
      node.removeEventListener('mousedown', keepFocus);
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
    };
  }, [update]);

  return ref;
}

/**
 * L'altezza massima della lista: quella voluta, ma non oltre lo spazio che
 * resta fra il campo e il bordo, tastiera esclusa. Il Popper lo scrive in una
 * variabile sulla tendina; i 10 px sono padding e bordo della tendina.
 */
export function dropdownMaxHeight(max: number) {
  return `min(${max}px, calc(var(--tamagui-popper-available-height, ${max + 10}px) - 10px))`;
}
