import { config } from "@repo/eslint-config/react-internal";
import { globalIgnores } from "eslint/config";

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...config,
  // Generati, non nostri: la build, la config che il compilatore di Tamagui
  // impacchetta a ogni build, e l'albero delle rotte che il plugin di TanStack
  // Start riscrive da sé.
  globalIgnores(["dist/**", ".tamagui/**", "src/routeTree.gen.ts"]),
];
