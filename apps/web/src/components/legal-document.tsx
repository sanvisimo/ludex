import { Text, YStack } from '@repo/ui';
import { Fragment } from 'react';
import { useLocale } from 'use-intl';

import { defaultLocale, isLocale } from '@/i18n/config';
import type { LegalDoc } from '@/lib/legal';
import { ExternalLink } from '@/src/components/external-link';
import { Page } from '@/src/components/page';

// Indirizzi ed email dentro il testo diventano link: i testi sono scritti in
// chiaro in `lib/legal.ts`, e un indirizzo che non si può cliccare è una
// scomodità inutile.
const LINKS = /(https?:\/\/[^\s]*[^\s.,)]|[\w.+-]+@[\w-]+\.[\w.-]*\w)/;

function Linkified({ text }: { text: string }) {
  return (
    <>
      {text.split(LINKS).map((part, index) => {
        // `split` con un gruppo di cattura alterna testo e corrispondenza.
        if (index % 2 === 0) return <Fragment key={index}>{part}</Fragment>;
        const href = part.includes('@') ? `mailto:${part}` : part;
        return (
          <ExternalLink key={index} href={href}>
            {part}
          </ExternalLink>
        );
      })}
    </>
  );
}

/**
 * Una pagina di testo legale — informativa, condizioni — nella lingua di chi
 * guarda. I testi stanno in `lib/legal.ts`, una `LegalDoc` per lingua.
 */
export function LegalDocument({ docs }: { docs: Record<string, LegalDoc> }) {
  const locale = useLocale();
  const doc = docs[isLocale(locale) ? locale : defaultLocale]!;

  return (
    <Page title={doc.title} subtitle={doc.updated}>
      {doc.sections.map((section) => (
        <YStack key={section.heading} gap={8}>
          <Text
            render="h2"
            fontFamily="$heading"
            fontSize={18}
            lineHeight={24}
            fontWeight="600"
            color="$color12"
            m={0}
          >
            {section.heading}
          </Text>
          {section.blocks.map((block, index) =>
            typeof block === 'string' ? (
              <Text
                key={index}
                fontSize={15}
                lineHeight={22}
                color="$color12"
                m={0}
              >
                <Linkified text={block} />
              </Text>
            ) : (
              <YStack
                key={index}
                render="ul"
                gap={6}
                m={0}
                pl={20}
                style={{ listStyle: 'disc' }}
              >
                {block.map((item) => (
                  <Text
                    key={item}
                    render="li"
                    style={{ display: 'list-item' }}
                    fontSize={15}
                    lineHeight={22}
                    color="$color12"
                  >
                    <Linkified text={item} />
                  </Text>
                ))}
              </YStack>
            ),
          )}
        </YStack>
      ))}
    </Page>
  );
}
