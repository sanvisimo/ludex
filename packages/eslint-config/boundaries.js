/**
 * I confini fra i workspace, scritti come regole invece che come promesse.
 *
 * Il CLAUDE.md li dichiara da sempre, ma una regola in un documento la si
 * rispetta finché qualcuno se ne ricorda: qui un import sbagliato fa fallire
 * `pnpm lint`. È `no-restricted-imports` e nient'altro, perché il confine è
 * un elenco di pacchetti e non serve un plugin per scriverlo.
 */

/** Costruisce il blocco di regole per un elenco di pacchetti vietati. */
function forbid(groups) {
  return {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: groups.map(({ names, message }) => ({
            group: names.flatMap((name) => [name, `${name}/*`]),
            message,
          })),
        },
      ],
    },
  };
}

/**
 * `packages/ui`: il design system universale.
 *
 * - `next/*` perché gira anche su React Native, dove quel modulo non esiste e
 *   il bundle si romperebbe.
 * - `@repo/contracts` e `@repo/db` perché un componente che conosce
 *   `BacklogEntry` smette di essere design system e diventa una schermata.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const designSystemBoundary = [
  forbid([
    {
      names: ["next"],
      message:
        "packages/ui gira anche su React Native: niente next/*. Ciò che conosce Next sta in apps/web.",
    },
    {
      names: ["@repo/contracts", "@repo/db"],
      message:
        "packages/ui non conosce il dominio: un componente che importa contratti o schema è una schermata, e sta nell'app.",
    },
  ]),
];

/**
 * `apps/mobile`: il bundle React Native.
 *
 * - `@repo/db` porterebbe il driver Postgres nel bundle. Se serve un tipo
 *   derivato dallo schema, lo si ri-esporta come tipo puro da
 *   `@repo/contracts`.
 * - `next/*` non esiste su React Native.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export const mobileBoundary = [
  forbid([
    {
      names: ["@repo/db"],
      message:
        "apps/mobile non importa mai @repo/db: il driver Postgres finirebbe nel bundle. I tipi passano da @repo/contracts.",
    },
    {
      names: ["next"],
      message: "next/* non esiste su React Native.",
    },
  ]),
];
