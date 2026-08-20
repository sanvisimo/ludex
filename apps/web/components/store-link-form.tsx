'use client';

import type { LinkableStore } from '@repo/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

/**
 * Il gesto del collegamento: apri il login, incolla quello che vedi.
 *
 * Uno solo per tutti i negozi e per tutti e due i momenti in cui serve —
 * aggiungere un account e ricollegarne uno scaduto — perché è letteralmente lo
 * stesso gesto. Cambia **cosa** si incolla: per Steam l'indirizzo del profilo,
 * per GOG quello su cui si atterra dopo il login.
 *
 * Il copia-incolla non è un ripiego provvisorio: nessuno dei negozi accetta un
 * `redirect_uri` nostro, quindi il codice non può tornarci da solo. Ma è un
 * gesto **solo**: da lì in poi il refresh token si rinnova da sé.
 *
 * E resta un `value` opaco, non un `code`: da `apps/mobile` lo prenderà una
 * WebView senza che nessuno lo veda, e questa procedura non deve sapere quale
 * dei due è stato.
 */
export function StoreLinkForm({
  store,
  submitLabel,
}: {
  store: LinkableStore;
  submitLabel: string;
}) {
  const t = useTranslations('account.store');
  const tStore = useTranslations(`account.stores.${store}`);
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');

  // Solo per i negozi che hanno un login da aprire: Steam rende null, perché lì
  // l'utente ha già sottomano il proprio profilo.
  const loginUrl = useQuery(
    api.accounts.loginUrl.queryOptions({ input: { store } }),
  );

  const link = useMutation({
    mutationFn: () =>
      client.accounts.link({
        store,
        value: value.trim(),
        label: label.trim() || null,
      }),
    onSuccess: async () => {
      setValue('');
      setLabel('');
      await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
      toast.success(t('linked'));
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('linkFailed') })),
  });

  return (
    <div className="grid gap-3">
      {loginUrl.data?.url && (
        <Button
          variant="outline"
          className="justify-self-start"
          onClick={() => window.open(loginUrl.data.url!, '_blank', 'noopener')}
        >
          {t('openLogin')}
        </Button>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`collega-${store}`}>
          {loginUrl.data?.url ? t('pasteStep') : tStore('inputLabel')}
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`collega-${store}`}
            className="min-w-64 flex-1"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={tStore('placeholder')}
          />
          <Button
            onClick={() => link.mutate()}
            disabled={value.trim().length === 0 || link.isPending}
          >
            {submitLabel}
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`etichetta-${store}`}>{t('labelField')}</Label>
        <Input
          id={`etichetta-${store}`}
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder={t('labelPlaceholder')}
          maxLength={60}
        />
        {/* Facoltativa, e detto: con un account solo non serve a niente. */}
        <p className="text-muted-foreground">{t('labelHint')}</p>
      </div>

      <p className="text-muted-foreground">{tStore('hint')}</p>
    </div>
  );
}
