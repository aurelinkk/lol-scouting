"use client";

import { usePathname } from "next/navigation";
import { type Region, regionFromPath } from "./region";

/** Région de la page affichée (d'après l'URL : /na/... = Amérique du Nord). */
export function useRegion(): Region {
  return regionFromPath(usePathname() ?? "/");
}
