import { FocusScope } from '@tamagui/focus-scope';
import { useEffect, type ReactNode } from 'react';
import { Sheet as SheetBase, YStack } from 'tamagui';

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il nome del foglio per i lettori di schermo: «Navigazione», «Filtri». */
  label: string;
  children: ReactNode;
};

/**
 * Il foglio che sale dal basso: la navigazione sulle finestre strette del web,
 * e domani il pannello dei filtri.
 *
 * È lo stesso foglio che il Select apre su un dispositivo touch, qui usato da
 * solo. Alto quanto il contenuto (`snapPointsMode="fit"`), si chiude
 * trascinandolo giù, toccando il velo o con Esc.
 *
 * Il foglio di Tamagui è solo un pannello che scorre: il comportamento da
 * dialogo modale lo aggiunge questo componente, ed è misurato in Storybook.
 *
 * - **Esc lo chiude.** Tamagui non lo ascolta, e un dialogo modale che la
 *   tastiera non sa chiudere è una trappola. Solo dove c'è `document`, cioè
 *   sul web: su un telefono si chiude col gesto.
 * - **Il focus entra, resta dentro ed esce dove era**: `FocusScope`, lo
 *   stesso che usa il Dialog. Senza, all'apertura restava sul bottone dietro
 *   il velo.
 * - **Da chiuso non c'è** (`unmountChildrenWhenHidden`): Tamagui lo lascerebbe
 *   montato fuori schermo, con i suoi link ancora raggiungibili col Tab.
 *
 * Tamagui non gli dà un ruolo: `role="dialog"` e `aria-modal` li mette questo
 * componente, e il nome lo decide chi lo apre, perché è l'app a sapere che
 * cosa c'è dentro. Stanno su un contenitore **dentro** il `Frame` e non sul
 * `Frame`: Tamagui ne copia le prop sulla copertura vuota che mette sotto il
 * foglio, e i dialoghi con quel nome sarebbero diventati due.
 */
export function Sheet({ open, onOpenChange, label, children }: SheetProps) {
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  return (
    <SheetBase
      modal
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      snapPointsMode="fit"
      unmountChildrenWhenHidden
    >
      <SheetBase.Overlay
        bg="$shadow6"
        transition="quick"
        enterStyle={{ opacity: 0 }}
        exitStyle={{ opacity: 0 }}
      />
      <SheetBase.Handle bg="$color8" />
      <SheetBase.Frame
        p={16}
        bg="$color2"
        borderTopLeftRadius={16}
        borderTopRightRadius={16}
      >
        <FocusScope trapped loop enabled={open}>
          {/* `tabIndex={-1}`: all'apertura `FocusScope` salta i link e, se non
              trova altro, porta il focus sul contenitore — che deve poterlo
              prendere, o il focus resterebbe dietro il velo. */}
          <YStack
            role="dialog"
            aria-modal
            aria-label={label}
            tabIndex={-1}
            gap={8}
          >
            {children}
          </YStack>
        </FocusScope>
      </SheetBase.Frame>
    </SheetBase>
  );
}
