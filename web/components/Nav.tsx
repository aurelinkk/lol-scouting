"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { link, REGION_INFO, type Region, REGIONS, regionFromPath } from "@/lib/region";

// Onglets : les pages Ligues, Ladder et Analyses n'existent que pour l'Europe
const NAV: { path: string; label: string; eu_only?: boolean }[] = [
  { path: "/", label: "Indicateurs" },
  { path: "/donnees", label: "Données" },
  { path: "/montees", label: "Montées" },
  { path: "/ligues", label: "Ligues", eu_only: true },
  { path: "/rosters", label: "Rosters" },
  { path: "/ladder", label: "Ladder", eu_only: true },
  { path: "/analyses", label: "Analyses", eu_only: true },
];
const SHARED = ["/", "/donnees", "/montees", "/rosters"];

/** Même page dans l'autre région (fiche joueur -> Données : les fiches sont propres à chaque région). */
function switchTo(pathname: string, target: Region): string {
  const path = pathname.replace(/^\/na(?=\/|$)/, "") || "/";
  if (SHARED.includes(path)) return link(target, path);
  if (path.startsWith("/joueurs/")) return link(target, "/donnees");
  return link(target, "/");
}

export default function Nav() {
  const pathname = usePathname() ?? "/";
  const region = regionFromPath(pathname);
  const current = pathname.replace(/^\/na(?=\/|$)/, "") || "/";
  return (
    <>
      <div className="flex shrink-0 rounded-md border border-border p-0.5 text-xs" role="group" aria-label="Région">
        {REGIONS.map((r) => (
          <Link
            key={r}
            href={switchTo(pathname, r)}
            title={REGION_INFO[r].name}
            className={`rounded px-2 py-1 ${r === region ? "bg-accent-soft font-semibold text-ink" : "text-ink-3 hover:text-ink"}`}
          >
            {REGION_INFO[r].short}
          </Link>
        ))}
      </div>
      <nav className="-mx-1 flex min-w-0 gap-1 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
        {NAV.filter((n) => region === "eu" || !n.eu_only).map((n) => {
          const active = n.path === "/" ? current === "/" : current.startsWith(n.path);
          return (
            <Link
              key={n.path}
              href={n.eu_only ? n.path : link(region, n.path)}
              className={`shrink-0 rounded-md px-2 py-1.5 hover:bg-surface-2 hover:text-ink sm:px-3 ${active ? "text-ink" : "text-ink-2"}`}
            >
              {n.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
