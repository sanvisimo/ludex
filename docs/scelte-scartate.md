# Scelte già valutate e scartate

Parte della documentazione in `docs/`, spostata dal CLAUDE.md della radice. Gli altri file: [modello-dati](modello-dati.md), [import-librerie](import-librerie.md), [negozi](negozi.md), [ordine-sviluppo](ordine-sviluppo.md), [scelte-scartate](scelte-scartate.md).

- **NestJS** (con adapter Fastify o Express): scartato in favore di Hono. La
  struttura che offre pesa più di quanto renda su un progetto portato avanti da una
  persona sola, e l'integrazione Better Auth su Nest + Fastify è in beta mentre su
  Hono è nativa.
- **Express**: scartato. Non dà nulla che Hono o Fastify non abbiano, ed è più
  lento e più debole su TypeScript.
- **tRPC**: era scartato perché si sovrapponeva a NestJS. Caduto NestJS, la
  motivazione decade: adottiamo **oRPC**, stessa categoria, con in più la
  compatibilità Web-standard e la generazione OpenAPI.
- **Fine-tuning per le raccomandazioni**: scartato in favore di RAG (vedi sotto).
- **Prisma al posto di Drizzle**: scartato. Prisma non ha un tipo scalare `vector`
  (solo `Unsupported`, escluso dal client tipizzato) e costringe a `$queryRaw` per
  la similarity search. La query di raccomandazione compone filtri hard _dinamici_
  - JOIN + ranking vettoriale: con Drizzle resta una singola query tipizzata, con
    Prisma diventa SQL costruito a stringhe. Non riproporlo.
- **Backend in Python** (FastAPI/SQLAlchemy): scartato. L'ecosistema ML di Python
  qui non verrebbe usato — gli embedding sono chiamate HTTP, la similarity search
  la esegue pgvector nel DB, il ragionamento è un'altra chiamata HTTP. In cambio si
  perderebbero i tipi condivisi con il frontend, che è vincolato a TypeScript.
  Eccezione ammessa: un microservizio Python isolato allo step 13 _solo_ se servissero
  modelli di embedding locali.
- **Base UI + registry shadcn** per il design system: era la strada di prima ed
  esce per un motivo solo, insuperabile — è DOM, e su React Native non gira. Il
  prezzo accettato è riscriversi i componenti che il registry dava pronti.
- **react-strict-dom** (fermo a `0.0.x`), **NativeWind** (solo styling, i
  componenti restano da scrivere) e **gluestack-ui** (fermo): valutati come
  alternative a Tamagui per un design system universale, nessuno è maturo quanto
  serve.
- **Panda CSS** e una pipeline **DTCG / Style Dictionary** per i token: Panda è
  solo web, e DTCG risolve il problema di tenere gli stessi valori in due sistemi
  di styling diversi, che con Tamagui su entrambe le piattaforme non c'è. Torna in
  discussione il giorno che entra Figma o un designer.
