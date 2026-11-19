import type { Store } from '@repo/contracts';
import type { Brand } from '@repo/ui';

export const STORE_BRAND: Partial<Record<Store, Brand>> = {
  steam: 'steam',
  gog: 'gog',
  epic: 'epic',
  ea: 'ea',
  battlenet: 'battlenet',
  ubisoft: 'ubisoft',
  amazon: 'amazon',
  psn: 'psn',
  xbox: 'xbox',
  nintendo: 'nintendo',
};
