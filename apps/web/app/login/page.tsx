"use client";

import { signIn } from "@repo/auth/client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);

    const { error } = await signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });

    setPending(false);
    if (error) setError(error.message ?? "Accesso fallito");
    else router.push("/");
  }

  return (
    <main style={{ padding: 32 }}>
      <h1>Accedi</h1>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 8, maxWidth: 320 }}>
        <input name="email" type="email" placeholder="Email" required />
        <input name="password" type="password" placeholder="Password" required />
        <button type="submit" disabled={pending}>
          {pending ? "Attendi…" : "Accedi"}
        </button>
        {error && <p style={{ color: "crimson" }}>{error}</p>}
      </form>
    </main>
  );
}
