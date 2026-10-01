import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  Text,
  YStack,
} from '@repo/ui';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import {
  contactEmail,
  icons,
  licenseUrl,
  platformIconsLicense,
  repoUrl,
  services,
  software,
  type Credit,
} from '@/lib/credits';
import { ExternalLink } from '@/src/components/external-link';
import { Page } from '@/src/components/page';

export const Route = createFileRoute('/_app/credits')({
  component: CreditsPage,
});

type Section = 'services' | 'software' | 'icons';

function CreditsPage() {
  const t = useTranslations('credits');

  return (
    <Page title={t('title')} subtitle={t('subtitle')}>
      <YStack gap={8}>
        <Body>{t('about.text')}</Body>
        <Body>
          <ExternalLink href={repoUrl}>{t('about.source')}</ExternalLink>
          {' · '}
          <ExternalLink href={licenseUrl}>AGPL-3.0</ExternalLink>
          {' · '}
          {t('about.contact')}:{' '}
          <ExternalLink href={`mailto:${contactEmail}`}>
            {contactEmail}
          </ExternalLink>
        </Body>
      </YStack>
      {/* Tutte aperte tranne il software: è l'elenco più lungo, e quello che
          interessa meno a chi arriva qui. */}
      <Accordion defaultValue={['services', 'icons']}>
        <CreditSection section="services" credits={services} />
        <CreditSection
          section="icons"
          credits={icons}
          footer={
            <Body>
              {t('icons.trademarks')}{' '}
              <ExternalLink href={platformIconsLicense}>
                {t('icons.fullList')}
              </ExternalLink>
            </Body>
          }
        />
        <CreditSection section="software" credits={software} />
      </Accordion>
    </Page>
  );
}

function CreditSection({
  section,
  credits,
  footer,
}: {
  section: Section;
  credits: Credit[];
  footer?: ReactNode;
}) {
  // Le chiavi dei testi sono gli `id` di `lib/credits.ts`, e il tipo dei
  // messaggi non sa che ogni id ne ha una. Un id senza testo si vede subito
  // in pagina (use-intl scrive la chiave al posto del testo).
  const t = useTranslations(`credits.${section}`) as (key: string) => string;

  return (
    <AccordionItem value={section}>
      <AccordionTrigger variant="heading">{t('title')}</AccordionTrigger>
      <AccordionContent>
        <YStack gap={8}>
          <Body>{t('intro')}</Body>
          <YStack
            render="ul"
            gap={8}
            m={0}
            pl={20}
            style={{ listStyle: 'disc' }}
          >
            {credits.map((credit) => (
              <YStack
                render="li"
                key={credit.id}
                gap={2}
                style={{ display: 'list-item' }}
              >
                <Text fontSize={15} lineHeight={22} color="$color12">
                  <ExternalLink href={credit.url} strong>
                    {credit.name}
                  </ExternalLink>
                  {credit.license && (
                    <>
                      {' · '}
                      {credit.licenseUrl ? (
                        <ExternalLink href={credit.licenseUrl}>
                          {credit.license}
                        </ExternalLink>
                      ) : (
                        credit.license
                      )}
                    </>
                  )}
                </Text>
                <Body>
                  {' · '}
                  {t(credit.id)}
                  {credit.note ? ` ${t(`${credit.id}Note`)}` : ''}
                </Body>
              </YStack>
            ))}
          </YStack>
          {footer}
        </YStack>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Un paragrafo: lo stesso di `LegalDocument`, perché le pagine si leggano uguali. */
function Body({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={15} lineHeight={22} color="$color12" m={0}>
      {children}
    </Text>
  );
}
