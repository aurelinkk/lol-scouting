// Couleurs et noms des niveaux de compétition (palette validée daltonisme,
// voir les variables --tier-* dans app/globals.css)
export const TIER_COLOR: Record<string, string> = {
  LEC: "var(--tier-lec)",
  ERL1: "var(--tier-erl1)",
  ERL2: "var(--tier-erl2)",
  EM: "var(--tier-em)",
  OTHER: "var(--text-3)",
};

export const TIER_NAME: Record<string, string> = {
  LEC: "LEC",
  ERL1: "ERL1",
  ERL2: "ERL2",
  EM: "EMEA Masters",
  OTHER: "Autre région",
};
