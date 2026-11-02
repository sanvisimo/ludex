import type { GameType, RelatedGame } from '@repo/contracts';

// I tipi che sono un'altra versione dello stesso gioco. Tutti gli altri che
// hanno un padre (DLC, espansioni, episodi…) sono un pezzo in più del gioco.
const VERSION_TYPES = new Set<GameType>([
  'remake',
  'remaster',
  'expanded_game',
  'port',
]);

/**
 * Le file di giochi legati della pagina del gioco.
 *
 * Il padre cambia fila secondo il tipo: Iceborne ha Monster Hunter: World come
 * «gioco principale», mentre Full Body e Catherine sono due versioni e si
 * mostrano a vicenda in «altre versioni». Lì il padre esce per primo.
 */
export function splitRelated(
  gameType: GameType | null,
  related: RelatedGame[],
) {
  const parent = related.filter((row) => row.kind === 'parent');
  const others = related.filter(
    (row) => row.kind !== 'parent' && row.kind !== 'similar',
  );
  const isVersion = gameType !== null && VERSION_TYPES.has(gameType);

  return {
    mainGame: isVersion ? [] : parent,
    versions: isVersion ? [...parent, ...others] : others,
    similar: related.filter((row) => row.kind === 'similar'),
  };
}
