// Punto di ingresso dello schema. `auth.ts` è generato da @better-auth/cli e
// viene RISCRITTO INTERO a ogni rigenerazione: non aggiungere lì le nostre
// tabelle. Le tabelle del dominio (games, backlog, …) vanno in file propri e si
// riesportano da qui.
export * from "./auth";
