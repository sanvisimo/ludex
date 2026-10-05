import type { GuidedStore } from '@repo/contracts';
import { checkPastedLogin } from '@repo/contracts';
import { Button, Input, Label, toast } from '@repo/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { useState } from 'react';

import { NintendoLinkIllustration } from '@/components/nintendo-link-illustration';
import { useApiErrorMessage } from '@/lib/api-error';
import { linkGuide } from '@/lib/link-guide';
import { api, client } from '@/lib/orpc';

/**
 * Il gesto del collegamento, **a passi**: apri il login, fai quello che il negozio
 * ti chiede, incolla quello che vedi.
 *
 * Uno solo per tutti i negozi e per tutti e due i momenti in cui serve —
 * aggiungere un account e ricollegarne uno scaduto — perché è letteralmente lo
 * stesso gesto. Cambia **cosa** si fa e **cosa** si incolla: l'indirizzo su cui si
 * atterra dopo il login per GOG, un testo per Epic, e per Nintendo l'indirizzo di
 * un pulsante che non si clicca. Steam non passa da qui: ha il suo modo.
 *
 * Una frase per passo, tutti visibili: il passo che non si indovina da soli (il
 * clic destro di Nintendo) ha il suo numero e un disegno, e la spiegazione lunga
 * non è più un paragrafo in fondo ma sta richiusa sotto, a chi la vuole. Il
 * campo dice **mentre si incolla** se sembra quello giusto (`checkPastedLogin`),
 * senza bloccare niente: decide il server.
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
  onLinked,
}: {
  store: GuidedStore;
  accountId?: string;
  submitLabel: string;
  /** Dopo un collegamento riuscito: chi sta in un dialogo lo chiude da qui. */
  onLinked?: () => void;
}) {
  const t = useTranslations('account.store');
  const tStore = useTranslations(`account.stores.${store}`);
  const guide = linkGuide[store];
  // I passi sono un elenco nei messaggi: una frase per azione, l'ultima è «incolla».
  const steps = tStore.raw('steps') as string[];
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();

  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  // Lo `state` del login che l'utente ha **davvero** aperto. Su Amazon cambia a
  // ogni richiesta (è il serial di un dispositivo nuovo), e il codice che torna
  // vale solo con quello: rileggerlo dalla query al momento di collegare
  // vorrebbe dire rischiare di mandarne uno diverso.
  const [openedState, setOpenedState] = useState<string | null>(null);

  // L'indirizzo da aprire: del login, o della pagina del codice su PSN. Mai
  // ricaricata da sola: al ritorno dalla scheda del negozio un refetch cambierebbe
  // il link sotto al bottone.
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
      onLinked?.();
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

  const inputId = `collega-${store}`;
  const check = checkPastedLogin(store, value);

  return (
    <div className="grid gap-5">
      <ol className="m-0 grid list-none gap-5 p-0">
        {steps.map((text, index) => {
          const last = index === steps.length - 1;
          return (
            <li key={index} className="flex gap-3">
              <span
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium"
              >
                {index + 1}
              </span>
              <div className="grid min-w-0 flex-1 gap-2">
                {last ? (
                  <Label htmlFor={inputId}>{text}</Label>
                ) : (
                  <p className="m-0">{text}</p>
                )}

                {index === guide.openAt && loginUrl.data?.url && (
                  <Button
                    variant="outline"
                    width="max-content"
                    onClick={() => {
                      setOpenedState(loginUrl.data.state);
                      window.open(loginUrl.data.url!, '_blank', 'noopener');
                    }}
                  >
                    {tStore('openLabel')}
                  </Button>
                )}

                {index === guide.illustrationAt && store === 'nintendo' && (
                  <NintendoLinkIllustration />
                )}

                {last && (
                  <>
                    <div className="flex flex-wrap gap-2">
                      <Input
                        id={inputId}
                        minW={256}
                        flex={1}
                        value={value}
                        onChange={(event) => setValue(event.target.value)}
                        placeholder={tStore('placeholder')}
                        aria-describedby={`${inputId}-check`}
                      />
                      <Button
                        onClick={() => link.mutate()}
                        disabled={value.trim().length === 0 || link.isPending}
                      >
                        {submitLabel}
                      </Button>
                    </div>
                    {/* Sempre in pagina, anche vuoto: un'area `status` che
                        compare insieme al suo testo non viene annunciata. Non
                        blocca il pulsante: il server decide. */}
                    <p
                      id={`${inputId}-check`}
                      role="status"
                      className={
                        check === 'wrong'
                          ? 'm-0 min-h-5 text-sm text-destructive'
                          : 'm-0 min-h-5 text-sm text-muted-foreground'
                      }
                    >
                      {check === 'ok' && `✓ ${t('pasteOk')}`}
                      {check === 'wrong' && tStore('wrong')}
                    </p>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {/* Richiudibili: servono a chi li cerca, e non stanno fra i passi. */}
      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm">{t('labelField')}</summary>
        <div className="mt-2 grid gap-2">
          <Input
            id={`etichetta-${store}`}
            aria-label={t('labelField')}
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            placeholder={t('labelPlaceholder')}
            maxLength={60}
          />
          {/* Facoltativa, e detto: con un account solo non serve a niente. */}
          <p className="m-0 text-sm text-muted-foreground">{t('labelHint')}</p>
        </div>
      </details>

      <details className="rounded-lg border px-3 py-2">
        <summary className="cursor-pointer text-sm">{t('knowMore')}</summary>
        <p className="mt-2 mb-0 text-sm text-muted-foreground">
          {tStore('note')}
        </p>
      </details>
    </div>
  );
}
