import '../env';

import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';

// Nomina admin un utente già registrato, per email.
//
//   pnpm --filter api admin:grant <email>
//
// Serve per il primo admin: il ruolo lo cambia un admin dalla sezione Utenti, e
// prima del primo non c'è nessuno che possa farlo. Scrive dritto su `user.role`,
// la colonna del plugin `admin` di Better Auth.

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error('uso: pnpm --filter api admin:grant <email>');
  process.exit(1);
}

const [row] = await db
  .update(schema.user)
  .set({ role: 'admin' })
  .where(eq(schema.user.email, email))
  .returning({ name: schema.user.name });

if (!row) {
  console.error(`nessun utente con email ${email}: prima deve registrarsi`);
  process.exit(1);
}

console.log(`${row.name} (${email}) ora è admin`);
process.exit(0);
