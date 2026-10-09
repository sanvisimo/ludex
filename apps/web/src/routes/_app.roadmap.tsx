import { Badge, Button, Text, XStack, YStack } from '@repo/ui';
import { Check } from '@repo/ui/icons';
import { createFileRoute } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { issuesUrl } from '@/lib/credits';
import { roadmap, type RoadmapEntry, type RoadmapStatus } from '@/lib/roadmap';
import { Page } from '@/src/components/page';

export const Route = createFileRoute('/_app/roadmap')({
  component: RoadmapPage,
});

// Le chiavi dei messaggi sono gli `id` di `lib/roadmap.ts`, e il tipo dei
// messaggi non sa che ogni id ne ha una: come in `/credits`, un id senza testo
// si vede subito in pagina.
type Translate = (key: string) => string;

function RoadmapPage() {
  const t = useTranslations('roadmap') as Translate;

  return (
    <Page title={t('title')} subtitle={t('subtitle')} maxW={1120}>
      {/* La timeline a sinistra e l'invito a destra da `$lg`; sotto, l'invito
          viene dopo, in fondo. Come nella pagina del gioco, sotto la soglia la
          colonna principale vuole `flexBasis: 'auto'`: la base 0 di `flex={1}`
          le darebbe un'altezza zero. */}
      <XStack
        gap={32}
        items="flex-start"
        $max-lg={{ flexDirection: 'column', items: 'stretch' }}
      >
        <YStack
          flex={1}
          minW={0}
          $max-lg={{ width: '100%', flexBasis: 'auto' }}
        >
          <YStack render="ol" m={0} p={0} style={{ listStyle: 'none' }}>
            {roadmap.map((entry, index) => (
              <Entry
                key={entry.id}
                entry={entry}
                last={index === roadmap.length - 1}
              />
            ))}
          </YStack>
        </YStack>
        {/* In colonna resta in vista mentre si scorre la timeline, che è lunga. */}
        <YStack
          width={280}
          shrink={0}
          $max-lg={{ width: '100%' }}
          style={{ position: 'sticky', top: 72 }}
        >
          <Invitation />
        </YStack>
      </XStack>
    </Page>
  );
}

/**
 * Una voce della timeline. Il colore è uno solo, il teal dell'accento: gli
 * stati si distinguono per **come è riempito** il pallino e l'etichetta — pieno
 * con la spunta, pieno con l'alone, col solo bordo, tratteggiato — e mai per la
 * tinta, o la pagina diventa un arcobaleno. Lo stato è scritto anche a parole,
 * perché un pallino non lo legge chi non lo vede.
 */
function Entry({ entry, last }: { entry: RoadmapEntry; last: boolean }) {
  const t = useTranslations('roadmap') as Translate;
  const format = useFormatter();
  const done = entry.status === 'done';

  // Il mese è `AAAA-MM`: in UTC da tutte e due le parti, o server e browser
  // scrivono due mesi diversi a cavallo della mezzanotte.
  const month = entry.month
    ? format.dateTime(new Date(`${entry.month}-01T00:00:00Z`), {
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
      })
    : null;

  return (
    <YStack
      render="li"
      position="relative"
      ml={8}
      pl={28}
      pb={last ? 0 : 28}
      borderLeftWidth={2}
      // L'ultima voce non ha niente sotto: la linea si ferma al suo pallino.
      borderLeftColor={last ? 'transparent' : '$accent6'}
    >
      <Dot status={entry.status} />
      <YStack gap={6}>
        <XStack flexWrap="wrap" items="center" gap={8}>
          {entry.status === 'done' ? (
            <Text fontSize={13} lineHeight={20} color="$color11">
              {t('status.done')} · {month}
            </Text>
          ) : (
            <StatusBadge status={entry.status} />
          )}
          {entry.areas.map((area) => (
            <Badge key={area} variant="secondary">
              {t(`areas.${area}`)}
            </Badge>
          ))}
        </XStack>
        <Text
          render="h2"
          m={0}
          fontFamily="$heading"
          fontSize={18}
          lineHeight={26}
          fontWeight="600"
          color={done ? '$accent11' : '$color12'}
        >
          {t(`items.${entry.id}.title`)}
        </Text>
        {done ? (
          <YStack
            render="ul"
            gap={4}
            m={0}
            pl={20}
            style={{ listStyle: 'disc' }}
          >
            {Array.from({ length: entry.points ?? 0 }, (_, i) => (
              <YStack render="li" key={i} style={{ display: 'list-item' }}>
                <Body>{t(`items.${entry.id}.p${i + 1}`)}</Body>
              </YStack>
            ))}
          </YStack>
        ) : (
          <Body>{t(`items.${entry.id}.text`)}</Body>
        )}
      </YStack>
    </YStack>
  );
}

/** Il pallino sulla linea, a cavallo del suo bordo. */
function Dot({ status }: { status: RoadmapStatus }) {
  const common = {
    position: 'absolute',
    t: 2,
    l: -10,
    width: 18,
    height: 18,
    rounded: 999,
    items: 'center',
    justify: 'center',
    'aria-hidden': true,
  } as const;

  if (status === 'done') {
    return (
      <XStack {...common} bg="$accent9">
        <Check size={12} color="$black1" />
      </XStack>
    );
  }
  if (status === 'doing') {
    return (
      <XStack
        {...common}
        bg="$accent9"
        borderWidth={4}
        borderColor="$accent5"
      />
    );
  }
  if (status === 'next') {
    return (
      <XStack
        {...common}
        bg="$background"
        borderWidth={2}
        borderColor="$accent9"
      />
    );
  }
  return (
    <XStack
      {...common}
      bg="$background"
      borderWidth={2}
      borderStyle="dashed"
      borderColor="$color9"
    />
  );
}

function StatusBadge({ status }: { status: Exclude<RoadmapStatus, 'done'> }) {
  const t = useTranslations('roadmap') as Translate;
  const label = t(`status.${status}`);

  if (status === 'doing') return <Badge variant="default">{label}</Badge>;
  if (status === 'next') {
    return (
      <Badge variant="outline" borderColor="$accent9">
        {label}
      </Badge>
    );
  }
  return <Badge variant="secondary">{label}</Badge>;
}

/**
 * Chiude la pagina con la strada per dire la propria: le issue di GitHub,
 * dove stanno anche le segnalazioni. Il riquadro è l'altro posto, con la linea,
 * dove compare il teal.
 */
function Invitation() {
  const t = useTranslations('roadmap') as Translate;

  return (
    <YStack
      gap={12}
      p={20}
      rounded={12}
      bg="$accent3"
      borderWidth={1}
      borderColor="$accent6"
    >
      <YStack gap={4}>
        <Text
          render="h2"
          m={0}
          fontFamily="$heading"
          fontSize={18}
          lineHeight={26}
          fontWeight="600"
          color="$color12"
        >
          {t('cta.title')}
        </Text>
        <Body>{t('cta.text')}</Body>
      </YStack>
      <XStack>
        <Button
          render="a"
          // Come in `ButtonLink`, ma verso fuori: `href` arriva all'`<a>` e il
          // browser fa il resto. I tipi del Button non conoscono gli attributi
          // del link.
          {...({
            href: issuesUrl,
            target: '_blank',
            rel: 'noopener noreferrer',
          } as object)}
        >
          {t('cta.button')}
        </Button>
      </XStack>
    </YStack>
  );
}

/** Un paragrafo: lo stesso di `/credits`, perché le pagine si leggano uguali. */
function Body({ children }: { children: ReactNode }) {
  return (
    <Text fontSize={15} lineHeight={22} color="$color12" m={0}>
      {children}
    </Text>
  );
}
