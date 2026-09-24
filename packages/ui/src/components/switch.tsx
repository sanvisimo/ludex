import { Switch as SwitchBase } from 'tamagui';
import type { SwitchProps as SwitchBaseProps } from 'tamagui';

export type SwitchProps = Omit<SwitchBaseProps, 'children'>;

/**
 * L'interruttore: oggi i due «Aggiorna automaticamente», generale e per
 * account.
 *
 * Il comportamento è quello dello Switch di Tamagui — `checked`,
 * `onCheckedChange`, `disabled`, `id`, gli stessi nomi di Base UI — con
 * `role="switch"` e `aria-checked` sul web e lo spostamento del pallino
 * calcolato da lui. Qui si decide solo l'aspetto, sulle misure di prima:
 * 32 × 18, pallino da 16.
 *
 * Il binario spento è `$color9` e non un grigio più tenue: come il bordo del
 * Button `outline` e dell'Input, è ciò che dice dove sta il controllo, e sotto
 * il 3:1 sul fondo scuro l'interruttore spento non si vedrebbe. Acceso è
 * l'accento, come il bottone primario.
 *
 * L'etichetta va **accanto**, con `<Label htmlFor>` che punta all'`id`: il
 * Label è un testo e non può contenere lo Switch.
 */
export function Switch(props: SwitchProps) {
  return (
    <SwitchBase
      width={32}
      height={18}
      // La variante `size` di Tamagui mette anche un `minHeight` (29 con la
      // taglia di serie), e quello vince sull'altezza: il binario restava alto
      // 29 e diventava una macchia tonda. I test non lo vedevano, perché
      // guardano il comportamento e non le misure.
      minH={18}
      p={1}
      borderWidth={0}
      bg="$color9"
      activeStyle={{ backgroundColor: '$accent9' }}
      disabledStyle={{ opacity: 0.5, cursor: 'not-allowed' }}
      {...props}
    >
      <SwitchBase.Thumb
        width={16}
        height={16}
        bg="$color1"
        transition="quick"
      />
    </SwitchBase>
  );
}
