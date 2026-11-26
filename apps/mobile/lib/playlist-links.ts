import { webUrl } from './env';

/** Il link pubblico di una playlist condivisa: la pagina `/shared/$token` del sito. */
export function sharedPlaylistUrl(token: string) {
  return `${webUrl}/shared/${token}`;
}
