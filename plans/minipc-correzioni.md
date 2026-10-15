# Mini PC — le correzioni a mano dei lotti 9a, 9b e 9f

Le correzioni rimaste dopo i confronti con Playnite di GOG, Epic, PSN, Amazon e
Steam (14–15/10/2026). Raccolte dai piani
[9a-gog-raccolte-e-doppioni](9a-gog-raccolte-e-doppioni.md),
[9a-epic-piu-giochi-per-prodotto](9a-epic-piu-giochi-per-prodotto.md),
[9b-psn-nomi-tagliati](9b-psn-nomi-tagliati.md) e
[9f-steam-gratuiti-e-demo](9f-steam-gratuiti-e-demo.md). I collegamenti già
scritti vincono sulle regole nuove: un reimport non li corregge da solo.

## Prima

- [ ] deploy del codice nuovo, con la migration 0054 (`subscription` e `medium`
      su `unresolved_imports`)

## Dall'admin: «Apri» → «Non è questo gioco»

### GOG ed Epic (9a)

- [X] Alone in the Dark 1 (GOG) → **1956**
- [X] Alone in the Dark 2 (GOG) → **1957**
- [X] Pools of Darkness (GOG) → **12761**
- [X] Hillsfar (GOG) → **8622**
- [X] War of the Lance (GOG) → **50494**
- [X] Metro 2033 Redux (GOG) → **80853**
- [X] DOOM 3 (GOG) → **280**
- [X] The Witcher 3: Wild Hunt — Remastered, id GOG `1495134320` (il prodotto
      GOTY; l'altro, `1207664643`, resta su 1942) → **415005**
- [X] Nioh: The Complete Edition (Epic) → **68461**
- [X] Torchlight II (Epic) → la scheda di _Torchlight II_
- [X] Dragon Age: Inquisition GOTY (Epic) → la scheda di _Dragon Age:
      Inquisition GOTY_
- [X] TROY (Epic, entrato come «AMAZONS» su _Amazon_) → _A Total War Saga:
      TROY_
- [X] _Legend of Keepers: Prologue_ (GOG): **«Scollega»**, poi reimport GOG;
      finisce fra i «Possibili doppioni», e lì si nasconde

### Steam (9f)

- [X] Metro 2033 Redux (Steam `286690`) → **80853**

### Dalla lista delle copie su una piattaforma sbagliata (9b, «Segnalati»)

- [X] Akalabeth: World of Doom (GOG) → **131719**
- [X] Ultima IV (GOG) → **«Va bene così»**
- [X] Dishonored: Definitive Edition (GOG, Epic) → **41590**
- [X] Monument Valley 2+ (Epic) → **36749**
- [ ] Predator (Epic) → **118272**
- [ ] Styx (Epic) → **13554**
- [ ] Jet Grind Radio (Steam) → **21004**
- [ ] Resident Evil 4 (Steam) → **145191**
- [ ] Bayonetta (Nintendo) → **279337**
- [ ] Final Fantasy IX (Nintendo) → **205673**
- [ ] Trine (Nintendo) → **51800**
- [ ] Trine 2 (Nintendo) → **38932**
- [ ] Harry Potter: Campioni di Quidditch (PS4, PS5) → **246166**
- [ ] LEGO Star Wars: La Saga degli Skywalker → **119305**
- [ ] Call of Duty: Modern Warfare 3 (PS4, PS5) → **260780**
- [ ] Game of Thrones (PS4) → **7610**
- [ ] Aliens (PS5) → **144153**
- [ ] Diablo III (PS4) → **47452**
- [ ] Final Fantasy XIV: A Realm Reborn (PS4) → **386**
- [ ] Indiana Jones and the Last Crusade (Amazon) → **186**
- [ ] Star Wars: The Force Unleashed (Amazon) → **19637**
- [ ] Mutation Nation (Amazon) → **99477**
- [ ] Metal Slug 3 (Amazon) → **347159**

## Nel database

### La demo di Castlevania (9f)

_Castlevania: Belmont's Curse Demo_ (Steam `5000760`) collegata al
_Castlevania_ del 1986 (1114). Dall'admin non si toglie: «Scollega» rifiuta
l'id unico, e per una demo un gioco giusto non c'è. In locale si sono
cancellati collegamento, copia e riga del backlog.

- [X] guardare prima cosa c'è (non scrive niente):

```bash
docker exec ludex-postgres psql -U ludex -d ludex -c "select e.id as link, b.id as backlog, b.status, b.rating, b.notes is not null as note, (select count(*) from backlog_tags t where t.backlog_id = b.id) as tag, (select count(*) from backlog x where x.game_id = g.id) as utenti from external_ids e join games g on g.id = e.game_id left join backlog b on b.game_id = g.id where e.source = 'steam' and e.external_id = '5000760'"
```

- [X] se la riga del backlog non ha dati dell'utente e nessun altro ha il
      gioco: cancellare il collegamento, le copie con `store_page =
    'app/5000760'` e la riga del backlog. Al reimport la demo torna fra gli
      scarti, nascosta come `prerelease`

### Moonrise (9f), solo se risolto a mano anche lì

- [X] guardare la copia:

```bash
docker exec ludex-postgres psql -U ludex -d ludex -c "select o.id, o.subscription, o.medium, o.store_page from ownerships o join backlog b on b.id = o.backlog_id join games g on g.id = b.game_id where g.igdb_id = 9873"
```

- [X] se c'è una copia con `subscription`, `medium` e `store_page` vuoti,
      cancellarla: il reimport la riscrive come `steam_family`

## Dopo

- [X] reimport di ogni negozio
- [X] controllo: la lista in «Segnalati» senza le righe corrette sopra, e nei
      «da sistemare» i casi attesi (Hillsfar e le altre voci GOG fra le «Non
      riconosciute», i prologhi fra i «Possibili doppioni»)
