import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les photos et logos sont affichés directement depuis le CDN de Leaguepedia
  // (balises <img>), sans passer par l'optimisation d'images de Next.
  images: { unoptimized: true },
  // Données lues par les pages générées à la demande (fiche PDF, équipes,
  // joueurs pas pré-générés) : on les inclut dans les fonctions serveur. Les
  // classements (public/data/**/rankings_<saison>.json) ont un nom calculé,
  // que Next ne repère pas tout seul.
  outputFileTracingIncludes: { "/**": ["./data/**", "./public/data/**"] },
};

export default nextConfig;
