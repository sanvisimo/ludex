# Step 10 — Import da file CSV

**Stato: in corso dal 16/10/2026.** Roadmap `csv` a «in corso».

## Contesto

Il file è l'export di Playnite fatto con l'estensione **Library Exporter
Advanced**, che lascia scegliere i campi e il separatore delle liste (`,` di
default). Le intestazioni sono nella lingua dell'interfaccia di Playnite.

Il file di prova è
[`playnite-ubisoft-2026-08.csv`](../apps/api/test/fixtures/playnite-ubisoft-2026-08.csv),
con tutti i campi: 87 giochi Ubisoft Connect, tutti `PC (Windows)`. Accanto
c'è il vecchio
[`playnite-export-2026-08.csv`](../apps/api/test/fixtures/playnite-export-2026-08.csv),
20 voci fra Amazon, Xbox e Ubisoft.

Cosa c'è nel file Ubisoft (misurato il 16/10/2026):

- campi su più righe (la descrizione), BOM, date `gg/mm/aaaa`, il tempo di
  gioco **in secondi**;
- `Id del gioco` è l'id del negozio (Ubisoft, che IGDB non conosce);
- **67 righe su 87 hanno l'appid Steam** in `Collegamenti`: per quelle IGDB
  risolve per id, non per nome;
- dati dell'utente: lo stato di completamento (Completed 8, Beaten 5,
  Won't Play 5, Plan to Play 15), `Categorie` su 15 righe, ore su 3.
  Voto, note e nascosti vuoti; `Etichette` sono solo le fasce `[HLTB]` del
  plugin di Playnite.

Ubisoft e Battle.net non si collegheranno mai ([negozi](../docs/negozi.md)):
il file è la loro unica strada. Ma il file serve anche a chi un negozio
collegabile **non vuole** collegarlo (EA, per esempio).

## Decisioni (16 e 19/10/2026)

1. **«Importa da CSV», non «da Playnite»** (19/10): un file con una riga per
   gioco e le colonne riconosciute per nome
   ([`csv-file.ts`](../apps/api/src/services/csv-file.ts)). I nomi sono
   quelli dell'export di Playnite (Library Exporter Advanced), **in inglese e
   in italiano**, presi dalla sua localizzazione (`LocSource.xaml`,
   `it_IT.xaml`): così il suo file si carica com'è. Obbligatorie solo `Name`
   e `Sources`; `Game Id` no, perché chi scrive il file a mano non sa l'id
   Ubisoft di un gioco: senza, l'id esterno è `name:` più il nome minuscolo.
   Date `2026-10-19` o `19/10/2026`; l'ordine giorno/mese dell'export
   inglese di Playnite non è misurato. Il CSV d'esempio da scaricare è
   [`ludex-import-example.csv`](../apps/web/public/ludex-import-example.csv),
   e un test controlla che si legga.
2. **Si importa tutto e si saltano i doppioni.** Ogni riga entra col negozio
   di `Sources`; una copia che l'utente ha già **da un altro account** (stesso
   gioco, piattaforma, negozio e supporto) non si scrive (`togliGiaPossedute`
   in `backlog.ts`). Le righe senza un negozio nostro si saltano e si contano.
   Ricaricare un file con un gioco già importato dalla stessa sorgente non lo
   reimporta: aggiorna le ore della copia che c'è.
3. **Stato, categorie e tag solo alla nascita** della riga di backlog, senza
   mai sovrascrivere ciò che c'è in Ludex: New / Plan to Play / On Hold →
   `backlog`, Playing → `playing`, Played / Beaten → `played`, Completed →
   `completed`, Abandoned → `dropped`, Won't Play → `excluded`; uno stato
   personalizzato → `backlog`. Le `Categories` diventano categorie
   dell'utente. Il **tag «Importato il {data}»** (19/10) lo compone il client
   nella lingua di chi carica e va solo sui giochi che entrano nel backlog
   con quel file: i tag non si accumulano a ogni caricamento.
4. **Il file arriva con oRPC come `File`** (`csvImport.upload`, al più 10 MB),
   il server lo legge subito — un formato sbagliato torna `BAD_REQUEST` con
   `data: { reason, missing }` — lo riduce a voci e accoda un job per negozio
   con le voci e il tag. `csvImport.status` dà l'ultimo import finito e se ce
   n'è uno in corso, per il riquadro in Librerie.
5. **Non è una libreria** (19/10, prima erano schede «da Playnite»): un
   account **interno** per negozio (`store_accounts.from_file`,
   `external_account_id = 'csv'`, nome «CSV»), che **non compare fra gli
   account**, non si aggiorna da solo e non si scollega. C'è perché ogni
   import di Ludex ne vuole uno: tiene gli scarti (che in «Da sistemare» si
   leggono «Ubisoft Connect · CSV»), il salto dei doppioni e l'adozione. Uno
   per negozio e non uno solo, perché `importLibrary` lavora su un negozio
   per volta e a fine corsa pota gli scarti che non ha visto. Se un giorno
   colleghi EA davvero, l'import EA **adotta** le copie EA del CSV invece di
   sdoppiarle (`adottaPossessiMenoSpecifici`).
6. **L'ordine della ricerca** (16/10, vedi la misura qui sotto): nome con
   l'anno, nome senza l'anno, appid Steam (`resolveByNameWithFallbacks`). Un
   appid che porta a una raccolta non vale.
7. **Le righe di un negozio console con più piattaforme** (le Xbox di
   Playnite) si saltano e si contano (`noPlatform`), finché non si decide.

Le colonne:

| Colonna (inglese / italiano)                   | Diventa                                |
| ---------------------------------------------- | -------------------------------------- |
| `Name` / `Nome`                                | nome della voce — **obbligatoria**     |
| `Sources` / `Sorgenti`                         | negozio — **obbligatoria**             |
| `Game Id` / `Id del gioco`                     | id esterno; senza, il nome             |
| `Platforms` / `Piattaforme`                    | sui negozi console, se è una sola      |
| `Release Date` / `Data di uscita`              | `releaseYear`, per il match per nome   |
| `Links` / `Collegamenti`                       | appid Steam → `igdbHint`, dopo il nome |
| `Time Played` / `Tempo di gioco`               | ore della copia (da secondi)           |
| `Last Played` / `Giocato l'ultima volta`       | ultima partita                         |
| `Completion Status` / `Stato di completamento` | stato, solo alla nascita               |
| `Categories` / `Categorie`                     | categorie, solo alla nascita           |

`Added` / `Aggiunto` no (è l'ingresso in Playnite), `Tags` / `Etichette` no
(sul file di prova sono solo le fasce HLTB del plugin).

## Da decidere

- **`Platforms` con più valori** (`Microsoft Xbox One, Microsoft Xbox
Series, PC (Windows)` nel vecchio file): è dove il gioco esiste, non dove
  lo hai. Per ora quelle righe si saltano.
- **LaunchBox, le altre forme dell'id**: da `Application Path` si prende solo
  `uplay://launch/<id>`, l'unica misurata. Steam, GOG ed Epic restano senza
  id (la riga si riconosce dal nome) finché un file non le mostra.

## La misura: `csv:probe` (16/10/2026)

`pnpm --filter api csv:probe [file.csv]` —
[`csv-probe.ts`](../apps/api/src/scripts/csv-probe.ts). Parla solo con IGDB,
non scrive. Il parser è
[`playnite-csv.ts`](../apps/api/src/services/playnite-csv.ts).

Sul file Ubisoft (87 righe, tutte PC):

| Strada                           | Giochi |
| -------------------------------- | ------ |
| solo per nome, con l'anno        | 73     |
| solo per nome, senza l'anno      | 75     |
| appid Steam, dove c'è            | 67/67  |
| col probe: appid prima, nome poi | 79     |

**I `Collegamenti` mentono**, come la scheda Steam per Metacritic: sono
metadata di Playnite, non del negozio. Tre volte su 67 l'appid dà un altro
gioco e il nome ha ragione:

- _Assassin's Creed Liberation HD_ → l'appid dà il Liberation del 2012;
- _Discovery Tour: Ancient Greece_ → l'appid dà quello dell'Egitto;
- _Assassin's Creed III - Remastered_ → l'appid dà una scheda `bundle`
  omonima (la regola 1 la porterebbe sul gioco trovato per nome).

**Anche le date mentono**: sono quelle di Playnite, spesso della riedizione
Ubisoft (_AC II_ e _Brotherhood_ 2016, _Splinter Cell_ 2019, _Ghost Recon_
2010). Con l'anno restano negli scarti; senza, si trovano. Ma senza anno si
perdono _Trackmania_ (2020) e _Discovery Tour: Ancient Greece_, che l'anno
lo vogliono.

Ordine che ne esce, tutto calcolato dalle tre corse:

1. per nome con l'anno;
2. per nome senza l'anno, solo per le voci rimaste;
3. per appid Steam, solo per le voci rimaste: recupera _Assassin's Creed_,
   _For Honor_, _MONOPOLY_, _Prince of Persia_, _Rainbow Six Siege X_,
   _Valiant Hearts_.

**83 su 87**. Negli scarti restano le due edizioni di _Heroes of Might &
Magic_, _Hungry Shark World_ e _Scott Pilgrim_. Un errore resta:
_Prince of Persia: The Sands of Time_, che Playnite data 2026 (la data del
remake), finisce sul remake; si corregge con «Non è questo gioco».

Sul vecchio file (20 righe): le 15 PC fanno 14 su 15, con appid e nome
d'accordo; le 5 Xbox portano **più piattaforme per riga** (One + Series + PC,
360 + One + Series): è ancora da decidere.

## Passi

1. ✅ Il CSV in `apps/api/test/fixtures/`, questo piano, roadmap «in corso».
2. ✅ Parser (con test) e `csv:probe`.
3. ✅ Vocabolario e migration (`ubisoft`, `store_accounts.from_file`),
   `importPlayniteFile` ([playnite-import.ts](../apps/api/src/services/playnite-import.ts)),
   il job `file` e `runFileImportJob`, i ripieghi della ricerca, stato e
   categorie alla nascita, il salto dei doppioni e l'adozione. Test in
   `playnite-import.test.ts`. `csv:probe` percorre ora la strada del job:
   **83 su 87**, confermato.
4. Wireframe Excalidraw: [10-import-csv.excalidraw](10-import-csv.excalidraw)
   (si apre trascinandolo su excalidraw.com), **in revisione** dal 19/10/2026.

   **Prima versione scartata** dall'utente il 19/10: «Importa da Playnite» e
   una scheda «da Playnite» per negozio in Librerie. Le correzioni:
   - è **«Importa da CSV»**: Playnite è un esempio, non il formato;
   - **un CSV non è una libreria**: niente schede in Librerie. Gli account
     interni (uno per negozio del file) restano, perché tengono scarti,
     doppioni e adozione, ma si chiamano «csv» e non compaiono nella lista;
   - i giochi del file prendono il **tag «Importato il {data}»** (in inglese
     «Imported on {date}»), nella lingua di chi carica;
   - un **link per scaricare un CSV d'esempio**;
   - le istruzioni dicono **quali colonne sono obbligatorie e quali
     facoltative**. Colonne in inglese, come l'export di Playnite in inglese,
     con i nomi italiani accettati; obbligatorie solo `Name` e `Sources`
     (senza `Game Id` la riga si riconosce dal nome); date `2026-10-19` o
     `19/10/2026`.

   Seconda versione, frame per frame:
   - **1, Librerie**: solo le schede dei negozi collegati; sotto, un
     riquadro «Da un file CSV» col bottone «⇪ Importa da CSV» e, dopo il
     primo, la riga «Ultimo import» col tag (o «importazione in corso…»).
   - **2, il dialogo**: il tag che i giochi riceveranno, il link al CSV
     d'esempio, la tabella delle colonne (obbligatorie e facoltative, con
     cosa contengono e i valori ammessi), «Hai Playnite?» con i tre passi di
     Library Exporter Advanced, il riquadro del file, tre righe su doppioni,
     stato e «Da sistemare». L'errore di formato sotto il riquadro.
   - **3, il resoconto**: righe per negozio, righe saltate e perché, «Vedi i
     giochi nel backlog →» filtrato per il tag.
   - **4, il tag nel gioco**: solo sui giochi che **entrano nel backlog con
     quel file**, come stato e categorie (decisione A, 19/10/2026). Un gioco
     che c'era già non lo prende: ricaricare un file con _Assassin's Creed_
     della stessa sorgente non lo reimporta, aggiorna solo le ore della
     copia. Così i tag non si accumulano a ogni caricamento. Le categorie di
     Playnite restano categorie, solo sui giochi nuovi.
   - **5, telefono**: il riquadro col bottone largo, il dialogo a tutta
     larghezza, solo «Scegli il file».

   «Hai Playnite?» diventa **«Da dove prendere il file»**: un riquadro
   richiudibile per programma, chiusi di default (19/10/2026). Oggi Playnite
   e **LaunchBox**, GOG Galaxy e altri dopo. LaunchBox **non ha un export
   CSV** (letto sul forum, non provato): la strada documentata è Vista
   elenco → Ctrl+A, Ctrl+C → un foglio di calcolo → salva in CSV. Le sue
   colonne (`Title`? una sorgente?) vanno misurate su un export vero prima
   di scrivere i passi e gli alias.

4b. ✅ Il server rifatto sul wireframe approvato (19/10/2026): parser
generico (`csv-file.ts`), `importCsvFile` e `csvImportStatus`
([csv-import.ts](../apps/api/src/services/csv-import.ts)), account interni
«csv» fuori dalla lista degli account, il tag alla nascita, le procedure
`csvImport.upload` e `csvImport.status`, il CSV d'esempio. Test in
`csv-file.test.ts`, `csv-import.test.ts` e `rpc/csv-import.test.ts`. 5. ✅ La UI (19/10/2026): `CsvImportPanel` e il dialogo in
[csv-import.tsx](../apps/web/components/csv-import.tsx), sotto le schede in
Librerie e anche senza librerie; la data del tag in `lib/import-tag.ts`
(con test). L'upload crea subito il tag e ne rende l'id (`tagId`), così
«Vedi i giochi nel backlog» filtra già dal resoconto. Provata con
Playwright su un utente di prova, col vecchio file a più negozi: Amazon 12
righe e Ubisoft 3 accodate, le 5 Xbox saltate; a import finito 14 giochi
col tag, 1 scarto («Amazon (CSV)» in Da sistemare), il riquadro con
«Ultimo import». Due cose rimaste: Ubisoft non ha un'icona in `BrandIcon`
(un riquadro grigio), e sul telefono il bottone non è a tutta larghezza. 5b. **L'anteprima** (chiesta il 19/10/2026, nello stesso lotto): fra il file e
il resoconto, una tabella delle righe con le spunte per escludere.
**Livello 2**, deciso: ciò che il parser legge più ciò che il database sa
già, senza IGDB — per ogni riga «Nuovo» (il gioco collegato a quell'id in
`external_ids`, non nel backlog), «Già nel backlog», «Da riconoscere» (lo
cercherà il worker) o «Saltata» col perché (negozio, più console, doppione
nel file), che non si spunta. Wireframe nei frame 6 e 7 di
[10-import-csv.excalidraw](10-import-csv.excalidraw), **in revisione**: - nel dialogo «Importa» diventa «Avanti →», che legge il file e apre
l'anteprima; - le chip in alto sono riepilogo e filtro insieme (Tutte, Nuove, Già nel
backlog, Da riconoscere, Saltate), con la ricerca per nome; la spunta in
testa vale per le righe che si vedono; - colonne: nel file, in Ludex, negozio · piattaforma, stato del file,
esito; «Indietro» e «Importa N righe»; - il dialogo qui si allarga oltre i 720 px; sul telefono una scheda per
riga.

    Lato server: `csvImport.preview(file)` rende le righe numerate con
    l'esito, e `csvImport.upload` riceve anche le righe escluse.

    ✅ **Fatta il 19/10/2026**, wireframe approvato. Anteprima e import passano
    dalla stessa funzione (`planCsvFile`), così l'anteprima mostra esattamente
    ciò che l'import farà e i numeri delle righe coincidono. Il doppione nel
    file ora si dice (`duplicates` nel resoconto, «doppione nel file»
    nell'anteprima) invece di sparire. Provata con Playwright sul vecchio file:
    20 righe, 14 nuove, 1 da riconoscere, 5 saltate; una riga tolta compare nel
    resoconto come «1 riga esclusa da te», e riaprendo i giochi appena
    importati sono «Già nel backlog» mentre la riga esclusa torna «Nuovo».
    Lo stato del file si mostra solo sulle righe che lo useranno (nuove e da
    riconoscere).

5c. ✅ **LaunchBox** (19/10/2026), misurato su due file veri dell'utente,
[`launchbox.txt`](../apps/api/test/fixtures/launchbox.txt) in inglese e
[`launchbox.csv`](../apps/api/test/fixtures/launchbox.csv) in italiano.
LaunchBox un export non ce l'ha: la vista a elenco copiata (Ctrl+A,
Ctrl+C) e incollata in un file di testo, salvato anche come `.txt`. Cosa
è servito: - **le tabulazioni**: il separatore si sceglie dall'intestazione; - **i nomi**: `Title`/`Titolo`, `Source`/`Fonte`, `Play Time`/`Tempo
      Giocato`, `Last Played`/`Ultima Partita`, `Application Path`/`Percorso
      Applicazione`; `Platform`/`Piattaforma` e `Release Date`/`Data di
      Uscita` c'erano già. `Status` è testo libero («Imported from Ubisoft
Connect») e non uno stato: non si usa; - **l'id** da `Application Path`: `uplay://launch/16232` è lo stesso id
di Playnite, quindi i collegamenti scritti da un import di Playnite
valgono anche per LaunchBox; - **il tempo** come `12h 34m 56s`.

    Le date di LaunchBox sono quelle dell'uscita, non della riedizione. Col
    probe (solo IGDB) 9 su 10: _Assassin's Creed_ per nome è ambiguo e non c'è
    il link Steam; sul DB di sviluppo l'anteprima ne riconosce 8 per id, lui
    compreso, grazie all'import di Playnite fatto prima. Il dialogo accetta
    `.txt` e i passi del riquadro LaunchBox sono riscritti così.

5d. ✅ **Gli scarti collegati a mano** (19/10/2026, trovato dall'utente con
_Prince of Persia_ e _MONOPOLY_ di `launhc_2.txt`). Stato, categorie e tag
del file valevano solo nel job: uno scarto collegato a mano nasceva nudo.
Ora `unresolved_imports.at_birth` (jsonb, migration `0058`) li conserva,
l'import la scrive e il reimport la riscrive, e `resolveUnresolvedImport`
li applica alla nascita con la stessa funzione dell'import
(`tagNewEntries`); su un gioco che c'era già non cambia niente. Vale anche
per «Collega per tutti». Sul DB di sviluppo: il tag aggiunto a mano a
_Prince of Persia_, già collegato, e `at_birth` riempita sui tre scarti
del CSV ancora aperti. 6. Documentazione: `negozi.md`, `ordine-sviluppo.md`, `import-librerie.md`.
