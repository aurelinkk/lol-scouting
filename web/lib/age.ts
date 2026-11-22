/**
 * Âge affiché : âge actuel (calculé à l'affichage depuis la date de naissance)
 * pour la saison en cours ; pour une saison passée, l'âge à la fin de cette
 * saison (champ « age » de l'export).
 */
export function ageFrom(birthdate?: string | null, at: Date = new Date()): number | undefined {
  if (!birthdate) return undefined;
  const b = new Date(`${birthdate.slice(0, 10)}T00:00:00Z`);
  if (isNaN(+b)) return undefined;
  return Math.floor(((at.getTime() - b.getTime()) / (365.25 * 86400000)) * 10) / 10;
}

type WithAge = { season: number; age?: number; birthdate?: string; age_approx?: boolean };

/** Remplace l'âge des lignes de la dernière saison par l'âge actuel */
export function withCurrentAge<T extends WithAge>(rows: T[], birthdates?: Record<string, string | undefined>, idOf?: (r: T) => string): T[] {
  if (!rows.length) return rows;
  const last = Math.max(...rows.map((r) => r.season));
  const now = new Date();
  for (const r of rows) {
    if (r.season !== last || r.age_approx) continue; // année de naissance seule : âge de l'export
    const bd = r.birthdate ?? (birthdates && idOf ? birthdates[idOf(r)] : undefined);
    const a = ageFrom(bd, now);
    if (a !== undefined) r.age = a;
  }
  return rows;
}
