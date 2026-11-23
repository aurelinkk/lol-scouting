"use client";
import { useEffect, useState } from "react";

/** Icônes de champions : CDN officiel de Riot (Data Dragon). Version récupérée
 *  une fois par le navigateur ; si une image ne charge pas, on affiche les initiales. */
const EXCEPTIONS: Record<string, string> = {
  Wukong: "MonkeyKing",
  "Nunu & Willump": "Nunu",
  "Renata Glasc": "Renata",
  LeBlanc: "Leblanc",
  "Kog'Maw": "KogMaw",
  "Rek'Sai": "RekSai",
  "K'Sante": "KSante",
  "Dr. Mundo": "DrMundo",
};

export function champKey(name: string): string {
  if (EXCEPTIONS[name]) return EXCEPTIONS[name];
  // Kai'Sa -> Kaisa, Kha'Zix -> Khazix, Bel'Veth -> Belveth
  if (name.includes("'")) {
    const joined = name.replace(/[^A-Za-z]/g, "");
    return joined[0].toUpperCase() + joined.slice(1).toLowerCase();
  }
  return name.replace(/[^A-Za-z0-9]/g, "");
}

let versionPromise: Promise<string | null> | null = null;
function loadVersion() {
  versionPromise ??= fetch("https://ddragon.leagueoflegends.com/api/versions.json")
    .then((r) => (r.ok ? r.json() : null))
    .then((v: string[] | null) => v?.[0] ?? null)
    .catch(() => null);
  return versionPromise;
}

export function useDdragonVersion(): string | null {
  const [v, setV] = useState<string | null>(null);
  useEffect(() => {
    loadVersion().then(setV);
  }, []);
  return v;
}

export const champIcon = (version: string, name: string) =>
  `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${champKey(name)}.png`;
