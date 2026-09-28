import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FORMULA_VERSION = "2026-09-27-v2";
const ZONES = ["atr2", "paint2", "mid2", "atb3", "c3"];
const THREE_POINT_ZONES = new Set(["atb3", "c3"]);
const FEATURE_INDEX = { orbPctPercentile: 6, drbPctPercentile: 7, astPctPercentile: 10 };

export function rebuildVerspi(data) {
  const players = data.players || [];
  const teamDefense = buildTeamDefenseIndex(data.teamStats, data.verspiTeamDefense);
  const efficiencyContexts = buildEfficiencyContexts(players);
  const source = players.map(player => sourceMetrics(player, efficiencyContexts, teamDefense));

  const groupIndexes = groupPlayerIndexes(players);
  const zMetrics = source.map(() => ({}));
  for (const indexes of groupIndexes.values()) {
    for (const key of ["rapm", "warp40", "drapm", "adjDe"]) {
      const values = indexes.map(index => source[index][key]);
      const stats = meanAndSd(values);
      indexes.forEach((index, offset) => {
        const value = values[offset];
        zMetrics[index][key] = Number.isFinite(value) && stats ? (value - stats.mean) / stats.sd : null;
      });
    }
  }

  const raw = source.map((metrics, index) => {
    const z = zMetrics[index];
    const impact = weightedAvailable([
      [z.rapm, 0.47],
      [z.warp40, 0.53]
    ]);
    const defense = Number.isFinite(metrics.drapm)
      ? weightedAvailable([
          [z.drapm, 0.55],
          [metrics.blockRate, 0.20],
          [metrics.stealRate, 0.15],
          [z.rapm, 0.10]
        ])
      : weightedAvailable([
          [z.rapm, 0.35],
          [metrics.blockRate, 0.30],
          [metrics.stealRate, 0.25],
          [Number.isFinite(z.adjDe) ? -z.adjDe : null, 0.10]
        ]);
    return {
      v: metrics.usg,
      e: metrics.efficiency,
      r: metrics.rebounding,
      s: Number.isFinite(metrics.topct) ? -metrics.topct : null,
      p: weightedAvailable([[metrics.assistRate, 0.70], [metrics.createdPerMinute, 0.30]]),
      i: impact,
      d: defense
    };
  });

  const missingBeforeImputation = raw.map(values => Object.fromEntries(
    ["v", "e", "r", "s", "p", "i", "d"].map(key => [key, !Number.isFinite(values[key])])
  ));
  imputeMissingFromFallbackSignals(players, source, groupIndexes, raw);

  const percentiles = raw.map(() => ({}));
  for (const indexes of groupIndexes.values()) {
    for (const key of ["v", "e", "r", "s", "p", "i", "d"]) {
      assignPercentiles(indexes, raw, percentiles, key);
    }
  }

  players.forEach((player, index) => {
    const next = percentiles[index];
    player.verspi = {
      ...player.verspi,
      v: rounded(next.v),
      e: rounded(next.e),
      r: rounded(next.r),
      s: rounded(next.s),
      p: rounded(next.p),
      i: rounded(next.i),
      d: rounded(next.d),
      height: player.height ?? player.verspi?.height ?? null
    };
  });

  const coverage = coverageSummary(players, source, raw, missingBeforeImputation);
  data.meta = {
    ...data.meta,
    verspiFormulaVersion: FORMULA_VERSION,
    verspiPercentilePool: "season + division",
    verspiEfficiencyPriorAttempts: 25,
    verspiCoverage: coverage,
    verspiSourceNotes: {
      rebounding: "D1 uses the retained individual ORB% and DRB% percentile features; D2 uses individual REB/40 because source ORB/DRB splits are unavailable.",
      playmaking: "D1 uses the retained individual AST% percentile feature as the assist-rate input; D2 uses individual assists per estimated possession because raw assist rate is unavailable.",
      defense: "Block% and steal-rate inputs use individual BLK/40 and STL/40 event-rate proxies because raw percentage denominators are not retained.",
      missingComponents: "Weighted branches renormalize over available individual components; missing team AdjDE is neutral rather than replaced with another team statistic. Historical rows missing an entire new-formula input are deterministically imputed from retained individual features and projection inputs."
    }
  };
  return { data, raw, source, coverage };
}

function sourceMetrics(player, efficiencyContexts, teamDefense) {
  const advanced = player.projectionStats?.advanced || {};
  const stats = player.projectionStats?.box || player.stats || {};
  const minutes = finite(stats.MPG ?? player.stats?.MPG);
  const games = finite(stats.GP ?? player.stats?.GP);
  const pbpGames = finite(player.pbp?.gp) ?? games;
  const zones = zoneMap(player);
  const fga = sum(ZONES.map(key => zones[key]?.fga));
  const fieldPoints = sum(ZONES.map(key => (finite(zones[key]?.fgm) ?? 0) * (THREE_POINT_ZONES.has(key) ? 3 : 2)));
  const totalPoints = Number.isFinite(pbpGames) ? (finite(stats["PTS/G"] ?? player.stats?.["PTS/G"]) ?? 0) * pbpGames : null;
  const ftm = Number.isFinite(totalPoints) ? Math.max(0, totalPoints - fieldPoints) : null;
  const ftPct = pctDecimal(stats["FT%"] ?? player.stats?.["FT%"]);
  const fta = ftm === 0 ? 0 : Number.isFinite(ftm) && Number.isFinite(ftPct) && ftPct > 0 ? ftm / ftPct : null;
  const turnovers = Number.isFinite(pbpGames) ? (finite(stats["TOV/G"] ?? player.stats?.["TOV/G"]) ?? 0) * pbpGames : null;
  const possessions = Number.isFinite(fga) && Number.isFinite(fta) && Number.isFinite(turnovers)
    ? fga + 0.44 * fta + turnovers
    : null;

  const context = efficiencyContexts.get(efficiencyGroup(player));
  const fgValue = context ? sum(ZONES.map(key => {
    const zone = zones[key] || {};
    const attempts = finite(zone.fga) ?? 0;
    const makes = finite(zone.fgm) ?? 0;
    const prior = context.priorPct[key];
    const share = context.attemptShare[key];
    if (!Number.isFinite(prior) || !Number.isFinite(share)) return null;
    const shrunk = (makes + prior * 25) / (attempts + 25);
    return share * shrunk * (THREE_POINT_ZONES.has(key) ? 3 : 2);
  })) : null;
  const efficiency = Number.isFinite(fga) && fga > 0 && Number.isFinite(fgValue) && Number.isFinite(ftm) && Number.isFinite(fta)
    ? (fga * fgValue + ftm) / (2 * (fga + 0.44 * fta))
    : finite(advanced["TS%"]);

  const rebounding = reboundMetric(player, stats, minutes);
  const assistRate = assistRateMetric(player, stats, possessions, pbpGames);
  const createdPerMinute = Number.isFinite(minutes) && minutes > 0
    ? finite(player.pbp?.creation?.ptsCreatedG) / minutes
    : null;
  return {
    usg: finite(advanced["USG%"]),
    efficiency,
    rebounding,
    topct: Number.isFinite(turnovers) && Number.isFinite(possessions) && possessions > 0 ? turnovers / possessions : null,
    assistRate,
    createdPerMinute: Number.isFinite(createdPerMinute) ? createdPerMinute : null,
    rapm: finite(advanced.RAPM),
    warp40: finite(advanced["WARP/40"]),
    drapm: finite(advanced.DRAPM),
    blockRate: per40(stats["BLK/G"] ?? player.stats?.["BLK/G"], minutes),
    stealRate: per40(stats["STL/G"] ?? player.stats?.["STL/G"], minutes),
    adjDe: teamDefense.get(teamSeasonKey(player.statsTeam || player.team, player.season)) ?? null
  };
}

function buildEfficiencyContexts(players) {
  const buckets = new Map();
  for (const player of players) {
    const key = efficiencyGroup(player);
    if (!buckets.has(key)) buckets.set(key, Object.fromEntries(ZONES.map(zone => [zone, { fgm: 0, fga: 0 }])));
    const bucket = buckets.get(key);
    const zones = zoneMap(player);
    for (const zone of ZONES) {
      bucket[zone].fgm += finite(zones[zone]?.fgm) ?? 0;
      bucket[zone].fga += finite(zones[zone]?.fga) ?? 0;
    }
  }
  const contexts = new Map();
  for (const [key, zones] of buckets) {
    const totalFga = sum(ZONES.map(zone => zones[zone].fga));
    const fallbackPct = sum(ZONES.map(zone => zones[zone].fgm)) / Math.max(1, totalFga);
    contexts.set(key, {
      priorPct: Object.fromEntries(ZONES.map(zone => [zone, zones[zone].fga ? zones[zone].fgm / zones[zone].fga : fallbackPct])),
      attemptShare: Object.fromEntries(ZONES.map(zone => [zone, totalFga ? zones[zone].fga / totalFga : 1 / ZONES.length]))
    });
  }
  return contexts;
}

function reboundMetric(player, stats, minutes) {
  const orb = d1Feature(player, FEATURE_INDEX.orbPctPercentile);
  const drb = d1Feature(player, FEATURE_INDEX.drbPctPercentile);
  if (Number.isFinite(orb) && Number.isFinite(drb)) return 0.5 * orb + 0.5 * drb;
  return per40(stats["REB/G"] ?? player.stats?.["REB/G"], minutes);
}

function assistRateMetric(player, stats, possessions, games) {
  const retained = d1Feature(player, FEATURE_INDEX.astPctPercentile);
  if (Number.isFinite(retained)) return retained;
  const assists = Number.isFinite(games) ? (finite(stats["AST/G"] ?? player.stats?.["AST/G"]) ?? 0) * games : null;
  return Number.isFinite(assists) && Number.isFinite(possessions) && possessions > 0 ? assists / possessions : null;
}

function d1Feature(player, index) {
  if (player.model !== "d1") return null;
  const value = finite(player.features?.[index]);
  return Number.isFinite(value) ? value : null;
}

function buildTeamDefenseIndex(teamStats, supplemental = []) {
  const map = new Map();
  const defs = teamStats?.defs || [];
  const adjDeIndex = defs.findIndex(definition => definition?.[0] === "AdjDE");
  if (adjDeIndex >= 0) {
    for (const row of teamStats?.teams || []) {
      const season = seasonFromOrdinal(row.s);
      const value = finite(row.st?.[adjDeIndex]?.[0]);
      if (!season || !Number.isFinite(value)) continue;
      map.set(teamSeasonKey(row.t, season), value);
    }
  }
  for (const row of supplemental || []) {
    const value = finite(row.adjDe);
    if (!row.team || !row.season || !Number.isFinite(value)) continue;
    map.set(teamSeasonKey(row.team, row.season), value);
  }
  return map;
}

function assignPercentiles(indexes, raw, output, key) {
  const ranked = indexes
    .map(index => ({ index, value: raw[index][key] }))
    .filter(item => Number.isFinite(item.value))
    .sort((left, right) => left.value - right.value);
  if (!ranked.length) return;
  let start = 0;
  while (start < ranked.length) {
    let end = start;
    while (end + 1 < ranked.length && ranked[end + 1].value === ranked[start].value) end += 1;
    const averageRank = (start + end) / 2;
    const percentile = ranked.length === 1 ? 50 : averageRank / (ranked.length - 1) * 100;
    for (let index = start; index <= end; index += 1) output[ranked[index].index][key] = percentile;
    start = end + 1;
  }
}

function imputeMissingFromFallbackSignals(players, source, groupIndexes, raw) {
  for (const indexes of groupIndexes.values()) {
    for (const key of ["v", "e", "r", "s", "p", "i", "d"]) {
      const available = indexes.map(index => raw[index][key]).filter(Number.isFinite).sort((left, right) => left - right);
      if (!available.length) continue;
      const fallback = indexes.map(index => ({ index, value: fallbackSignal(players[index], source[index], key) }))
        .filter(item => Number.isFinite(item.value))
        .sort((left, right) => left.value - right.value);
      const fallbackPercentiles = percentileMap(fallback);
      for (const index of indexes) {
        if (Number.isFinite(raw[index][key])) continue;
        raw[index][key] = quantile(available, fallbackPercentiles.get(index) ?? 0.5);
      }
    }
  }
}

function fallbackSignal(player, source, key) {
  const stats = player.projectionStats?.box || player.stats || {};
  const minutes = finite(stats.MPG ?? player.stats?.MPG);
  if (key === "v") return d1Feature(player, 4) ?? finite(stats["PTS/G"] ?? player.stats?.["PTS/G"]);
  if (key === "e") return finite(player.projectionStats?.advanced?.["TS%"]) ?? d1Feature(player, 5) ?? finite(stats["FG%"]);
  if (key === "r") return source.rebounding ?? per40(stats["REB/G"] ?? player.stats?.["REB/G"], minutes);
  if (key === "s") {
    const turnoverRate = per40(stats["TOV/G"] ?? player.stats?.["TOV/G"], minutes);
    return Number.isFinite(source.topct) ? -source.topct : Number.isFinite(turnoverRate) ? -turnoverRate : null;
  }
  if (key === "p") return d1Feature(player, FEATURE_INDEX.astPctPercentile) ?? per40(stats["AST/G"] ?? player.stats?.["AST/G"], minutes);
  if (key === "i") return finite(player.projectionStats?.advanced?.["WS/40"]) ?? finite(player.primaryScore) ?? finite(player.projection?.score);
  if (key === "d") {
    const events = [source.blockRate, source.stealRate].filter(Number.isFinite);
    return events.length ? sum(events) : null;
  }
  return null;
}

function percentileMap(ranked) {
  const output = new Map();
  if (!ranked.length) return output;
  let start = 0;
  while (start < ranked.length) {
    let end = start;
    while (end + 1 < ranked.length && ranked[end + 1].value === ranked[start].value) end += 1;
    const probability = ranked.length === 1 ? 0.5 : ((start + end) / 2) / (ranked.length - 1);
    for (let index = start; index <= end; index += 1) output.set(ranked[index].index, probability);
    start = end + 1;
  }
  return output;
}

function quantile(sorted, probability) {
  if (!sorted.length) return null;
  const bounded = Math.max(0, Math.min(1, probability));
  const position = bounded * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function groupPlayerIndexes(players) {
  const groups = new Map();
  players.forEach((player, index) => {
    const key = `${player.model}\u0000${player.season}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  return groups;
}

function efficiencyGroup(player) {
  return `${player.model}\u0000${player.season}\u0000${player.posTier === "Big" ? "Big" : "G/W"}`;
}

function zoneMap(player) {
  return Object.fromEntries((player.pbp?.zones || []).map(zone => [zone.key, zone]));
}

function meanAndSd(values) {
  const clean = values.filter(Number.isFinite);
  if (clean.length < 2) return null;
  const mean = sum(clean) / clean.length;
  const variance = sum(clean.map(value => (value - mean) ** 2)) / (clean.length - 1);
  const sd = Math.sqrt(variance);
  return sd > 0 ? { mean, sd } : null;
}

function weightedAvailable(entries) {
  const valid = entries.filter(([value, weight]) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0);
  const weight = sum(valid.map(([, amount]) => amount));
  return weight ? sum(valid.map(([value, amount]) => value * amount)) / weight : null;
}

function per40(perGame, minutesPerGame) {
  const value = finite(perGame);
  return Number.isFinite(value) && Number.isFinite(minutesPerGame) && minutesPerGame > 0 ? value * 40 / minutesPerGame : null;
}

function pctDecimal(value) {
  const number = finite(value);
  if (!Number.isFinite(number)) return null;
  return Math.abs(number) > 1 ? number / 100 : number;
}

function finite(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sum(values) {
  return values.filter(Number.isFinite).reduce((total, value) => total + value, 0);
}

function rounded(value) {
  return Number.isFinite(value) ? Math.round(value * 10) / 10 : null;
}

function teamSeasonKey(team, season) {
  return `${normalize(team)}\u0000${season}`;
}

function normalize(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function seasonFromOrdinal(value) {
  const ordinal = Number(value);
  return Number.isInteger(ordinal) && ordinal >= 1 ? `${2020 + ordinal}-${String(21 + ordinal).padStart(2, "0")}` : "";
}

function coverageSummary(players, source, raw, missingBeforeImputation) {
  const summary = {};
  for (const model of ["d1", "d2"]) {
    const indexes = players.map((player, index) => player.model === model ? index : -1).filter(index => index >= 0);
    summary[model] = {
      players: indexes.length,
      drapmBranch: indexes.filter(index => Number.isFinite(source[index].drapm)).length,
      fallbackDefenseBranch: indexes.filter(index => !Number.isFinite(source[index].drapm)).length,
      fallbackWithTeamAdjDe: indexes.filter(index => !Number.isFinite(source[index].drapm) && Number.isFinite(source[index].adjDe)).length,
      completeImpactBlend: indexes.filter(index => Number.isFinite(source[index].rapm) && Number.isFinite(source[index].warp40)).length,
      completeEfficiency: indexes.filter(index => Number.isFinite(raw[index].e)).length,
      directAllSeven: indexes.filter(index => !Object.values(missingBeforeImputation[index]).some(Boolean)).length,
      imputedAny: indexes.filter(index => Object.values(missingBeforeImputation[index]).some(Boolean)).length,
      completeAllSeven: indexes.filter(index => ["v", "e", "r", "s", "p", "i", "d"].every(key => Number.isFinite(raw[index][key]))).length
    };
  }
  return summary;
}

export function syncLegacyVersp(legacy, players) {
  const output = legacy || { versp: {} };
  output.versp ||= {};
  players.filter(player => player.model === "d1").forEach(player => {
    const index = Number(String(player.id).replace(/^d1-/, ""));
    if (!Number.isInteger(index)) return;
    output.versp[index] = {
      ...(output.versp[index] || {}),
      cls: player.class || output.versp[index]?.cls || "",
      v: player.verspi?.v,
      e: player.verspi?.e,
      r: player.verspi?.r,
      s: player.verspi?.s,
      p: player.verspi?.p,
      i: player.verspi?.i,
      d: player.verspi?.d,
      ht: player.height ?? output.versp[index]?.ht ?? null
    };
  });
  output.meta = {
    ...(output.meta || {}),
    verspiFormulaVersion: FORMULA_VERSION,
    percentilePool: "season + division"
  };
  return output;
}

async function main() {
  const scriptPath = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(scriptPath), "..");
  const hubPath = path.join(projectRoot, "public/cbb-hub/data/hub-data.json");
  const legacyPath = path.join(projectRoot, "public/versp.json");
  const data = JSON.parse(fs.readFileSync(hubPath, "utf8"));
  data.verspiTeamDefense = loadTeamDefenseSource(path.join(projectRoot, "public/tabs/data.js"));
  const result = rebuildVerspi(data);
  fs.writeFileSync(hubPath, JSON.stringify(result.data));
  if (fs.existsSync(legacyPath)) {
    const legacy = JSON.parse(fs.readFileSync(legacyPath, "utf8"));
    fs.writeFileSync(legacyPath, JSON.stringify(syncLegacyVersp(legacy, result.data.players)));
  }
  process.stdout.write(`${JSON.stringify({ formulaVersion: FORMULA_VERSION, coverage: result.coverage }, null, 2)}\n`);
}

function loadTeamDefenseSource(sourcePath) {
  if (!fs.existsSync(sourcePath)) return [];
  const source = fs.readFileSync(sourcePath, "utf8");
  const line = source.split(/\r?\n/).find(value => /^var TDATA\s*=/.test(value));
  const match = line?.match(/^var TDATA\s*=\s*(\[.*\]);\s*$/);
  if (!match) throw new Error("Could not parse TDATA team performance source");
  return JSON.parse(match[1]).map(row => ({
    team: row.t,
    season: seasonFromOrdinal(row.s),
    adjDe: finite(row.de)
  })).filter(row => row.team && row.season && Number.isFinite(row.adjDe));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
