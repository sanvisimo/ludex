import type { ReactNode } from 'react';

export type SpinnerProps = {
  /** Gira finché è vero; falso lo rimette fermo, com'era. */
  spinning?: boolean;
  /** Ciò che gira: di solito un'icona, già della misura giusta. Senza, un cerchio. */
  children?: ReactNode;
  /** Quanto dura un giro, in millisecondi. */
  duration?: number;
};
