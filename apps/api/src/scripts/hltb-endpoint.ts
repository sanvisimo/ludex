import '../env';

import {
  cachedHltbApiPath,
  discoverSearchPath,
  hltbApiPath,
} from '../external/hltb';

// Scoperta dell'endpoint di ricerca HLTB, a comando e **senza scrivere niente**.
//
//   pnpm --filter api hltb:endpoint
//
// È la stessa funzione che il client chiama da sé quando un job si becca un
// 404. Qui gira a freddo e racconta ogni passo, e serve nei due momenti in cui
// quella automatica non basta: quando *non* trova niente e si vuole vedere dove
// si è fermata, e quando si vuole guardare prima di fidarsi.
//
// Il parente in RomM è `utils/update_hltb_api_url.py`, che però il risultato lo
// scrive in un file da servire a tutte le installazioni. Qui non c'è niente da
// servire: se il path va fissato, lo fissa una persona in `HLTB_API_PATH`.

// Quello che userebbe un processo appena partito, e quello che i processi vivi
// hanno già in mano: sono due cose diverse, e guardarne una sola è il modo di
// non capire perché il worker si comporta in un altro modo.
const codice = hltbApiPath();
const condiviso = await cachedHltbApiPath();
const corrente = condiviso ?? codice;

console.log(`Nel codice (o in HLTB_API_PATH): ${codice}`);
console.log(`Nella cache condivisa: ${condiviso ?? '(niente)'}\n`);

const trovato = await discoverSearchPath((message) =>
  console.log(`  ${message}`),
);

if (!trovato) {
  console.log(
    '\nNessun endpoint trovato. Le righe qui sopra dicono dove si è fermata:\n' +
      '  - manifest introvabile → HLTB ha cambiato il modo di servire le route,\n' +
      '    e la scoperta va riscritta guardando di nuovo il sito\n' +
      "  - candidati scartati → il path c'è ma non serve la ricerca, e il\n" +
      '    candidato giusto va trovato a mano e messo in HLTB_API_PATH',
  );
  process.exit(1);
}

console.log(`\nEndpoint: ${trovato}`);

if (trovato === corrente) {
  console.log('È già quello in uso: niente da fare.');
} else {
  console.log(
    'È diverso da quello in uso: a runtime il client ci arriverebbe da sé al\n' +
      'primo 404, e se lo scriverebbe in cache per gli altri processi. Se\n' +
      `invece va fissato: HLTB_API_PATH=${trovato}`,
  );
}

if (trovato !== codice) {
  console.log(
    `\nDEFAULT_API_PATH in apps/api/src/external/hltb.ts dice ancora ${codice}:\n` +
      'la scoperta lo aggira a ogni avvio, ma a metterlo in pari va un commit.',
  );
}

console.log();

process.exit(0);
