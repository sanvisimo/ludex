'use client';

import type { LinkableStore } from '@repo/contracts';
import { Button, Input, Label, toast } from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

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
 *
 * `accountId` c'è quando si ricollega: il server controlla che il login sia
 * stato fatto proprio con quell'account, e Amazon riusa il suo dispositivo.
 */
export function StoreLinkForm({
  store,
  accountId,
  submitLabel,
}: {
  store: LinkableStore;
  accountId?: string;
  submitLabel: string;
}) {
  const t = useTranslations('account.store');
  const tStore = useTranslations(`account.stores.${store}`);
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  // Lo `state` del login che l'utente ha **davvero** aperto. Su Amazon cambia a
  // ogni richiesta (è il serial di un dispositivo nuovo), e il codice che torna
  // vale solo con quello: rileggerlo dalla query al momento di collegare
  // vorrebbe dire rischiare di mandarne uno diverso.
  const [openedState, setOpenedState] = useState<string | null>(null);

  // Solo per i negozi che hanno un login da aprire: Steam rende null, perché lì
  // l'utente ha già sottomano il proprio profilo. Mai ricaricata da sola: al
  // ritorno dalla scheda del negozio un refetch cambierebbe il link sotto al
  // bottone.
  const loginUrl = useQuery({
    ...api.accounts.loginUrl.queryOptions({ input: { store, accountId } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  const link = useMutation({
    mutationFn: () =>
      client.accounts.link({
        store,
        value: value.trim(),
        label: label.trim() || null,
        state: openedState ?? loginUrl.data?.state ?? null,
        accountId: accountId ?? null,
      }),
    onSuccess: async () => {
      setValue('');
      setLabel('');
      setOpenedState(null);
      // Un link usato non si riusa: su Amazon porta il serial del dispositivo
      // appena registrato, e collegarci un secondo account gli toglierebbe il
      // dispositivo — il bug che il serial per account è venuto a chiudere.
      await queryClient.invalidateQueries({
        queryKey: api.accounts.loginUrl.key(),
      });
      await queryClient.invalidateQueries({
        queryKey: api.accounts.list.key(),
      });
      toast.success(t('linked'));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t('linkFailed'),
          // Solo sui ricollegamenti: il negozio ha reso un altro account.
          CONFLICT: t('wrongAccount'),
        }),
      ),
  });

  return (
    <div className="grid gap-3">
      {loginUrl.data?.url && (
        <Button
          variant="outline"
          width="max-content"
          onClick={() => {
            setOpenedState(loginUrl.data.state);
            window.open(loginUrl.data.url!, '_blank', 'noopener');
          }}
        >
          {t('openLogin')}
        </Button>
      )}

      <div className="grid gap-2">
        <Label htmlFor={`collega-${store}`}>
          {loginUrl.data?.url
            ? t('pasteStep', {
                address:
                  store === 'psn' ? t('pasteContent') : t('pasteAddress'),
              })
            : tStore('inputLabel')}
        </Label>
        <div className="flex flex-wrap gap-2">
          <Input
            id={`collega-${store}`}
            minW={256}
            flex={1}
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
