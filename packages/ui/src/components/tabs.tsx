import {
  createContext,
  useContext,
  useEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { ScrollView, Text, XStack } from 'tamagui';

import { Badge } from './badge';

const TabsContext = createContext<{
  value: string;
  select: (value: string) => void;
}>({ value: '', select: () => {} });

export type TabsProps = {
  /** Il tab acceso. Sempre uno: una sezione senza tab aperto non esiste. */
  value: string;
  onValueChange: (value: string) => void;
  /** Cosa si sceglie, per i lettori di schermo: «Tipo di voce nascosta». */
  label: string;
  children: ReactNode;
};

/**
 * I tab: il testo di una sezione sopra una linea, e sotto il tab acceso una
 * sottolineatura con l'accento.
 *
 * Servono dove **la stessa lista cambia sezione** — i nascosti per tipo — e non
 * dove si sceglie come guardarla: per quello c'è il `ToggleGroup`, che è una
 * scelta di vista in una cornice. Un `ToggleGroup` messo a fare i tab sembra una
 * barra di bottoni, e coi numeri attaccati al testo è peggio.
 *
 * **Scorrono in orizzontale** quando non stanno, senza barra: la barra di
 * scorrimento di Windows è un nastro grigio sotto i tab, e il tab che esce dal
 * bordo dice già «ce ne sono altri». Il tab acceso si porta da sé in vista.
 *
 * Frecce, Home e Fine passano da un tab all'altro, come nel pattern dei tab: un
 * solo tab è nella sequenza del Tab (`tabIndex`), gli altri si raggiungono con
 * le frecce. Il pannello non è di questo componente: lo disegna chi lo usa,
 * sotto, secondo `value`.
 */
export function Tabs({ value, onValueChange, label, children }: TabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
    if (!keys.includes(event.key)) return;

    // Solo sul web ci sono la tastiera e il DOM: su React Native l'evento non
    // arriva, e il codice qui sotto non gira mai.
    const tabs = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]'),
    );
    const current = tabs.indexOf(event.target as HTMLElement);
    if (current === -1) return;

    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) %
            tabs.length;

    event.preventDefault();
    const target = tabs[next]!;
    target.focus();
    // Attivazione automatica: la sezione cambia con la freccia, perché cambiarla
    // è a costo zero e non c'è niente da confermare.
    target.click();
  };

  return (
    <TabsContext.Provider value={{ value, select: onValueChange }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        // La linea sotto tutti i tab, anche dove il testo finisce.
        borderBottomWidth={1}
        borderBottomColor="$borderColor"
        // Non si allarga oltre chi lo contiene: senza, con `flex-shrink: 0`
        // delle view di Tamagui, la riga spinge la pagina fuori dallo schermo.
        maxW="100%"
      >
        <XStack
          role="tablist"
          aria-label={label}
          // `onKeyDown` non è nei tipi della view: arriva al DOM.
          {...({ onKeyDown } as object)}
        >
          {children}
        </XStack>
      </ScrollView>
    </TabsContext.Provider>
  );
}

export type TabsTabProps = {
  value: string;
  /** Un numero accanto al nome, come le voci nascoste di quel tipo. Zero non si scrive. */
  count?: number;
  children: string;
};

/** Un tab. Il nome è testo, e il numero un `Badge` piccolo accanto, non attaccato. */
export function TabsTab({ value, count, children }: TabsTabProps) {
  const { value: selectedValue, select } = useContext(TabsContext);
  const selected = value === selectedValue;
  const ref = useRef<HTMLElement | null>(null);

  // Il tab acceso si porta in vista: su un telefono può essere uscito dal bordo,
  // per un indirizzo aperto su «Non interessato». `nearest` non muove la pagina
  // se è già visibile.
  useEffect(() => {
    if (selected) {
      ref.current?.scrollIntoView?.({ inline: 'nearest', block: 'nearest' });
    }
  }, [selected]);

  return (
    <XStack
      ref={ref as never}
      render="button"
      role="tab"
      aria-selected={selected}
      // Roving tabindex: nella sequenza del Tab c'è solo quello acceso.
      tabIndex={selected ? 0 : -1}
      onPress={() => select(value)}
      height={40}
      px={12}
      gap={8}
      items="center"
      shrink={0}
      bg="transparent"
      borderWidth={0}
      // Si sovrappone alla linea di tutti i tab: l'accento sta **sopra** la
      // linea grigia, non sotto.
      borderBottomWidth={2}
      borderBottomColor={selected ? '$accent9' : 'transparent'}
      mb={-1}
      cursor="pointer"
      hoverStyle={{ bg: '$color3' }}
      pressStyle={{ bg: '$color4' }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
        outlineOffset: -2,
      }}
    >
      <Text
        fontSize={14}
        lineHeight={20}
        fontWeight="500"
        whiteSpace="nowrap"
        color={selected ? '$color12' : '$color11'}
      >
        {children}
      </Text>
      {count ? <Badge variant="secondary">{count}</Badge> : null}
    </XStack>
  );
}
