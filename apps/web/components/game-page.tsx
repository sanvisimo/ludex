import type {
  BacklogEntry,
  BacklogStatus,
  GameDetail,
  GameScore,
  RelatedGame,
} from '@repo/contracts';
import { storePageUrl } from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  brandTitle,
  Button,
  CornerLabel,
  Dialog,
  DialogContent,
  DialogTitle,
  Gallery,
  Text,
  Theme,
  XStack,
  YStack,
  type GalleryItem,
} from '@repo/ui';
import { ArrowDown, ArrowUpRight, Gamepad2, Globe, Info } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { BadgeLink } from '@/components/badge-link';
import { StatusButton } from '@/components/backlog-views';
import { CriticScores } from '@/components/critic-scores';
import { Muted, Strong } from '@/components/detail-text';
import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { useOpenIgdbHit } from '@/components/game-search';
import { GameTypeBadge } from '@/components/game-type-badge';
import { PlayedTime } from '@/components/played-time';
import { HltbTimes } from '@/components/hltb-times';
import { RatingStars } from '@/components/rating-stars';
import { ScrollRow } from '@/components/scroll-row';
import { statusIcons } from '@/components/status-icon';
import { useBacklogHref } from '@/lib/backlog-filter';
import { useDuration } from '@/lib/duration';
import { igdbImageUrl } from '@/lib/igdb-image';
import { STORE_BRAND } from '@/lib/store-brand';
import { useStatusLabels, useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

/**
 * Pagina del gioco: hero compatta, fascia personale e due colonne desktop.
 * Su mobile: durata/critica, gallery/descrizione, copie/link e giochi legati.
 * Revisione approvata in `plans/revisione-web.md`.
 */

/**
 * Una riga che, se c'è dove portare, è tutta un link che esce dall'app:
 * icona e testo insieme, non la sola icona. Senza `href` è la stessa riga,
 * ferma.
 */
function LinkRow({
  href,
  title,
  children,
  items = 'center',
  tile = false,
}: {
  href: string | null;
  /** Il suggerimento al passaggio, es. «Apri su GOG». */
  title: string;
  children: ReactNode;
  items?: 'center' | 'flex-start';
  /** Superficie cliccabile per copie e destinazioni esterne. */
  tile?: boolean;
}) {
  return (
    <XStack
      render={href ? 'a' : 'div'}
      {...(href
        ? ({
            href,
            target: '_blank',
            rel: 'noopener noreferrer',
            title,
            style: { textDecoration: 'none', color: 'inherit' },
          } as object)
        : {})}
      items={items}
      gap={tile ? 8 : 10}
      minW={0}
      minH={tile ? 48 : undefined}
      mx={tile || !href ? 0 : -6}
      px={tile ? 10 : href ? 6 : 0}
      py={tile ? 10 : href ? 2 : 0}
      rounded={tile ? 10 : 6}
      bg={tile ? '$color3' : 'transparent'}
      borderWidth={tile ? 1 : 0}
      borderColor="$borderColor"
      cursor={href ? 'pointer' : undefined}
      hoverStyle={href ? { bg: '$color4' } : undefined}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
      }}
    >
      {children}
      {tile && href && (
        <XStack shrink={0} pt={items === 'flex-start' ? 2 : 0}>
          <ArrowUpRight size={13} color="$color11" aria-hidden />
        </XStack>
      )}
    </XStack>
  );
}

// --- la hero ---

/**
 * L'immagine grande in testa: l'artwork IGDB; se manca il primo screenshot;
 * se manca anche quello la copertina, sfocata. Sopra, in basso, copertina,
 * titolo, anno, autori e generi e temi come badge.
 *
 * Il testo sta sempre su un fondo scuro — la sfumatura sopra l'immagine — e
 * per questo la hero è in tema scuro qualunque sia quello dell'app.
 *
 * L'immagine va da un bordo all'altro della finestra (`Page` la mette fuori
 * dal suo respiro); il testo sopra resta allineato alla colonna della pagina,
 * larga `GAME_PAGE_WIDTH`.
 */
export const GAME_PAGE_WIDTH = 1200;

export function GameHero({ game }: { game: GameDetail }) {
  const year = game.firstReleaseDate?.getFullYear() ?? null;
  // Da loggati generi, temi e tipo portano a `/backlog` filtrato; da anonimi
  // restano semplici, perché `/backlog` è privato. E solo se sono fra le voci
  // del pannello dei filtri, cioè se il tuo backlog ne ha almeno uno: altrimenti
  // il link aprirebbe una lista vuota, con un chip che il nome non lo sa.
  const { data: session } = useSession();
  const backlogHref = useBacklogHref();
  const { data: options } = useQuery({
    ...api.backlog.filterOptions.queryOptions(),
    enabled: !!session,
  });
  const attributeIds = new Set(options?.attributes.map((row) => row.id));
  const typeHref =
    game.gameType && options?.gameTypes.includes(game.gameType)
      ? backlogHref({ gameTypes: [game.gameType] })
      : undefined;

  const artwork = game.artworkImageIds?.[0] ?? game.screenshotImageIds?.[0];
  const background = artwork
    ? { src: igdbImageUrl(artwork, '1080p', false), blur: false }
    : game.coverImageId
      ? { src: igdbImageUrl(game.coverImageId, 'cover_big'), blur: true }
      : null;

  const meta = [
    year,
    game.developers?.length ? game.developers.join(', ') : null,
    game.publishers?.length &&
    game.publishers.join(', ') !== game.developers?.join(', ')
      ? game.publishers.join(', ')
      : null,
  ].filter(Boolean);

  return (
    <Theme name="dark">
      <YStack
        position="relative"
        overflow="hidden"
        bg="$color2"
        minH={320}
        justify="flex-end"
        $max-md={{ minH: 240 }}
      >
        {background && (
          <img
            src={background.src}
            alt=""
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              ...(background.blur && {
                filter: 'blur(24px)',
                transform: 'scale(1.2)',
              }),
            }}
          />
        )}
        <YStack
          position="absolute"
          t={0}
          r={0}
          b={0}
          l={0}
          style={{
            backgroundImage:
              'linear-gradient(to top, rgba(10,12,14,0.95) 0%, rgba(10,12,14,0.6) 45%, rgba(10,12,14,0.1) 100%)',
          }}
        />

        <XStack
          position="relative"
          width="100%"
          maxW={GAME_PAGE_WIDTH}
          mx="auto"
          p={24}
          gap={20}
          items="flex-end"
        >
          <YStack $max-sm={{ display: 'none' }}>
            <GameCover
              imageId={game.coverImageId}
              name={game.name}
              size="cover_big"
              width={132}
            />
          </YStack>
          <YStack flex={1} minW={0} gap={8}>
            <XStack flexWrap="wrap" items="center" gap={8}>
              <Text
                render="h1"
                fontFamily="$heading"
                fontSize={30}
                lineHeight={36}
                fontWeight="700"
                color="$color12"
                m={0}
                $max-sm={{ fontSize: 24, lineHeight: 30 }}
              >
                {game.name}
              </Text>
              <GameTypeBadge type={game.gameType} href={typeHref} />
            </XStack>
            {meta.length > 0 && <Muted>{meta.join(' · ')}</Muted>}
            {game.attributes.length > 0 && (
              <XStack flexWrap="wrap" gap={6}>
                {game.attributes.map((attribute) =>
                  attributeIds.has(attribute.id) ? (
                    <BadgeLink
                      key={attribute.id}
                      variant="secondary"
                      href={backlogHref({ attributes: [attribute.id] })}
                    >
                      {attribute.name}
                    </BadgeLink>
                  ) : (
                    <Badge key={attribute.id} variant="secondary">
                      {attribute.name}
                    </Badge>
                  ),
                )}
              </XStack>
            )}
          </YStack>
        </XStack>
      </YStack>
    </Theme>
  );
}

// --- la gallery ---

export function GameGallery({ game }: { game: GameDetail }) {
  const t = useTranslations('game');

  const items: GalleryItem[] = [
    ...(game.videos ?? []).map(
      (video): GalleryItem => ({
        kind: 'video',
        videoId: video.videoId,
        title: video.name ?? 'Trailer',
      }),
    ),
    ...(game.screenshotImageIds ?? []).map(
      (imageId, index): GalleryItem => ({
        kind: 'image',
        src: igdbImageUrl(imageId, 'screenshot_big'),
        thumb: igdbImageUrl(imageId, 'screenshot_med', false),
        full: igdbImageUrl(imageId, '1080p', false),
        alt: t('screenshotAlt', { index: index + 1, name: game.name }),
      }),
    ),
  ];

  if (items.length === 0) return null;

  return (
    <Gallery
      items={items}
      labels={{
        previous: t('galleryPrevious'),
        next: t('galleryNext'),
        play: t('galleryPlay'),
        enlarge: t('galleryEnlarge'),
        close: t('galleryClose'),
        item: (index, total) => t('galleryItem', { index, total }),
      }}
    />
  );
}

// --- la colonna laterale: durata e critica ---

function Panel({
  children,
  id,
  label,
}: {
  children: ReactNode;
  id?: string;
  label?: string;
}) {
  return (
    <YStack
      render={label ? 'section' : 'div'}
      id={id}
      aria-label={label}
      tabIndex={id ? -1 : undefined}
      style={id ? { scrollMarginTop: 96 } : undefined}
      gap={12}
      p={16}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      bg="$color2"
      focusVisibleStyle={
        id
          ? {
              outlineColor: '$outlineColor',
              outlineStyle: 'solid',
              outlineWidth: 2,
            }
          : undefined
      }
    >
      {children}
    </YStack>
  );
}

function PanelTitle({ children }: { children: ReactNode }) {
  return (
    <Text
      render="h2"
      fontFamily="$heading"
      fontSize={16}
      lineHeight={22}
      fontWeight="600"
      color="$color12"
      m={0}
    >
      {children}
    </Text>
  );
}

/**
 * Il voto Metacritic da mostrare: quello della piattaforma su cui ce l'hai, se
 * Metacritic lo dà, altrimenti il complessivo. Su Mafia il complessivo è 66,
 * il port Xbox; chi ce l'ha su PC deve leggere 88.
 */
function metacriticFor(
  scores: GameScore[],
  platformSlugs: string[],
): GameScore | undefined {
  const mine = scores.find(
    (score) =>
      score.source === 'metacritic' &&
      score.platformSlug !== null &&
      platformSlugs.includes(score.platformSlug),
  );
  return (
    mine ??
    scores.find(
      (score) => score.source === 'metacritic' && score.platformSlug === null,
    )
  );
}

/**
 * Il riepilogo al posto del box d'acquisto: tre tempi di HLTB, un voto per
 * fonte, e «Dettagli» per tutto il resto. Ogni fonte ha la sua icona, che
 * porta alla pagina del gioco su quella fonte.
 */
export function DurationAndCritics({
  game,
  entry,
}: {
  game: GameDetail;
  entry: BacklogEntry | null;
}) {
  const t = useTranslations('game');
  const tHltb = useTranslations('hltb');
  const tCritic = useTranslations('critic');
  const duration = useDuration();
  const [open, setOpen] = useState(false);

  // Su un gioco non collegato a IGDB non arriva niente: meglio nessun
  // riquadro che uno che promette dati.
  if (game.igdbId === null) return null;

  const times = (
    [
      ['main', game.hltbMainMinutes],
      ['plus', game.hltbPlusMinutes],
      ['completionist', game.hltbCompletionistMinutes],
    ] as const
  ).filter(([, minutes]) => minutes !== null);

  const platforms = (entry?.ownerships ?? []).map((o) => o.platformSlug);
  // Una fonte senza voto resta in elenco se sappiamo dov'è la sua pagina: il
  // link serve lo stesso, e così non sta in due posti (OpenCritic lo vuole
  // vicino al voto, e senza voto la riga è il posto).
  const scores = [
    {
      source: 'opencritic' as const,
      score: game.scores.find(
        (s) => s.source === 'opencritic' && s.platformSlug === null,
      ),
      link: game.links.opencritic,
    },
    {
      source: 'metacritic' as const,
      score: metacriticFor(game.scores, platforms),
      link: game.links.metacritic,
    },
    {
      source: 'igdb' as const,
      score: game.scores.find(
        (s) => s.source === 'igdb' && s.platformSlug === null,
      ),
      link: game.links.igdb,
    },
  ].filter((row) => row.score !== undefined || row.link !== null);

  return (
    <Panel>
      <YStack gap={12}>
        <LinkRow
          href={game.links.hltb}
          title={t('openOn', { name: 'HowLongToBeat' })}
        >
          <BrandIcon brand="hltb" size={20} />
          <PanelTitle>{tHltb('title')}</PanelTitle>
        </LinkRow>
        {times.length === 0 ? (
          <Muted>
            {game.hltbSyncedAt === null
              ? tHltb('notFetched')
              : tHltb('noTimes')}
          </Muted>
        ) : (
          <XStack gap={8} flexWrap="wrap">
            {times.map(([key, minutes]) => (
              <YStack
                key={key}
                grow={1}
                minW={96}
                p={10}
                rounded={8}
                bg={key === 'main' ? '$selectionBackground' : '$color3'}
                gap={4}
              >
                <Muted fontSize={12} lineHeight={16}>
                  {tHltb(key)}
                </Muted>
                <Strong fontSize={22} lineHeight={28}>
                  {duration(minutes!)}
                </Strong>
              </YStack>
            ))}
          </XStack>
        )}
      </YStack>

      <YStack
        gap={10}
        pt={16}
        mt={4}
        borderTopWidth={1}
        borderColor="$borderColor"
      >
        <PanelTitle>{tCritic('title')}</PanelTitle>
        {scores.length === 0 ? (
          <Muted>{tCritic('none')}</Muted>
        ) : (
          <YStack gap={8}>
            {scores.map(({ source, score, link }) => (
              <LinkRow
                key={source}
                href={link}
                title={t('openOn', { name: tCritic(source) })}
              >
                <BrandIcon brand={source} size={20} />
                <YStack grow={1} shrink={1} minW={0} gap={2}>
                  <Strong fontWeight="500">{tCritic(source)}</Strong>
                  {score?.tier && <Muted fontSize={12}>{score.tier}</Muted>}
                </YStack>
                {score ? (
                  <XStack
                    bg="$color4"
                    rounded={8}
                    px={10}
                    py={6}
                    gap={3}
                    items="baseline"
                  >
                    <Strong fontSize={20} lineHeight={24}>
                      {Math.round(score.score)}
                    </Strong>
                    <Muted fontSize={11}>/100</Muted>
                  </XStack>
                ) : (
                  <Muted fontSize={13}>{tCritic('noScore')}</Muted>
                )}
              </LinkRow>
            ))}
          </YStack>
        )}
        <Button variant="outline" onPress={() => setOpen(true)}>
          <Info size={16} color="$color12" />
          {t('details')}
        </Button>
      </YStack>
      <Dialog modal open={open} onOpenChange={setOpen}>
        <DialogContent closeLabel={t('close')}>
          <DialogTitle>{t('durationAndCritics')}</DialogTitle>
          <HltbTimes game={game} />
          <CriticScores game={game} />
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// --- il prezzo ---

/**
 * Il prezzo più basso di adesso su IsThereAnyDeal, col negozio, e un segnale se
 * è anche il minimo storico. Tutta la card è il link; senza offerte, il solo
 * nome. Solo per i giochi che non hai: la pagina non la monta se sono nel backlog.
 *
 * Il prezzo arriva a parte (`games.price`) perché la pagina non aspetti ITAD: la
 * card compare quando c'è, e non c'è sui giochi che ITAD non conosce.
 *
 * Il nome sta sopra e il prezzo sotto, sempre: nella colonna larga 360 nome,
 * prezzo e segnale su una riga sola non ci stanno, e andare a capo solo quando
 * c'è il segnale faceva cambiare la card da un gioco all'altro.
 */
export function GamePriceCard({ game }: { game: GameDetail }) {
  const t = useTranslations('game');
  const format = useFormatter();
  const { data: price } = useQuery(
    api.games.price.queryOptions({ input: { gameId: game.id } }),
  );
  if (!price) return null;

  const { current } = price;
  const name = brandTitle('itad');

  return (
    <Panel>
      <LinkRow href={price.url} title={t('openOn', { name })}>
        <YStack flex={1} gap={8}>
          <XStack items="center" gap={10}>
            <BrandIcon brand="itad" size={20} />
            <PanelTitle>{name}</PanelTitle>
          </XStack>
          {current && (
            <XStack items="center" gap={6}>
              <Strong fontSize={16}>
                {current.amount === 0
                  ? t('itadFree')
                  : format.number(current.amount, {
                      style: 'currency',
                      currency: current.currency,
                    })}
              </Strong>
              <Muted flex={1}>· {current.shop}</Muted>
              {current.historicalLow && (
                <Badge variant="success">{t('itadHistoricalLow')}</Badge>
              )}
            </XStack>
          )}
        </YStack>
      </LinkRow>
    </Panel>
  );
}

/** Stato e voto al volo, separati dai dettagli delle singole copie. */
export function GamePersonalBar({
  entry,
  onStatus,
  onRating,
}: {
  entry: BacklogEntry;
  onStatus: (entry: BacklogEntry, status: BacklogStatus) => void;
  onRating: (entry: BacklogEntry, rating: number | null) => void;
}) {
  const t = useTranslations('game');
  const statusLabels = useStatusLabels();
  return (
    <YStack
      render="section"
      aria-label={t('inBacklog')}
      gap={12}
      px={20}
      py={16}
      rounded={12}
      bg="$surface"
      borderWidth={1}
      borderColor="$borderColor"
      $max-sm={{ px: 12 }}
    >
      <div className="game-personal-fields">
        <YStack gap={6} minW={0}>
          <Muted fontSize={12}>{t('inBacklog')}</Muted>
          <XStack items="center" gap={8} minH={32}>
            <StatusButton entry={entry} onStatus={onStatus} />
            <Strong shrink={1}>{statusLabels[entry.status]}</Strong>
          </XStack>
        </YStack>
        <YStack className="game-personal-rating" gap={6} minW={0}>
          <Muted fontSize={12}>{t('yourRating')}</Muted>
          <XStack minH={32} items="center">
            <RatingStars
              size="sm"
              value={entry.rating}
              onChange={(rating) => onRating(entry, rating)}
            />
          </XStack>
        </YStack>
        <YStack className="game-personal-collection" gap={6} minW={0}>
          <Muted fontSize={12}>{t('yourCollection')}</Muted>
          <XStack flexWrap="wrap" items="center" minH={32} gap={12}>
            <Button
              variant="ghost"
              size="sm"
              render="a"
              role="link"
              {...({ href: '#game-copies' } as object)}
              px={0}
              gap={4}
            >
              {t('copyCount', { count: entry.ownerships.length })}
              <ArrowDown size={13} color="$color11" aria-hidden />
            </Button>
            <PlayedTime ownerships={entry.ownerships} />
          </XStack>
        </YStack>
      </div>
      {entry.hiddenAt && <Muted>{t('hiddenNotice')}</Muted>}
    </YStack>
  );
}

/** Copie con i loro dati, note e tag; stato e voto sono nella fascia personale. */
export function BacklogPanel({
  entry,
  storeLinks,
  actions,
}: {
  entry: BacklogEntry;
  storeLinks: GameDetail['storeLinks'];
  actions: ReactNode;
}) {
  const t = useTranslations('game');
  const tSubscription = useTranslations('subscription');
  const tMedium = useTranslations('medium');
  const storeLabels = useStoreLabels();
  const duration = useDuration();
  const format = useFormatter();
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });
  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  return (
    <Panel id="game-copies" label={t('copies')}>
      <XStack items="center" justify="space-between" gap={8}>
        <PanelTitle>{t('copies')}</PanelTitle>
        <Badge variant="secondary">{entry.ownerships.length}</Badge>
      </XStack>
      <YStack gap={8}>
        {entry.ownerships.map((ownership) => {
          const brand = ownership.store
            ? STORE_BRAND[ownership.store]
            : undefined;
          const storeName = ownership.store
            ? storeLabels[ownership.store]
            : null;
          const platformName =
            nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug;
          const url =
            storePageUrl(ownership.store, ownership.storePage) ??
            storeLinks.find((link) => link.store === ownership.store)?.url ??
            null;
          const account = [
            ...new Set(
              [
                ownership.storeAccount?.label,
                ownership.storeAccount?.displayName,
              ].filter(Boolean),
            ),
          ];
          const label = [
            ...account,
            ownership.subscription && tSubscription(ownership.subscription),
            ownership.subscriptionEndedAt && t('subscriptionEnded'),
            ownership.medium === 'physical' && tMedium('physical'),
          ]
            .filter(Boolean)
            .join(' · ');
          const dates = [
            ownership.lastPlayedAt
              ? t('lastPlayed', {
                  date: format.dateTime(ownership.lastPlayedAt, {
                    dateStyle: 'medium',
                  }),
                })
              : null,
            ownership.acquiredAt
              ? t('acquired', {
                  date: format.dateTime(ownership.acquiredAt, {
                    dateStyle: 'medium',
                  }),
                })
              : null,
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <LinkRow
              key={ownership.id}
              href={url}
              title={t('openOn', { name: storeName ?? platformName })}
              items="flex-start"
              tile
            >
              <XStack shrink={0} pt={2}>
                {brand ? (
                  <BrandIcon brand={brand} size={24} />
                ) : (
                  <Gamepad2 size={24} color="$color11" aria-hidden />
                )}
              </XStack>
              <YStack grow={1} shrink={1} minW={0} gap={4}>
                <Text
                  fontSize={13}
                  lineHeight={18}
                  color="$color12"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {storeName && (
                    <Text fontWeight="600">
                      {storeName}
                      {' · '}
                    </Text>
                  )}
                  {platformName}
                </Text>
                {label && (
                  <Muted
                    fontSize={12}
                    lineHeight={18}
                    style={{ overflowWrap: 'anywhere' }}
                  >
                    {label}
                  </Muted>
                )}
                {!!ownership.playtimeMinutes && (
                  <Strong fontSize={12} lineHeight={18}>
                    {t('played', {
                      duration: duration(ownership.playtimeMinutes),
                    })}
                  </Strong>
                )}
                {dates && (
                  <Muted fontSize={12} lineHeight={18}>
                    {dates}
                  </Muted>
                )}
              </YStack>
            </LinkRow>
          );
        })}
      </YStack>

      {(entry.notes || entry.tags.length > 0) && (
        <YStack gap={10} pt={12} borderTopWidth={1} borderColor="$borderColor">
          {entry.notes && (
            <YStack gap={4}>
              <Muted fontSize={13}>{t('notes')}</Muted>
              <Text
                fontSize={14}
                lineHeight={20}
                color="$color12"
                style={{ whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}
              >
                {entry.notes}
              </Text>
            </YStack>
          )}
          <EntryTags tags={entry.tags} linked />
        </YStack>
      )}
      <XStack
        flexWrap="wrap"
        gap={8}
        pt={12}
        mt={4}
        borderTopWidth={1}
        borderColor="$borderColor"
      >
        {actions}
      </XStack>
    </Panel>
  );
}

// --- la colonna laterale: dove si compra ---

/**
 * Dove andare per saperne di più o per comprarlo, ognuno con la sua icona e il
 * nome, tutta la riga è il link. Sta sotto il tuo backlog, come durata e
 * critica sopra: sono gli stessi link che escono dall'app, e dicono dove
 * andare.
 *
 * In cima il sito ufficiale, poi i negozi (`storeLinks`, nostri o di IGDB dove
 * mancano), poi i negozi che non sono nostri, e Wikipedia in fondo. Senza
 * nessun link non c'è la card.
 */
export function StoreLinks({ game }: { game: GameDetail }) {
  const t = useTranslations('game');
  const storeLabels = useStoreLabels();

  const official = game.websites.find((site) => site.type === 'official');
  const otherStores = (['itch', 'app_store', 'google_play'] as const).flatMap(
    (type) => {
      const site = game.websites.find((row) => row.type === type);
      return site ? [{ type, url: site.url }] : [];
    },
  );
  const wikipedia = game.websites.find((site) => site.type === 'wikipedia');
  if (
    !official &&
    game.storeLinks.length === 0 &&
    otherStores.length === 0 &&
    !wikipedia
  )
    return null;

  return (
    <Panel label={t('links')}>
      <PanelTitle>{t('links')}</PanelTitle>
      {official && (
        <LinkRow href={official.url} title={t('officialSite')} tile>
          <Globe size={20} color="$color11" aria-hidden />
          <Text
            grow={1}
            shrink={1}
            minW={0}
            fontSize={13}
            fontWeight="500"
            color="$color12"
          >
            {t('officialSite')}
          </Text>
        </LinkRow>
      )}
      {(game.storeLinks.length > 0 || otherStores.length > 0) && (
        <div className="game-store-links">
          {game.storeLinks.map(({ store, url }) => {
            const brand = STORE_BRAND[store];
            return (
              <LinkRow
                key={store}
                href={url}
                title={t('openOn', { name: storeLabels[store] })}
                tile
              >
                {brand && (
                  <XStack shrink={0}>
                    <BrandIcon brand={brand} size={20} />
                  </XStack>
                )}
                <Text
                  grow={1}
                  shrink={1}
                  minW={0}
                  fontSize={13}
                  lineHeight={18}
                  fontWeight="500"
                  color="$color12"
                  style={{ overflowWrap: 'anywhere' }}
                >
                  {storeLabels[store].replace(/ (store|eshop)/i, '')}
                </Text>
              </LinkRow>
            );
          })}
          {otherStores.map(({ type, url }) => (
            <LinkRow
              key={type}
              href={url}
              title={t('openOn', { name: brandTitle(type) })}
              tile
            >
              <XStack shrink={0}>
                <BrandIcon brand={type} size={20} />
              </XStack>
              <Text
                grow={1}
                shrink={1}
                minW={0}
                fontSize={13}
                lineHeight={18}
                fontWeight="500"
                color="$color12"
              >
                {brandTitle(type)}
              </Text>
            </LinkRow>
          ))}
        </div>
      )}
      {wikipedia && (
        <YStack pt={12} borderTopWidth={1} borderColor="$borderColor">
          <LinkRow
            href={wikipedia.url}
            title={t('openOn', { name: brandTitle('wikipedia') })}
            tile
          >
            <BrandIcon brand="wikipedia" size={20} />
            <Text
              grow={1}
              shrink={1}
              minW={0}
              fontSize={13}
              fontWeight="500"
              color="$color12"
            >
              {brandTitle('wikipedia')}
            </Text>
          </LinkRow>
        </YStack>
      )}
    </Panel>
  );
}

// --- remake e simili ---

/**
 * Una fila di giochi legati che scorre di lato. Quelli che non hai sono
 * attenuati e col bordo tratteggiato, come nel wireframe. Si aprono con la
 * regola della ricerca (12f): un gioco già in catalogo è un link alla sua
 * pagina; uno che non c'è ancora, da loggati, al clic diventa una riga di
 * `games` e si apre; da ospiti resta copertina e nome.
 * Fila e frecce sono `ScrollRow`, la stessa delle fasce della home.
 *
 * `showKind` scrive sulla copertina che versione è: «Edizione estesa» dall'
 * originale, «Originale» dall'edizione estesa. Il badge sta fuori
 * dall'attenuazione, perché un gioco che non hai è proprio quello di cui
 * bisogna poterlo leggere.
 */
export function RelatedRow({
  title,
  games,
  showKind = false,
}: {
  title: string;
  games: RelatedGame[];
  showKind?: boolean;
}) {
  const t = useTranslations('game');
  const kindLabels: Partial<Record<RelatedGame['kind'], string>> = {
    parent: t('relatedOriginal'),
    remake: t('relatedRemake'),
    remaster: t('relatedRemaster'),
    expanded: t('relatedExpanded'),
  };
  const statusLabels = useStatusLabels();
  const { data: session } = useSession();
  const openIgdb = useOpenIgdbHit();

  if (games.length === 0) return null;

  return (
    <ScrollRow
      title={<PanelTitle>{title}</PanelTitle>}
      itemCount={games.length}
    >
      {games.map((game) => {
        const opacity = game.owned ? 1 : 0.55;
        const kindLabel = showKind ? kindLabels[game.kind] : undefined;
        const card = (
          <YStack
            width={104}
            gap={6}
            aria-label={
              game.owned
                ? undefined
                : [game.name, kindLabel, t('notOwned')]
                    .filter(Boolean)
                    .join(', ')
            }
          >
            <YStack position="relative">
              <YStack
                position="relative"
                overflow="hidden"
                rounded={8}
                opacity={opacity}
                borderWidth={game.owned ? 0 : 1}
                borderStyle="dashed"
                borderColor="$color8"
              >
                <GameCover
                  imageId={game.coverImageId}
                  name={game.name}
                  size="cover_big"
                  width={104}
                />
                {game.status && (
                  <CornerLabel icon={statusIcons[game.status]}>
                    {statusLabels[game.status]}
                  </CornerLabel>
                )}
              </YStack>
              {kindLabel && (
                <XStack position="absolute" b={4} l={4}>
                  <Badge variant="secondary">{kindLabel}</Badge>
                </XStack>
              )}
            </YStack>
            <Text
              fontSize={13}
              lineHeight={18}
              color={game.owned ? '$color12' : '$color11'}
              numberOfLines={2}
              // Dentro il bottone il browser centrerebbe.
              text="left"
            >
              {game.name}
            </Text>
          </YStack>
        );

        const key = `${game.kind}-${game.igdbId}`;

        if (game.slug)
          return (
            <Link
              key={key}
              to="/games/$slug"
              params={{ slug: game.slug }}
              style={{ color: 'inherit', textDecoration: 'none' }}
            >
              {card}
            </Link>
          );

        // Un bottone e non un link: prima di aprirlo, la riga va creata.
        if (session)
          return (
            <YStack
              key={key}
              render="button"
              p={0}
              bg="transparent"
              borderWidth={0}
              items="stretch"
              cursor="pointer"
              focusVisibleStyle={{
                outlineColor: '$outlineColor',
                outlineStyle: 'solid',
                outlineWidth: 2,
                rounded: 8,
              }}
              {...({ type: 'button', disabled: openIgdb.isPending } as object)}
              onPress={() => openIgdb.mutate(game.igdbId)}
            >
              {card}
            </YStack>
          );

        return <YStack key={key}>{card}</YStack>;
      })}
    </ScrollRow>
  );
}
