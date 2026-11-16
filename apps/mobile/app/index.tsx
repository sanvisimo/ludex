import { Redirect } from 'expo-router';

import { authClient } from '../lib/auth';

export default function Index() {
  const { data: session } = authClient.useSession();
  return <Redirect href={session ? '/backlog' : '/login'} />;
}
