import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

// I comandi drizzle-kit girano con cwd = packages/db, il .env sta alla radice.
config({ path: '../../.env' });

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error('DATABASE_URL non impostata: copia .env.example in .env');
}

export default defineConfig({
  schema: './src/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url },
});
