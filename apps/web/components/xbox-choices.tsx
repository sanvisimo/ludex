import type { XboxPlatform } from '@repo/contracts';
import {
  PLAYED_DEFAULT_MIN_MINUTES,
  xboxPlatformValues,
} from '@repo/contracts';
import { Checkbox, Label, Text, XStack, YStack } from '@repo/ui';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

import { PlayedMinutesSlider } from '@/components/played-threshold';

export type XboxChoicesValue = {
  platforms: XboxPlatform[];
  gamePassActive: boolean;
  minMinutes: number;
};

/** Nessuna piattaforma spuntata: la scelta la fa l'utente (9e, pannello 1). */
export const NO_XBOX_CHOICES: XboxChoicesValue = {
  platforms: [],
  gamePassActive: false,
  minMinutes: PLAYED_DEFAULT_MIN_MINUTES,
};

/**
 * Le scelte di un account Xbox (9e): su quali piattaforme gioca, se il Game
 * Pass è attivo, e da quanti minuti un gioco conta come giocato. Servono prima
 * del codice, al collegamento, e di nuovo nelle impostazioni dell'import: per
 * questo stanno qui e non dentro uno dei due.
 *
 * Collections e lo storico non dicono su che console si gioca, e il catalogo
 * dice «One e Series» per quasi tutto: ogni gioco prende una copia per ciascuna
 * piattaforma spuntata su cui gira.
 *
 * **La soglia si vede sempre** (plans/soglia-giocato.md): fa passare a
 * `played` ogni gioco che la supera, comprati compresi. Col Game Pass non
 * attivo decide anche quali giochi del Game Pass e Gold entrano. Su Xbox non
 * ha la casella degli altri negozi: c'era già, ed è sempre accesa.
 */
export function XboxChoices({
  value,
  onChange,
}: {
  value: XboxChoicesValue;
  onChange: (value: XboxChoicesValue) => void;
}) {
  const t = useTranslations('account.xbox');
  const id = useId();

  const toggle = (platform: XboxPlatform, on: boolean) =>
    onChange({
      ...value,
      // Nell'ordine dell'elenco, non in quello dei clic: è ciò che la scheda
      // mostra dopo.
      platforms: xboxPlatformValues.filter((p) =>
        p === platform ? on : value.platforms.includes(p),
      ),
    });

  return (
    <YStack gap={16}>
      <YStack gap={8}>
        <Text fontWeight="600" color="$color12">
          {t('platformsTitle')}
        </Text>
        <Text fontSize={12} color="$color11">
          {t('platformsHint')}
        </Text>
        {xboxPlatformValues.map((platform) => (
          <XStack key={platform} items="center" gap={10}>
            <Checkbox
              id={`${id}-${platform}`}
              checked={value.platforms.includes(platform)}
              onCheckedChange={(on) => toggle(platform, on === true)}
            />
            <Label htmlFor={`${id}-${platform}`}>
              {t(`platforms.${platform}`)}
            </Label>
          </XStack>
        ))}
      </YStack>

      <YStack gap={4}>
        <XStack items="center" gap={10}>
          <Checkbox
            id={`${id}-gamepass`}
            checked={value.gamePassActive}
            onCheckedChange={(on) =>
              onChange({ ...value, gamePassActive: on === true })
            }
          />
          <Label htmlFor={`${id}-gamepass`}>{t('gamePass')}</Label>
        </XStack>
        <Text fontSize={12} color="$color11" pl={26}>
          {t('gamePassHint')}
        </Text>
      </YStack>

      {/* Non rientrata sotto il Game Pass: vale per tutti i giochi. */}
      <PlayedMinutesSlider
        value={value.minMinutes}
        onChange={(minutes) => onChange({ ...value, minMinutes: minutes })}
        text={
          value.minMinutes === 0
            ? t('minMinutesAll')
            : t('minMinutes', { minutes: value.minMinutes })
        }
        hint={t('minMinutesHint')}
        label={t('minMinutesLabel')}
      />
    </YStack>
  );
}
