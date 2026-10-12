import type { HiddenKind } from '@repo/contracts/vocabulary';
import {
  AppWindow,
  FlaskConical,
  Gift,
  Puzzle,
  ThumbsDown,
} from '@repo/ui/icons';

/**
 * Un'icona per tipo di voce nascosta, una volta sola: il menu «Nascondi» di
 * «Da sistemare» e i tab di `/account/hidden` mostrano gli stessi tipi, e
 * devono avere gli stessi disegni.
 */
export const HIDDEN_KIND_ICON: Record<HiddenKind, typeof AppWindow> = {
  app: AppWindow,
  dlc: Puzzle,
  extra: Gift,
  prerelease: FlaskConical,
  unwanted: ThumbsDown,
};
