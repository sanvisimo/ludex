import type { LinkableStore } from '@repo/contracts';
import { linkableStoreValues } from '@repo/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  YStack,
} from '@repo/ui';
import { Plus } from '@repo/ui/icons';
import { useTranslations } from 'use-intl';
import { useState } from 'react';

import { StoreLinkForm } from '@/components/store-link-form';
import { useStoreLabels } from '@/lib/labels';

/**
 * Aggiunge un account, di un negozio qualunque fra quelli collegabili: il
 * bottone «Aggiungi libreria» e il dialogo che apre.
 *
 * Prima `/account` disegnava una scheda fissa per negozio, presa da
 * `linkableStoreValues`: quella lista non sparisce, cambia mestiere — da elenco
 * delle schede a elenco di questa tendina. È il cambio che serviva perché gli
 * account per negozio possono essere più d'uno, e una scheda per negozio non
 * poteva rappresentarli.
 *
 * `variant` perché il bottone sta in due posti: sulla riga sopra le schede e,
 * quando non c'è ancora nessuna libreria, nello stato vuoto.
 */
export function AddStoreAccount({
  variant = 'outline',
}: {
  variant?: 'default' | 'outline';
}) {
  const t = useTranslations('account.add');
  const storeLabels = useStoreLabels();

  const [open, setOpen] = useState(false);
  const [store, setStore] = useState<LinkableStore>(linkableStoreValues[0]);

  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus
          size={16}
          color={variant === 'default' ? '$black1' : '$color12'}
        />
        {t('title')}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent maxW={512}>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('description')}</DialogDescription>
          </DialogHeader>

          <YStack gap={8}>
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
          </YStack>

          {/* La chiave rimonta il modulo cambiando negozio: il testo incollato
              per GOG non deve restare nel campo quando si passa ad Amazon. Da
              collegato il dialogo si chiude: la scheda nuova è nella griglia. */}
          <StoreLinkForm
            key={store}
            store={store}
            submitLabel={t('submit')}
            onLinked={() => setOpen(false)}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
