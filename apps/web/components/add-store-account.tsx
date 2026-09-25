import type { LinkableStore } from '@repo/contracts';
import { linkableStoreValues } from '@repo/contracts';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';
import { useTranslations } from 'use-intl';
import { useState } from 'react';

import { StoreLinkForm } from '@/components/store-link-form';
import { useStoreLabels } from '@/lib/labels';

/**
 * Aggiunge un account, di un negozio qualunque fra quelli collegabili.
 *
 * Prima `/account` disegnava una scheda fissa per negozio, presa da
 * `linkableStoreValues`: quella lista non sparisce, cambia mestiere — da elenco
 * delle schede a elenco di questa tendina. È il cambio che serviva perché gli
 * account per negozio possono essere più d'uno, e una scheda per negozio non
 * poteva rappresentarli.
 */
export function AddStoreAccount() {
  const t = useTranslations('account.add');
  const storeLabels = useStoreLabels();

  const [store, setStore] = useState<LinkableStore>(linkableStoreValues[0]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent gap={16}>
        <p className="text-muted-foreground">{t('description')}</p>

        <div className="grid gap-2">
          <Label>{t('storeLabel')}</Label>
          <Select
            value={store}
            onValueChange={(value) => setStore(value as LinkableStore)}
            items={storeLabels}
          >
            <SelectTrigger width="100%" $sm={{ width: 256 }}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {linkableStoreValues.map((value) => (
                <SelectItem key={value} value={value}>
                  {storeLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* La chiave rimonta il modulo cambiando negozio: il testo incollato per
            GOG non deve restare nel campo quando si passa ad Amazon. */}
        <StoreLinkForm key={store} store={store} submitLabel={t('submit')} />
      </CardContent>
    </Card>
  );
}
