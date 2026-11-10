import { useTranslations } from 'use-intl';

import { AppShell } from './app-shell';
import { ButtonLink } from './button-link';
import { Page } from './page';

/** Il 404 usa la stessa cornice e la stessa via d’uscita delle schede mancanti. */
export function NotFoundPage() {
  const t = useTranslations('notFound');

  return (
    <AppShell>
      <Page title={t('title')} subtitle={t('description')}>
        <ButtonLink href="/" variant="outline" width="max-content">
          {t('back')}
        </ButtonLink>
      </Page>
    </AppShell>
  );
}
