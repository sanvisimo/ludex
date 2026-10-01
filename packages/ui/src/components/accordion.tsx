import { createContext, useContext, useId, type ReactNode } from 'react';
import { Accordion as AccordionBase, Text, XStack } from 'tamagui';

import { ChevronDown } from '../icons';

export type AccordionProps = {
  /** Le sezioni aperte. Più d'una alla volta: è un pannello, non un menu. */
  value?: string[];
  defaultValue?: string[];
  onValueChange?: (value: string[]) => void;
  children: ReactNode;
};

/**
 * Le sezioni che si aprono e si chiudono: il pannello dei filtri.
 *
 * Sempre a **più sezioni aperte** (`type="multiple"`): chi guarda i generi e
 * poi la durata non deve vedersi chiudere i generi. La forma a una sola
 * sezione non la usa nessuno e non c'è.
 *
 * Sotto c'è l'Accordion di Tamagui: il titolo è un `button` dentro un
 * `h3`, con `aria-expanded` e `aria-controls`, e le frecce della tastiera
 * passano da un titolo all'altro.
 */
export function Accordion({ children, ...props }: AccordionProps) {
  return (
    <AccordionBase type="multiple" width="100%" {...props}>
      {children}
    </AccordionBase>
  );
}

/**
 * L'id del contenuto di ogni sezione, che il titolo nomina in
 * `aria-controls`. Lo teniamo noi perché l'Accordion di Tamagui 2.7.7 lo
 * mette sul titolo ma **non** sul contenuto: il titolo puntava a un id che non
 * esisteva, e axe lo segnala. Si toglie quando Tamagui lo sistema.
 */
const ContentId = createContext<string | undefined>(undefined);

export function AccordionItem({
  value,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const contentId = useId();
  return (
    <ContentId.Provider value={contentId}>
      <AccordionBase.Item
        value={value}
        borderBottomWidth={1}
        borderColor="$borderColor"
      >
        {children}
      </AccordionBase.Item>
    </ContentId.Provider>
  );
}

/**
 * Il titolo della sezione. `hint` sta a destra, prima della freccia: è dove
 * il pannello dice quanti criteri sono accesi lì dentro anche a sezione
 * chiusa.
 */
export function AccordionTrigger({
  children,
  hint,
  variant = 'default',
}: {
  children: string;
  hint?: ReactNode;
  /**
   * `heading` è il titolo di una sezione di una pagina di testo, nel carattere
   * dei titoli; `default` è quello da pannello, più piccolo.
   */
  variant?: 'default' | 'heading';
}) {
  const heading = variant === 'heading';
  const contentId = useContext(ContentId);
  return (
    <AccordionBase.Header>
      <AccordionBase.Trigger
        aria-controls={contentId}
        unstyled
        flexDirection="row"
        items="center"
        gap={8}
        width="100%"
        height={heading ? 48 : 40}
        px={0}
        bg="transparent"
        borderWidth={0}
        cursor="pointer"
        focusVisibleStyle={{
          outlineColor: '$outlineColor',
          outlineStyle: 'solid',
          outlineWidth: 2,
          outlineOffset: 2,
        }}
      >
        {({ open }: { open: boolean }) => (
          <>
            {/* A sinistra e nel carattere del testo: dentro un `<button>` il
                browser centra, e l'`h3` intorno porta quello dei titoli. */}
            <Text
              flex={1}
              text="left"
              fontFamily={heading ? '$heading' : '$body'}
              fontSize={heading ? 18 : 14}
              lineHeight={heading ? 24 : undefined}
              fontWeight={heading ? '600' : '500'}
              color="$color12"
            >
              {children}
            </Text>
            {/* Un contenitore suo: il Badge si allinea da sé in alto
                (`self: flex-start`), e nella riga del titolo pendeva su. */}
            {hint && <XStack self="center">{hint}</XStack>}
            <ChevronDown
              size={16}
              color="$color11"
              rotate={open ? '180deg' : '0deg'}
            />
          </>
        )}
      </AccordionBase.Trigger>
    </AccordionBase.Header>
  );
}

export function AccordionContent({ children }: { children: ReactNode }) {
  const contentId = useContext(ContentId);
  return (
    <AccordionBase.Content id={contentId} unstyled pb={12} gap={8}>
      {children}
    </AccordionBase.Content>
  );
}
