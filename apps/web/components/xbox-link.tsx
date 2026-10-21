import { Button, Input, Label, Text, YStack } from '@repo/ui';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { XboxCodePanel } from '@/components/xbox-code-panel';
import {
  NO_XBOX_CHOICES,
  XboxChoices,
  type XboxChoicesValue,
} from '@/components/xbox-choices';

/**
 * Collegare Xbox (9e): **prima le scelte, poi il codice**, nello stesso dialogo.
 *
 * Le scelte vanno prima perché il server le salva al momento della conferma,
 * insieme al token. «Continua» è spento finché non c'è almeno una piattaforma:
 * senza, l'import non avrebbe dove mettere niente.
 *
 * Su un ricollegamento (`accountId`) le scelte partono da quelle di adesso, e il
 * nome non si chiede: l'account c'è già, e si rinomina dal menu.
 */
export function XboxLink({
  accountId,
  initial,
  onLinked,
}: {
  accountId?: string;
  initial?: XboxChoicesValue | null;
  onLinked: () => void;
}) {
  const t = useTranslations('account.xbox');
  const tStore = useTranslations('account.store');

  const [step, setStep] = useState<'choose' | 'code'>('choose');
  const [choices, setChoices] = useState<XboxChoicesValue>(
    initial ?? NO_XBOX_CHOICES,
  );
  const [label, setLabel] = useState('');

  if (step === 'code') {
    return (
      <YStack gap={12}>
        <Button
          variant="ghost"
          size="sm"
          self="flex-start"
          onClick={() => setStep('choose')}
        >
          ← {t('back')}
        </Button>
        <XboxCodePanel
          choices={choices}
          label={label}
          accountId={accountId}
          onDone={onLinked}
        />
      </YStack>
    );
  }

  const empty = choices.platforms.length === 0;

  return (
    <YStack gap={20}>
      <XboxChoices value={choices} onChange={setChoices} />

      {!accountId && (
        <YStack gap={8}>
          <Label htmlFor="etichetta-xbox">{tStore('labelField')}</Label>
          <Input
            id="etichetta-xbox"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={tStore('labelPlaceholder')}
            maxLength={60}
          />
          <Text fontSize={12} color="$color11">
            {tStore('labelHint')}
          </Text>
        </YStack>
      )}

      <YStack gap={6} items="flex-end">
        <Button disabled={empty} onClick={() => setStep('code')}>
          {t('continue')}
        </Button>
        {empty && (
          <Text fontSize={12} color="$color11">
            {t('pickOne')}
          </Text>
        )}
      </YStack>
    </YStack>
  );
}
