import { useState } from 'react';
import { Image, YStack } from 'tamagui';

import { Play } from '../icons';
import type { YoutubeVideoProps } from './youtube-video';

/**
 * Un video di YouTube, sul web: l'`iframe` dentro la pagina.
 *
 * L'`iframe` **si monta solo quando si preme «play»**. Fino ad allora c'è la
 * miniatura, un'immagine e basta: aprire la pagina di un gioco non deve
 * caricare gli script di YouTube per un trailer che magari nessuno guarda. Il
 * dominio è `youtube-nocookie.com`, che non lascia cookie finché il video non
 * parte.
 *
 * Il gemello nativo è `youtube-video.tsx`, che apre il video nell'app.
 */
export function YoutubeVideo({ videoId, title, playLabel }: YoutubeVideoProps) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <YStack width="100%" aspectRatio={16 / 9} overflow="hidden" rounded={8}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1`}
          title={title}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          style={{ width: '100%', height: '100%', border: 0 }}
        />
      </YStack>
    );
  }

  return (
    <YStack
      render="button"
      aria-label={`${playLabel}: ${title}`}
      onPress={() => setPlaying(true)}
      width="100%"
      aspectRatio={16 / 9}
      overflow="hidden"
      rounded={8}
      cursor="pointer"
      items="center"
      justify="center"
      bg="$color3"
      borderWidth={0}
      p={0}
      focusVisibleStyle={{
        outlineColor: '$outlineColor',
        outlineStyle: 'solid',
        outlineWidth: 2,
      }}
    >
      <Image
        src={youtubeThumbnail(videoId)}
        alt=""
        position="absolute"
        width="100%"
        height="100%"
        objectFit="cover"
      />
      <YStack bg="rgba(0,0,0,0.6)" rounded={999} p={14}>
        <Play size={28} color="#ffffff" fill="#ffffff" />
      </YStack>
    </YStack>
  );
}

/** La miniatura che YouTube pubblica per ogni video, in 480×360. */
export function youtubeThumbnail(videoId: string) {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg`;
}
