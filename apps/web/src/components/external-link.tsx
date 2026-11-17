import { Text } from '@repo/ui';
import type { ReactNode } from 'react';

/**
 * Un link che esce dall'app: nuova scheda, senza passare il `referrer`. Un
 * `mailto:` apre invece il programma di posta, e una scheda vuota non serve.
 */
export function ExternalLink({
  href,
  strong = false,
  children,
}: {
  href: string;
  strong?: boolean;
  children: ReactNode;
}) {
  return (
    <Text
      render="a"
      {...{ href }}
      {...(href.startsWith('mailto:')
        ? {}
        : { target: '_blank', rel: 'noopener noreferrer' })}
      color="color12"
      fontWeight={strong ? '600' : '400'}
      textDecorationLine="underline"
      cursor="pointer"
    >
      {children}
    </Text>
  );
}
