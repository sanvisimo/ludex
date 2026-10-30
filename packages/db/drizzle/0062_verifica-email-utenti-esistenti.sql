-- Il rilascio accende la verifica dell'email (`requireEmailVerification`).
-- Chi si è registrato prima non ha mai ricevuto il link, perché nessuno lo
-- spediva: senza questo resterebbe chiuso fuori dal suo account. Vale una
-- volta sola, per gli utenti che ci sono al momento della migration; chi si
-- registra dopo passa dalla verifica.
UPDATE "user" SET "email_verified" = true WHERE "email_verified" = false;
