"use client";

import { signOut, useSession } from "@repo/auth/client";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";

export function SiteNav() {
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Ludex
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {/* isPending evita che i bottoni da anonimo lampeggino al primo render. */}
          {isPending ? null : session ? (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/backlog" />}>
                Il mio backlog
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                Esci
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                Accedi
              </Button>
              <Button nativeButton={false} render={<Link href="/register" />}>
                Registrati
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
