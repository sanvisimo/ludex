import { schema } from '@repo/db';
import { sql } from '@repo/db/orm';

/**
 * La riga di backlog ha **qualcosa dell'utente** sopra: un voto, delle note, uno
 * stato diverso da `backlog`, dei tag.
 *
 * È la linea che decide cosa si può buttare senza chiedere. Una riga senza
 * niente di tutto questo è solo il riflesso di una libreria, e se la libreria
 * non la contiene più si può togliere; una con un voto è roba che l'utente ha
 * scritto, e non sparisce perché un negozio ha smesso di dirne il possesso.
 *
 * La usano lo scollegamento di un account (`orphanEntries`, per dire quanto si
 * perde) e la potatura delle copie uscite dalla famiglia Steam: due posti che
 * devono tracciare la linea nello stesso punto, o uno promette ciò che l'altro
 * non fa.
 */
export const hasPersonalData = sql<boolean>`(
  ${schema.backlog.rating} is not null
  or ${schema.backlog.notes} is not null
  or ${schema.backlog.status} <> 'backlog'
  or exists (
    select 1 from ${schema.backlogTags}
     where ${schema.backlogTags.backlogId} = ${schema.backlog.id}
  )
)`;
