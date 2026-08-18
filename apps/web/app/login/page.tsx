"use client";

import { signIn } from "@repo/auth/client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * `next` arriva dall'URL, quindi è input non fidato: si accettano solo percorsi
 * interni. Senza questo controllo `?next=https://sito-cattivo` o `?next=//host`
 * (protocol-relative) trasformerebbero il login in un redirect aperto.
 */
function safeNext(value: string | null) {
  if (!value) return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
    if (error) {
      setError(error.message ?? "Accesso fallito");
      return;
    }

    // Il proxy scrive ?next=/percorso quando rimbalza un anonimo da una pagina
    // privata: si torna lì invece che sulla home.
    router.push(safeNext(searchParams.get("next")));
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button type="submit" disabled={pending}>
        {pending ? "Attendi…" : "Accedi"}
      </Button>

      <p className="text-center text-muted-foreground">
        Non hai un account?{" "}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          Registrati
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-lg">Accedi</CardTitle>
          <CardDescription>Bentornato su Ludex.</CardDescription>
        </CardHeader>
        <CardContent>
          {/* useSearchParams richiede un confine di Suspense, o la pagina non
              può restare prerenderizzata staticamente. */}
          <Suspense fallback={<p className="text-muted-foreground">Caricamento…</p>}>
            <LoginForm />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
