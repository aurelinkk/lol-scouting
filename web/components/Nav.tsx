"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { link, REGION_INFO, type Region, REGIONS, regionFromPath, stripRegion } from "@/lib/region";

// Onglets : les pages Ligues, Ladder et Analyses n'existent que pour l'Europe
// global : même page pour les deux régions (pas de version /na)
const NAV: { path: string; label: string; eu_only?: boolean; global?: boolean }[] = [
  { path: "/", label: "Indicateurs" },
  { path: "/donnees", label: "Données" },
  { path: "/montees", label: "Montées" },
  { path: "/ligues", label: "Ligues", eu_only: true },
  { path: "/rosters", label: "Rosters" },
  { path: "/besoins", label: "Besoins" },
  { path: "/comparer", label: "Comparer", global: true },
  { path: "/ladder", label: "Ladder", eu_only: true },
  { path: "/analyses", label: "Analyses", eu_only: true },
];
const SHARED = ["/", "/donnees", "/montees", "/rosters", "/besoins"];

/** Même page dans l'autre région (fiche joueur -> Données : les fiches sont propres à chaque région). */
function switchTo(pathname: string, target: Region): string {
  const path = stripRegion(pathname);
  if (SHARED.includes(path)) return link(target, path);
  if (path.startsWith("/joueurs/")) return link(target, "/donnees");
  if (path === "/comparer") return "/comparer";
  return link(target, "/");
}

export default function Nav() {
  const pathname = usePathname() ?? "/";
  const region = regionFromPath(pathname);
  const current = stripRegion(pathname);
  return (
    <>
      <div className="flex shrink-0 rounded-full border border-border bg-surface-2/60 p-0.5 text-[11px]" role="group" aria-label="Région">
        {REGIONS.map((r) => (
          <Link
            key={r}
            href={switchTo(pathname, r)}
            title={REGION_INFO[r].name}
            aria-current={r === region ? "true" : undefined}
            className={`rounded-full px-2.5 py-1 font-semibold transition-colors ${
              r === region ? "bg-accent text-white shadow-[0_0_12px_-3px_var(--accent)]" : "text-ink-3 hover:text-ink"
            }`}
          >
            {REGION_INFO[r].short}
          </Link>
        ))}
      </div>
      <nav className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
        {NAV.filter((n) => region === "eu" || !n.eu_only).map((n) => {
          const href = n.eu_only || n.global ? n.path : link(region, n.path);
          const active = n.path === "/" ? current === "/" : current.startsWith(n.path);
          return (
            <Link
              key={n.path}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative shrink-0 rounded-full px-2.5 py-1.5 text-[13px] transition-colors hover:bg-surface-2 hover:text-ink sm:px-3 ${
                active ? "font-medium text-ink" : "text-ink-2"
              }`}
            >
              {n.label}
              {active && (
                <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
