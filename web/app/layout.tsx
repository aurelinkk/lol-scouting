import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import DeepRunner from "@/components/DeepRunner";
import Nav from "@/components/Nav";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "LoL Scouting",
  description: "Suivi des prospects européens (ERL, EMEA Masters, LEC) et nord-américains (NACL, LCS)",
};


export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  return (
    <html lang="fr">
      <body className="min-h-screen overflow-x-clip">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-screen-2xl items-center gap-3 px-4 py-3 sm:gap-6">
            <Link href="/" className="whitespace-nowrap text-base font-bold tracking-tight">
              LoL Scouting
            </Link>
            <Nav />
            <span className="ml-auto hidden text-xs text-ink-3 sm:block">
              Saisons {meta.seasons.join(" – ")} · MAJ {meta.generated}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-screen-2xl px-4 py-6">
          {/* filtres dans l'adresse de la page (onglet Données) */}
          <NuqsAdapter>{children}</NuqsAdapter>
        </main>
        <DeepRunner />
        <footer className="mx-auto max-w-screen-2xl px-4 pb-8 pt-4 text-xs text-ink-3">
          Données : Leaguepedia (CC BY-SA 3.0)
          {meta.has_oe ? ", Oracle's Elixir" : ""}. Photos et logos affichés depuis Leaguepedia.
        </footer>
      </body>
    </html>
  );
}
