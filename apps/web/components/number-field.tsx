import { Input, Text, XStack } from '@repo/ui';
import { useState } from 'react';

/**
 * Un campo numerico accanto a uno slider.
 *
 * **Si applica quando si esce dal campo o si preme Invio, non a ogni tasto.**
 * Scrivere «2000» passa da «2», e un campo che a ogni cifra si porta dentro gli
 * estremi (1970) riscriverebbe il numero sotto le dita. Finché si scrive, il
 * testo è suo; fuori dal campo mostra il valore dello slider, e vuoto
 * all'estremo, dove lo slider vuol dire «nessun limite».
 */
export function NumberField({
  label,
  ariaLabel,
  value,
  placeholder,
  disabled = false,
  onCommit,
}: {
  /** La sillaba davanti al campo: «Da», «A», «Minimo». */
  label: string;
  ariaLabel: string;
  /** Il valore dello slider, o `null` all'estremo («nessun limite»). */
  value: number | null;
  /** L'estremo, a campo vuoto: dice quanto vale «nessun limite». */
  placeholder: string;
  disabled?: boolean;
  /** Il testo scritto, da portare al valore dello slider. */
  onCommit: (text: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);

  const finish = () => {
    if (draft !== null) onCommit(draft);
    setDraft(null);
  };

  return (
    <XStack items="center" gap={6}>
      <Text fontSize={13} color="$color11">
        {label}
      </Text>
      <Input
        value={draft ?? (value === null ? '' : String(value))}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode="decimal"
        disabled={disabled}
        width={84}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish();
          }
        }}
      />
    </XStack>
  );
}
