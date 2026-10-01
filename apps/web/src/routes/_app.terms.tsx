import { createFileRoute } from '@tanstack/react-router';

import { terms } from '@/lib/legal';
import { LegalDocument } from '@/src/components/legal-document';

export const Route = createFileRoute('/_app/terms')({
  component: () => <LegalDocument docs={terms} />,
});
