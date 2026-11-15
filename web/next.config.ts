import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Les photos et logos sont affichés directement depuis le CDN de Leaguepedia
  // (balises <img>), sans passer par l'optimisation d'images de Next.
  images: { unoptimized: true },
  // players.json est lu au build : on l'inclut dans les fonctions serveur
  outputFileTracingIncludes: { "/**": ["./data/**"] },
};

export default nextConfig;
