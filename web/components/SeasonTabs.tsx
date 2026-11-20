"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

/** Onglets de saisons : le contenu de chaque onglet est rendu côté serveur. */
export default function SeasonTabs({
  items,
}: {
  items: { key: string; label: string; content: React.ReactNode }[];
}) {
  return (
    <Tabs defaultValue={items[0]?.key} className="space-y-6">
      <TabsList>
        {items.map((it) => (
          <TabsTrigger key={it.key} value={it.key}>
            {it.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {items.map((it) => (
        // gardé dans la page (forceMount) : contenu déjà rendu côté serveur
        <TabsContent key={it.key} value={it.key} forceMount className="data-[state=inactive]:hidden">
          {it.content}
        </TabsContent>
      ))}
    </Tabs>
  );
}
