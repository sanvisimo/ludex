import type { ReactElement } from 'react';
import { Paragraph, Tooltip as TooltipBase } from 'tamagui';

export type TooltipProps = {
  /** Il testo del suggerimento. */
  content: string;
  /** Il bottone a cui si attacca: uno solo, e deve poter prendere il focus. */
  children: ReactElement;
  /** Da che parte compare. */
  placement?: 'top' | 'right' | 'bottom' | 'left';
};

/**
 * Il suggerimento al passaggio del mouse o al focus da tastiera: il nome di un
 * bottone di sola icona, o di una voce della barra quando è chiusa.
 *
 * Al focus compare solo se è `:focus-visible`, cioè dalla tastiera e non dopo
 * un clic: è il default di Tamagui, e va bene così.
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
  return (
    <TooltipBase placement={placement} delay={{ open: 400, close: 0 }}>
      <TooltipBase.Trigger asChild>{children}</TooltipBase.Trigger>
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
