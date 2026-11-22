import type { Metadata } from "next";
import Link from "next/link";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { CodeXmlIcon, CrosshairIcon } from "lucide-react";
import "./globals.css";
import DeepRunner from "@/components/DeepRunner";
import GlobalSearch from "@/components/GlobalSearch";
import Nav from "@/components/Nav";
import ThemeToggle from "@/components/ThemeToggle";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "LoL Scouting",
  description: "Suivi des prospects européens (ERL, EMEA Masters, LEC), nord-américains (NACL, LCS) et coréens (LCK CL, LCK)",
};

// Thème choisi avant l'affichage (pas de « flash » de la mauvaise couleur)
const THEME_SCRIPT = `try{if(localStorage.getItem("theme")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  return (
    <html lang="fr" className={`${GeistSans.variable} ${GeistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen overflow-x-clip">
        <header className="sticky top-0 z-20 border-b border-border/70 bg-bg/75 backdrop-blur-md print:hidden">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-2.5 sm:gap-5">
            <Link href="/" className="group flex shrink-0 items-center gap-2" aria-label="LoL Scouting, accueil">
              <span className="grid size-8 place-items-center rounded-xl bg-gradient-to-br from-accent to-[#7a5cff] text-white shadow-[0_0_18px_-4px_var(--accent)]">
                <CrosshairIcon className="size-4.5" strokeWidth={2.25} />
              </span>
              <span className="hidden text-[15px] font-semibold tracking-tight sm:block">
                LoL <span className="text-gold">Scouting</span>
              </span>
            </Link>
            <Nav />
            <div className="ml-auto" />
            <GlobalSearch />
            <Link
              href="/technique"
              className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface-2/60 text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
              title="Technique : calcul du score, modèle de montée, stats, stack (mode développeur)"
              aria-label="Technique"
            >
              <CodeXmlIcon className="size-4" />
            </Link>
            <span className="hidden text-[11px] text-ink-3 2xl:block">
              {meta.seasons[0]}–{meta.seasons.at(-1)} · MAJ {meta.generated}
            </span>
            <ThemeToggle />
          </div>
        </header>
        <main className="mx-auto max-w-screen-2xl px-4 py-6 print:max-w-none print:p-0">
          {/* filtres dans l'adresse de la page (onglet Données) */}
          <NuqsAdapter>{children}</NuqsAdapter>
        </main>
        <DeepRunner />
        <footer className="mx-auto max-w-screen-2xl px-4 pb-8 pt-4 text-xs text-ink-3 print:hidden">
          Données : Leaguepedia (CC BY-SA 3.0)
          {meta.has_oe ? ", Oracle's Elixir" : ""}. Photos et logos affichés depuis Leaguepedia.
        </footer>
      </body>
    </html>
  );
}
