import { useTranslations } from 'use-intl';

import { ComingSoon } from '../../components/coming-soon';

export default function Wishlist() {
  const t = useTranslations('tabs');
  return <ComingSoon title={t('wishlist')} />;
}
