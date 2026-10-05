import { useTranslations } from 'use-intl';

/**
 * Il passo del clic destro di Nintendo, disegnato.
 *
 * Sulla pagina «Link an account» il pulsante finale non si clicca: punta a un
 * indirizzo `npf…://` che il browser non apre, e va copiato col clic destro. È il
 * passo che nessuno indovina da solo, ed è per questo che ha un disegno.
 *
 * **Schematico di proposito**: un pulsante e un menu, non la pagina di Nintendo.
 * Non riproduce la loro interfaccia, che può cambiare, e nemmeno il menu del
 * browser, che cambia da un browser all'altro (Chrome «Copia indirizzo del link»,
 * Edge «Copia collegamento»). Lo dice la didascalia.
 *
 * Decorativo per chi usa uno screen reader: il passo a parole dice la stessa cosa.
 */
export function NintendoLinkIllustration() {
  const t = useTranslations('account.nintendoGuide');

  return (
    <figure className="m-0 grid gap-1">
      <div
        aria-hidden="true"
        className="relative h-36 w-full max-w-sm rounded-lg border bg-muted/50 p-3"
      >
        <div className="flex items-center gap-3">
          <div className="size-9 rounded-full bg-muted" />
          <span className="text-sm text-muted-foreground">{t('name')}</span>
          <span className="ml-auto rounded-full bg-destructive px-3 py-1 text-xs text-white">
            {t('button')}
          </span>
        </div>
        <div className="absolute right-3 top-14 grid w-48 gap-0.5 rounded-md border bg-background p-1 text-xs shadow">
          <span className="rounded px-2 py-1 text-muted-foreground">
            {t('menuTop')}
          </span>
          <span className="rounded bg-muted px-2 py-1 font-medium">
            {t('menuCopy')}
          </span>
        </div>
      </div>
      <figcaption className="text-xs text-muted-foreground">
        {t('caption')}
      </figcaption>
    </figure>
  );
}
