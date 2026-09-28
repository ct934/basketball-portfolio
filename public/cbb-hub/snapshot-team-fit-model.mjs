const CATEGORIES = ["v", "e", "r", "s", "p", "i", "d"];

const CATEGORY_METRICS = {
  v: ["FTRate", "FG3Rate"],
  e: ["AdjOE", "eFG", "FG3Pct", "FG2Pct", "FTPct"],
  r: ["ORPct", "D_ORPct"],
  s: ["TOPct", "NSTRate", "D_TOPct", "OppStlRate"],
  p: ["ARate"],
  i: ["AdjEM", "AdjOE", "AdjDE"],
  d: ["AdjDE", "D_eFG", "D_TOPct", "D_ORPct", "D_FTRate", "OppFG3Pct", "OppFG2Pct", "BlockPct", "StlRate"]
};

export function rankSnapshotTeamFits(payload, player, options = {}) {
  const model = payload?.teamProjectionModel || {};
  const definitions = (model.defs || []).map((definition, index) => ({
    key: definition[0],
    label: definition[1],
    group: definition[2],
    direction: Number(definition[3]),
    format: definition[4],
    index
  }));
  const season = String(options.season || player?.season || "");
  const teams = (model.teams || []).filter(row => row.s === season).map(row => ({ team: row.t, season: row.s, metrics: row.m }));
  if (!player || !definitions.length || !teams.length) {
    return { season, teamCount: teams.length, impact: null, results: [] };
  }

  const impactIndex = buildImpactCandidateIndex(payload.players || []);
  const impact = resolveImpact(impactIndex, player, definitions.length);
  const seasonValues = buildSeasonValues(teams, definitions);
  const tierIndex = buildTierIndex(payload, season);
  const context = { definitions, impact, model, seasonValues, tierIndex };
  const excludeCurrent = options.excludeCurrent !== false;
  const results = teams
    .filter(team => !excludeCurrent || player.model !== "d1" || !sameTeam(player, team.team))
    .map(team => analyzeTeam(player, team, context))
    .sort((left, right) => right.fit - left.fit || right.adjEmGain - left.adjEmGain || left.team.localeCompare(right.team));
  const limit = Math.max(1, Math.min(100, Number(options.limit) || 10));
  return { season, teamCount: results.length, impact, results: results.slice(0, limit) };
}

// The season-level pieces below (team rows, percentile distributions, tier
// lookups, and the impact-candidate index) depend only on the season, not on
// any individual player - so when many players need to be projected against
// the same season (e.g. ranking a whole transfer-portal pool against one
// destination team), build this once and reuse it. Building it per-player
// instead would repeatedly re-scan the full ~18k player table and ~370 team
// rows for every single candidate, which is the difference between an
// instant result and a multi-second freeze for a pool of a few thousand.
export function buildTeamImpactContext(payload, season) {
  const model = payload?.teamProjectionModel || {};
  const definitions = (model.defs || []).map((definition, index) => ({
    key: definition[0],
    label: definition[1],
    group: definition[2],
    direction: Number(definition[3]),
    format: definition[4],
    index
  }));
  const targetSeason = String(season || "");
  const teams = (model.teams || []).filter(row => row.s === targetSeason).map(row => ({ team: row.t, season: row.s, metrics: row.m }));
  return {
    definitions,
    model,
    teams,
    season: targetSeason,
    seasonValues: buildSeasonValues(teams, definitions),
    tierIndex: buildTierIndex(payload, targetSeason),
    impactIndex: buildImpactCandidateIndex(payload.players || [])
  };
}

// Cheap per-player projection against a team, given a context already built
// by buildTeamImpactContext. Use this (not projectPlayerImpactForTeam) when
// projecting many players in a loop.
export function projectPlayerImpactWithContext(context, payload, player, teamName) {
  const { definitions, teams, seasonValues, tierIndex, impactIndex } = context;
  const team = teams.find(row => canonical(row.team) === canonical(teamName));
  if (!player || !definitions.length || !team) return null;
  const impact = resolveImpact(impactIndex, player, definitions.length);
  const analyzeContext = { definitions, impact, model: context.model, seasonValues, tierIndex };
  const analyzed = analyzeTeam(player, team, analyzeContext);
  const percentiles = new Map(definitions.map(definition => [definition.key, orientedPercentile(team, definition, seasonValues)]));
  const projection = projectPlayerToTeam(team, percentiles, analyzeContext);
  return {
    ...analyzed,
    definitions,
    currentMetrics: team.metrics,
    projectedMetrics: projection.metrics
  };
}

// Same machinery as rankSnapshotTeamFits, but resolves one named team instead
// of ranking all of them (rankSnapshotTeamFits caps its results at 100, so a
// mid/low-major destination can fall outside that cap for a given player -
// this always returns the exact team asked for). Convenience one-shot
// wrapper around buildTeamImpactContext + projectPlayerImpactWithContext;
// prefer building the context once yourself if projecting many players.
export function projectPlayerImpactForTeam(payload, player, teamName, season) {
  const context = buildTeamImpactContext(payload, season || player?.season);
  return projectPlayerImpactWithContext(context, payload, player, teamName);
}

function buildImpactCandidateIndex(players) {
  const byModel = new Map();
  const byModelArchetype = new Map();
  players.forEach(candidate => {
    if (candidate.season !== "2025-26" || !Array.isArray(candidate.teamImpact?.delta)) return;
    if (!byModel.has(candidate.model)) byModel.set(candidate.model, []);
    byModel.get(candidate.model).push(candidate);
    const archKey = `${candidate.model}|${candidate.archetype}`;
    if (!byModelArchetype.has(archKey)) byModelArchetype.set(archKey, []);
    byModelArchetype.get(archKey).push(candidate);
  });
  return { byModel, byModelArchetype };
}


function resolveImpact(impactIndex, player, metricCount) {
  const direct = player.teamImpact?.delta;
  if (Array.isArray(direct) && direct.length) {
    return {
      delta: Array.from({ length: metricCount }, (_, index) => numberOrZero(direct[index])),
      estimated: false,
      confidence: player.teamImpact?.confidence || "Modeled",
      sample: Number(player.teamImpact?.sample) || 0,
      similarity: numberOrNull(player.teamImpact?.similarity),
      source: player.teamImpact?.method || "Individual transfer-impact model",
      comps: player.teamImpact?.comps || []
    };
  }

  const sameArchetypePool = impactIndex.byModelArchetype.get(`${player.model}|${player.archetype}`) || [];
  const candidates = sameArchetypePool
    .map(candidate => ({ candidate, similarity: profileSimilarity(player, candidate) }))
    .filter(match => Number.isFinite(match.similarity))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 24);
  const modelPool = impactIndex.byModel.get(player.model) || [];
  const fallback = candidates.length >= 5 ? candidates : modelPool
    .map(candidate => ({ candidate, similarity: profileSimilarity(player, candidate) }))
    .filter(match => Number.isFinite(match.similarity))
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, 24);
  const weights = fallback.map(match => Math.max(0.05, Math.exp((match.similarity - 100) / 12)));
  const totalWeight = weights.reduce((sum, value) => sum + value, 0);
  const delta = Array.from({ length: metricCount }, (_, index) => totalWeight
    ? fallback.reduce((sum, match, matchIndex) => sum + numberOrZero(match.candidate.teamImpact.delta[index]) * weights[matchIndex], 0) / totalWeight
    : 0);
  const similarity = weightedAverage(fallback.map(match => match.similarity), weights);
  return {
    delta,
    estimated: true,
    confidence: fallback.length >= 15 && similarity >= 72 ? "Medium" : "Low",
    sample: fallback.length,
    similarity,
    source: fallback.length
      ? `Estimated from ${fallback.length} closest current ${player.model.toUpperCase()} ${player.archetype || "player"} profiles`
      : "No comparable impact profiles were available; role fit drives this estimate",
    comps: fallback.slice(0, 3).map(match => ({
      name: match.candidate.name,
      team: match.candidate.team,
      similarity: match.similarity
    }))
  };
}

function profileSimilarity(left, right) {
  const differences = CATEGORIES.map(key => {
    const a = numberOrNull(left.verspi?.[key]);
    const b = numberOrNull(right.verspi?.[key]);
    return a === null || b === null ? null : ((a - b) / 25) ** 2;
  }).filter(value => value !== null);
  if (differences.length < 4) return NaN;
  return clamp(100 * Math.exp(-0.5 * Math.sqrt(average(differences))), 0, 100);
}

function analyzeTeam(player, team, context) {
  const percentiles = new Map(context.definitions.map(definition => [definition.key, orientedPercentile(team, definition, context.seasonValues)]));
  const categoryNeeds = {};
  CATEGORIES.forEach(key => {
    const values = (CATEGORY_METRICS[key] || []).map(metric => percentiles.get(metric)).filter(Number.isFinite);
    categoryNeeds[key] = values.length ? 100 - average(values) : 50;
  });
  const scores = fitComponents(player, percentiles, categoryNeeds, context);
  const projection = projectPlayerToTeam(team, percentiles, context);
  const adjEm = metricDefinition(context.definitions, "AdjEM");
  const adjO = metricDefinition(context.definitions, "AdjOE");
  const adjD = metricDefinition(context.definitions, "AdjDE");
  const currentAdjEm = metricValue(team, adjEm);
  const projectedAdjEm = metricValue(projection, adjEm);
  const needs = alignedNeeds(team, projection, percentiles, context);
  return {
    team: team.team,
    season: team.season,
    tier: context.tierIndex.get(canonical(team.team)) || "Unclassified",
    ...scores,
    currentAdjEm,
    projectedAdjEm,
    adjEmGain: projectedAdjEm - currentAdjEm,
    offenseChange: metricChange(team, projection, adjO),
    defenseChange: metricChange(team, projection, adjD),
    currentRank: projectedRank(team, adjEm, context.seasonValues),
    projectedRank: projectedRank(projection, adjEm, context.seasonValues),
    bestNeed: needs[0] || null
  };
}

function fitComponents(player, percentiles, categoryNeeds, context) {
  let impactTotal = 0;
  let impactWeight = 0;
  context.definitions.forEach(definition => {
    if (!definition.direction) return;
    const weakness = 100 - (percentiles.get(definition.key) ?? 50);
    const importance = metricImportance(definition.key);
    const weight = importance * (0.4 + weakness / 100);
    const normalized = clamp(playerDelta(context.impact, definition) * definition.direction / impactScale(context.model, definition), -1, 1);
    impactTotal += normalized * weight;
    impactWeight += weight;
  });
  const impactFit = clamp(50 + (impactWeight ? impactTotal / impactWeight * 35 : 0), 0, 100);
  let roleTotal = 0;
  let roleWeight = 0;
  CATEGORIES.forEach(key => {
    const value = numberOrNull(player.verspi?.[key]);
    if (value === null) return;
    const weight = 0.3 + categoryNeeds[key] / 100;
    roleTotal += value * weight;
    roleWeight += weight;
  });
  const roleFit = clamp(roleWeight ? roleTotal / roleWeight : 50, 0, 100);
  const quality = clamp(average(CATEGORIES.map(key => numberOrNull(player.verspi?.[key])).filter(value => value !== null)) ?? 50, 0, 100);
  const opportunity = clamp(average(Object.values(categoryNeeds).sort((a, b) => b - a).slice(0, 3)) ?? 50, 0, 100);
  return { fit: clamp(impactFit * 0.7 + roleFit * 0.2 + quality * 0.1, 0, 100), impactFit, roleFit, quality, opportunity };
}

function projectPlayerToTeam(team, percentiles, context) {
  const metrics = context.definitions.map(definition => {
    const current = numberOrNull(team.metrics?.[definition.index]);
    if (current === null) return null;
    const rawChange = playerDelta(context.impact, definition);
    const oriented = definition.direction ? rawChange * definition.direction : 0;
    const percentile = percentiles.get(definition.key) ?? 50;
    const needMultiplier = oriented > 0 ? 0.85 + 0.45 * (1 - percentile / 100) : 1;
    const change = rawChange * needMultiplier;
    const cap = Number(context.model.cohortCaps?.[definition.index] || context.model.caps?.[definition.index] || Math.abs(change) || 1);
    return current + clamp(change, -cap, cap);
  });
  const offense = metricDefinition(context.definitions, "AdjOE");
  const defense = metricDefinition(context.definitions, "AdjDE");
  const margin = metricDefinition(context.definitions, "AdjEM");
  if (offense && defense && margin && metrics[offense.index] !== null && metrics[defense.index] !== null) {
    metrics[margin.index] = metrics[offense.index] - metrics[defense.index];
  }
  return { team: team.team, season: team.season, metrics };
}

function alignedNeeds(team, projection, percentiles, context) {
  return context.definitions.filter(definition => definition.direction).map(definition => {
    const current = metricValue(team, definition);
    const projected = metricValue(projection, definition);
    const change = projected - current;
    const need = 100 - (percentiles.get(definition.key) ?? 50);
    const match = change * definition.direction / impactScale(context.model, definition) * (0.4 + need / 100) * metricImportance(definition.key);
    return { key: definition.key, label: definition.label, format: definition.format, direction: definition.direction, current, projected, change, need, match };
  }).sort((left, right) => right.match - left.match);
}

function buildSeasonValues(teams, definitions) {
  const values = new Map();
  definitions.forEach(definition => {
    values.set(definition.key, teams.map(team => numberOrNull(team.metrics?.[definition.index])).filter(value => value !== null).sort((a, b) => a - b));
  });
  return values;
}

function buildTierIndex(payload, season) {
  const tiers = new Map(Object.entries(payload.teamTiers || {}).map(([team, tier]) => [canonical(team), tier]));
  (payload.players || []).filter(player => player.model === "d1" && player.season === season && player.tier).forEach(player => {
    [player.team, player.statsTeam].filter(Boolean).forEach(team => tiers.set(canonical(team), player.tier));
  });
  return tiers;
}

function orientedPercentile(team, definition, seasonValues) {
  const value = numberOrNull(team.metrics?.[definition.index]);
  const values = seasonValues.get(definition.key) || [];
  if (value === null || !values.length || !definition.direction) return 50;
  const below = upperBound(values, value) / values.length * 100;
  return definition.direction > 0 ? below : 100 - below;
}

function projectedRank(team, definition, seasonValues) {
  if (!definition) return "--";
  const value = metricValue(team, definition);
  const values = seasonValues.get(definition.key) || [];
  if (!Number.isFinite(value) || !values.length) return "--";
  return definition.direction >= 0 ? 1 + values.length - upperBound(values, value) : upperBound(values, value);
}

function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (values[middle] <= target) low = middle + 1;
    else high = middle;
  }
  return low;
}

function metricDefinition(definitions, key) {
  return definitions.find(definition => definition.key === key);
}

function metricValue(team, definition) {
  return numberOrZero(team?.metrics?.[definition?.index]);
}

function metricChange(current, projected, definition) {
  return metricValue(projected, definition) - metricValue(current, definition);
}

function playerDelta(impact, definition) {
  return numberOrZero(impact?.delta?.[definition.index]);
}

function impactScale(model, definition) {
  return Number(model.predictionCaps?.[definition.index] || model.caps?.[definition.index] || 1);
}

function metricImportance(key) {
  return key === "AdjEM" ? 2 : key === "AdjOE" || key === "AdjDE" ? 1.4 : 1;
}

function sameTeam(player, team) {
  return [player.team, player.statsTeam].filter(Boolean).some(name => canonical(name) === canonical(team));
}

function weightedAverage(values, weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  return total ? values.reduce((sum, value, index) => sum + value * weights[index], 0) / total : null;
}

function average(values) {
  return values.length ? values.reduce((sum, value) => sum + Number(value), 0) / values.length : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, "");
}
