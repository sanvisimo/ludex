import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";

import { SiteNav } from "@/components/site-nav";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import { Providers } from "./providers";
import "./globals.css";

// Il preset Nova di shadcn si aspetta Geist su `--font-sans`. I .woff locali
// dello scaffold create-turbo sono stati rimossi: erano la stessa famiglia,
// caricata in un secondo modo.
const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("title"),
    description: t("description"),
  };
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // La lingua non sta nell'URL: la decide `i18n/request.ts` leggendo cookie e
  // Accept-Language. Qui serve solo per l'attributo `lang`.
  const locale = await getLocale();

  return (
    // `suppressHydrationWarning` è richiesto da next-themes: la classe del tema
    // la scrive uno script prima dell'idratazione, quindi il markup del server
    // non può combaciare. Vale solo per questo elemento, non per i figli.
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(geistSans.variable, geistMono.variable)}
    >
      <body className="font-sans antialiased">
        {/* Senza `messages` espliciti: il provider eredita quelli già risolti
            lato server, così non si duplica il bundle delle traduzioni. */}
        <NextIntlClientProvider>
          <Providers>
            <SiteNav />
            {children}
            <Toaster />
          </Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
