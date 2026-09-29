import type { BacklogStatus } from '@repo/contracts';
import {
  Ban,
  Bookmark,
  Check,
  CircleStop,
  Play,
  Trophy,
} from '@repo/ui/icons';

/**
 * L'icona di ogni stato, in un punto solo: il bottone di stato delle viste e
 * i filtri di stato della barra devono dire la stessa cosa con lo stesso
 * disegno.
 *
 * Abbandonato è uno stop e non una x, che si leggeva come «togli»: fa coppia
 * col play di In corso. La coppa è del platinato (`completed`), perché su PSN
 * il platinato è un trofeo; il voto della critica ha la coccarda.
 *
 * Annotata e non inferita: il tipo dedotto passerebbe da un pacchetto interno
 * di Tamagui che TypeScript non sa nominare (TS2742).
 */
export const statusIcons: Record<BacklogStatus, typeof Bookmark> = {
  backlog: Bookmark,
  playing: Play,
  played: Check,
  completed: Trophy,
  dropped: CircleStop,
  excluded: Ban,
};
