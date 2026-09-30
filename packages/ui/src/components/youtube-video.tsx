import { Linking } from 'react-native';
import { Image, YStack } from 'tamagui';

import { Play } from '../icons';

export type YoutubeVideoProps = {
  /** L'id del video su YouTube, come lo dà IGDB. */
  videoId: string;
  /** Il nome del video, per il lettore di schermo e per l'`iframe`. */
  title: string;
  /** «Guarda», nella lingua dell'app: il testo lo decide l'app. */
  playLabel: string;
};

/**
 * Un video di YouTube, su mobile: la miniatura, che apre il video nell'app di
 * YouTube, o nel browser se l'app non c'è. Un lettore dentro l'app vorrebbe
 * una WebView e un'altra dipendenza, per un trailer.
 *
 * Il gemello per il web è `youtube-video.web.tsx`, con l'`iframe`.
 */
export function YoutubeVideo({ videoId, title, playLabel }: YoutubeVideoProps) {
  return (
    <YStack
      role="button"
      aria-label={`${playLabel}: ${title}`}
      onPress={() =>
        Linking.openURL(
          `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`,
        )
      }
      width="100%"
      aspectRatio={16 / 9}
      overflow="hidden"
      rounded={8}
      items="center"
      justify="center"
      bg="$color3"
    >
      <Image
        src={youtubeThumbnail(videoId)}
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
