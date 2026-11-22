/** Page Besoins : âge maximum des joueurs proposés (âge inconnu : gardé).
 *  Fichier partagé serveur / navigateur (une constante exportée d'un composant
 *  « use client » n'est qu'une référence côté serveur). */
export const MAX_AGE = 26.2;

/** Imports autorisés dans le cinq de départ (règle de Riot : au moins 3 résidents ;
 *  la LCK n'en prend aucun en pratique) */
export const IMPORT_LIMIT = { eu: 2, na: 2, kr: 0, cn: 2, lcp: 2, br: 2 } as const;
