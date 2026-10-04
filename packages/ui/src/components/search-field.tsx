import { createContext, useContext, useEffect, useId, useState } from 'react';
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

import { Search, X } from '../icons';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from './input-group';

/**
 * Il campo di ricerca con la tendina dei risultati (12f): si scrive, i
 * risultati arrivano dal server, una voce si apre; Invio senza aver scelto
 * una voce cerca, cioè porta alla pagina dei risultati.
 *
 * Non è il `Combobox`, e la differenza è di sostanza: il Combobox sceglie un
 * valore fra voci che ha già in mano e le filtra lui; qui il testo **è** il
 * valore, le voci le porta chi chiama — da due fonti, in gruppi, con
 * copertina e anno — e sceglierne una vuol dire andare da qualche parte.
 *
 * Il pattern ARIA è lo stesso, però: il fuoco **resta nel campo**, le frecce
 * spostano una voce evidenziata che il lettore di schermo segue via
 * `aria-activedescendant`, Esc chiude. All'inizio nessuna voce è evidenziata,
 * così Invio cerca; la freccia giù entra nella lista.
 *
 * Chi chiama dice quali voci ci sono e in che ordine (`options`): le frecce
 * camminano su quell'elenco, mentre le voci si disegnano con
 * `SearchFieldItem` dove si vuole, anche dentro gruppi diversi.
 */

type SearchFieldContextValue = {
  items: string[];
  active: number;
  setActive: (index: number) => void;
  select: (item: string) => void;
  optionId: (index: number) => string;
};

const SearchFieldContext = createContext<SearchFieldContextValue | null>(null);

function useSearchField() {
  const context = useContext(SearchFieldContext);
  if (!context) {
    throw new Error(
      'I pezzi del SearchField vanno usati dentro <SearchField>.',
    );
  }
  return context;
}

export type SearchFieldProps = Omit<
  GetProps<typeof PopperAnchor>,
  'children' | 'id'
> & {
  value: string;
  onValueChange: (value: string) => void;
  /**
   * Le voci sceglibili della tendina, nell'ordine in cui compaiono. Non
   * `items`, che in Tamagui è l'allineamento.
   */
  options: string[];
  /** Una voce scelta, col clic o con Invio. */
  onSelect: (item: string) => void;
  /** Invio senza una voce evidenziata: la ricerca vera e propria. */
  onSubmit: (value: string) => void;
  /** Da quanti caratteri la tendina si apre. */
  minLength?: number;
  id?: string;
  placeholder?: string;
  'aria-label': string;
  /** L'etichetta della x che svuota il campo, per i lettori di schermo. */
  clearLabel?: string;
  autoFocus?: boolean;
  /** Il contenuto della tendina: gruppi, voci, messaggi. */
  children?: ReactNode;
};

export function SearchField({
  value,
  onValueChange,
  options: items,
  onSelect,
  onSubmit,
  minLength = 1,
  id,
  placeholder,
  'aria-label': ariaLabel,
  clearLabel = 'Clear',
  autoFocus,
  children,
  ...props
}: SearchFieldProps) {
  const [wantsOpen, setWantsOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const open = wantsOpen && value.trim().length >= minLength;

  // Le voci cambiano mentre arrivano i risultati: un indice rimasto oltre la
  // fine non deve evidenziare niente.
  useEffect(() => {
    if (active >= items.length) setActive(-1);
  }, [active, items.length]);

  const close = () => {
    setWantsOpen(false);
    setActive(-1);
  };

  const select = (item: string) => {
    close();
    onSelect(item);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!open) setWantsOpen(true);
        else setActive(Math.min(active + 1, items.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        // Sopra la prima voce si torna al campo: Invio cerca di nuovo.
        setActive(Math.max(active - 1, -1));
        break;
      case 'Enter': {
        event.preventDefault();
        const item = open && active >= 0 ? items[active] : undefined;
        if (item !== undefined) return select(item);
        if (value.trim().length === 0) return;
        close();
        onSubmit(value.trim());
        break;
      }
      case 'Escape':
        if (open) {
          // Chiude la tendina e basta: se il campo sta in un dialog, il
          // primo Esc non deve chiudere anche quello.
          event.preventDefault();
          event.stopPropagation();
          close();
        }
        break;
    }
  };

  const context: SearchFieldContextValue = {
    items,
    active,
    setActive,
    select,
    optionId,
  };

  return (
    <SearchFieldContext.Provider value={context}>
      <Popper
        open={open}
        placement="bottom-start"
        offset={6}
        strategy="fixed"
        stayInFrame
        allowFlip
      >
        <PopperAnchor width="100%" {...props}>
          <InputGroup>
            <InputGroupAddon align="inline-start" pl={8} aria-hidden>
              <Search size={14} color="$color11" />
            </InputGroupAddon>
            <InputGroupInput
              id={id}
              role="combobox"
              aria-label={ariaLabel}
              aria-expanded={open}
              aria-controls={listId}
              aria-autocomplete="list"
              aria-activedescendant={
                open && active >= 0 ? optionId(active) : undefined
              }
              autoComplete="off"
              autoFocus={autoFocus}
              placeholder={placeholder}
              value={value}
              onChange={(event) => {
                onValueChange(event.target.value);
                setActive(-1);
                setWantsOpen(true);
              }}
              onFocus={() => setWantsOpen(true)}
              onKeyDown={onKeyDown}
              // Uscendo dal campo con Tab la tendina si chiude. Il clic su una
              // voce non passa di qui: la tendina trattiene il fuoco.
              onBlur={close}
            />
            {value.length > 0 && (
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  aria-label={clearLabel}
                  // Fuori dal giro del Tab: col campo vuoto non c'è, e Esc
                  // o la selezione del testo fanno lo stesso da tastiera.
                  tabIndex={-1}
                  onPress={() => onValueChange('')}
                >
                  <X size={12} />
                </InputGroupButton>
              </InputGroupAddon>
            )}
          </InputGroup>
        </PopperAnchor>

        {open && (
          <Portal zIndex={200_000}>
            <PopperContent
              // Il portale non prende i clic (`pointer-events: none`), la
              // tendina sì; e un clic dentro non porta via il fuoco al campo,
              // o lo chiuderebbe prima che il clic sulla voce arrivi.
              pointerEvents="auto"
              onMouseDown={(event) => event.preventDefault()}
              width={'var(--tamagui-popper-anchor-width)' as never}
              minW={280}
              p={4}
              rounded={8}
              bg="$color2"
              borderWidth={1}
              borderColor="$borderColor"
            >
              <ScrollView maxH={440} width="100%">
                <YStack
                  id={listId}
                  // `listbox` non è fra i ruoli di React Native, ma sul web
                  // passa com'è.
                  role={'listbox' as never}
                  aria-label={ariaLabel}
                  width="100%"
                >
                  {children}
                </YStack>
              </ScrollView>
            </PopperContent>
          </Portal>
        )}
      </Popper>
    </SearchFieldContext.Provider>
  );
}

/** Un gruppo di voci col suo titolo: «In Ludex», «Su IGDB». */
export function SearchFieldGroup({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const labelId = useId();
  return (
    <YStack role="group" aria-labelledby={labelId} width="100%">
      <Text
        id={labelId}
        px={8}
        pt={8}
        pb={4}
        fontSize={12}
        lineHeight={16}
        fontWeight="500"
        color="$color11"
      >
        {label}
      </Text>
      {children}
    </YStack>
  );
}

/** Una voce: ciò che contiene lo decide chi chiama. */
export function SearchFieldItem({
  value: item,
  children,
}: {
  value: string;
  children: ReactNode;
}) {
  const { items, active, setActive, select, optionId } = useSearchField();
  const index = items.indexOf(item);
  const highlighted = index >= 0 && index === active;

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
      aria-selected={highlighted}
      items="center"
      gap={10}
      px={8}
      py={4}
      minH={32}
      rounded={6}
      cursor="pointer"
      bg={highlighted ? '$color5' : 'transparent'}
      pressStyle={{ bg: '$color6' }}
      onMouseEnter={() => setActive(index)}
      onPress={() => select(item)}
    >
      {children}
    </XStack>
  );
}

/** Un messaggio nella tendina, al posto delle voci: «Cerco…», «Nessun gioco». */
export function SearchFieldMessage({ children }: { children: ReactNode }) {
  return (
    <Text px={8} py={6} fontSize={14} lineHeight={20} color="$color11">
      {children}
    </Text>
  );
}
