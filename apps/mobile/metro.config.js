// La config di Expo così com'è: dalla SDK 52 riconosce da sola il monorepo
// (cartelle da osservare e `node_modules` da risolvere). React e React Native
// sono una copia sola perché il repo ne ha una versione sola: vedi l'override
// in `pnpm-workspace.yaml`.
const { getDefaultConfig } = require('expo/metro-config');

module.exports = getDefaultConfig(__dirname);
