import type {
  BacklogEntry,
  BacklogStatus,
  GameDetail,
  GameScore,
  RelatedGame,
  Store,
} from '@repo/contracts';
import { storePageUrl } from '@repo/contracts';
import {
  Badge,
  BrandIcon,
  Button,
  CornerLabel,
  Dialog,
  DialogContent,
  DialogTitle,
  Gallery,
  PlatformIcon,
  ScrollView,
  Text,
  Theme,
  XStack,
  YStack,
  type Brand,
  type GalleryItem,
} from '@repo/ui';
import { ChevronLeft, ChevronRight } from '@repo/ui/icons';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  useEffect,
  useRef,
  useState,
  type ElementRef,
  type ReactNode,
} from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import { StatusButton } from '@/components/backlog-views';
import { CriticScores } from '@/components/critic-scores';
import { Muted, Strong } from '@/components/detail-text';
import { EntryTags } from '@/components/entry-tags';
import { GameCover } from '@/components/game-cover';
import { GameTypeBadge } from '@/components/game-type-badge';
import { HltbTimes } from '@/components/hltb-times';
import { RatingValue } from '@/components/rating-value';
import { statusIcons } from '@/components/status-icon';
import { useDuration } from '@/lib/duration';
import { igdbImageUrl } from '@/lib/igdb-image';
import { platformIconUrl } from '@/lib/platform-icons';
import { useStatusLabels, useStoreLabels } from '@/lib/labels';
import { api } from '@/lib/orpc';

/**
 * I pezzi della pagina del gioco (12d). La struttura è quella approvata sul
 * wireframe in `plans/12d-pagina-gioco.excalidraw`: la hero, e sotto due
 * colonne — la principale con gallery, descrizione e giochi legati, la
 * laterale con durata e critica sopra e il tuo backlog sotto. Su un telefono
 * una colonna sola, con la laterale **prima**: stato, durata e critica sono
 * ciò che serve a decidere.
 */

/** Il marchio di ciascun negozio; Amazon non ne ha uno, e resta col nome. */
const STORE_BRAND: Partial<Record<Store, Brand>> = {
  steam: 'steam',
  gog: 'gog',
  epic: 'epic',
  ea: 'ea',
  battlenet: 'battlenet',
  psn: 'psn',
  xbox: 'xbox',
  nintendo: 'nintendo',
};

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
}: {
  href: string | null;
  /** Il suggerimento al passaggio, es. «Apri su GOG». */
  title: string;
  children: ReactNode;
  items?: 'center' | 'flex-start';
}) {
  if (!href) {
    return (
      <XStack items={items} gap={10}>
        {children}
      </XStack>
    );
  }
  return (
    <XStack
      render="a"
      // Come in `NavItem`: gli attributi del link arrivano all'`<a>`, ma i
      // tipi della view non li conoscono.
      {...({
        href,
        target: '_blank',
        rel: 'noopener noreferrer',
        title,
        style: { textDecoration: 'none', color: 'inherit' },
      } as object)}
      items={items}
      gap={10}
      mx={-6}
      px={6}
      py={2}
      rounded={6}
      cursor="pointer"
      hoverStyle={{ bg: '$color4' }}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
      }}
    >
      {children}
    </XStack>
  );
}

// --- la hero ---

/**
 * L'immagine grande in testa: l'artwork IGDB; se manca il primo screenshot;
 * se manca anche quello la copertina, sfocata. Sopra, in basso, copertina,
 * titolo, anno, autori, «DLC di…» e generi e temi come badge.
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
  const t = useTranslations('game');
  const year = game.firstReleaseDate?.getFullYear() ?? null;

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
        minH={300}
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
              <GameTypeBadge type={game.gameType} />
            </XStack>
            {meta.length > 0 && <Muted>{meta.join(' · ')}</Muted>}
            {game.parent && (
              <Muted>
                {t.rich('dlcOf', {
                  name: game.parent.name,
                  link: (chunks) => (
                    <Link
                      to="/games/$id"
                      params={{ id: game.parent!.id }}
                      style={{ color: 'inherit' }}
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </Muted>
            )}
            {game.attributes.length > 0 && (
              <XStack flexWrap="wrap" gap={6}>
                {game.attributes.map((attribute) => (
                  <Badge
                    key={`${attribute.kind}-${attribute.igdbId}`}
                    variant="secondary"
                  >
                    {attribute.name}
                  </Badge>
                ))}
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

function Panel({ children }: { children: ReactNode }) {
  return (
    <YStack
      gap={12}
      p={16}
      rounded={12}
      borderWidth={1}
      borderColor="$borderColor"
      bg="$color2"
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
  ].filter((row) => row.score !== undefined);

  return (
    <Panel>
      <LinkRow
        href={game.links.hltb}
        title={t('openOn', { name: 'HowLongToBeat' })}
      >
        <BrandIcon brand="hltb" size={20} />
        <PanelTitle>{tHltb('title')}</PanelTitle>
      </LinkRow>
      {times.length === 0 ? (
        <Muted>
          {game.hltbSyncedAt === null ? tHltb('notFetched') : tHltb('noTimes')}
        </Muted>
      ) : (
        // Vanno a capo intere invece di stringersi: a 375 px «Completionist»
        // si spezzava a metà parola.
        <XStack gap={8} flexWrap="wrap">
          {times.map(([key, minutes]) => (
            <YStack
              key={key}
              grow={1}
              minW={96}
              p={8}
              rounded={8}
              bg="$color3"
              gap={2}
            >
              <Muted fontSize={12} lineHeight={16}>
                {tHltb(key)}
              </Muted>
              <Strong fontSize={16}>{duration(minutes!)}</Strong>
            </YStack>
          ))}
        </XStack>
      )}

      <PanelTitle>{tCritic('title')}</PanelTitle>
      {scores.length === 0 ? (
        <Muted>{tCritic('none')}</Muted>
      ) : (
        <YStack gap={6}>
          {scores.map(({ source, score, link }) => (
            <LinkRow
              key={source}
              href={link}
              title={t('openOn', { name: tCritic(source) })}
            >
              <BrandIcon brand={source} size={20} />
              <Muted flex={1}>{tCritic(source)}</Muted>
              {score!.tier && <Muted fontSize={13}>{score!.tier}</Muted>}
              <Strong>{Math.round(score!.score)}</Strong>
            </LinkRow>
          ))}
        </YStack>
      )}

      <Button variant="outline" onPress={() => setOpen(true)}>
        {t('details')}
      </Button>
      <Dialog modal open={open} onOpenChange={setOpen}>
        <DialogContent maxW={560} closeLabel={t('close')}>
          <DialogTitle>{t('durationAndCritics')}</DialogTitle>
          <HltbTimes game={game} />
          <CriticScores game={game} />
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

// --- la colonna laterale: il tuo backlog ---

/**
 * Stato, voto, copie, note e tag. Ogni copia ha l'icona del negozio, che
 * porta alla pagina del gioco su quel negozio quando sappiamo dov'è
 * (`storePageUrl`), e ciò che solo quella copia sa: ore giocate, ultima
 * partita, quando l'hai presa.
 */
export function BacklogPanel({
  entry,
  onStatus,
  actions,
  hiddenNotice,
}: {
  entry: BacklogEntry;
  onStatus: (entry: BacklogEntry, status: BacklogStatus) => void;
  actions: ReactNode;
  hiddenNotice: ReactNode;
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
    <Panel>
      <XStack items="center" justify="space-between" gap={8}>
        <PanelTitle>{t('inBacklog')}</PanelTitle>
        <XStack items="center" gap={8}>
          <RatingValue value={entry.rating} />
          <StatusButton entry={entry} onStatus={onStatus} />
        </XStack>
      </XStack>
      {hiddenNotice}

      <YStack gap={8}>
        <Muted fontSize={13}>{t('copies')}</Muted>
        {entry.ownerships.map((ownership) => {
          const brand = ownership.store
            ? STORE_BRAND[ownership.store]
            : undefined;
          const storeName = ownership.store
            ? storeLabels[ownership.store]
            : null;
          const url = storePageUrl(ownership.store, ownership.storePage);
          const icon = brand ? <BrandIcon brand={brand} size={24} /> : null;
          const platformName =
            nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug;
          const platformIcon = platformIconUrl(ownership.platformSlug);

          const facts = [
            ownership.playtimeMinutes
              ? t('played', { duration: duration(ownership.playtimeMinutes) })
              : null,
            ownership.lastPlayedAt
              ? t('lastPlayed', {
                  // Una data e non «3 mesi fa»: il tempo relativo dipende
                  // dall'ora di chi lo calcola, e server e browser
                  // scriverebbero due testi diversi.
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
          ].filter(Boolean);

          const label = [
            // Con l'icona il nome si toglie: resta nel suo
            // `aria-label` e al passaggio del mouse.
            !platformIcon && platformName,
            // Senza icona il negozio si scrive: è il caso di Amazon.
            !brand && storeName,
            ownership.storeAccount?.label,
            ownership.subscription && tSubscription(ownership.subscription),
            ownership.medium === 'physical' && tMedium('physical'),
          ]
            .filter(Boolean)
            .join(' · ');

          return (
            <LinkRow
              key={ownership.id}
              href={url}
              title={t('openOn', { name: storeName ?? '' })}
              items="flex-start"
            >
              <XStack gap={6} pt={2} shrink={0}>
                {icon}
                {platformIcon && (
                  <PlatformIcon src={platformIcon} label={platformName} />
                )}
              </XStack>
              <YStack flex={1} minW={0}>
                {label && <Strong fontWeight="500">{label}</Strong>}
                {facts.length > 0 && (
                  <Muted fontSize={13}>{facts.join(' · ')}</Muted>
                )}
              </YStack>
            </LinkRow>
          );
        })}
      </YStack>

      {entry.notes && (
        <YStack gap={4}>
          <Muted fontSize={13}>{t('notes')}</Muted>
          <Text
            fontSize={14}
            lineHeight={20}
            color="$color12"
            style={{ whiteSpace: 'pre-line' }}
          >
            {entry.notes}
          </Text>
        </YStack>
      )}
      <EntryTags tags={entry.tags} />
      <XStack flexWrap="wrap" gap={8}>
        {actions}
      </XStack>
    </Panel>
  );
}

// --- remake e simili ---

/**
 * Una fila di giochi legati che scorre di lato. Quelli che hai aprono la loro
 * pagina; gli altri sono copertina e nome, attenuati e col bordo tratteggiato
 * come nel wireframe, finché la wishlist (step 15) non darà loro un posto.
 *
 * Con la rotella del mouse una fila orizzontale non si muove e la barra è
 * nascosta, quindi le frecce accanto al titolo: compaiono solo se la fila
 * non ci sta, e agli estremi si spengono, come in `Gallery`.
 */
export function RelatedRow({
  title,
  games,
}: {
  title: string;
  games: RelatedGame[];
}) {
  const t = useTranslations('game');
  const statusLabels = useStatusLabels();
  const scroller = useRef<ElementRef<typeof ScrollView>>(null);
  const [{ x, content, viewport }, setScroll] = useState({
    x: 0,
    content: 0,
    viewport: 0,
  });

  // Le misure si leggono dal DOM: `onLayout` e `onContentSizeChange` passati
  // al `ScrollView` di Tamagui sul web non arrivano mai.
  useEffect(() => {
    const node = scroller.current?.getScrollableNode() as
      | HTMLElement
      | undefined;
    if (!node) return;
    const measure = () =>
      setScroll({
        x: node.scrollLeft,
        content: node.scrollWidth,
        viewport: node.clientWidth,
      });
    measure();
    node.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    if (node.firstElementChild) observer.observe(node.firstElementChild);
    return () => {
      node.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [games.length]);

  if (games.length === 0) return null;

  const overflows = content > viewport + 1;
  const scrollBy = (direction: -1 | 1) =>
    scroller.current?.scrollTo({
      x: Math.max(0, x + direction * viewport * 0.8),
      animated: true,
    });

  return (
    <YStack gap={8} render="section">
      <XStack items="center" justify="space-between" gap={8}>
        <PanelTitle>{title}</PanelTitle>
        {overflows && (
          <XStack gap={8}>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('galleryPrevious')}
              disabled={x <= 0}
              onPress={() => scrollBy(-1)}
            >
              <ChevronLeft size={16} />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('galleryNext')}
              disabled={x + viewport >= content - 1}
              onPress={() => scrollBy(1)}
            >
              <ChevronRight size={16} />
            </Button>
          </XStack>
        )}
      </XStack>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
      >
        <XStack gap={12} pb={4}>
          {games.map((game) => {
            const card = (
              <YStack
                width={104}
                gap={6}
                opacity={game.owned ? 1 : 0.55}
                aria-label={
                  game.owned ? undefined : `${game.name}, ${t('notOwned')}`
                }
              >
                <YStack
                  position="relative"
                  overflow="hidden"
                  rounded={8}
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
                <Text
                  fontSize={13}
                  lineHeight={18}
                  color="$color12"
                  numberOfLines={2}
                >
                  {game.name}
                </Text>
              </YStack>
            );

            return game.owned && game.gameId ? (
              <Link
                key={`${game.kind}-${game.igdbId}`}
                to="/games/$id"
                params={{ id: game.gameId }}
                style={{ color: 'inherit', textDecoration: 'none' }}
              >
                {card}
              </Link>
            ) : (
              <YStack key={`${game.kind}-${game.igdbId}`}>{card}</YStack>
            );
          })}
        </XStack>
      </ScrollView>
    </YStack>
  );
}
