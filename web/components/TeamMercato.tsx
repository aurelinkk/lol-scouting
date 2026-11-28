"use client";
import { useLiveMercato } from "@/lib/mercato/useLive";
import { type MercatoTeam, TeamCard } from "./MercatoBoard";
import type { Region } from "@/lib/region";

/** Carte mercato d'une équipe, avec la version rafraîchie en ligne si elle existe */
export default function TeamMercato({
  region,
  season,
  generated,
  team,
}: {
  region: Region;
  season: number;
  generated?: string;
  team: MercatoTeam;
}) {
  const { live: m } = useLiveMercato(region, generated, { autoRefresh: false });
  const live = m?.mercato.teams.find(
    (x) => x.team === team.team || (team.former_team && x.former_team === team.former_team),
  );
  return <TeamCard t={live ?? team} season={season} linkTeam={false} />;
}
