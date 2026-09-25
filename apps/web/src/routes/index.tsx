import { Card, CardContent, Skeleton } from '@repo/ui';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useTranslations } from 'use-intl';

import { GameCover } from '@/components/game-cover';
import { GameDuration } from '@/components/game-duration';
import { api } from '@/lib/orpc';

// Catalogo pubblico: "questi giochi Ludex li conosce". Volutamente anonimo —
// non dice chi li ha aggiunti, solo che esistono.
export const Route = createFileRoute('/')({ component: CatalogPage });

function CatalogPage() {
  const t = useTranslations('catalog');
  const { data, isPending, error } = useQuery(
    api.games.latest.queryOptions({ input: {} }),
  );

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground">{t('subtitle')}</p>
      </header>

      {error ? (
        <p className="text-destructive">{t('error')}</p>
      ) : isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} height={64} width="100%" rounded={12} />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent>
            <p className="text-muted-foreground">{t('empty')}</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {data.map((game) => (
            <li key={game.id}>
              {/* Un `<a>` semplice finché `/games/$id` non passa a Start (passo 3):
                  il `Link` del router vuole una rotta che esista. */}
              <a href={`/games/${game.id}`} className="block">
                <Card interactive>
                  <CardContent flexDirection="row" items="center" gap={16}>
                    <GameCover imageId={game.coverImageId} name={game.name} />
                    <div className="grid gap-0.5">
                      <span className="font-medium">{game.name}</span>
                      {game.firstReleaseDate && (
                        <span className="text-muted-foreground">
                          {game.firstReleaseDate.getFullYear()}
                        </span>
                      )}
                      <GameDuration game={game} />
                      {game.igdbId === null && (
                        <span className="text-muted-foreground">
                          {t('unresolved')}
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </a>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
