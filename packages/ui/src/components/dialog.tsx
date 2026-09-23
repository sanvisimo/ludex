import type { ReactElement } from 'react';
import { Dialog as DialogBase, XStack, YStack, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

import { X } from '../icons';
import { Button } from './button';

/**
 * La finestra modale: aggiungi gioco, modifica, rimuovi, scollega, risolvi
 * uno scarto.
 *
 * Sotto c'è il Dialog di Tamagui, che fa la parte difficile e invisibile:
 * focus intrappolato dentro, Esc per chiudere, `aria-labelledby` dal titolo,
 * lo scorrimento della pagina bloccato. Qui si decide l'aspetto e si tengono i
 * nomi di prima: `Dialog`, `DialogTrigger`, `DialogContent`, `DialogHeader`,
 * `DialogFooter`, `DialogTitle`, `DialogDescription`, `DialogClose`.
 */
export { Dialog } from 'tamagui';

/**
 * Il bottone che apre. `render` è la prop di Base UI che le schermate già
 * usano (`render={<Button>…</Button>}`); qui diventa l'`asChild` di Tamagui,
 * così quella riga resta com'è.
 */
export function DialogTrigger({ render }: { render: ReactElement }) {
  return <DialogBase.Trigger asChild>{render}</DialogBase.Trigger>;
}

/** Chiude la finestra; come il trigger, avvolge il bottone che gli si passa. */
export function DialogClose({ render }: { render: ReactElement }) {
  return <DialogBase.Close asChild>{render}</DialogBase.Close>;
}

type DialogContentProps = GetProps<typeof DialogBase.Content> & {
  /** La x in alto a destra. C'è di serie, come prima. */
  showCloseButton?: boolean;
  /** L'etichetta della x per i lettori di schermo: il testo lo decide l'app. */
  closeLabel?: string;
};

/**
 * Il pannello, con il suo velo e il suo portale. La larghezza massima di
 * serie è 384 (lo `sm:max-w-sm` di prima); le finestre più larghe la
 * cambiano con `maxW`, dove prima scrivevano `sm:max-w-xl`.
 */
export function DialogContent({
  children,
  showCloseButton = true,
  closeLabel = 'Close',
  ...props
}: DialogContentProps) {
  return (
    <DialogBase.Portal>
      <DialogBase.Overlay
        key="overlay"
        bg="$shadow6"
        transition="quick"
        opacity={1}
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <DialogBase.Content
        key="content"
        width="100%"
        maxW={384}
        mx={16}
        p={16}
        gap={16}
        rounded={12}
        bg="$color2"
        borderWidth={1}
        borderColor="$borderColor"
        transition="quick"
        opacity={1}
        scale={1}
        enterStyle={{ opacity: 0, scale: 0.95 }}
        exitStyle={{ opacity: 0, scale: 0.95 }}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogBase.Close asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              position="absolute"
              t={8}
              r={8}
              aria-label={closeLabel}
            >
              <X size={16} />
            </Button>
          </DialogBase.Close>
        )}
      </DialogBase.Content>
    </DialogBase.Portal>
  );
}

export const DialogHeader = styled(YStack, {
  name: 'DialogHeader',

  gap: 8,
  // Lo spazio per la x, o un titolo lungo ci finirebbe sotto.
  pr: 24,
});

/**
 * La fascia dei bottoni, attaccata al fondo del pannello: esce dal suo
 * padding (`mx`, `mb` negativi) per arrivare ai bordi. Su schermi stretti i
 * bottoni vanno in colonna, e il primario — che si scrive per ultimo — resta
 * in alto, sotto il pollice.
 */
export const DialogFooter = styled(XStack, {
  name: 'DialogFooter',

  mx: -16,
  mb: -16,
  p: 16,
  gap: 8,
  justify: 'flex-end',
  borderTopWidth: 1,
  borderColor: '$borderColor',
  bg: '$color3',

  '$max-sm': {
    flexDirection: 'column-reverse',
  },
});

export const DialogTitle = styled(DialogBase.Title, {
  name: 'DialogTitle',

  fontSize: 16,
  lineHeight: 20,
  fontWeight: '500',
  color: '$color12',
});

export const DialogDescription = styled(DialogBase.Description, {
  name: 'DialogDescription',

  fontSize: 14,
  lineHeight: 20,
  color: '$color11',
});

export type DialogProps = GetProps<typeof DialogBase>;
export type { DialogContentProps };
