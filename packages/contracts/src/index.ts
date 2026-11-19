import type { ContractRouterClient } from '@orpc/contract';

import type { contract } from './contract';

export * from './vocabulary';
export * from './schemas';
export * from './store-links';
export * from './contract';
export * from './admin-sort';

// Il tipo del client, derivato dal contratto e esposto da qui così web e mobile
// non devono dipendere direttamente da @orpc/contract.
export type ApiClient = ContractRouterClient<typeof contract>;
