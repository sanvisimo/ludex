"use client";

import { signOut, useSession } from "@repo/auth/client";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LocaleSwitcher } from "@/components/locale-switcher";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export function SiteNav() {
  const t = useTranslations("nav");
  const router = useRouter();
  const { data: session, isPending } = useSession();

  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex max-w-4xl items-center gap-4 px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          Ludex
        </Link>

        <div className="ml-auto flex items-center gap-2">
          {/* Tema e lingua restano raggiungibili anche da anonimo: sono
              preferenze del browser, non dell'account. */}
          <ThemeToggle />
          <LocaleSwitcher />

          {/* isPending evita che i bottoni da anonimo lampeggino al primo render. */}
          {isPending ? null : session ? (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/backlog" />}>
                {t("backlog")}
              </Button>
              <Button variant="ghost" nativeButton={false} render={<Link href="/account" />}>
                {t("account")}
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await signOut();
                  router.push("/");
                  router.refresh();
                }}
              >
                {t("signOut")}
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" nativeButton={false} render={<Link href="/login" />}>
                {t("signIn")}
              </Button>
              <Button nativeButton={false} render={<Link href="/register" />}>
                {t("signUp")}
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}
