import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing } from 'react-native';

import { LoaderCircle } from '../icons';
import type { SpinnerProps } from './spinner-props';

export type { SpinnerProps } from './spinner-props';

/**
 * Fa girare ciò che contiene: l'icona «aggiorna» mentre un account importa, o
 * il cerchio di caricamento da solo.
 *
 * **Questa è la versione React Native**, con `Animated` e il driver nativo; la
 * versione web è `spinner.tsx`, una rotazione CSS. Le due sono separate perché
 * `Animated` non si può importare sul web — il rendering lato server di Vite si
 * rompe — e un `@keyframes` qui non esiste. Metro sceglie questo file da solo.
 *
 * **Non è provato.** `apps/mobile` è ancora uno scheletro, e questo file non è
 * mai girato su un telefono: l'API è quella documentata di `Animated`, e
 * lo si guarda la prima volta che una schermata mobile lo monta.
 *
 * Chi ha chiesto meno movimento al sistema lo vede fermo.
 *
 * È **decorativo**: il nome di ciò che sta succedendo lo porta chi lo usa.
 */
export function Spinner({
  spinning = true,
  children,
  duration = 1000,
}: SpinnerProps) {
  // Un solo valore per tutta la vita del componente: va da 0 a 1 e ricomincia.
  const turn = useRef(new Animated.Value(0)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (alive) setReduceMotion(value);
    });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    turn.setValue(0);
    if (!spinning || reduceMotion) return;

    const loop = Animated.loop(
      Animated.timing(turn, {
        toValue: 1,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spinning, reduceMotion, duration, turn]);

  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      {children ?? <LoaderCircle size={16} color="$color11" />}
    </Animated.View>
  );
}
