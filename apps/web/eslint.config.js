import { nextJsConfig } from "@repo/eslint-config/next-js";
import { globalIgnores } from "eslint/config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...nextJsConfig,
  // La config che `tamagui build` impacchetta a ogni build: generata, non nostra.
  globalIgnores([".tamagui/**"]),
  // L'albero delle rotte che il plugin di TanStack Start rigenera da sé.
  globalIgnores(["src/routeTree.gen.ts"]),
  // Passo 1 del 12b: in `src/` c'è TanStack Start, a cui le regole di Next
  // non si applicano (lì `<head>` è giusto). Esce con Next, al passo 5.
  {
    files: ["src/**"],
    rules: { "@next/next/no-head-element": "off" },
  },
];
