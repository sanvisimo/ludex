/**
 * Scelta della voce di una fonte esterna che corrisponde a un nostro gioco.
 *
 * Sta in un file suo perché è **pura**: la si prova senza database e senza
 * rete, con i payload veri. Ed è generica perché lo stesso problema si ripete
 * identico su ogni fonte che non condivide un id con IGDB — HLTB allo step 6,
 * Metacritic allo step 8 — mentre le fonti che un id lo hanno (OpenCritic via
 * Wikidata) da qui non passano affatto.
 *
 * Il problema: senza id in comune l'unica strada è cercare per nome e decidere
 * quale risultato è il nostro. E cercare per nome sbaglia:
 *
 *     "Resident Evil 4"  →  108881 | 2023 | 16.2h
 *                        →  7720   | 2005 | 15.6h
 *
 * Due voci, nome identico, durate diverse. Chi confronta solo i nomi prende
 * quella che capita. Noi abbiamo una cosa in più: l'**anno** da IGDB, che qui
 * decide da solo. Le prove d'identità che costano una richiesta — l'appid Steam
 * dichiarato dalla pagina HLTB, il link Metacritic sulla scheda Steam — non
 * passano da qui: stanno al servizio, che è chi può permettersi di chiamare.
 */

/**
 * Quello che una voce esterna deve esporre per essere giudicata. Nient'altro:
 * l'id non serve a scegliere, serve solo a chi poi ci farà qualcosa — e infatti
 * viene portato attraverso i generici, senza che questo file lo veda mai.
 */
export type Matchable = {
  name: string;
  /** Titolo alternativo, quando la fonte ne tiene uno. */
  alias?: string | null;
  /** "game", "dlc"…: se la fonte lo dice, i DLC si buttano. */
  type?: string | null;
  releaseYear?: number | null;
};

/** Il gioco da agganciare, ridotto a ciò che serve per scegliere. */
export type TitleQuery = {
  name: string;
  releaseYear: number | null;
  /**
   * Il termine con cui si è davvero cercato, quando non è il titolo intero.
   *
   * Serve perché la ricerca e il giudizio sono due cose separate: HLTB cerca in
   * AND su tutti i termini, quindi un titolo lungo a volte non trova niente e
   * bisogna chiedere di meno — ma questo non vuol dire che si debba anche
   * *giudicare* di meno. Il caso che l'ha imposto:
   *
   *     nostro:  "Gabriel Knight 3: Blood of the Sacred, Blood of the Damned"
   *     loro:    "Gabriel Knight III: Blood of the Sacred, Blood of the Damned"
   *
   * Sul titolo intero HLTB non restituisce niente, perché "3" non è "III".
   * Cercando la sola coda la voce salta fuori, e a quel punto i due titoli
   * interi si somigliano per lo 0.95: il numero romano non era mai stato un
   * problema di punteggio, solo di ricerca.
   */
  searchedAs?: string | null;
};

export type Ranked<T> = {
  hit: T;
  score: number;
  /** Il titolo normalizzato coincide, non «somiglia molto». Vedi `pickByName`. */
  exact: boolean;
};

/**
 * Sotto questa somiglianza non si aggancia niente. Una durata sbagliata è
 * peggio di nessuna durata: il motore dello step 7 la userebbe per decidere.
 */
export const NAME_THRESHOLD = 0.85;

/**
 * Di quanto il primo deve staccare il secondo. Due candidati appaiati vogliono
 * dire che il nome non basta a distinguerli — ed è esattamente il caso dei due
 * "Resident Evil 4" quando di nostro non sappiamo l'anno.
 */
export const DISTINCTNESS = 0.05;

// L'anno non è un dettaglio decorativo: è ciò che separa un remake dal suo
// originale. Concordi si dà una spinta, discordi si affonda — un titolo
// identico ma di sedici anni prima non è lo stesso gioco.
const YEAR_BONUS = 0.05;
const YEAR_PENALTY = 0.35;
// Le uscite scivolano fra i mercati e le due fonti datano cose diverse (IGDB la
// prima uscita mondiale, HLTB quella che ha in scheda): un anno di scarto non
// significa niente.
const YEAR_TOLERANCE = 1;

/**
 * Riduce un titolo a ciò che è confrontabile: minuscole, niente accenti, niente
 * punteggiatura. Serve a far coincidere "NieR: Automata" e "Nier Automata", che
 * sono lo stesso gioco scritto da due cataloghi diversi.
 */
export function normalizeTitle(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * La parte di titolo prima del primo separatore, o null se non si può tagliare.
 *
 * Serve al secondo tentativo di ricerca: HLTB cerca in **AND** su tutti i
 * termini, quindi più il titolo IGDB è lungo più è probabile che nessuna voce li
 * contenga tutti — "The Witcher: Enhanced Edition Director's Cut" non trova
 * niente, "The Witcher" trova il gioco.
 *
 * Si taglia solo su `:` e `/`, i due separatori con cui i cataloghi attaccano
 * sottotitoli ed edizioni. **Mai sul trattino**: lì dentro finirebbe "Half-Life"
 * accorciato a "Half". E si tiene la testa e non la coda, al contrario di quel
 * che fa RomM, perché loro partono da un nome di file che si porta davanti il
 * nome della serie, noi dal titolo canonico che si porta dietro l'edizione.
 */
export function shortenTitle(name: string, reverse = false) {
  const taglio = name.search(/:/);
  if (taglio < 1) return null;

  const testa = reverse
    ? name.slice(taglio + 1).trim()
    : name.slice(0, taglio).trim();
  // Due caratteri non sono una ricerca, sono un pescaggio a caso.
  if (testa.length < 3) return null;
  if (normalizeTitle(testa) === normalizeTitle(name)) return null;

  return testa;
}

function bigrams(value: string) {
  const grams = new Map<string, number>();
  for (let i = 0; i < value.length - 1; i += 1) {
    const gram = value.slice(i, i + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
}

/**
 * Coefficiente di Dice sui bigrammi, da 0 a 1.
 *
 * Scelto perché è insensibile all'ordine delle parole ma non alla lunghezza: la
 * cosa che deve riconoscere più spesso è "questo è lo stesso titolo con un
 * pezzo in più attaccato" — "The Witcher 3: Wild Hunt" contro "…- Game of the
 * Year Edition" — e lì un confronto per sottostringa direbbe di sì.
 */
export function titleSimilarity(a: string, b: string) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const first = bigrams(a);
  const second = bigrams(b);
  let shared = 0;
  let total = 0;

  for (const [gram, times] of first) {
    shared += Math.min(times, second.get(gram) ?? 0);
    total += times;
  }
  for (const times of second.values()) total += times;

  return (2 * shared) / total;
}

/**
 * I candidati ordinati dal più probabile, DLC esclusi.
 *
 * I DLC si buttano perché ogni ricerca ne è piena — "The Witcher 3" ne
 * restituisce tre nei primi cinque risultati su HLTB — e nessuno di loro è mai
 * il gioco che abbiamo in libreria: quello lo importiamo come gioco a sé. Le
 * fonti che non dichiarano il tipo lasciano il campo nullo e non perdono
 * niente.
 */
export function rankCandidates<T extends Matchable>(
  query: TitleQuery,
  hits: T[],
): Ranked<T>[] {
  // Il nostro titolo in tutte le forme che ha preso: quello vero e, se la
  // ricerca è passata da un accorciamento, anche quello. Si prende il massimo,
  // simmetricamente a quello che si fa già sul loro lato fra nome e alias —
  // entrambi i cataloghi scrivono lo stesso gioco in più di un modo, e il
  // massimo può solo alzare i punteggi, mai perdere un match che già funziona.
  const nostri = [normalizeTitle(query.name)];
  if (query.searchedAs) {
    const anche = normalizeTitle(query.searchedAs);
    if (anche && anche !== nostri[0]) nostri.push(anche);
  }

  return hits
    .filter((hit) => hit.type !== 'dlc')
    .map((hit) => {
      // Anche l'alias conta: HLTB tiene il titolo principale in `game_name` e
      // l'edizione o il nome alternativo in `game_alias`, e a volte è il
      // secondo a coincidere col nostro. Vale per ogni fonte che ne tenga uno.
      const loro = [normalizeTitle(hit.name)];
      if (hit.alias) loro.push(normalizeTitle(hit.alias));

      let score = 0;
      let exact = false;
      for (const nostro of nostri) {
        for (const suo of loro) {
          score = Math.max(score, titleSimilarity(nostro, suo));
          if (nostro === suo) exact = true;
        }
      }

      if (
        query.releaseYear !== null &&
        hit.releaseYear !== null &&
        hit.releaseYear !== undefined
      ) {
        const distance = Math.abs(query.releaseYear - hit.releaseYear);
        score += distance <= YEAR_TOLERANCE ? YEAR_BONUS : -YEAR_PENALTY;
      }

      return { hit, score: Math.min(1, Math.max(0, score)), exact };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Il candidato da agganciare guardando solo nome e anno, o null se non c'è
 * niente di cui essere sicuri.
 *
 * Null non vuol dire "HLTB non ce l'ha": vuol dire "non so quale sia". Sono due
 * cose che il servizio scrive nello stesso `not_found`, ma con un `error`
 * diverso — perché la seconda è quella che un umano può sistemare guardando la
 * lista dei candidati scartati.
 */
export function pickByName<T>(ranked: Ranked<T>[]): Ranked<T> | null {
  // Un titolo *identico* è un'altra cosa da un titolo che somiglia tanto, e il
  // punteggio da solo non lo sa dire: "Orcs Must Die!" prende 1.00 e "Orcs Must
  // Die! 2" prende 0.97, appaiati abbastanza da far rinunciare — con l'esatto
  // che era lì in cima. Quando di coincidente ce n'è **uno solo**, è quello.
  //
  // La soglia resta: "7 Days to Die" coincide col titolo ma HLTB lo data 2013
  // (accesso anticipato) contro il 2024 di IGDB (la 1.0), e undici anni di
  // scarto sono la stessa forma dei due "Resident Evil 4". Lì a decidere non
  // può essere il nome: decide l'appid, o non decide nessuno.
  const esatti = ranked.filter((row) => row.exact);
  if (esatti.length === 1 && esatti[0]!.score >= NAME_THRESHOLD)
    return esatti[0]!;

  const [best, second] = ranked;
  if (!best || best.score < NAME_THRESHOLD) return null;
  if (second && best.score - second.score < DISTINCTNESS) return null;
  return best;
}
