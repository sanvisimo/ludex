import { Text, Tooltip } from '@repo/ui';
import { Link } from '@tanstack/react-router';

/**
 * Il titolo di una scheda, che porta alla pagina del gioco. Su una scheda il
 * nome si tronca spesso, quindi quello intero sta sempre nel `Tooltip`, anche
 * quando ci starebbe tutto: misurare caso per caso non vale la complicazione.
 */
export function GameTitleLink({
  game,
  lines,
}: {
  game: { name: string; slug: string };
  /** Oltre quante righe il titolo si tronca: le schede ne hanno due. */
  lines: 1 | 2;
}) {
  return (
    <Tooltip content={game.name}>
      <Link
        to="/games/$slug"
        params={{ slug: game.slug }}
        // Un blocco e non un link in riga: dentro un `<a>` inline il testo non
        // si tronca, e nella compatta il titolo passava sopra le colonne.
        style={{
          color: 'inherit',
          textDecoration: 'none',
          display: 'block',
          minWidth: 0,
          overflow: 'hidden',
          ...(lines === 1 && {
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }),
        }}
      >
        <Text
          fontSize={14}
          lineHeight={20}
          fontWeight="500"
          color="$color12"
          hoverStyle={{ textDecorationLine: 'underline' }}
          numberOfLines={lines}
        >
          {game.name}
        </Text>
      </Link>
    </Tooltip>
  );
}
