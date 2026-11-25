import { useEffect } from 'react';
import { BackHandler } from 'react-native';

// Il tasto indietro di Android non chiude da solo un foglio di Tamagui: senza,
// esce dalla schermata (o dall'app) con il foglio ancora aperto.
export function useBackToClose(open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        close();
        return true;
      },
    );
    return () => subscription.remove();
  }, [open, close]);
}
