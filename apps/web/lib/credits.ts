/**
 * Chi ringraziamo nella pagina `/credits`: i dati, ognuno con la sua licenza.
 *
 * Qui stanno solo le cose che non si traducono — nome, indirizzo, licenza. Il
 * «a cosa ci serve» sta nei messaggi, `credits.<sezione>.<id>`, e con
 * `note: true` anche `credits.<sezione>.<id>Note`.
 *
 * Le licenze del software le dice il `package.json` installato di ogni
 * pacchetto, non la memoria: se si aggiorna una dipendenza se ne rilegge la
 * riga. Di proposito è lo stack che il progetto dichiara e non le dipendenze
 * transitive, che sarebbero centinaia di righe senza valore per chi legge.
 */
export type Credit = {
  id: string;
  name: string;
  url: string;
  license?: string;
  licenseUrl?: string;
  /** C'è una nota in più nei messaggi (`<id>Note`). */
  note?: boolean;
};

/** Fonti dati e negozi da cui importiamo. Una licenza solo dove ne hanno una. */
export const services: Credit[] = [
  { id: 'igdb', name: 'IGDB', url: 'https://www.igdb.com' },
  { id: 'hltb', name: 'HowLongToBeat', url: 'https://howlongtobeat.com' },
  { id: 'opencritic', name: 'OpenCritic', url: 'https://opencritic.com' },
  { id: 'metacritic', name: 'Metacritic', url: 'https://www.metacritic.com' },
  {
    id: 'wikidata',
    name: 'Wikidata',
    url: 'https://www.wikidata.org',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  { id: 'steam', name: 'Steam', url: 'https://store.steampowered.com' },
  { id: 'gog', name: 'GOG', url: 'https://www.gog.com' },
  { id: 'epic', name: 'Epic Games', url: 'https://store.epicgames.com' },
  { id: 'amazon', name: 'Amazon Games', url: 'https://gaming.amazon.com' },
  { id: 'psn', name: 'PlayStation', url: 'https://www.playstation.com' },
];

/** Il software su cui poggia Ludex. */
export const software: Credit[] = [
  { id: 'react', name: 'React', url: 'https://react.dev', license: 'MIT' },
  {
    id: 'tanstack',
    name: 'TanStack (Start, Router, Query)',
    url: 'https://tanstack.com',
    license: 'MIT',
  },
  { id: 'vite', name: 'Vite', url: 'https://vite.dev', license: 'MIT' },
  {
    id: 'tamagui',
    name: 'Tamagui',
    url: 'https://tamagui.dev',
    license: 'MIT',
  },
  {
    id: 'react-native-web',
    name: 'React Native Web',
    url: 'https://necolas.github.io/react-native-web',
    license: 'MIT',
  },
  {
    id: 'react-native',
    name: 'React Native',
    url: 'https://reactnative.dev',
    license: 'MIT',
  },
  { id: 'expo', name: 'Expo', url: 'https://expo.dev', license: 'MIT' },
  { id: 'hono', name: 'Hono', url: 'https://hono.dev', license: 'MIT' },
  { id: 'orpc', name: 'oRPC', url: 'https://orpc.dev', license: 'MIT' },
  {
    id: 'better-auth',
    name: 'Better Auth',
    url: 'https://better-auth.com',
    license: 'MIT',
  },
  {
    id: 'drizzle',
    name: 'Drizzle ORM',
    url: 'https://orm.drizzle.team',
    license: 'Apache-2.0',
  },
  {
    id: 'postgres',
    name: 'postgres.js',
    url: 'https://github.com/porsager/postgres',
    license: 'Unlicense',
  },
  { id: 'bullmq', name: 'BullMQ', url: 'https://bullmq.io', license: 'MIT' },
  { id: 'zod', name: 'Zod', url: 'https://zod.dev', license: 'MIT' },
  {
    id: 'use-intl',
    name: 'use-intl',
    url: 'https://next-intl.dev',
    license: 'MIT',
  },
  {
    id: 'inter',
    name: 'Inter',
    url: 'https://rsms.me/inter',
    license: 'OFL-1.1',
    note: true,
  },
  {
    id: 'space-grotesk',
    name: 'Space Grotesk',
    url: 'https://github.com/floriankarsten/space-grotesk',
    license: 'OFL-1.1',
    note: true,
  },
];

/**
 * Le icone. Le piattaforme stanno in `apps/web/public/platforms`, con la
 * provenienza file per file in `LICENSE.md`: se cambia una, cambia anche lì.
 */
export const icons: Credit[] = [
  {
    id: 'romm',
    name: 'RomM',
    url: 'https://github.com/rommapp/romm',
    license: 'AGPL-3.0',
    licenseUrl: 'https://github.com/rommapp/romm/blob/master/LICENSE',
  },
  {
    id: 'libretro',
    name: 'Libretro / RetroArch',
    url: 'https://git.libretro.com/libretro-assets/retroarch-assets',
    license: 'CC BY 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
    note: true,
  },
  {
    id: 'simple-icons',
    name: 'Simple Icons',
    url: 'https://simpleicons.org',
    license: 'CC0',
    licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
  },
  { id: 'igdb-icons', name: 'IGDB', url: 'https://www.igdb.com/icons' },
  {
    id: 'pcgamingwiki',
    name: 'PCGamingWiki',
    url: 'https://www.pcgamingwiki.com',
  },
  { id: 'lucide', name: 'Lucide', url: 'https://lucide.dev', license: 'ISC' },
];

/** Dove sta l'elenco file per file delle icone delle piattaforme. */
export const platformIconsLicense = '/platforms/LICENSE.md';

/** Il sorgente: l'AGPL lo chiede a chi offre il servizio in rete. */
export const repoUrl = 'https://github.com/sanvisimo/ludex';
export const licenseUrl = 'https://www.gnu.org/licenses/agpl-3.0.html';

/** Dove arrivano suggerimenti e idee. Un posto solo, qui. */
export const contactEmail = 'sanvi.simo@proton.me';
