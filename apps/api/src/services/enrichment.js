"use strict";
var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
    if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
    return cooked;
};
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENRICHMENT_SOURCE_NAMES = exports.ENRICHMENT_SOURCES = void 0;
exports.markSource = markSource;
exports.findSourceExternalId = findSourceExternalId;
exports.findGamesNeedingSource = findGamesNeedingSource;
var db_1 = require("@repo/db");
var orm_1 = require("@repo/db/orm");
exports.ENRICHMENT_SOURCES = {
    igdb: {
        // Voti, copertine e sommari si muovono, ma piano: sotto il mese si
        // spenderebbero chiamate per riscrivere le stesse righe.
        staleAfterDays: 30,
        retryAfterHours: 24,
        // Un gioco senza `igdbId` non è risolto: non c'è niente da chiedere.
        requires: 'igdbId',
    },
    hltb: {
        // Sei mesi. I tempi di HLTB si muovono molto più piano dei dati IGDB: sono
        // medie su migliaia di segnalazioni, e mille in più non le spostano.
        staleAfterDays: 180,
        retryAfterHours: 24,
        // HLTB parte solo su un gioco che IGDB ha già arricchito, perché il match si
        // fa sul titolo canonico e sull'anno di uscita: senza quei due, scegliere
        // fra i due "Resident Evil 4" è un lancio di moneta. Costo accettato: un
        // gioco che IGDB non conosce non avrà mai una durata.
        requires: 'igdbOk',
    },
};
exports.ENRICHMENT_SOURCE_NAMES = Object.keys(exports.ENRICHMENT_SOURCES);
/**
 * Annota l'esito di un tentativo su una fonte.
 *
 * `externalId` ha tre stati e non due: assente vuol dire "non toccarlo" — un
 * fallimento temporaneo non deve far dimenticare l'aggancio già trovato — null
 * vuol dire "scollegalo", e una stringa lo scrive.
 *
 * Accetta un `executor` perché la fonte va segnata **nella stessa transazione**
 * in cui si scrivono i dati che ha portato: separarle lascerebbe la porta a un
 * gioco marcato sincronizzato e vuoto, che nessuna spazzata riproverebbe.
 */
function markSource(values_1) {
    return __awaiter(this, arguments, void 0, function (values, executor) {
        var now, gameId, source, status, error, touchesExternalId;
        var _a, _b, _c;
        if (executor === void 0) { executor = db_1.db; }
        return __generator(this, function (_d) {
            switch (_d.label) {
                case 0:
                    now = new Date();
                    gameId = values.gameId, source = values.source, status = values.status;
                    error = (_a = values.error) !== null && _a !== void 0 ? _a : null;
                    touchesExternalId = values.externalId !== undefined;
                    return [4 /*yield*/, executor
                            .insert(db_1.schema.gameSources)
                            .values({
                            gameId: gameId,
                            source: source,
                            status: status,
                            // `syncedAt` si muove solo sul successo: è il campo su cui si decide
                            // cosa riaccodare, e un fallimento non deve far sembrare fresco un dato.
                            syncedAt: status === 'ok' ? now : null,
                            attemptedAt: now,
                            error: error,
                            externalId: (_b = values.externalId) !== null && _b !== void 0 ? _b : null,
                        })
                            .onConflictDoUpdate({
                            target: [db_1.schema.gameSources.gameId, db_1.schema.gameSources.source],
                            set: __assign(__assign({ status: status, attemptedAt: now, error: error, updatedAt: now }, (status === 'ok' ? { syncedAt: now } : {})), (touchesExternalId ? { externalId: (_c = values.externalId) !== null && _c !== void 0 ? _c : null } : {})),
                        })];
                case 1:
                    _d.sent();
                    return [2 /*return*/];
            }
        });
    });
}
/** L'id del gioco sulla fonte, se l'abbiamo già trovato una volta. */
function findSourceExternalId(gameId, source) {
    return __awaiter(this, void 0, void 0, function () {
        var row;
        var _a;
        return __generator(this, function (_b) {
            switch (_b.label) {
                case 0: return [4 /*yield*/, db_1.db.query.gameSources.findFirst({
                        columns: { externalId: true },
                        where: (0, orm_1.and)((0, orm_1.eq)(db_1.schema.gameSources.gameId, gameId), (0, orm_1.eq)(db_1.schema.gameSources.source, source)),
                    })];
                case 1:
                    row = _b.sent();
                    return [2 /*return*/, (_a = row === null || row === void 0 ? void 0 : row.externalId) !== null && _a !== void 0 ? _a : null];
            }
        });
    });
}
/**
 * Quello che una fonte pretende da un gioco prima ancora di provarci.
 *
 * `igdbOk` è una EXISTS e non una JOIN in più perché la JOIN che c'è già è sulla
 * fonte corrente: quando la fonte corrente *è* IGDB le due si sovrapporrebbero,
 * e servirebbe un alias per una condizione che qui si legge in una riga.
 */
function requirement(requires) {
    if (requires === 'igdbId')
        return (0, orm_1.isNotNull)(db_1.schema.games.igdbId);
    return (0, orm_1.sql)(templateObject_1 || (templateObject_1 = __makeTemplateObject(["exists (\n    select 1 from game_sources igdb\n    where igdb.game_id = ", " and igdb.source = 'igdb' and igdb.status = 'ok'\n  )"], ["exists (\n    select 1 from game_sources igdb\n    where igdb.game_id = ", " and igdb.source = 'igdb' and igdb.status = 'ok'\n  )"])), db_1.schema.games.id);
}
/**
 * Giochi da (ri)arricchire con una fonte.
 *
 * «Da riarricchire» non è «mai arricchito»: un gioco sincronizzato mesi fa è un
 * candidato quanto uno mai visto, altrimenti la coda va in quiescenza appena il
 * primo giro finisce e i dati invecchiano senza che nessuno lo dica.
 *
 * Tre cose del predicato che non sono ovvie rileggendolo:
 *
 * - il ramo `game_sources.game_id IS NULL` è obbligatorio, non difensivo. Con la
 *   LEFT JOIN, su un gioco mai tentato tutte le colonne di `game_sources` sono
 *   NULL, e `status <> 'not_found'` vale NULL: senza questo ramo i giochi nuovi —
 *   quelli che servono di più — spariscono dal risultato.
 * - `attempted_at` governa i fallimenti temporanei. `synced_at` da solo non basta:
 *   su un gioco che fallisce resta indietro, e la spazzata lo riaccoderebbe ogni
 *   sei ore.
 * - l'ordinamento non è cosmetico. Se i candidati sono più del limite, senza
 *   ORDER BY Postgres può restituire le stesse righe a ogni giro e lasciarne
 *   altre a digiuno per sempre. `nulls first` mette davanti i mai sincronizzati.
 */
function findGamesNeedingSource(source, limit) {
    if (limit === void 0) { limit = 100; }
    var config = exports.ENRICHMENT_SOURCES[source];
    return (db_1.db
        .select({ id: db_1.schema.games.id })
        .from(db_1.schema.games)
        .leftJoin(db_1.schema.gameSources, (0, orm_1.and)((0, orm_1.eq)(db_1.schema.gameSources.gameId, db_1.schema.games.id), (0, orm_1.eq)(db_1.schema.gameSources.source, source)))
        .where((0, orm_1.and)(requirement(config.requires), (0, orm_1.or)((0, orm_1.isNull)(db_1.schema.gameSources.gameId), (0, orm_1.and)((0, orm_1.ne)(db_1.schema.gameSources.status, 'not_found'), (0, orm_1.or)((0, orm_1.isNull)(db_1.schema.gameSources.syncedAt), (0, orm_1.lt)(db_1.schema.gameSources.syncedAt, (0, orm_1.sql)(templateObject_2 || (templateObject_2 = __makeTemplateObject(["now() - ", " * interval '1 day'"], ["now() - ", " * interval '1 day'"])), config.staleAfterDays))), (0, orm_1.or)((0, orm_1.isNull)(db_1.schema.gameSources.attemptedAt), (0, orm_1.lt)(db_1.schema.gameSources.attemptedAt, (0, orm_1.sql)(templateObject_3 || (templateObject_3 = __makeTemplateObject(["now() - ", " * interval '1 hour'"], ["now() - ", " * interval '1 hour'"])), config.retryAfterHours)))))))
        // `sql` grezzo e non `asc()`: quello avvolge l'espressione e produrrebbe
        // `synced_at nulls first asc`, che Postgres rifiuta.
        .orderBy((0, orm_1.sql)(templateObject_4 || (templateObject_4 = __makeTemplateObject(["", " asc nulls first"], ["", " asc nulls first"])), db_1.schema.gameSources.syncedAt))
        .limit(limit));
}
var templateObject_1, templateObject_2, templateObject_3, templateObject_4;
