"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { CompassIcon, GlobeIcon, SearchIcon, ShieldIcon, UserIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { REGION_INFO } from "@/lib/region";
import type { SearchEntry } from "@/lib/search";

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

type Item = SearchEntry & { n: string; nx: string; nd: string };

/** Score de pertinence : nom exact > début du nom > début d'un mot > contenu ; 0 = pas trouvé */
function score(item: Item, q: string, words: string[]): number {
  let s = 0;
  if (item.n === q) s = 100;
  else if (item.n.startsWith(q)) s = 80;
  else if (item.n.split(" ").some((w) => w.startsWith(q))) s = 60;
  else if (item.n.includes(q)) s = 40;
  else if (item.nx.includes(q)) s = 35; // vrai nom, ancien nom d'équipe
  else if (item.nd.includes(q)) s = 12; // détail : équipe d'un joueur, ligue
  else if (words.length > 1 && words.every((w) => item.n.includes(w) || item.nx.includes(w) || item.nd.includes(w))) s = 10;
  if (!s) return 0;
  return s + (item.w ?? 0) * 3 + (item.k === "p" || item.k === "r" ? 2 : 0) - Math.min(item.n.length, 30) / 30;
}

const GROUPS: { k: SearchEntry["k"]; label: string; icon: typeof UserIcon; max: number }[] = [
  { k: "p", label: "Pages", icon: CompassIcon, max: 6 },
  { k: "r", label: "Régions", icon: GlobeIcon, max: 6 },
  { k: "j", label: "Joueurs", icon: UserIcon, max: 8 },
  { k: "e", label: "Équipes", icon: ShieldIcon, max: 6 },
];

function groupOrder(scored: { i: Item; s: number }[]) {
  const best = (k: string) => Math.max(0, ...scored.filter((x) => x.i.k === k).map((x) => x.s));
  return [...GROUPS].sort((a, b) => best(b.k) - best(a.k));
}

let indexPromise: Promise<Item[]> | null = null;
function loadIndex(): Promise<Item[]> {
  indexPromise ??= fetch("/api/search")
    .then((r) => r.json())
    .then((list: SearchEntry[]) => list.map((e) => ({ ...e, n: norm(e.t), nx: norm(e.x ?? ""), nd: norm(e.d ?? "") })))
    .catch(() => {
      indexPromise = null;
      return [];
    });
  return indexPromise;
}

export default function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [active, setActive] = useState(0);
  const router = useRouter();
  const listRef = useRef<HTMLDivElement>(null);

  // Ctrl+K / Cmd+K ou « / » pour ouvrir
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName));
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open && !items) loadIndex().then(setItems);
    if (!open) setQ("");
  }, [open, items]);

  const results = useMemo(() => {
    const query = norm(q);
    if (!items) return [];
    if (!query) return items.filter((i) => i.k === "p" || i.k === "r").slice(0, 12);
    const words = query.split(" ");
    const scored = items
      .map((i) => ({ i, s: score(i, query, words) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s);
    // Groupes dans l'ordre de leur meilleur résultat (« karmine » : équipes d'abord)
    const out: Item[] = [];
    for (const g of groupOrder(scored)) out.push(...scored.filter((x) => x.i.k === g.k).slice(0, g.max).map((x) => x.i));
    return out;
  }, [items, q]);

  useEffect(() => setActive(0), [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = useCallback(
    (item?: Item) => {
      if (!item) return;
      setOpen(false);
      router.push(item.u);
    },
    [router],
  );

  let index = -1;
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full border border-border bg-surface-2/60 px-2.5 text-xs text-ink-3 transition-colors hover:border-ink-3 hover:text-ink"
        aria-label="Rechercher"
      >
        <SearchIcon className="size-3.5" />
        <span className="hidden lg:inline">Rechercher</span>
        <kbd className="hidden rounded border border-border px-1 font-sans text-[10px] lg:inline">Ctrl K</kbd>
      </button>

      <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px]" />
          <DialogPrimitive.Content
            className="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-2xl border border-border bg-surface shadow-2xl outline-none"
            aria-describedby={undefined}
          >
            <DialogPrimitive.Title className="sr-only">Recherche</DialogPrimitive.Title>
            <div className="flex items-center gap-2 border-b border-border px-4">
              <SearchIcon className="size-4 shrink-0 text-ink-3" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setActive((a) => Math.min(a + 1, results.length - 1));
                  } else if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setActive((a) => Math.max(a - 1, 0));
                  } else if (e.key === "Enter") {
                    e.preventDefault();
                    go(results[active]);
                  }
                }}
                placeholder="Joueur, équipe, page, région…"
                className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-ink-3"
              />
              <kbd className="shrink-0 rounded border border-border px-1.5 text-[10px] text-ink-3">Échap</kbd>
            </div>
            <div ref={listRef} className="max-h-[60vh] overflow-y-auto p-2">
              {!items && <p className="px-3 py-6 text-center text-sm text-ink-3">Chargement de l&apos;index…</p>}
              {items && !results.length && <p className="px-3 py-6 text-center text-sm text-ink-3">Rien trouvé pour « {q} ».</p>}
              {[...GROUPS].sort((a, b) => results.findIndex((r) => r.k === a.k) - results.findIndex((r) => r.k === b.k)).map((g) => {
                const list = results.filter((r) => r.k === g.k);
                if (!list.length) return null;
                return (
                  <div key={g.k} className="mb-1">
                    <div className="px-2 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-3">{g.label}</div>
                    {list.map((item) => {
                      index += 1;
                      const i = index;
                      const Icon = g.icon;
                      return (
                        <button
                          key={`${item.k}-${item.u}`}
                          data-index={i}
                          onMouseMove={() => setActive(i)}
                          onClick={() => go(item)}
                          className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left ${i === active ? "bg-accent-soft" : ""}`}
                        >
                          {item.i ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.i}
                              alt=""
                              className="size-7 shrink-0 rounded-md bg-surface-2 object-cover"
                              loading="lazy"
                              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
                            />
                          ) : (
                            <span className="grid size-7 shrink-0 place-items-center rounded-md bg-surface-2 text-ink-3">
                              <Icon className="size-3.5" />
                            </span>
                          )}
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm text-ink">
                              {item.t}
                              {item.x && item.k === "j" && <span className="text-ink-3"> ({item.x})</span>}
                            </span>
                            {item.d && <span className="block truncate text-[11px] text-ink-3">{item.d}</span>}
                          </span>
                          {item.r && (
                            <span className="shrink-0 rounded border border-border px-1.5 text-[10px] font-semibold text-ink-2">
                              {REGION_INFO[item.r].short}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <div className="flex gap-4 border-t border-border px-4 py-2 text-[10px] text-ink-3">
              <span>↑ ↓ pour naviguer</span>
              <span>Entrée pour ouvrir</span>
              <span className="ml-auto">Ctrl K ou / pour rechercher</span>
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </>
  );
}
