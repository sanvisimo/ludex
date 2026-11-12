# Revisione dialog — 12 novembre 2026

Direzione approvata in chat: proporzioni dedicate, titoli più leggibili,
spaziatura più ampia, chiusura accessibile e azioni raggiungibili nei moduli lunghi.
Dettagli durata/critica e copie come casi guida. Dialog centrate anche su telefono.

## Decisioni

- Tre larghezze: 440 px per contenuti brevi, 560 per dettagli, 720 per moduli.
- Padding di 24 px desktop e 20 mobile; titolo di 20 px; chiusura fuori
  dall'area scorrevole e footer delle azioni sticky sul web.
- Durate in righe allineate con accenti blu e viola, segnalazioni secondarie
  e avvisi separati per campioni ridotti e giochi senza fine.
- Critica raggruppata per fonte, con link di attribuzione e loghi esistenti
  delle piattaforme. Badge su 100: rosso sotto 50, ambra 50–74, verde da 75,
  sul valore arrotondato mostrato. Nessuna media fra fonti.
- Copie raggruppate per negozio, con piattaforma, account e abbonamento
  distinti, mantenendo tooltip e modalità di apertura attuali.

## Verifiche

- [x] Typecheck e lint web/UI; build web.
- [x] Storie dialog in Chromium: apertura, Escape, chiusura e moduli lunghi.
- [x] Prova visiva desktop/mobile nei due temi: dettagli completi e mancanti,
      account lunghi, loghi disponibili e fallback, tastiera e scorrimento.

17 storie UI (dialog, menu e galleria) e 36 casi Chromium superati. Nessuna
violazione axe nelle dialog verificate. Le prove visive montano i componenti
reali con dati di esempio e non eseguono scritture o import su dati utente.
Report e schermate in [dialog-review](../docs/brand/pilecue/dialog-review/README.md).

Lotto approvato dall'utente il 12 novembre 2026, con richiesta di branch, commit, push e PR.

## Adattamento desktop approvato

Dopo la prova in uso, approvata la disposizione affiancata da 1024 px:
la sola dialog durata/critica arriva a 960 px, con durata a sinistra (320 px)
e critica a destra, separate da un bordo verticale. Titolo e nome del gioco
restano sopra entrambe. Sotto 1024 px restano larghezza e ordine precedenti.

- [x] Typecheck e lint web; build client/server.
- [x] Chromium nei due temi: 1023/1024 px e desktop, mobile 390/320 px,
      molte piattaforme, scorrimento, Escape e ritorno del focus.

14 casi Chromium aggiuntivi superati sul componente reale con dati di prova:
nessun overflow, nessuna violazione axe e nessun pageerror. Con quattro voti
per piattaforma la dialog misura 960 × 826 px sul desktop alto 1000 px e non
richiede scroll. Con molte piattaforme mantiene lo scroll interno. Riscontri:
[report desktop](../docs/brand/pilecue/dialog-review/desktop-columns-report.json).
