import { Toast } from '@tamagui/toast';
import type { ToastRootProps } from '@tamagui/toast';
import { Spinner } from 'tamagui';

import { CircleCheck, Info, OctagonX, TriangleAlert } from '../icons';

/**
 * Le notifiche a comparsa: «salvato», «import avviato», «non è riuscito».
 *
 * `toast` ha la stessa API di sonner — `toast`, `toast.success`,
 * `toast.error`, `toast.warning` — ed è globale: le schermate lo chiamano da
 * dove vogliono, e `<Toaster />` si monta una volta sola nel layout.
 * `@tamagui/toast` è fra le dipendenze fissato alla stessa versione del
 * resto, o si porterebbe dietro un secondo core.
 *
 * Il tema lo prende da solo: il toast è un componente Tamagui come gli altri,
 * e sotto il `TamaguiProvider` segue chiaro e scuro.
 */
export { toast } from '@tamagui/toast';

/**
 * Le icone per tipo. Tamagui non ne mette di sue: senza questa mappa un errore
 * e un successo sarebbero lo stesso rettangolo. `loading` è lo Spinner, che
 * gira da sé invece di un'icona da animare.
 */
const icons: ToastRootProps['icons'] = {
  success: <CircleCheck size={16} color="green11" />,
  info: <Info size={16} color="color11" />,
  warning: <TriangleAlert size={16} color="amber11" />,
  error: <OctagonX size={16} color="red11" />,
  loading: <Spinner size="small" color="color11" />,
};

export type ToasterProps = Omit<ToastRootProps, 'children'>;

export function Toaster(props: ToasterProps) {
  return (
    <Toast position="bottom-right" icons={icons} {...props}>
      <Toast.Viewport>
        <Toast.List />
      </Toast.Viewport>
    </Toast>
  );
}
