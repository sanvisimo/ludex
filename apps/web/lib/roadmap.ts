/**
 * La pagina `/roadmap`: cosa c'è, cosa arriva, cosa è solo un'idea.
 *
 * Come `lib/credits.ts`, qui stanno solo le cose che non si traducono: l'id, lo
 * stato, le aree e il mese. Il testo sta nei messaggi, `roadmap.items.<id>`:
 * `title`, e `text` per ciò che non è ancora fatto oppure `p1…pN` (tanti quanti
 * `points`) per ciò che lo è.
 *
 * **Lo scrive una persona**, non si ricava da `docs/ordine-sviluppo.md`: quello
 * è il diario di chi sviluppa, con gli step e i perché, e questa è la pagina di
 * chi usa l'app. Una voce nuova si aggiunge qui e nei due file dei messaggi.
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
 * l'ordine di lavoro di `docs/ordine-sviluppo.md`, dopo le due cose piccole.
 */
export const roadmap: RoadmapEntry[] = [
  { id: 'sourceLinks', status: 'next', areas: ['game', 'critic'] },
  { id: 'steamNintendo', status: 'next', areas: ['import'] },
  { id: 'betterAdmin', status: 'next', areas: ['admin', 'library'] },
  { id: 'merge', status: 'next', areas: ['admin'] },
  { id: 'ea', status: 'next', areas: ['import'] },
  { id: 'csv', status: 'next', areas: ['import'] },
  { id: 'subscriptions', status: 'next', areas: ['library'] },
  { id: 'xbox', status: 'next', areas: ['import'] },
  { id: 'ai', status: 'next', areas: ['ai'] },
  { id: 'mobile', status: 'next', areas: ['mobile'] },
  { id: 'openPlaylists', status: 'idea', areas: ['playlists'] },
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
