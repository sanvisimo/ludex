import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  baseURL: process.env.PUBLIC_API_URL ?? 'http://localhost:3005',
});

export const { signIn, signUp, signOut, useSession } = authClient;
