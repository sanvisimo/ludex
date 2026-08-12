"use client";

import { signOut, useSession } from "@repo/auth/client";
import Link from "next/link";

export default function Home() {
  const { data: session, isPending } = useSession();

  if (isPending) return <main style={{ padding: 32 }}>Caricamento…</main>;

  if (!session) {
    return (
      <main style={{ padding: 32, display: "grid", gap: 12 }}>
        <h1>Ludex</h1>
        <p>Non sei autenticato.</p>
        <div style={{ display: "flex", gap: 12 }}>
          <Link href="/login">Accedi</Link>
          <Link href="/register">Registrati</Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ padding: 32, display: "grid", gap: 12 }}>
      <h1>Ludex</h1>
      <p>
        Sei autenticato come <strong>{session.user.email}</strong>.
      </p>
      <button type="button" onClick={() => signOut()} style={{ width: "fit-content" }}>
        Esci
      </button>
    </main>
  );
}
