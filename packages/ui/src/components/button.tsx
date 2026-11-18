import { createStyledHOC, isWeb, styled, useThemeName } from 'tamagui';
import type { GetProps } from 'tamagui';
import {
  ButtonFrame as ButtonBehaviorFrame,
  ButtonText as ButtonBehaviorText,
  textParentInlineProps,
  useButton,
  type ButtonBehaviorProps,
} from 'tamagui/unstyled';

/**
 * Il comportamento del bottone di Tamagui — il testo avvolto, il `<button>`,
 * lo stato disabilitato — senza la sua pelle. Il `Button` di `tamagui` ha
 * taglie sue (`xs`…`xl`) che leggono la stessa prop `size` delle nostre, e ci
 * mettevano sopra padding e altezza minima: 38 pixel invece di 32.
 * `inlineProps` fa arrivare al testo colore e carattere delle varianti qui
 * sotto, come fa la pelle, anche su React Native, dove il testo non li eredita.
 */
const ButtonText = styled(ButtonBehaviorText, {
  name: 'ButtonText',
  select: 'none',
});

const ButtonBehavior = createStyledHOC(
  ButtonBehaviorFrame,
  function ButtonBehavior(props: ButtonBehaviorProps, ref) {
    const { props: buttonProps } = useButton(props, { Text: ButtonText });
    return <ButtonBehaviorFrame ref={ref} {...buttonProps} />;
  },
  { staticConfig: { inlineProps: textParentInlineProps } },
);

/**
 * Il bottone.
 *
 * **Livello 3 — i token di componente**: qui i semantici (`$accent9`,
 * `$color3`, `$red11`) diventano decisioni su questo componente. Sopra non si
 * risale mai: un primitivo (`teal9`) scritto qui dentro sarebbe teal anche il
 * giorno che l'accento cambia.
 *
 * Le varianti sono quelle che le schermate usano davvero, contate:
 * `ghost` 25 volte, `outline` 22, `secondary` 6, `destructive` 5, `default`
 * implicito. Le tre che shadcn dava in dotazione e che nessuno ha mai usato —
 * `link`, `xs`, `lg`, `icon-lg` — non sono state portate: un design system si
 * mantiene se contiene ciò che serve, e ogni variante in più è una riga di
 * story, un caso di test e una decisione da ripetere.
 *
 * I nomi (`variant`, `size`, e i valori) restano quelli di prima, così le
 * schermate cambiano l'import e non la struttura.
 */
const ButtonFrame = styled(ButtonBehavior, {
  name: 'Button',
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: 'transparent',
  cursor: 'web:pointer',
  fontWeight: '500',
  // Il focus si vede **solo da tastiera**: `focusVisibleStyle` e non
  // `focusStyle`, o l'anello comparirebbe a ogni clic del mouse.
  outlineColor: 'focus-visible:outline-color',
  outlineStyle: 'focus-visible:solid',
  outlineWidth: 'focus-visible:2px',
  outlineOffset: 'focus-visible:2px',
  opacity: 'disabled:0.5',
  variants: {
    variant: {
      /** Coppie fondo/testo misurate in entrambi i temi, anche in pressione. */
      default: {
        bg: 'actionBackground hover:actionBackgroundHover press:actionBackgroundPress',
        color: 'actionColor',
      },
      /** Filtri attivi: superficie tenue distinta dall'azione principale. */
      selection: {
        bg: 'selectionBackground hover:selectionBackgroundHover press:selectionBackgroundPress',
        color: 'selectionColor',
        borderColor:
          'selectionBorder hover:selectionBorderHover press:selectionBorderPress',
      },
      /**
       * Il bordo è `$color9` e non `$borderColor`, ed è una scelta **misurata**:
       * `$borderColor` è il passo 4 della scala, che contro lo sfondo dà 1.20
       * nel tema scuro — un bordo che non c'è. Sotto quel numero le tre
       * varianti senza tinta (questa, `secondary`, `ghost`) stavano tutte in
       * 0.20 punti di contrasto, cioè erano lo stesso colore.
       *
       * `$color9` è l'unico passo grigio sopra la soglia WCAG di 3:1 in
       * **entrambi** i temi (3.44 scuro, 3.15 chiaro), e per un bottone che il
       * solo bordo identifica quella soglia è la regola giusta. Il prezzo
       * accettato è un contorno più marcato di quello di partenza: le scale
       * Radix mettono al passo 9 la tinta piena, non un filo.
       */
      outline: {
        bg: 'background hover:color3 press:color4',
        borderColor: 'color9 hover:color10 press:color10',
        color: 'color12',
      },
      secondary: {
        // Sopra il base, non sotto: con `$color4` e `$color5` il bottone si
        // **abbassava** al passaggio del mouse, che è il contrario di ciò che
        // un rilievo deve fare.
        bg: 'color6 hover:color7 press:color8',
        color: 'color12',
      },
      /** Il più usato: sta in silenzio finché non lo si sfiora. */
      ghost: {
        // Premendo deve succedere qualcosa: con lo stesso `$color6` dell'hover
        // il clic non dava nessun ritorno.
        bg: 'transparent hover:color6 press:color7',
        color: 'color11 hover:color12 press:color12',
      },
      /**
       * Tinta e non superficie piena, come prima: un rosso pieno accanto a
       * «Scollega» o «Rimuovi» griderebbe più di quanto quei gesti meritino —
       * e sono gesti che il dialogo di conferma spiega già.
       */
      destructive: {
        bg: 'red3 hover:red4 press:red5',
        color: 'red11',
      },
    },

    size: {
      // Sul telefono 44, come l'Input: la misura minima di tocco, e nei moduli
      // bottone e campo restano alti uguali.
      default: {
        height: '32px native:44px',
        px: 10,
        rounded: 8,
        fontSize: 14,
        gap: 6,
      },
      sm: { height: 28, px: 10, rounded: 8, fontSize: 13, gap: 4 },
      // I tre formati quadrati per i bottoni di sola icona.
      icon: {
        height: '32px native:44px',
        width: '32px native:44px',
        px: 0,
        rounded: 8,
      },
      'icon-sm': { height: 28, width: 28, px: 0, rounded: 8 },
      'icon-xs': { height: 24, width: 24, px: 0, rounded: 6 },
    },
  } as const,
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

// Su Tamagui 2.7.7 il Button risolveva le varianti native prima del cambio di
// schema e poteva conservarne i colori. Passare il nome al frame
// forza la risoluzione nel tema corrente senza rimontare o perdere stato.
export const Button = isWeb
  ? ButtonFrame
  : createStyledHOC(ButtonFrame, (props: ButtonProps, ref) => {
      const theme = useThemeName();
      return <ButtonFrame {...props} ref={ref} theme={props.theme ?? theme} />;
    });

export type ButtonProps = GetProps<typeof ButtonFrame>;
