import {
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import {
  Popper,
  PopperAnchor,
  PopperContent,
  Portal,
  ScrollView,
  Text,
  XStack,
  YStack,
} from 'tamagui';
import type { GetProps } from 'tamagui';

import { Check, ChevronDown, X } from '../icons';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './input-group';

/**
 * Il campo che filtra mentre scrivi: oggi la scelta della piattaforma, 96
 * voci, dove una tendina semplice sarebbe inusabile.
 *
 * È l'unico componente del kit che Tamagui non ha, quindi qui c'è davvero
 * del comportamento e non solo aspetto. Il pattern è quello ARIA del
 * *combobox con lista*: il fuoco **resta nel campo** per tutto il tempo, le
 * frecce spostano una voce evidenziata che il lettore di schermo segue via
 * `aria-activedescendant`, Invio sceglie, Esc chiude. La tendina sta in un
 * portale, così esce anche da un contenitore che scorre, come il corpo del
 * dialog «Aggiungi gioco».
 *
 * Il posizionamento è il `Popper` di Tamagui e **non** il Popover, ed è
 * misurato: il Popover porta con sé la semantica di un dialog — `role="dialog"`
 * sulla tendina, `aria-expanded` e `aria-haspopup="dialog"` sull'ancora, che
 * axe boccia — e si apre da solo quando il campo prende il fuoco. Al combobox
 * serve solo sapere dove disegnare la lista: aprire e chiudere lo decide lui.
 *
 * L'API è quella di Base UI che `platform-combobox` già usa — `items`,
 * `value`, `onValueChange`, `itemToStringLabel`, e `ComboboxList` con una
 * funzione per voce — così la schermata cambia l'import e basta. I pezzi che
 * nessuno usava (chip multipli, gruppi, separatori) non ci sono.
 *
 * Su telefono andrà ripensato: con la tastiera aperta una tendina ancorata
 * sotto il campo ha poco spazio, e il 12a stesso dice che lì diventa una
 * schermata di ricerca.
 */

type ComboboxContextValue = {
  filtered: string[];
  value: string | null;
  label: (item: string) => string;
  open: boolean;
  setOpen: (open: boolean) => void;
  query: string | null;
  setQuery: (query: string | null) => void;
  active: number;
  setActive: (index: number) => void;
  select: (item: string | null) => void;
  listId: string;
  optionId: (index: number) => string;
};

const ComboboxContext = createContext<ComboboxContextValue | null>(null);

function useCombobox() {
  const context = useContext(ComboboxContext);
  if (!context) {
    throw new Error('I pezzi del Combobox vanno usati dentro <Combobox>.');
  }
  return context;
}

export type ComboboxProps = {
  items: string[];
  value: string | null;
  onValueChange: (value: string | null) => void;
  /** Ciò che si vede a schermo per una voce; di serie la voce stessa. */
  itemToStringLabel?: (item: string) => string;
  children: ReactNode;
};

export function Combobox({
  items,
  value,
  onValueChange,
  itemToStringLabel = String,
  children,
}: ComboboxProps) {
  const [open, setOpenState] = useState(false);
  // `null` vuol dire «non sta scrivendo»: il campo mostra la voce scelta.
  const [query, setQuery] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const id = useId();

  const filtered = useMemo(() => {
    if (!query) return items;
    const needle = query.toLocaleLowerCase();
    return items.filter((item) =>
      itemToStringLabel(item).toLocaleLowerCase().includes(needle),
    );
  }, [items, query, itemToStringLabel]);

  const setOpen = (next: boolean) => {
    setOpenState(next);
    // Chiudendo senza scegliere, il testo scritto a metà se ne va e torna la
    // voce scelta: il campo non deve mentire su cosa è selezionato.
    if (!next) setQuery(null);
  };

  const context: ComboboxContextValue = {
    filtered,
    value,
    label: itemToStringLabel,
    open,
    setOpen,
    query,
    setQuery,
    active,
    setActive,
    select: (item) => {
      onValueChange(item);
      setOpen(false);
    },
    listId: `${id}-list`,
    optionId: (index) => `${id}-option-${index}`,
  };

  return (
    <ComboboxContext.Provider value={context}>
      <Popper
        open={open}
        placement="bottom-start"
        offset={6}
        strategy="fixed"
        stayInFrame
        allowFlip
      >
        {children}
      </Popper>
    </ComboboxContext.Provider>
  );
}

type ComboboxInputProps = Omit<
  GetProps<typeof PopperAnchor>,
  'children' | 'id'
> & {
  /** Va sul campo, non sul contenitore: è ciò a cui punta `<Label htmlFor>`. */
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** La freccia che apre e chiude. C'è di serie, come prima. */
  showTrigger?: boolean;
  /** La x che svuota la scelta. Di serie no, come prima. */
  showClear?: boolean;
  /** Le etichette dei due bottoni per i lettori di schermo. */
  triggerLabel?: string;
  clearLabel?: string;
  'aria-label'?: string;
};

/**
 * Il campo, con la freccia e la x dentro il bordo. È anche l'ancora della
 * tendina: va **fuori** da `ComboboxContent`.
 */
export function ComboboxInput({
  placeholder,
  disabled,
  showTrigger = true,
  showClear = false,
  triggerLabel = 'Open',
  clearLabel = 'Clear',
  'aria-label': ariaLabel,
  id,
  ...props
}: ComboboxInputProps) {
  const {
    filtered,
    value,
    label,
    open,
    setOpen,
    query,
    setQuery,
    active,
    setActive,
    select,
    listId,
    optionId,
  } = useCombobox();

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) {
          setOpen(true);
          setActive(0);
        } else {
          setActive(Math.min(active + 1, filtered.length - 1));
        }
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActive(Math.max(active - 1, 0));
        break;
      case 'Enter':
        if (open && filtered[active] !== undefined) {
          event.preventDefault();
          select(filtered[active]);
        }
        break;
      case 'Escape':
        if (open) {
          // Chiude la tendina e basta: se il campo sta in un dialog, il
          // primo Esc non deve chiudere anche quello.
          event.preventDefault();
          event.stopPropagation();
          setOpen(false);
        }
        break;
    }
  };

  return (
    <PopperAnchor width="100%" {...props}>
      <InputGroup opacity={disabled ? 0.5 : 1}>
        <InputGroupInput
          id={id}
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && filtered.length > 0 ? optionId(active) : undefined
          }
          autoComplete="off"
          placeholder={placeholder}
          disabled={disabled}
          value={query ?? (value !== null ? label(value) : '')}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
            setOpen(true);
          }}
          onKeyDown={onKeyDown}
          // Uscendo dal campo con Tab la tendina si chiude. Il clic su una
          // voce non passa di qui: `ComboboxContent` trattiene il fuoco.
          onBlur={() => setOpen(false)}
        />
        <InputGroupAddon align="inline-end">
          {showClear && value !== null && (
            <InputGroupButton
              aria-label={clearLabel}
              disabled={disabled}
              onPress={() => select(null)}
            >
              <X size={12} />
            </InputGroupButton>
          )}
          {showTrigger && (
            <InputGroupButton
              aria-label={triggerLabel}
              // Fuori dal giro del Tab: il campo fa già tutto da tastiera.
              tabIndex={-1}
              disabled={disabled}
              onPress={() => setOpen(!open)}
            >
              <ChevronDown size={14} />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </PopperAnchor>
  );
}

/**
 * La tendina. Non prende mai il fuoco — resta nel campo — e un clic dentro
 * non lo porta via (`onMouseDown`), o il campo perderebbe il fuoco e la
 * chiuderebbe prima che il clic sulla voce arrivi.
 */
export function ComboboxContent({ children }: { children: ReactNode }) {
  const { open } = useCombobox();
  if (!open) return null;

  return (
    <Portal zIndex={200_000}>
      <PopperContent
        // Il portale non prende i clic (`pointer-events: none`), la tendina sì.
        pointerEvents="auto"
        onMouseDown={(event) => event.preventDefault()}
        width={'var(--tamagui-popper-anchor-width)' as never}
        p={4}
        rounded={8}
        bg="$color2"
        borderWidth={1}
        borderColor="$borderColor"
      >
        <ScrollView maxH={288} width="100%">
          {children}
        </ScrollView>
      </PopperContent>
    </Portal>
  );
}

/** Il messaggio quando il filtro non trova niente. */
export function ComboboxEmpty({ children }: { children: ReactNode }) {
  const { filtered } = useCombobox();
  if (filtered.length > 0) return null;
  return (
    <Text px={8} py={6} fontSize={14} color="$color11">
      {children}
    </Text>
  );
}

/** L'elenco: chiama la funzione per ogni voce che passa il filtro. */
export function ComboboxList({
  children,
}: {
  children: (item: string) => ReactNode;
}) {
  const { filtered, listId } = useCombobox();
  return (
    <YStack
      id={listId}
      // `listbox` non è fra i ruoli di React Native, ma sul web passa com'è.
      role={'listbox' as never}
      width="100%"
    >
      {filtered.map(children)}
    </YStack>
  );
}

export function ComboboxItem({
  value: item,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const { filtered, value, active, setActive, select, optionId } =
    useCombobox();
  const index = filtered.indexOf(item);
  const highlighted = index === active;
  const selected = item === value;

  // Con le frecce la voce evidenziata può uscire dalla vista: la si riporta
  // dentro. Solo sul web, dove l'id è un id del DOM.
  useEffect(() => {
    if (!highlighted || typeof document === 'undefined') return;
    document
      .getElementById(optionId(index))
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [highlighted, index, optionId]);

  return (
    <XStack
      id={optionId(index)}
      role="option"
      aria-selected={selected}
      items="center"
      gap={8}
      px={8}
      minH={28}
      rounded={6}
      cursor="pointer"
      bg={highlighted ? '$color5' : 'transparent'}
      pressStyle={{ bg: '$color6' }}
      onMouseEnter={() => setActive(index)}
      onPress={() => select(item)}
    >
      <Text flex={1} fontSize={14} lineHeight={20} color="$color12">
        {children}
      </Text>
      {selected && <Check size={14} color="$color12" />}
    </XStack>
  );
}

export type { ComboboxInputProps };
