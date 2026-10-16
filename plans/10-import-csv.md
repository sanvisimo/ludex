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

## Decisioni (16/10/2026)

1. **Formato: l'export di Library Exporter Advanced**, non un CSV generico. Si
   chiede all'utente un insieme **piccolo** di campi, che diventa le istruzioni
   per creare il file: obbligatori `Nome`, `Id del gioco`, `Sorgenti`, gli
   altri facoltativi. Il parser vuole i tre obbligatori e ignora tutto il resto.
2. **Si importa tutto e si saltano i doppioni.** Ogni riga entra col negozio
   di `Sorgenti`; una riga il cui gioco l'utente ha già, con una copia di quel
   negozio sulla stessa piattaforma, si salta e si conta nel resoconto.
3. **Stato e categorie di Playnite si importano solo alla nascita** della riga
   di backlog, senza mai sovrascrivere ciò che c'è in Ludex:
   New / Plan to Play / On Hold → `backlog`, Playing → `playing`,
   Played / Beaten → `played`, Completed → `completed`, Abandoned → `dropped`,
   Won't Play → `excluded`; uno stato personalizzato → `backlog`. Le
   `Categorie` diventano tag dell'utente. Il limite, accettato: un gioco che
   c'è già (da Steam, per esempio) non prende lo stato di Playnite.
4. **Il file arriva con oRPC come `File`**, il server lo legge con `csv-parse`,
   lo riduce a `LibraryEntry[]` e accoda un job con le voci: non sono un
   credenziale, e ridotte (senza descrizioni) pesano poco.

Mappatura dei campi:

| Campo Playnite           | Diventa                               |
| ------------------------ | ------------------------------------- |
| `Nome`                   | nome della voce                       |
| `Id del gioco`           | id esterno                            |
| `Sorgenti`               | negozio                               |
| `Piattaforme`            | piattaforma della copia (da misurare) |
| `Data di uscita`         | `releaseYear`, per il match per nome  |
| `Collegamenti`           | appid Steam → `igdbLookup`            |
| `Tempo di gioco`         | ore della copia (da secondi)          |
| `Giocato l'ultima volta` | ultima partita                        |
| `Stato di completamento` | stato, solo alla nascita              |
| `Categorie`              | tag dell'utente, solo alla nascita    |
| `Aggiunto`               | **no**: è l'ingresso in Playnite      |
| `Etichette`              | **no**: sono le fasce HLTB del plugin |

5. **Una scheda «Playnite» per utente** in `/account` (una riga di
   `store_accounts`), approvata il 16/10/2026. Ogni import di Ludex è legato a
   una scheda, ed è ciò che dà gli scarti, lo scollegamento e il reimport. Le
   copie portano il negozio vero (`ea`, `ubisoft`…) ma appartengono a quella
   scheda. Ricaricare il file aggiorna la scheda. Se un giorno colleghi EA
   davvero, l'import EA **adotta** le copie EA del file invece di sdoppiarle
   (estende l'adozione di `ensureOwnerships`).

## Da decidere

- **Le intestazioni in inglese**: il file vero è italiano; i nomi inglesi
  vanno presi dalla localizzazione di Playnite, con un test.
- **`Piattaforme` con più valori** (`Microsoft Xbox One, Microsoft Xbox
Series, PC (Windows)` nel vecchio file): è dove il gioco esiste, non dove
  lo hai. Da misurare col probe.

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
3. Vocabolario (`ubisoft`, migration), servizio, job, test contro Postgres.
4. Wireframe Excalidraw del caricamento in `/account`, con le istruzioni per
   creare il file.
5. La UI.
6. Documentazione: `negozi.md`, `ordine-sviluppo.md`, `import-librerie.md`.
