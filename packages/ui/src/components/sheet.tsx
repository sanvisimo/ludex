import { useEffect, useRef, type ReactNode } from 'react';
import { Sheet as SheetBase, YStack, type TamaguiElement } from 'tamagui';

export type SheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il nome del foglio per i lettori di schermo: «Navigazione», «Filtri». */
  label: string;
  children: ReactNode;
};

/**
 * Il foglio che sale dal basso: la navigazione sulle finestre strette del web.
 * I filtri del backlog, lunghi più dello schermo, stanno nel `Drawer`.
 *
 * È lo stesso foglio che il Select apre su un dispositivo touch, qui usato da
 * solo. Alto quanto il contenuto (`snapPointsMode="fit"`), si chiude
 * trascinandolo giù, toccando il velo o con Esc.
 *
 * Da modale lo Sheet di Tamagui 3 è già un dialogo: `role="dialog"`,
 * `aria-modal`, Esc che lo chiude sul web, il focus che resta dentro e torna
 * dove era. Questo componente aggiunge due cose, misurate in Storybook:
 *
 * - **Il focus entra.** All'apertura il `FocusScope` di Tamagui lo darebbe al
 *   suo involucro `display: contents`, che non lo prende, e resterebbe sul
 *   bottone dietro il velo: lo sposta questo componente, sul foglio
 *   (`tabIndex={-1}`).
 * - **Da chiuso non c'è** (`unmountChildrenWhenHidden`): Tamagui lo lascerebbe
 *   montato fuori schermo, con i suoi link ancora raggiungibili col Tab.
 *
 * Il nome lo decide chi apre il foglio, perché è l'app a sapere che cosa c'è
 * dentro.
 */
export function Sheet({ open, onOpenChange, label, children }: SheetProps) {
  const container = useRef<TamaguiElement>(null);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      (container.current as HTMLElement | null)?.focus?.(),
    );
    return () => cancelAnimationFrame(frame);
  }, [open]);

  return (
    <SheetBase
      modal
      aria-label={label}
      open={open}
      onOpenChange={onOpenChange}
      dismissOnSnapToBottom
      snapPointsMode="fit"
      unmountChildrenWhenHidden
    >
      <SheetBase.Overlay
        bg="shadow6"
        transition="quick"
        opacity="enter:0 exit:0"
      />
      <SheetBase.Handle bg="color8" />
      <SheetBase.Container ref={container} p={16} tabIndex={-1}>
        <SheetBase.Background
          bg="color2"
          borderTopLeftRadius={16}
          borderTopRightRadius={16}
        />
        <YStack gap={8}>{children}</YStack>
      </SheetBase.Container>
    </SheetBase>
  );
}
