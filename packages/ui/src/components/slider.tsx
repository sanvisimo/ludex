import { Slider as SliderBase } from 'tamagui/unstyled';
import type { SliderProps as SliderBaseProps } from 'tamagui/unstyled';

export type SliderProps = Omit<SliderBaseProps, 'children' | 'size'> & {
  /**
   * Il nome di ogni maniglia per i lettori di schermo, nell'ordine: «Durata
   * minima», «Durata massima». Uno per maniglia: sono loro ad avere il ruolo
   * `slider`, non il binario.
   */
  thumbLabels: string[];
};

/**
 * Il cursore: durata, voto, anno di uscita e voto della critica, nel pannello
 * dei filtri.
 *
 * Le maniglie sono quante i valori: `value={[2]}` ne ha una,
 * `value={[1, 10]}` due, e il tratto acceso sta fra le due. Sotto c'è lo
 * Slider di Tamagui, che dà frecce, Home/End e trascinamento, e tiene le due
 * maniglie in ordine da sé.
 *
 * Il binario spento è `$color6` e non `$color9`: a dire dove sta il
 * controllo sono le maniglie, col bordo d'accento, e un binario marcato
 * quanto loro le annegherebbe.
 */
export function Slider({ thumbLabels, ...props }: SliderProps) {
  const thumbs = (props.value ?? props.defaultValue ?? [0]).length;

  return (
    <SliderBase
      height={20}
      minW={120}
      // `opacity` e non lo stile da spento di Tamagui: sullo Slider della 2.7.7
      // valeva sempre, e il cursore acceso usciva a metà.
      opacity={props.disabled ? 0.5 : 1}
      {...props}
    >
      <SliderBase.Track height={4} bg="color6" rounded={2}>
        <SliderBase.TrackActive bg="accent9" rounded={2} />
      </SliderBase.Track>
      {Array.from({ length: thumbs }, (_, index) => (
        <SliderBase.Thumb
          key={index}
          index={index}
          aria-label={thumbLabels[index]}
          size={16}
          width={16}
          height={16}
          bg="color1 hover:color3 press:color4"
          borderWidth={2}
          borderColor="accent9"
          outlineColor="focus-visible:outline-color"
          outlineStyle="focus-visible:solid"
          outlineWidth="focus-visible:2px"
          outlineOffset="focus-visible:2px"
          circular
        />
      ))}
    </SliderBase>
  );
}
