import { useEffect, useState, type ReactNode } from 'react';
import { Dialog as DialogBase, ScrollView, XStack, YStack } from 'tamagui';

import { X } from '../icons';
import { Button } from './button';

export type DrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Il titolo in cima, che è anche il nome del dialogo: «Filtri». */
  title: string;
  /** L'etichetta della x per i lettori di schermo: il testo lo decide l'app. */
  closeLabel: string;
  children: ReactNode;
};

/**
 * Il pannello che entra da destra: i filtri del backlog, su telefono e
 * desktop.
 *
 * Esiste accanto allo `Sheet` perché fanno due mestieri. Il foglio sale dal
 * basso ed è alto quanto il contenuto: un menu di tre voci. Il drawer è alto
 * quanto lo schermo e scorre dentro: un pannello lungo, che sul desktop non
 * deve prendersi una colonna fissa accanto alla lista.
 *
 * Sotto c'è il Dialog di Tamagui, come per `DialogContent`, e porta con sé ciò
 * che allo `Sheet` va aggiunto a mano: Esc lo chiude, il focus entra, resta
 * dentro e torna dove era, la pagina sotto non scorre, e il titolo dà il nome
 * al dialogo (`aria-labelledby`). Da chiuso non è montato.
 *
 * Una cosa sola va aggiunta: il focus, alla chiusura, Tamagui lo rimanda al
 * suo `Dialog.Trigger`, e qui non ce n'è uno — il drawer lo apre un bottone
 * della pagina, da fuori. Senza, chiuso con Esc il focus finiva sul `body`.
 * Si ricorda chi l'aveva all'apertura e glielo si ridà.
 *
 * «All'apertura» vuol dire nel render in cui `open` diventa vero, e non in un
 * effetto: gli effetti del contenuto girano prima di quelli del drawer, e
 * quando toccava a noi il focus era già sulla x. Misurato nella storia.
 *
 * E lo scorrimento della pagina lo blocca il drawer, non Tamagui
 * (`disableRemoveScroll`). Tamagui mette `scrollbar-gutter: stable`
 * sull'`html`, e gli elementi fissi — il velo e il drawer — si fermano prima
 * di quella fascia: fra il pannello e il bordo destro restava una striscia di
 * 15 px, anche dove la barra di scorrimento non c'era. Qui la barra si toglie
 * e la sua larghezza diventa `padding-right`, così la pagina sotto non si
 * sposta e il drawer arriva al bordo.
 *
 * Largo 380, e su un telefono il 90%: la striscia di velo che resta a sinistra
 * è il posto dove toccare per chiuderlo.
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  closeLabel,
  children,
}: DrawerProps) {
  const [wasOpen, setWasOpen] = useState(open);
  const [returnFocusTo, setReturnFocusTo] = useState<HTMLElement | null>(null);

  // Lo stato che segue una prop, come lo vuole React: si aggiorna durante il
  // render, prima che il contenuto monti e si prenda il focus.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open && typeof document !== 'undefined') {
      setReturnFocusTo(document.activeElement as HTMLElement | null);
    }
  }

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const html = document.documentElement;
    const scrollbar = window.innerWidth - html.clientWidth;
    const before = {
      overflow: html.style.overflow,
      paddingRight: html.style.paddingRight,
    };
    html.style.overflow = 'hidden';
    if (scrollbar > 0) html.style.paddingRight = `${scrollbar}px`;
    return () => {
      html.style.overflow = before.overflow;
      html.style.paddingRight = before.paddingRight;
    };
  }, [open]);

  useEffect(() => {
    if (open || !returnFocusTo) return;
    returnFocusTo.focus();
    setReturnFocusTo(null);
  }, [open, returnFocusTo]);

  return (
    <DialogBase
      open={open}
      onOpenChange={onOpenChange}
      modal
      disableRemoveScroll
    >
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
          position="absolute"
          t={0}
          r={0}
          b={0}
          width="90%"
          maxW={380}
          p={0}
          rounded={0}
          bg="$color2"
          borderLeftWidth={1}
          borderColor="$borderColor"
          transition="quick"
          x={0}
          opacity={1}
          enterStyle={{ x: 40, opacity: 0 }}
          exitStyle={{ x: 40, opacity: 0 }}
          // `preventDefault` salta il rientro di Tamagui sul trigger che non
          // c'è: il focus l'ha già rimesso a posto l'effetto qui sopra.
          onCloseAutoFocus={(event) => event.preventDefault()}
        >
          <XStack
            items="center"
            justify="space-between"
            gap={8}
            px={16}
            py={12}
            borderBottomWidth={1}
            borderColor="$borderColor"
          >
            <DialogBase.Title
              fontFamily="$heading"
              fontSize={18}
              lineHeight={24}
              fontWeight="600"
              color="$color12"
            >
              {title}
            </DialogBase.Title>
            <DialogBase.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={closeLabel}>
                <X size={16} />
              </Button>
            </DialogBase.Close>
          </XStack>
          {/* `flex={1}` e non `grow`: qui l'altezza la decide lo schermo, non
              il contenuto, ed è proprio la base 0 a far scorrere il pannello
              invece di allungarlo. */}
          <ScrollView flex={1}>
            <YStack p={16} gap={16}>
              {children}
            </YStack>
          </ScrollView>
        </DialogBase.Content>
      </DialogBase.Portal>
    </DialogBase>
  );
}
