import type { XboxPlatform } from '@repo/contracts';
import { xboxPlatformValues } from '@repo/contracts';
import { Checkbox, Label, Text, XStack, YStack } from '@repo/ui';
import { useId } from 'react';
import { useTranslations } from 'use-intl';

export type XboxChoicesValue = {
  platforms: XboxPlatform[];
  gamePassActive: boolean;
};

/** Nessuna piattaforma spuntata: la scelta la fa l'utente (9e, pannello 1). */
export const NO_XBOX_CHOICES: XboxChoicesValue = {
  platforms: [],
  gamePassActive: false,
};

/**
 * Le scelte di un account Xbox (9e): su quali piattaforme gioca, e se il Game
 * Pass è attivo. Servono prima del codice, al collegamento, e di nuovo in
 * «Cambia piattaforme»: per questo stanno qui e non dentro uno dei due.
 *
 * Collections e lo storico non dicono su che console si gioca, e il catalogo
 * dice «One e Series» per quasi tutto: ogni gioco prende una copia per ciascuna
 * piattaforma spuntata su cui gira.
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
    </YStack>
  );
}
