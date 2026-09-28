import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const TRANSLATE_FORMULA_VERSION = "2026-09-28-v1";
export const TRANSLATE_WEIGHTS = Object.freeze({
  stick: 0.50,
  team: 0.22,
  archetype: 0.12,
  youth: 0.16
});

const TIER_COUNTS = Object.freeze([
  ["Elite translation", 22],
  ["Strong", 39],
  ["Solid", 152],
  ["Fringe rotation", 388]
]);

export function translateScore(projection) {
  const score =
    TRANSLATE_WEIGHTS.stick * Number(projection.comp_pct ?? projection.compPct)
    + TRANSLATE_WEIGHTS.team * Number(projection.team_pct ?? projection.teamPct)
    + TRANSLATE_WEIGHTS.archetype * Number(projection.arch_base ?? projection.archBase)
    + TRANSLATE_WEIGHTS.youth * Number(projection.youth);
  return Number.isFinite(score) ? Math.round(score * 10) / 10 : null;
}

function assignRankCalibratedTiers(rows, scoreKey) {
  const ranked = rows
    .filter(row => Number.isFinite(scoreKey(row)))
    .sort((left, right) => scoreKey(right) - scoreKey(left) || String(left.fullName || left.name).localeCompare(String(right.fullName || right.name)));
  let boundary = 0;
  for (const [tier, count] of TIER_COUNTS) {
    ranked.slice(boundary, boundary + count).forEach(row => { row.proj_tier = tier; });
    boundary += count;
  }
  ranked.slice(boundary).forEach(row => { row.proj_tier = "Long shot"; });
}

function rebuildEmbeddedModel(html) {
  const pattern = /(<script id="DATA" type="application\/json">)([\s\S]*?)(<\/script>)/;
  const match = html.match(pattern);
  if (!match) throw new Error("Could not find the College-to-NBA DATA payload");
  const data = JSON.parse(match[2]);
  for (const projection of data.projections || []) projection.proj_score = translateScore(projection);
  assignRankCalibratedTiers(data.projections || [], projection => projection.proj_score);
  data.meta = {
    ...data.meta,
    translate_formula_version: TRANSLATE_FORMULA_VERSION,
    translate_weights: TRANSLATE_WEIGHTS,
    stick_score_note: "comp_pct is the stored archetype-specific stick score percentile. The source repository retains its result and top driver weights, but not the complete upstream scoring program."
  };
  return html.replace(pattern, `$1${JSON.stringify(data)}$3`);
}

function rebuildHub(hub) {
  const modeled = (hub.players || []).filter(player =>
    player.model === "d1"
    && player.season === "2025-26"
    && Number.isFinite(player.projection?.compPct)
    && Number.isFinite(player.projection?.teamPct)
    && Number.isFinite(player.projection?.archBase)
    && Number.isFinite(player.projection?.youth)
  );
  for (const player of modeled) {
    const score = translateScore(player.projection);
    player.projection.score = score;
    player.projection.floor = score;
  }
  assignRankCalibratedTiers(modeled, player => player.projection.score);
  for (const player of modeled) player.projection.tier = player.proj_tier;
  for (const player of modeled) delete player.proj_tier;
  hub.meta = {
    ...hub.meta,
    nbaTranslateFormulaVersion: TRANSLATE_FORMULA_VERSION,
    nbaTranslateWeights: TRANSLATE_WEIGHTS
  };
  return hub;
}

function main() {
  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const modelPath = path.join(projectRoot, "public/college-nba-translation.html");
  const hubPath = path.join(projectRoot, "public/cbb-hub/data/hub-data.json");
  const modelHtml = rebuildEmbeddedModel(fs.readFileSync(modelPath, "utf8"));
  fs.writeFileSync(modelPath, modelHtml);
  const hub = rebuildHub(JSON.parse(fs.readFileSync(hubPath, "utf8")));
  fs.writeFileSync(hubPath, JSON.stringify(hub));
  process.stdout.write(`${JSON.stringify({
    formulaVersion: TRANSLATE_FORMULA_VERSION,
    weights: TRANSLATE_WEIGHTS,
    projections: hub.players.filter(player => player.model === "d1" && player.season === "2025-26" && player.projection?.score != null).length
  }, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
