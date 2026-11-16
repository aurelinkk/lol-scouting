import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import DeepRunner from "@/components/DeepRunner";
import { getMeta } from "@/lib/data";

export const metadata: Metadata = {
  title: "LoL Scouting",
  description: "Suivi des prospects européens : ERL, EMEA Masters et montées en LEC",
};

const NAV = [
  { href: "/", label: "Indicateurs" },
  { href: "/donnees", label: "Données" },
  { href: "/montees", label: "Montées" },
  { href: "/ligues", label: "Ligues" },
  { href: "/rosters", label: "Rosters" },
  { href: "/ladder", label: "Ladder" },
  { href: "/analyses", label: "Analyses" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const meta = getMeta();
  return (
    <html lang="fr">
      <body className="min-h-screen">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:gap-6">
            <Link href="/" className="whitespace-nowrap text-base font-bold tracking-tight">
              LoL Scouting
            </Link>
            <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="shrink-0 rounded-md px-2 py-1.5 text-ink-2 hover:bg-surface-2 hover:text-ink sm:px-3"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <span className="ml-auto hidden text-xs text-ink-3 sm:block">
              Saisons {meta.seasons.join(" – ")} · MAJ {meta.generated}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        <DeepRunner />
        <footer className="mx-auto max-w-7xl px-4 pb-8 pt-4 text-xs text-ink-3">
          Données : Leaguepedia (CC BY-SA 3.0)
          {meta.has_oe ? ", Oracle's Elixir" : ""}. Photos et logos affichés depuis Leaguepedia.
        </footer>
      </body>
    </html>
  );
}
