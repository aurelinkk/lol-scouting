import "server-only";
import type { Store } from "@/lib/deep/store";
import type { LiveMercato } from "@/lib/mercato/live";
import { mentions, type Watchlist, watchKey } from "@/lib/watch";

/**
 * Alerte Discord (facultative) : quand le mercato se met à jour, chaque news
 * qui concerne un joueur suivi (⭐) est envoyée une seule fois sur le salon du
 * webhook DISCORD_WEBHOOK_URL (variable d'environnement Vercel).
 */
const MAX_KEYS = 2000;

export async function sendWatchAlerts(store: Store, live: LiveMercato) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (!webhook) return;
  const news = [...live.changes, ...(live.mercato.news ?? [])];
  const key = (n: { date: string; text: string }) => `${n.date}|${n.text}`;
  const doneKey = `mercato:alerted:${live.region}`;
  const done = await store.get<string[]>(doneKey);
  const seen = new Set(done ?? []);
  const fresh = news.filter((n) => !seen.has(key(n)));
  // Première fois : on note l'existant sans rien envoyer (pas d'avalanche)
  if (done) {
    const watched = Object.values((await store.get<Watchlist>(watchKey(live.region))) ?? {}).map((w) => w.name);
    const lines = fresh
      .filter((n) => watched.some((w) => mentions(n.text, w)))
      .map((n) => `⭐ **${n.text}** · ${n.official ? "officiel" : "rumeur"}${n.url ? ` · <${n.url}>` : ""}`);
    for (let i = 0; i < lines.length; i += 10) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: lines.slice(i, i + 10).join("\n").slice(0, 1900) }),
      }).catch(() => {});
    }
  }
  if (fresh.length || !done)
    await store.set(doneKey, [...seen, ...fresh.map(key)].slice(-MAX_KEYS));
}
