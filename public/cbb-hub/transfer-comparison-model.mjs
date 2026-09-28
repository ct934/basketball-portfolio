import { buildTeamImpactContext, projectPlayerImpactWithContext } from "./snapshot-team-fit-model.mjs?v=20260912-features1";

const TEAM_IMPACT_KEYS = new Set(["AdjEM", "AdjOE", "AdjDE", "eFG", "D_eFG"]);

export function movementRows(board, level = "d1") {
  return (board?.rows || []).map((row, index) => ({
    ...row,
    movementId: `${level}:${index}:${row.player || "player"}:${row.season || "season"}`
  }));
}

export function latestMovementSeason(board) {
  return movementRows(board).map(row => row.season).filter(Boolean).sort().reverse()[0] || "";
}

export function impactColumns(board) {
  const preferred = (board?.columns || []).map((column, index) => ({ ...column, index }))
    .filter(column => TEAM_IMPACT_KEYS.has(column.key));
  if (preferred.length) return preferred;
  return (board?.columns || []).map((column, index) => ({ ...column, index }))
    .filter(column => Number(column.direction) !== 0);
}

// Align shared impact metrics by key. D2 -> D1 boards include D1 MPG and
// success before the five team-impact values, while D1 boards start with the
// team-impact values. Raw array indexes therefore cannot be compared across
// divisions; referenceIndex/candidateIndex keep the units correctly aligned.
export function comparisonImpactColumns(referenceBoard, candidateBoard = referenceBoard) {
  const candidateByKey = new Map(impactColumns(candidateBoard).map(column => [column.key, column]));
  return impactColumns(referenceBoard).map(referenceColumn => {
    const candidateColumn = candidateByKey.get(referenceColumn.key);
    if (!candidateColumn) return null;
    return {
      ...referenceColumn,
      referenceIndex: referenceColumn.index,
      candidateIndex: candidateColumn.index
    };
  }).filter(Boolean);
}

export function rankTransferImpactMatches(board, selectedId, options = {}) {
  const level = options.level || "d1";
  const candidateBoard = options.candidateBoard || board;
  const candidateLevel = options.candidateLevel || level;
  const referenceRows = movementRows(board, level);
  const candidateRows = movementRows(candidateBoard, candidateLevel);
  const selected = referenceRows.find(row => row.movementId === selectedId) || referenceRows[0] || null;
  const columns = comparisonImpactColumns(board, candidateBoard);
  const season = options.season || latestMovementSeason(candidateBoard);
  const destination = String(options.destination || "").trim();
  if (!selected || !columns.length) return { selected, columns, season, destination, eligibleCount: 0, results: [] };

  const scales = comparisonScales(columns, referenceRows, candidateRows, board === candidateBoard);
  const tier = String(options.tier || "").trim();
  const candidates = candidateRows.filter(row => row.movementId !== selected.movementId && (!season || row.season === season))
    .filter(row => options.archetype !== "same" || row.archetype === selected.archetype)
    .filter(row => !tier || !row.fromTier || row.fromTier === tier)
    .filter(row => !destination || schoolMatches(row.to, destination))
    .filter(row => !options.states?.size || options.states.has(options.schoolStates?.[row.to] || ""))
    .map(row => compareRows(selected, row, columns, scales))
    .filter(Boolean)
    .sort((left, right) => right.score - left.score || right.impactScore - left.impactScore || String(left.row.player).localeCompare(String(right.row.player)));

  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  return {
    selected,
    columns,
    season,
    destination,
    eligibleCount: candidates.length,
    results: candidates.slice(0, limit).map((result, index) => ({ ...result, rank: index + 1 }))
  };
}

// "Which available transfer would have a similar impact ON MY TEAM as this
// reference transfer actually had?" Unlike rankTransferImpactMatches (which
// compares two REALIZED moves), the candidates here haven't transferred
// anywhere - each one's impact vector is a hypothetical projection of what
// would happen if they joined `destinationTeam`, computed the same way
// Player Fit projects any player onto any team. Reuses compareRows so the
// same normalized-distance scoring and archetype/MPG/route context apply.
export function rankHypotheticalTransferMatches(payload, board, selectedId, destinationTeam, options = {}) {
  const level = options.level || "d1";
  const candidateBoard = options.candidateBoard || board;
  const candidateLevel = options.candidateLevel || level;
  const referenceRows = movementRows(board, level);
  const scaleCandidateRows = movementRows(candidateBoard, candidateLevel);
  const selected = referenceRows.find(row => row.movementId === selectedId) || referenceRows[0] || null;
  const columns = comparisonImpactColumns(board, candidateBoard);
  const teamName = String(destinationTeam || "").trim();
  if (!selected || !columns.length || !teamName) {
    return { selected, columns, teamName, destinationTier: null, eligibleCount: 0, results: [] };
  }

  const scales = comparisonScales(columns, referenceRows, scaleCandidateRows, board === candidateBoard);
  const candidateSeason = String(options.candidateSeason || "2025-26");
  const destinationTier = teamTierLookup(payload, teamName, candidateSeason);
  const tier = String(options.tier || "").trim();
  const pool = (payload.players || []).filter(player => player.season === candidateSeason
    && player.model === candidateLevel
    && !sameTeamName(player, teamName)
    && (!options.states?.size || options.states.has(player.schoolState || ""))
    && (options.archetype !== "same" || player.archetype === selected.archetype)
    && (!tier || player.model !== "d1" || player.tier === tier));

  // Season-level pieces (percentile distributions, tier lookups, the
  // impact-candidate index) are identical for every candidate in this pool -
  // build them once rather than once per player, or a pool of a few thousand
  // turns into tens of millions of redundant comparisons.
  const context = buildTeamImpactContext(payload, candidateSeason);
  const candidates = pool.map(player => {
    const projection = projectPlayerImpactWithContext(context, payload, player, teamName);
    if (!projection) return null;
    const values = [];
    columns.forEach(column => {
      const definition = projection.definitions.find(entry => entry.key === column.key);
      if (!definition) return;
      const current = Number(projection.currentMetrics?.[definition.index]);
      const projected = Number(projection.projectedMetrics?.[definition.index]);
      if (Number.isFinite(current) && Number.isFinite(projected)) values[column.candidateIndex] = projected - current;
    });
    const syntheticRow = {
      player: player.name,
      playerId: player.id,
      from: player.statsTeam || player.team,
      to: teamName,
      season: player.season,
      archetype: player.archetype,
      class: player.classShort || player.class || null,
      height: player.height ?? null,
      mpg: Number(player.stats?.MPG),
      fromTier: player.model === "d1" ? (player.tier || null) : "D2",
      toTier: destinationTier,
      values
    };
    const comparison = compareRows(selected, syntheticRow, columns, scales);
    return comparison ? { ...comparison, projectedAdjEmGain: projection.adjEmGain, hypotheticalFit: projection.fit } : null;
  }).filter(Boolean)
    .sort((left, right) => right.score - left.score || right.impactScore - left.impactScore || String(left.row.player).localeCompare(String(right.row.player)));

  const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
  return {
    selected,
    columns,
    teamName,
    destinationTier,
    eligibleCount: candidates.length,
    results: candidates.slice(0, limit).map((result, index) => ({ ...result, rank: index + 1 }))
  };
}

function canonicalTeam(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, "");
}

function sameTeamName(player, teamName) {
  const target = canonicalTeam(teamName);
  return [player.team, player.statsTeam].filter(Boolean).some(name => canonicalTeam(name) === target);
}

function teamTierLookup(payload, teamName, season) {
  const target = canonicalTeam(teamName);
  const direct = Object.entries(payload.teamTiers || {}).find(([name]) => canonicalTeam(name) === target);
  if (direct) return direct[1];
  const match = (payload.players || []).find(player => player.model === "d1" && player.season === season && player.tier
    && [player.team, player.statsTeam].filter(Boolean).some(name => canonicalTeam(name) === target));
  return match?.tier || null;
}

function schoolMatches(team, query) {
  const teamTokens = schoolTokens(team);
  const queryTokens = schoolTokens(query);
  if (!queryTokens.length) return true;
  if (teamTokens.join("") === queryTokens.join("")) return true;
  return queryTokens.every(token => teamTokens.some(teamToken => teamToken.startsWith(token)));
}

function schoolTokens(value) {
  const aliases = { ky: "kentucky", fla: "florida", fl: "florida", oh: "ohio", cal: "california", univ: "university" };
  return String(value || "").toLowerCase().replace(/&/g, " and ").match(/[a-z0-9]+/g)?.map(token => aliases[token] || token) || [];
}

function compareRows(selected, candidate, columns, scales) {
  const metricMatches = columns.map((column, index) => {
    const reference = Number(selected.values?.[column.referenceIndex]);
    const value = Number(candidate.values?.[column.candidateIndex]);
    if (!Number.isFinite(reference) || !Number.isFinite(value)) return null;
    const normalizedDifference = Math.abs(reference - value) / scales[index];
    return {
      key: column.key,
      label: column.label,
      format: column.format,
      direction: column.direction,
      reference,
      value,
      difference: value - reference,
      normalizedDifference,
      similarity: 100 * Math.exp(-0.5 * normalizedDifference)
    };
  }).filter(Boolean);
  if (metricMatches.length < Math.min(3, columns.length)) return null;

  const rootMeanSquareDistance = Math.sqrt(metricMatches.reduce((sum, metric) => {
    return sum + (metric.normalizedDifference ** 2);
  }, 0) / metricMatches.length);
  const impactScore = 100 * Math.exp(-0.5 * rootMeanSquareDistance);
  const archetypeScore = selected.archetype === candidate.archetype ? 100 : 52;
  const mpgDifference = Math.abs(Number(selected.mpg) - Number(candidate.mpg));
  const mpgScore = Number.isFinite(mpgDifference) ? 100 * Math.exp(-mpgDifference / 12) : 50;
  const routeScore = transferRouteScore(selected, candidate);
  const contextScore = 0.5 * archetypeScore + 0.3 * mpgScore + 0.2 * routeScore;
  return {
    row: candidate,
    impactScore,
    contextScore,
    score: 0.9 * impactScore + 0.1 * contextScore,
    metricMatches
  };
}

function comparisonScales(columns, referenceRows, candidateRows, sameBoard) {
  return columns.map(column => {
    const referenceValues = referenceRows.map(row => Number(row.values?.[column.referenceIndex])).filter(Number.isFinite);
    const candidateValues = sameBoard
      ? []
      : candidateRows.map(row => Number(row.values?.[column.candidateIndex])).filter(Number.isFinite);
    return robustScale([...referenceValues, ...candidateValues]);
  });
}

function transferRouteScore(selected, candidate) {
  if (!selected.fromTier || !selected.toTier || !candidate.fromTier || !candidate.toTier) return 50;
  if (selected.fromTier === candidate.fromTier && selected.toTier === candidate.toTier) return 100;
  if (selected.toTier === candidate.toTier) return 76;
  if (selected.fromTier === candidate.fromTier) return 62;
  return 35;
}

function robustScale(values) {
  if (!values.length) return 1;
  const middle = median(values);
  const deviation = median(values.map(value => Math.abs(value - middle))) * 1.4826;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const standardDeviation = Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
  if (Number.isFinite(deviation) && deviation > Math.max(0.001, standardDeviation * 0.15)) return deviation;
  return Math.max(standardDeviation, 0.001);
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}
