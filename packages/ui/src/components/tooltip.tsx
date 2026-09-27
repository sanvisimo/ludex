import {
  cloneElement,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type ReactElement,
} from 'react';
import { Paragraph, Tooltip as TooltipBase } from 'tamagui';

export type TooltipProps = {
  /** Il testo del suggerimento. */
  content: string;
  /** Il bottone a cui si attacca: uno solo, e deve poter prendere il focus. */
  children: ReactElement<{
    onFocus?: (event: FocusEvent<HTMLElement>) => void;
    onBlur?: (event: FocusEvent<HTMLElement>) => void;
    onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
  }>;
  /** Da che parte compare. */
  placement?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Il suggerimento al passaggio del mouse o al focus da tastiera: il nome di un
 * bottone di sola icona.
 *
 * **Il focus lo gestisce questo componente**, e non per scelta: il Tooltip di
 * Tamagui 2.7.7 dichiara di aprirsi al focus ma non lo fa, nemmeno su un
 * `<button>` nudo (misurato con la tastiera vera di Playwright). Qui si apre
 * quando il bottone prende il focus **da tastiera** (`:focus-visible`, così un
 * clic non lo accende), si chiude quando lo perde o con Esc. Il passaggio del
 * mouse resta a Tamagui, che quello lo fa bene. Quando Tamagui sistemerà il
 * suo, questo pezzo si toglie.
 *
 * **Non è l'etichetta accessibile.** Un bottone di sola icona porta comunque il
 * suo `aria-label`: il suggerimento è per chi vede, e su un telefono, dove il
 * passaggio del mouse non esiste, non compare affatto.
 */
export function Tooltip({
  content,
  children,
  placement = 'top',
}: TooltipProps) {
  const [open, setOpen] = useState(false);
  const { onFocus, onBlur, onKeyDown } = children.props;

  const trigger = cloneElement(children, {
    onFocus: (event) => {
      onFocus?.(event);
      // Su React Native `matches` non c'è: lì il suggerimento non serve.
      if (event.target.matches?.(':focus-visible')) setOpen(true);
    },
    onBlur: (event) => {
      onBlur?.(event);
      setOpen(false);
    },
    onKeyDown: (event) => {
      onKeyDown?.(event);
      if (event.key === 'Escape') setOpen(false);
    },
  });

  return (
    <TooltipBase
      open={open}
      onOpenChange={setOpen}
      placement={placement}
      delay={{ open: 400, close: 0 }}
    >
      <TooltipBase.Trigger asChild>{trigger}</TooltipBase.Trigger>
      <TooltipBase.Content
        px={8}
        py={4}
        rounded={6}
        bg="$color12"
        transition="quick"
        opacity={1}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      >
        <Paragraph fontSize={12} lineHeight={16} color="$color1">
          {content}
        </Paragraph>
      </TooltipBase.Content>
    </TooltipBase>
  );
}
