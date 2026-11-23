"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PopoverClose } from "@radix-ui/react-popover";
import { ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { link, REGION_INFO, type Region, REGIONS, regionFromPath, stripRegion } from "@/lib/region";

// Menus : les pages Ligues, Ladder et Analyses n'existent que pour l'Europe ;
// global : même page pour toutes les régions (pas de version /na)
type Item = { path: string; label: string; hint: string; eu_only?: boolean; global?: boolean };
const GROUPS: { label: string; items: Item[] }[] = [
  {
    label: "Accueil",
    items: [
      { path: "/", label: "Indicateurs", hint: "Meilleurs prospects, niveau des régions et des ligues" },
      { path: "/ligues", label: "Ligues", hint: "Niveau de chaque ligue saison par saison", eu_only: true },
    ],
  },
  {
    label: "Joueurs",
    items: [
      { path: "/donnees", label: "Données", hint: "Classement complet, filtres, stats" },
      { path: "/comparer", label: "Comparer", hint: "Deux joueurs côte à côte, score mondial", global: true },
    ],
  },
  {
    label: "Mercato",
    items: [
      { path: "/rosters", label: "Rosters", hint: "Mercato en direct et effectifs" },
      { path: "/besoins", label: "Besoins", hint: "Postes à pourvoir et joueurs disponibles" },
      { path: "/montees", label: "Montées", hint: "Modèle de montée et montées passées" },
    ],
  },
  {
    label: "SoloQ",
    items: [
      { path: "/ladder", label: "Ladder", hint: "Ladder EUW et pros en soloQ", eu_only: true },
      { path: "/analyses", label: "Analyses", hint: "Analyse soloQ approfondie", eu_only: true },
    ],
  },
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
      <nav className="-mx-1 flex min-w-0 items-center gap-0.5 overflow-x-auto px-1 text-sm [scrollbar-width:none]">
        {GROUPS.map((g) => {
          const items = g.items.filter((n) => region === "eu" || !n.eu_only);
          if (!items.length) return null;
          const hrefOf = (n: Item) => (n.eu_only || n.global ? n.path : link(region, n.path));
          const isActive = (n: Item) => (n.path === "/" ? current === "/" : current.startsWith(n.path));
          const active = items.some(isActive);
          const cls = `relative flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] transition-colors hover:bg-surface-2 hover:text-ink sm:px-3 ${
            active ? "font-medium text-ink" : "text-ink-2"
          }`;
          const underline = active && (
            <span aria-hidden className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
          );
          // Un seul onglet dans la région (ex : Accueil hors Europe) : lien direct
          if (items.length === 1)
            return (
              <Link key={g.label} href={hrefOf(items[0])} aria-current={active ? "page" : undefined} className={cls}>
                {items[0].label}
                {underline}
              </Link>
            );
          const current_ = items.find(isActive);
          return (
            <Popover key={g.label}>
              <PopoverTrigger className={cls} aria-label={`Menu ${g.label}`}>
                {g.label}
                {current_ && <span className="text-ink-3">· {current_.label}</span>}
                <ChevronDownIcon className="size-3.5 text-ink-3" />
                {underline}
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-1.5">
                {items.map((n) => (
                  <PopoverClose asChild key={n.path}>
                    <Link
                      href={hrefOf(n)}
                      aria-current={isActive(n) ? "page" : undefined}
                      className={`block rounded-lg px-2.5 py-2 transition-colors hover:bg-surface-2 ${isActive(n) ? "bg-accent-soft" : ""}`}
                    >
                      <div className="text-sm font-medium text-ink">{n.label}</div>
                      <div className="text-[11px] text-ink-3">{n.hint}</div>
                    </Link>
                  </PopoverClose>
                ))}
              </PopoverContent>
            </Popover>
          );
        })}
      </nav>
    </>
  );
}
