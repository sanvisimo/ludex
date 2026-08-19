// Operatori di query (eq, and, desc, inArray, sql…) ri-esportati da qui.
//
// Serve perché `apps/api` deve comporre query ma non può avere drizzle-orm fra
// le sue dipendenze dirette: due copie del pacchetto significano due set di
// classi, e i controlli interni di Drizzle smettono di riconoscere le tabelle.
// Passando da qui c'è una sola istanza, quella di questo package.
//
// Subpath separato da "." per non mescolare gli operatori con i nomi delle
// tabelle nello stesso namespace.
export * from 'drizzle-orm';
