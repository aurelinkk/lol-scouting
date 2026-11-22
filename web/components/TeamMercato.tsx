"use client";
import { useEffect, useState } from "react";
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
  const [live, setLive] = useState<MercatoTeam | null>(null);
  useEffect(() => {
    fetch(`/api/mercato?region=${region}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const m = d?.live?.mercato;
        if (!m || m.generated !== generated) return;
        const t = (m.teams as MercatoTeam[]).find(
          (x) => x.team === team.team || (team.former_team && x.former_team === team.former_team),
        );
        if (t) setLive(t);
      })
      .catch(() => {});
  }, [region, generated, team.team, team.former_team]);
  return <TeamCard t={live ?? team} season={season} linkTeam={false} />;
}
