import {
  PLAYED_DEFAULT_MIN_MINUTES,
  PLAYED_MAX_MIN_MINUTES,
} from '@repo/contracts';
import { Checkbox, Label, Slider, Text, XStack, YStack } from '@repo/ui';
import { useEffect, useId, useState } from 'react';
import { useTranslations } from 'use-intl';

/**
 * Lo slider dei minuti della soglia «conta come giocato»
 * (plans/soglia-giocato.md): il valore scritto sopra, lo slider, la spiegazione
 * sotto. Lo usano la soglia degli altri negozi, qui sotto, e le scelte di Xbox,
 * che lo tengono sempre acceso e lo spiegano a modo loro.
 */
export function PlayedMinutesSlider({
  value,
  onChange,
  text,
  hint,
  label,
}: {
  value: number;
  onChange: (minutes: number) => void;
  /** Ciò che si legge sopra lo slider, col valore dentro. */
  text: string;
  hint: string;
  /** L'etichetta della maniglia per i lettori di schermo. */
  label: string;
}) {
  // Lo slider solo nel browser, come nei filtri del backlog: Tamagui misura il
  // binario per mettere la maniglia, e sul server non c'è.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <YStack gap={8}>
      <Text fontSize={14} color="$color12">
        {text}
      </Text>
      {mounted ? (
        <Slider
          min={0}
          max={PLAYED_MAX_MIN_MINUTES}
          step={5}
          value={[value]}
          onValueChange={([minutes]) => onChange(minutes ?? 0)}
          thumbLabels={[label]}
          mx={8}
        />
      ) : (
        <YStack height={20} />
      )}
      <Text fontSize={12} color="$color11">
        {hint}
      </Text>
    </YStack>
  );
}

/**
 * La soglia di un account Steam, PSN, Nintendo o EA: una casella, e lo slider
 * quando è spuntata. `null` è spenta, ed è com'è di partenza: le ore da sole
 * non dicono niente sullo stato, finché l'utente non sceglie che lo dicano.
 *
 * `store` per la nota di EA, che dà i tempi solo per i giochi avviati di
 * recente: sotto la casella, anche spenta, perché serve a decidere se
 * accenderla.
 */
export function PlayedThreshold({
  value,
  onChange,
  store,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  store?: string;
}) {
  const t = useTranslations('account.played');
  const id = useId();

  return (
    <YStack gap={8}>
      <XStack items="center" gap={10}>
        <Checkbox
          id={id}
          checked={value !== null}
          onCheckedChange={(on) =>
            onChange(on === true ? PLAYED_DEFAULT_MIN_MINUTES : null)
          }
        />
        <Label htmlFor={id}>{t('toggle')}</Label>
      </XStack>
      {store === 'ea' && (
        <Text fontSize={12} color="$color11" pl={26}>
          {t('eaNote')}
        </Text>
      )}
      {value !== null && (
        <YStack pl={26}>
          <PlayedMinutesSlider
            value={value}
            onChange={onChange}
            text={
              value === 0 ? t('minutesAll') : t('minutes', { minutes: value })
            }
            hint={t('hint')}
            label={t('label')}
          />
        </YStack>
      )}
    </YStack>
  );
}
