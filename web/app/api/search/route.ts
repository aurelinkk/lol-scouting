import { buildSearchIndex } from "@/lib/search";

// Généré une fois au build (fichier statique), chargé à la première recherche
export const dynamic = "force-static";

export function GET() {
  return Response.json(buildSearchIndex(), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
