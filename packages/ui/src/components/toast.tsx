import { Toaster as ToasterBase } from '@tamagui/toast/v2';
import type { ToasterProps } from '@tamagui/toast/v2';
import { Spinner } from 'tamagui';

import { CircleCheck, Info, OctagonX, TriangleAlert } from '../icons';

/**
 * Le notifiche a comparsa: «salvato», «import avviato», «non è riuscito».
 *
 * È il toast **v2** di Tamagui, che ha la stessa API di sonner — `toast`,
 * `toast.success`, `toast.error`, `toast.warning` e un `<Toaster />` montato
 * una volta nel layout — quindi le quattordici schermate che lo usano
 * cambiano l'import e nient'altro. Sta in `@tamagui/toast/v2`, che il
 * pacchetto `tamagui` non riesporta (dà solo la vecchia API a controller):
 * per questo `@tamagui/toast` è fra le dipendenze, fissato alla stessa
 * versione del resto, o si porterebbe dietro un secondo core.
 *
 * Il tema lo prende da solo: il toast è un componente Tamagui come gli altri,
 * e sotto il `TamaguiProvider` segue chiaro e scuro senza che `next-themes`
 * glielo dica, come faceva invece il Toaster di prima.
 */
export { toast } from '@tamagui/toast/v2';

/**
 * Le icone per tipo, come quelle di prima. Tamagui non ne mette di sue: senza
 * questa mappa un errore e un successo sarebbero lo stesso rettangolo.
 * `loading` è lo Spinner, che gira da sé invece di un'icona da animare.
 */
const icons: ToasterProps['icons'] = {
  success: <CircleCheck size={16} color="$green11" />,
  info: <Info size={16} color="$color11" />,
  warning: <TriangleAlert size={16} color="$amber11" />,
  error: <OctagonX size={16} color="$red11" />,
  loading: <Spinner size="small" color="$color11" />,
};

export function Toaster(props: ToasterProps) {
  return <ToasterBase position="bottom-right" icons={icons} {...props} />;
}

export type { ToasterProps };
