// Vérifie que chaque région a bien ses fichiers de données (sinon le site affiche
// « Pas encore de données pour cette région »). Lancé par la GitHub Action avant le build.
//   node scripts/check-data.mjs
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REGIONS = ["eu", "na", "kr", "cn", "lcp", "br"];
const errors = [];
const warnings = [];

const dataDir = (r) => path.join(root, "data", ...(r === "eu" ? [] : [r]));
const pubDir = (r) => path.join(root, "public", "data", ...(r === "eu" ? [] : [r]));

function readJson(file) {
  if (!fs.existsSync(file)) {
    errors.push(`fichier manquant : ${path.relative(root, file)}`);
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e) {
    errors.push(`JSON invalide : ${path.relative(root, file)} (${e.message})`);
    return null;
  }
}

for (const r of REGIONS) {
  const meta = readJson(path.join(dataDir(r), "meta.json"));
  if (!meta) continue;
  for (const f of ["players.json", "leagues.json", "promotions.json", "mercato.json"]) readJson(path.join(dataDir(r), f));
  readJson(path.join(pubDir(r), "rosters.json"));
  for (const s of meta.seasons ?? []) {
    const rows = readJson(path.join(pubDir(r), `rankings_${s}.json`));
    if (rows && !rows.length) errors.push(`${r} : classement ${s} vide`);
  }
  const age = (Date.now() - new Date(String(meta.generated).replace(" ", "T"))) / 86400000;
  if (age > 21) warnings.push(`${r} : données exportées il y a ${Math.round(age)} jours (python run_all.py)`);
  console.log(`${r.padEnd(4)} ok · saisons ${meta.seasons.join(", ")} · export ${meta.generated}`);
}

const world = readJson(path.join(root, "data", "world.json"));
if (world) {
  const last = Math.max(...Object.keys(world.seasons).map(Number));
  const missing = REGIONS.filter((r) => !world.seasons[last]?.[r]);
  if (missing.length) warnings.push(`score mondial ${last} : pas de décalage pour ${missing.join(", ")} (python world_scale.py)`);
}

for (const w of warnings) console.log(`::warning::${w}`);
if (errors.length) {
  for (const e of errors) console.log(`::error::${e}`);
  process.exit(1);
}
console.log("Données complètes pour les 6 régions.");
