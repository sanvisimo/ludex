import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

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

export const metadata: Metadata = {
  title: "Ludex",
  description: "Cosa gioco adesso",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="it" className={cn(geistSans.variable, geistMono.variable)}>
      <body className="font-sans antialiased">
        <Providers>
          <SiteNav />
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
