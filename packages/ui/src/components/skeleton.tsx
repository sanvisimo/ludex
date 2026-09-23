import { useEffect, useState } from 'react';
import { View, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

const SkeletonFrame = styled(View, {
  name: 'Skeleton',

  bg: '$color4',
  rounded: 6,
  transition: 'superLazy',
});

export type SkeletonProps = GetProps<typeof SkeletonFrame>;

/** Metà del ciclo di pulsazione: 1 → 0.5 → 1 in due secondi, come `animate-pulse`. */
const HALF_CYCLE_MS = 1000;

function prefersReducedMotion() {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/**
 * Il segnaposto mentre i dati arrivano. Le misure le decide chi lo usa
 * (`height`, `width`, `rounded`): uno scheletro vale solo se ha la forma di
 * ciò che sostituisce.
 *
 * La pulsazione è un'opacità che si alterna, con la transizione del driver
 * CSS: `animate-pulse` era un `@keyframes`, che su React Native non esiste.
 * Chi ha chiesto meno movimento al sistema la vede ferma.
 */
export function Skeleton(props: SkeletonProps) {
  const [dim, setDim] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const id = setInterval(() => setDim((d) => !d), HALF_CYCLE_MS);
    return () => clearInterval(id);
  }, []);

  return <SkeletonFrame aria-hidden opacity={dim ? 0.5 : 1} {...props} />;
}
