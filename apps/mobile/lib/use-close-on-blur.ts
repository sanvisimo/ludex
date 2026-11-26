import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

// I fogli di Tamagui stanno in un portale sopra tutte le schermate: uno
// lasciato aperto resterebbe a galla cambiando tab o aprendo un'altra pagina.
// Lasciando la schermata, si chiudono.
export function useCloseOnBlur(close: () => void) {
  useFocusEffect(
    useCallback(
      () => () => {
        close();
      },
      // `close` cambia a ogni render; serve solo quella dell'ultima uscita.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    ),
  );
}
