import {
  createRouter,
  parseSearchWith,
  stringifySearchWith,
} from '@tanstack/react-router';

import { routeTree } from './routeTree.gen';

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    // Le liste nella query string separate da virgole, come le scriveva nuqs
    // (`?status=backlog,playing`), e non in JSON: i link ai filtri salvati
    // prima del passaggio aprono ancora lo stesso filtro. Il resto resta come
    // lo fa il router. Chi legge una lista la divide: vedi `listOf` in
    // `lib/backlog-filter.ts`.
    stringifySearch: stringifySearchWith((value) =>
      Array.isArray(value) ? value.join(',') : JSON.stringify(value),
    ),
    parseSearch: parseSearchWith(JSON.parse),
  });
}
