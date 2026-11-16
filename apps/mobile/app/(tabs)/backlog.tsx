import { useTranslations } from 'use-intl';

import { ComingSoon } from '../../components/coming-soon';

export default function Backlog() {
  const t = useTranslations('tabs');
  return <ComingSoon title={t('backlog')} />;
}
