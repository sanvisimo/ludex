import { Button as ButtonBase, styled } from 'tamagui';
import type { GetProps } from 'tamagui';

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
export const Button = styled(ButtonBase, {
  name: 'Button',

  borderWidth: 1,
  borderColor: 'transparent',
  fontWeight: '500',

  // Il focus si vede **solo da tastiera**: `focusVisibleStyle` e non
  // `focusStyle`, o l'anello comparirebbe a ogni clic del mouse.
  focusVisibleStyle: {
    outlineColor: '$outlineColor',
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineOffset: 2,
  },

  disabledStyle: {
    opacity: 0.5,
  },

  variants: {
    variant: {
      /**
       * Il primario: superficie piena.
       *
       * Testo **scuro** su teal, e non è un gusto — è misurato: `$accent9` con
       * testo scuro dà 6.16 di contrasto, con testo chiaro 2.99, sotto la
       * soglia WCAG di 4.5. Il teal sta fra i colori "bright" delle scale
       * Radix, quelli il cui passo 9 vuole testo scuro sopra. Il giorno che
       * l'accento cambia, questo va rimisurato: con un viola la risposta si
       * inverte.
       *
       * Non usa `$accentBackground` perché quel token **non è simmetrico** fra
       * i temi: nel chiaro è una tinta tenue, nello scuro una superficie piena.
       * Va benissimo per un pannello, non per il bottone che deve pesare
       * uguale in entrambi.
       */
      default: {
        bg: '$accent9',
        color: '$black1',
        hoverStyle: { bg: '$accent10' },
        pressStyle: { bg: '$accent8' },
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
        bg: '$background',
        borderColor: '$color9',
        color: '$color12',
        hoverStyle: { bg: '$color3', borderColor: '$color10' },
        pressStyle: { bg: '$color4', borderColor: '$color10' },
      },
      secondary: {
        bg: '$color6',
        color: '$color12',
        // Sopra il base, non sotto: con `$color4` e `$color5` il bottone si
        // **abbassava** al passaggio del mouse, che è il contrario di ciò che
        // un rilievo deve fare.
        hoverStyle: { bg: '$color7' },
        pressStyle: { bg: '$color8' },
      },
      /** Il più usato: sta in silenzio finché non lo si sfiora. */
      ghost: {
        bg: 'transparent',
        color: '$color11',
        hoverStyle: { bg: '$color6', color: '$color12' },
        // Premendo deve succedere qualcosa: con lo stesso `$color6` dell'hover
        // il clic non dava nessun ritorno.
        pressStyle: { bg: '$color7', color: '$color12' },
      },
      /**
       * Tinta e non superficie piena, come prima: un rosso pieno accanto a
       * «Scollega» o «Rimuovi» griderebbe più di quanto quei gesti meritino —
       * e sono gesti che il dialogo di conferma spiega già.
       */
      destructive: {
        bg: '$red3',
        color: '$red11',
        hoverStyle: { bg: '$red4' },
        pressStyle: { bg: '$red5' },
      },
    },

    size: {
      default: { height: 32, px: 10, rounded: 8, fontSize: 14, gap: 6 },
      sm: { height: 28, px: 10, rounded: 8, fontSize: 13, gap: 4 },
      // I tre formati quadrati per i bottoni di sola icona.
      icon: { height: 32, width: 32, px: 0, rounded: 8 },
      'icon-sm': { height: 28, width: 28, px: 0, rounded: 8 },
      'icon-xs': { height: 24, width: 24, px: 0, rounded: 6 },
    },
  } as const,

  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
});

export type ButtonProps = GetProps<typeof Button>;
