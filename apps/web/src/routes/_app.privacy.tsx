import { createFileRoute } from '@tanstack/react-router';

import { privacy } from '@/lib/legal';
import { LegalDocument } from '@/src/components/legal-document';

export const Route = createFileRoute('/_app/privacy')({
  component: () => <LegalDocument docs={privacy} />,
});
