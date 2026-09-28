export const VERSPI_DIMENSIONS = [
  ["v", "Volume"],
  ["e", "Efficiency"],
  ["r", "Rebounding"],
  ["s", "Security"],
  ["p", "Playmaking"],
  ["i", "Impact"],
  ["d", "Defense"]
];

export const STYLE_DIMENSIONS = [
  { key: "role", label: "Role & Volume", features: [["mpg", .25], ["points", .4], ["shotVolume", .35]] },
  { key: "inside", label: "Interior Scoring", features: [["fgPct", .2], ["rimPct", .35], ["paintPct", .25], ["midPct", .2]] },
  { key: "perimeter", label: "Perimeter Shooting", features: [["threePct", .3], ["atbThreePct", .25], ["cornerThreePct", .2], ["threeShare", .15], ["ftPct", .1]] },
  { key: "playmaking", label: "Playmaking", features: [["assists", .3], ["created", .35], ["rimPaintAst", .2], ["astTov", .15]] },
  { key: "security", label: "Ball Security", features: [["turnoverBurden", -1]] },
  { key: "rebounding", label: "Rebounding", features: [["rebounds", 1]] },
  { key: "defense", label: "Defensive Events", features: [["steals", .55], ["blocks", .45]] },
  { key: "rimPressure", label: "Rim Pressure", features: [["rimShare", .65], ["rimVolume", .35]] },
  { key: "selfCreation", label: "Self Creation", features: [["unassistedPoints", .6], ["unassistedShare", .4]] }
];

const RAW_KEYS = [...new Set(STYLE_DIMENSIONS.flatMap(dimension => dimension.features.map(([key]) => key)))];

export function buildSimilarityIndex(players) {
  const records = players.map(player => ({
    player,
    group: `${player.model}\u0000${player.season}`,
    raw: rawFeatures(player),
    verspiRaw: VERSPI_DIMENSIONS.map(([key]) => finite(player.verspi?.[key]))
  }));
  const rawStats = groupedStats(records, record => record.raw, RAW_KEYS);
  const verspiStats = groupedStats(records, record => Object.fromEntries(
    VERSPI_DIMENSIONS.map(([key], index) => [key, record.verspiRaw[index]])
  ), VERSPI_DIMENSIONS.map(([key]) => key));

  records.forEach(record => {
    record.rawZ = Object.fromEntries(RAW_KEYS.map(key => [key, zScore(record.raw[key], rawStats.get(record.group)?.[key])]));
    record.styleBase = STYLE_DIMENSIONS.map(dimension => weightedMean(
      dimension.features.map(([key, weight]) => [record.rawZ[key], weight])
    ));
    record.verspiZ = VERSPI_DIMENSIONS.map(([key], index) => zScore(
      record.verspiRaw[index], verspiStats.get(record.group)?.[key]
    ));
  });

  const styleStats = STYLE_DIMENSIONS.map((_, index) => summary(records.map(record => record.styleBase[index])));
  records.forEach(record => {
    record.styleZ = record.styleBase.map((value, index) => zScore(value, styleStats[index]));
  });

  const verspiVectors = records.map(record => record.verspiZ).filter(vector => vector.every(Number.isFinite));
  const covariance = covarianceMatrix(verspiVectors, .08);
  const verspiInverse = invertMatrix(covariance) || identityMatrix(VERSPI_DIMENSIONS.length);
  return {
    records,
    byId: new Map(records.map(record => [record.player.id, record])),
    verspiInverse
  };
}

export function findSimilar(index, targetId, options = {}) {
  const target = index.byId.get(targetId);
  if (!target) return { eligibleCount: 0, shortlistCount: 0, results: [] };
  const method = options.method || "two-stage";
  const limit = Math.max(1, Number(options.limit) || 100);
  const candidates = index.records.filter(record => candidateAllowed(target, record, options));
  const scored = candidates.map(record => {
    const verspiDistance = mahalanobisDistance(target.verspiZ, record.verspiZ, index.verspiInverse);
    const styleDistance = euclideanDistance(target.styleZ, record.styleZ);
    const verspiScore = similarityScore(verspiDistance, VERSPI_DIMENSIONS.length);
    const styleScore = similarityScore(styleDistance, STYLE_DIMENSIONS.length);
    return { record, player: record.player, verspiDistance, styleDistance, verspiScore, styleScore };
  }).filter(result => Number.isFinite(result.verspiScore) || Number.isFinite(result.styleScore));

  let ranked;
  let shortlistCount = scored.length;
  if (method === "verspi") {
    ranked = scored.filter(result => Number.isFinite(result.verspiScore));
    ranked.sort((left, right) => right.verspiScore - left.verspiScore);
    ranked.forEach(result => { result.score = result.verspiScore; });
  } else if (method === "box") {
    ranked = scored.filter(result => Number.isFinite(result.styleScore));
    ranked.sort((left, right) => right.styleScore - left.styleScore);
    ranked.forEach(result => { result.score = result.styleScore; });
  } else {
    const broadLimit = Math.min(scored.length, Math.max(90, limit * 3));
    ranked = scored
      .filter(result => Number.isFinite(result.verspiScore) && Number.isFinite(result.styleScore))
      .sort((left, right) => right.verspiScore - left.verspiScore)
      .slice(0, broadLimit);
    shortlistCount = ranked.length;
    ranked.forEach(result => { result.score = result.verspiScore * .4 + result.styleScore * .6; });
    ranked.sort((left, right) => right.score - left.score || right.styleScore - left.styleScore);
  }
  return {
    eligibleCount: candidates.length,
    shortlistCount,
    results: ranked.slice(0, limit).map((result, indexValue) => ({ ...result, rank: indexValue + 1 }))
  };
}

export function profileFor(index, playerId, method = "two-stage") {
  const record = index.byId.get(playerId);
  if (!record) return { labels: [], values: [] };
  const useVerspi = method === "verspi";
  const definitions = useVerspi ? VERSPI_DIMENSIONS : STYLE_DIMENSIONS.map(({ key, label }) => [key, label]);
  const vector = useVerspi ? record.verspiZ : record.styleZ;
  return {
    labels: definitions.map(definition => definition[1]),
    values: vector.map(value => Number.isFinite(value) ? clamp(normalCdf(value) * 100, 2, 98) : 50)
  };
}

export function profileDifferences(index, targetId, candidateId, method = "two-stage") {
  const target = profileFor(index, targetId, method);
  const candidate = profileFor(index, candidateId, method);
  return target.labels.map((label, indexValue) => ({
    label,
    target: target.values[indexValue],
    candidate: candidate.values[indexValue],
    gap: Math.abs(target.values[indexValue] - candidate.values[indexValue])
  })).sort((left, right) => left.gap - right.gap);
}

function candidateAllowed(target, candidate, options) {
  const targetPlayer = target.player;
  const player = candidate.player;
  if (player.id === targetPlayer.id || sameIdentity(targetPlayer, player)) return false;
  const pool = options.pool || "all";
  if (pool === "same" && player.model !== targetPlayer.model) return false;
  if (pool === "cross" && player.model === targetPlayer.model) return false;
  if (pool === "d1" && player.model !== "d1") return false;
  if (pool === "d2" && player.model !== "d2") return false;
  if ((options.season || "same") === "same" && player.season !== targetPlayer.season) return false;
  if (options.classes?.size && !options.classes.has(player.class)) return false;
  if (options.archetype && player.archetype !== options.archetype) return false;
  if (options.position && player.posTier !== options.position) return false;
  const teamNeedle = String(options.teamSearch || "").trim().toLowerCase();
  if (teamNeedle && !`${player.team} ${player.statsTeam || ""}`.toLowerCase().includes(teamNeedle)) return false;
  if (options.states?.size && !options.states.has(player.schoolState || "")) return false;
  if (!matchesRanges(player, options.ranges)) return false;
  return true;
}

function matchesRanges(player, ranges) {
  for (const [key, bounds] of Object.entries(ranges || {})) {
    let value;
    if (key === "height") value = player.height ?? player.verspi?.height;
    else if (VERSPI_DIMENSIONS.some(([dimension]) => dimension === key)) value = player.verspi?.[key];
    else value = player.stats?.[key];
    value = value == null || value === "" ? null : Number(value);
    if (value !== null && ["FG%", "3P%", "FT%"].includes(key) && Math.abs(value) <= 1) value *= 100;
    if (bounds.min !== undefined && (value === null || !Number.isFinite(value) || value < bounds.min)) return false;
    if (bounds.max !== undefined && (value === null || !Number.isFinite(value) || value > bounds.max)) return false;
  }
  return true;
}

function sameIdentity(left, right) {
  const leftId = String(left.pbp?.playerId || "").trim();
  const rightId = String(right.pbp?.playerId || "").trim();
  return Boolean(leftId && rightId && leftId === rightId);
}

function rawFeatures(player) {
  const stats = player.stats || {};
  const zones = Object.fromEntries((player.pbp?.zones || []).map(zone => [zone.key, zone]));
  const creation = player.pbp?.creation || {};
  const zoneVolume = key => finite(zones[key]?.fgaG);
  const zonePct = key => finite(zones[key]?.fga) >= 8 ? validPct(zones[key]?.fgPct) : null;
  const rimVolume = zoneVolume("atr2");
  const paintVolume = zoneVolume("paint2");
  const midVolume = zoneVolume("mid2");
  const atbVolume = zoneVolume("atb3");
  const cornerVolume = zoneVolume("c3");
  const volumes = [rimVolume, paintVolume, midVolume, atbVolume, cornerVolume].filter(Number.isFinite);
  const shotVolume = volumes.length ? volumes.reduce((sum, value) => sum + value, 0) : null;
  const assists = finite(stats["AST/G"]);
  const turnovers = finite(stats["TOV/G"]);
  const points = finite(stats["PTS/G"]);
  const assistedPct = validPct(creation.fgmAstdPct);
  return {
    mpg: finite(stats.MPG),
    points,
    shotVolume,
    fgPct: validPct(stats["FG%"]),
    rimPct: zonePct("atr2"),
    paintPct: zonePct("paint2"),
    midPct: zonePct("mid2"),
    threePct: validPct(stats["3P%"]),
    atbThreePct: zonePct("atb3"),
    cornerThreePct: zonePct("c3"),
    threeShare: ratio(sumFinite(atbVolume, cornerVolume), shotVolume),
    ftPct: validPct(stats["FT%"]),
    assists,
    created: finite(creation.ptsCreatedG),
    rimPaintAst: finite(creation.rimPaintAst40),
    astTov: Number.isFinite(assists) && Number.isFinite(turnovers) ? assists / Math.max(.35, turnovers) : null,
    turnoverBurden: Number.isFinite(turnovers) && Number.isFinite(shotVolume) && Number.isFinite(assists)
      ? turnovers / Math.max(1, shotVolume + assists)
      : null,
    rebounds: finite(stats["REB/G"]),
    steals: finite(stats["STL/G"]),
    blocks: finite(stats["BLK/G"]),
    rimShare: ratio(rimVolume, shotVolume),
    rimVolume,
    unassistedPoints: finite(creation.uPtsG),
    unassistedShare: Number.isFinite(assistedPct) ? 100 - assistedPct : null
  };
}

function groupedStats(records, valuesFor, keys) {
  const grouped = new Map();
  records.forEach(record => {
    if (!grouped.has(record.group)) grouped.set(record.group, Object.fromEntries(keys.map(key => [key, []])));
    const values = valuesFor(record);
    keys.forEach(key => {
      const value = finite(values[key]);
      if (Number.isFinite(value)) grouped.get(record.group)[key].push(value);
    });
  });
  for (const [group, values] of grouped) {
    grouped.set(group, Object.fromEntries(keys.map(key => [key, summary(values[key])])));
  }
  return grouped;
}

function summary(values) {
  const clean = values.filter(Number.isFinite);
  if (!clean.length) return null;
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;
  const variance = clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / Math.max(1, clean.length - 1);
  return { mean, sd: Math.sqrt(variance), n: clean.length };
}

function zScore(value, stats) {
  return Number.isFinite(value) && stats?.sd > 1e-9 ? (value - stats.mean) / stats.sd : null;
}

function weightedMean(entries) {
  const valid = entries.filter(([value]) => Number.isFinite(value));
  if (!valid.length) return null;
  const denominator = valid.reduce((sum, [, weight]) => sum + Math.abs(weight), 0);
  return valid.reduce((sum, [value, weight]) => sum + value * weight, 0) / denominator;
}

function covarianceMatrix(vectors, ridge = 0) {
  const size = vectors[0]?.length || 0;
  const means = Array.from({ length: size }, (_, index) => vectors.reduce((sum, vector) => sum + vector[index], 0) / vectors.length);
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => {
    const covariance = vectors.reduce((sum, vector) => sum + (vector[row] - means[row]) * (vector[column] - means[column]), 0)
      / Math.max(1, vectors.length - 1);
    return covariance + (row === column ? ridge : 0);
  }));
}

function invertMatrix(matrix) {
  const size = matrix.length;
  if (!size) return null;
  const augmented = matrix.map((row, rowIndex) => [
    ...row.map(Number),
    ...Array.from({ length: size }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0)
  ]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    augmented[column] = augmented[column].map(value => value / divisor);
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      augmented[row] = augmented[row].map((value, index) => value - factor * augmented[column][index]);
    }
  }
  return augmented.map(row => row.slice(size));
}

function identityMatrix(size) {
  return Array.from({ length: size }, (_, row) => Array.from({ length: size }, (_, column) => row === column ? 1 : 0));
}

function mahalanobisDistance(left, right, inverse) {
  if (!left.every(Number.isFinite) || !right.every(Number.isFinite)) return null;
  const difference = left.map((value, index) => value - right[index]);
  const projected = inverse.map(row => row.reduce((sum, value, index) => sum + value * difference[index], 0));
  return Math.sqrt(Math.max(0, difference.reduce((sum, value, index) => sum + value * projected[index], 0)));
}

function euclideanDistance(left, right) {
  const pairs = left.map((value, index) => [value, right[index]]).filter(pair => pair.every(Number.isFinite));
  if (pairs.length < Math.ceil(STYLE_DIMENSIONS.length * .7)) return null;
  const sum = pairs.reduce((total, [leftValue, rightValue]) => total + (leftValue - rightValue) ** 2, 0);
  return Math.sqrt(sum * STYLE_DIMENSIONS.length / pairs.length);
}

function similarityScore(distance, dimensions) {
  return Number.isFinite(distance) ? clamp(100 * Math.exp(-distance / (Math.sqrt(dimensions) * 2)), 0, 100) : null;
}

function normalCdf(value) {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const t = 1 / (1 + .3275911 * x);
  const erf = sign * (1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - .284496736) * t + .254829592) * t * Math.exp(-x * x));
  return .5 * (1 + erf);
}

function validPct(value) {
  const number = finite(value);
  if (!Number.isFinite(number) || number < 0) return null;
  const percent = number <= 1 ? number * 100 : number;
  return percent <= 100 ? percent : null;
}

function ratio(numerator, denominator) {
  return Number.isFinite(numerator) && Number.isFinite(denominator) && denominator > 0 ? numerator / denominator : null;
}

function sumFinite(...values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) : null;
}

function finite(value) {
  const number = Number(value);
  return value !== null && value !== undefined && value !== "" && Number.isFinite(number) ? number : null;
}

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}
