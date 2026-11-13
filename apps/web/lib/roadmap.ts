/**
 * La roadmap è curata manualmente, non derivata dal diario di sviluppo:
 * comunica agli utenti le funzionalità, senza esporre gli step interni.
 */
export type RoadmapStatus = 'doing' | 'next' | 'idea' | 'done';

export type RoadmapArea =
  | 'import'
  | 'library'
  | 'game'
  | 'critic'
  | 'playlists'
  | 'account'
  | 'admin'
  | 'ai'
  | 'mobile';

export type RoadmapEntry = {
  id: string;
  status: RoadmapStatus;
  areas: RoadmapArea[];
  /** Il mese, `AAAA-MM`: solo per ciò che è fatto. */
  month?: string;
  /** Quanti punti elenco ha (`p1…pN`): solo per ciò che è fatto. */
  points?: number;
};

/**
 * Nell'ordine in cui si leggono: prima il futuro (in corso, poi in arrivo, poi
 * le idee), poi il fatto dal più recente al più vecchio. «In arrivo» segue
 * l'ordine di lavoro di `docs/ordine-sviluppo.md`; «in corso» è ciò che si sta
 * facendo adesso, e una voce passa a «fatto» quando l'utente dice che è pronta.
 */
export const roadmap: RoadmapEntry[] = [
  { id: 'nintendo3dsWiiu', status: 'doing', areas: ['import'] },
  { id: 'nintendoSwitch2', status: 'doing', areas: ['import'] },
  { id: 'ai', status: 'next', areas: ['ai'] },
  { id: 'mobile', status: 'next', areas: ['mobile'] },
  { id: 'publicPlaylists', status: 'next', areas: ['playlists'] },
  { id: 'categoryPages', status: 'next', areas: ['game', 'library'] },
  { id: 'addToBacklog', status: 'next', areas: ['game', 'library'] },
  { id: 'playtime', status: 'next', areas: ['game'] },
  { id: 'metaquest', status: 'idea', areas: ['import'] },
  { id: 'notifications', status: 'idea', areas: ['account', 'import'] },
  {
    id: 'dialogDesign',
    status: 'done',
    areas: ['game', 'library'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'accountDesign',
    status: 'done',
    areas: ['account', 'import'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'pilecueBrand',
    status: 'done',
    areas: ['library'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'webDesign',
    status: 'done',
    areas: ['library', 'game', 'playlists', 'account'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'release',
    status: 'done',
    areas: ['account'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'librarySyncOnOpen',
    status: 'done',
    areas: ['import'],
    month: '2026-11',
    points: 2,
  },
  {
    id: 'playedThreshold',
    status: 'done',
    areas: ['import'],
    month: '2026-11',
    points: 2,
  },
  {
    id: 'gameVersions',
    status: 'done',
    areas: ['game'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'itadPrice',
    status: 'done',
    areas: ['game'],
    month: '2026-11',
    points: 3,
  },
  {
    id: 'openPlaylists',
    status: 'done',
    areas: ['playlists'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'badgeLinks',
    status: 'done',
    areas: ['game', 'library'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'quickRating',
    status: 'done',
    areas: ['game'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'subscriptions',
    status: 'done',
    areas: ['library'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'xbox',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'csv',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'randomFilter',
    status: 'done',
    areas: ['library'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'linksFix',
    status: 'done',
    areas: ['game'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'mediaFilter',
    status: 'done',
    areas: ['library'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'steamFree',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'wrongPlatform',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'gogCollections',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'epicDuplicates',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'ea',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'storeWishlists',
    status: 'done',
    areas: ['import', 'playlists'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'betterAdmin',
    status: 'done',
    areas: ['admin', 'library'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'merge',
    status: 'done',
    areas: ['admin'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'steamNintendo',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'sourceLinks',
    status: 'done',
    areas: ['game', 'critic'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'playlists',
    status: 'done',
    areas: ['playlists'],
    month: '2026-10',
    points: 4,
  },
  {
    id: 'account',
    status: 'done',
    areas: ['account'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'admin',
    status: 'done',
    areas: ['admin'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'gamePage',
    status: 'done',
    areas: ['game'],
    month: '2026-10',
    points: 4,
  },
  {
    id: 'stores',
    status: 'done',
    areas: ['import'],
    month: '2026-10',
    points: 2,
  },
  {
    id: 'critic',
    status: 'done',
    areas: ['critic', 'library'],
    month: '2026-10',
    points: 3,
  },
  {
    id: 'start',
    status: 'done',
    areas: ['library', 'import'],
    month: '2026-09',
    points: 4,
  },
];
