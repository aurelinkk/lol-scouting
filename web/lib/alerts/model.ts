import "server-only";
import { getPromotionModel } from "@/lib/data";
import type { Store } from "@/lib/deep/store";
import { REGION_INFO, type Region } from "@/lib/region";
import { type Watchlist, watchKey } from "@/lib/watch";

/**
 * Alertes Discord du modèle de montée, pour les joueurs suivis (⭐) : à chaque
 * nouvelle version du modèle (après un run_all), message si la chance de monter
 * bouge d'au moins 5 points, ou si le joueur entre dans le top 3 de son poste.
 * Même webhook que les alertes mercato (DISCORD_WEBHOOK_URL sur Vercel).
 */
const MIN_MOVE = 0.05;
const MIN_MOVE_T2 = 0.08;

type Snap = { generated: string; players: Record<string, [number | null, number | null, number | null]> };

export async function sendModelAlerts(store: Store, region: Region) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  const model = getPromotionModel();
  if (!webhook || !model) return;
  const watch = (await store.get<Watchlist>(watchKey(region))) ?? {};
  const ids = Object.keys(watch);
  if (!ids.length) return;
  const top = model.players[region] ?? {};
  const t2 = model.tier2?.players[region] ?? {};
  const cur: Snap = { generated: model.generated, players: {} };
  for (const id of ids) {
    const a = top[id];
    const b = t2[id];
    if (a || b) cur.players[id] = [a?.p ?? null, a?.rank_role ?? null, b?.p ?? null];
  }
  const snapKey = `model:snap:${region}`;
  const prev = await store.get<Snap>(snapKey);
  // Première fois ou même version du modèle : on note sans rien envoyer
  if (prev && prev.generated !== cur.generated) {
    const pct = (x: number) => `${Math.round(x * 100)} %`;
    const lines: string[] = [];
    for (const [id, [p, rank, p2]] of Object.entries(cur.players)) {
      const old = prev.players[id];
      if (!old) continue;
      const name = watch[id]?.name ?? id;
      if (p !== null && old[0] !== null && Math.abs(p - old[0]) >= MIN_MOVE)
        lines.push(`${p > old[0] ? "📈" : "📉"} **${name}** : ${pct(old[0])} → **${pct(p)}** de chances de jouer en 1re division en ${model.target}`);
      if (rank !== null && rank <= 3 && (old[1] === null || old[1] > 3))
        lines.push(`🔝 **${name}** entre dans le top 3 des chances de son poste en ${REGION_INFO[region].short} (${rank}e, ${pct(p ?? 0)})`);
      if (p2 !== null && old[2] !== null && Math.abs(p2 - old[2]) >= MIN_MOVE_T2)
        lines.push(`${p2 > old[2] ? "📈" : "📉"} **${name}** : ${pct(old[2])} → **${pct(p2)}** de chances de monter en 2e division`);
    }
    for (let i = 0; i < lines.length; i += 10) {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: `**Modèle de montée mis à jour** (${model.generated})\n${lines.slice(i, i + 10).join("\n")}`.slice(0, 1900) }),
      }).catch(() => {});
    }
  }
  if (!prev || prev.generated !== cur.generated || Object.keys(cur.players).some((id) => !prev.players[id]))
    await store.set(snapKey, cur);
}
