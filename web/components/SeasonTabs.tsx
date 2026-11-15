"use client";

import { useState } from "react";

/** Onglets de saisons : le contenu de chaque onglet est rendu côté serveur. */
export default function SeasonTabs({
  items,
}: {
  items: { key: string; label: string; content: React.ReactNode }[];
}) {
  const [active, setActive] = useState(items[0]?.key);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-1.5" role="tablist">
        {items.map((it) => (
          <button
            key={it.key}
            role="tab"
            aria-selected={active === it.key}
            onClick={() => setActive(it.key)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              active === it.key
                ? "border-accent bg-accent-soft font-medium text-ink"
                : "border-border text-ink-2 hover:bg-surface-2"
            }`}
          >
            {it.label}
          </button>
        ))}
      </div>
      {items.map((it) => (
        <div key={it.key} hidden={active !== it.key} role="tabpanel">
          {it.content}
        </div>
      ))}
    </div>
  );
}
