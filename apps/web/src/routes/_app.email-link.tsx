import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@repo/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { ButtonLink } from '@/src/components/button-link';
import { Page } from '@/src/components/page';
import { useSession } from '@/src/use-session';

type Step = 'signup' | 'change-confirmed' | 'change-done';

const steps: readonly Step[] = ['signup', 'change-confirmed', 'change-done'];

export const Route = createFileRoute('/_app/email-link')({
  // `step` lo scrive il web quando chiede il link, e per il secondo link del
  // cambio email `packages/auth/src/email-links.ts`; `error` lo aggiunge
  // Better Auth quando il token è scaduto, già usato o non valido.
  validateSearch: (
    search: Record<string, unknown>,
  ): { step?: Step; error?: string } => ({
    step: steps.includes(search.step as Step)
      ? (search.step as Step)
      : undefined,
    error: typeof search.error === 'string' ? search.error : undefined,
  }),
  head: () => ({ meta: [{ name: 'robots', content: 'noindex, nofollow' }] }),
  component: EmailLinkPage,
});

/**
 * Dove arrivano tutti i link delle email (rilascio, `plans/rilascio.md`): la
 * conferma della registrazione e i due link del cambio email. È pubblica e
 * nel guscio, perché un link si apre anche dove non si è entrati: l'app di
 * posta del telefono, un altro browser. Il primo link del cambio non apre
 * una sessione; la conferma della registrazione e il secondo link sì.
 */
function EmailLinkPage() {
  const t = useTranslations('emailLink');
  const { step = 'signup', error } = Route.useSearch();
  const { data: session, isPending } = useSession();

  const change = step !== 'signup';
  const failed = Boolean(error);
  const key = failed
    ? change
      ? 'changeFailed'
      : 'signupFailed'
    : step === 'change-confirmed'
      ? 'changeConfirmed'
      : step === 'change-done'
        ? 'changeDone'
        : 'signup';

  // Dove porta il bottone: al profilo o al backlog da dentro, all'accesso da
  // fuori. Il primo link del cambio non ne ha: resta solo da aprire l'altro.
  const action =
    key === 'changeConfirmed'
      ? null
      : session
        ? change
          ? { href: '/account/profile', label: t('toProfile') }
          : { href: '/backlog', label: t('toBacklog') }
        : { href: '/login', label: t('toLogin') };

  return (
    <Page maxW={480}>
      <Card>
        <CardHeader>
          <CardTitle fontSize={18} lineHeight={28}>
            {t(`${key}.title`)}
          </CardTitle>
          <CardDescription>
            {t(`${key}.text`, { email: session?.user.email ?? '' })}
          </CardDescription>
        </CardHeader>
        {action && (
          <CardContent>
            {isPending ? (
              <Skeleton height={40} width="100%" rounded={8} />
            ) : (
              <ButtonLink href={action.href}>{action.label}</ButtonLink>
            )}
          </CardContent>
        )}
      </Card>
    </Page>
  );
}
