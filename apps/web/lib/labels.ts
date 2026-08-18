import type { BacklogStatus, Store } from "@repo/contracts";
import { backlogStatusValues, storeValues } from "@repo/contracts";

// Etichette italiane per i valori del vocabolario condiviso. Stanno nel web e
// non in packages/contracts perché sono testo di interfaccia: il mobile avrà le
// sue, e il contratto deve restare dato puro.
export const statusLabels: Record<BacklogStatus, string> = {
  backlog: "Da giocare",
  playing: "In corso",
  played: "Finito",
  dropped: "Abbandonato",
  excluded: "Non mi interessa",
};

export const storeLabels: Record<Store, string> = {
  steam: "Steam",
  gog: "GOG",
  epic: "Epic",
  ea: "EA",
  battlenet: "Battle.net",
  amazon: "Amazon",
  psn: "PlayStation Store",
  xbox: "Xbox",
  nintendo: "Nintendo eShop",
};

export const statusOptions = backlogStatusValues.map((value) => ({
  value,
  label: statusLabels[value],
}));

export const storeOptions = storeValues.map((value) => ({
  value,
  label: storeLabels[value],
}));

// Base UI mostra il valore grezzo nel trigger di Select se non gli si passa una
// mappa valore → etichetta tramite la prop `items`. Senza, si legge "backlog"
// invece di "Da giocare".
export const statusItems: Record<string, string> = { ...statusLabels };
export const storeItems = (noneValue: string, noneLabel: string): Record<string, string> => ({
  [noneValue]: noneLabel,
  ...storeLabels,
});
