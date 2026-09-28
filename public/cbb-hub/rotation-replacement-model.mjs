import { findSimilar } from "./comparison-model.js?v=20260915-replacement1";
import { buildTeamImpactContext, projectPlayerImpactWithContext } from "./snapshot-team-fit-model.mjs?v=20260912-features1";

const TIER_LEVEL = { "Low Major": 1, "Mid-Major": 2, "High Major": 3 };

export function buildRotationLossProfile(player) {
  const stats = player?.stats || {};
  const advanced = player?.projectionStats?.advanced || {};
  const zones = Object.fromEntries((player?.pbp?.zones || []).map(zone => [zone.key, zone]));
  const totalAttempts = Object.values(zones).reduce((sum, zone) => sum + number(zone?.fgaG), 0);
  const rimAttempts = number(zones.atr2?.fgaG);
  const threeAttempts = number(zones.atb3?.fgaG) + number(zones.c3?.fgaG);
  const usage = nullable(advanced["USG%"]);
  const shootingGravity = clamp(
    0.42 * number(player?.verspi?.e, 50)
      + 0.28 * number(player?.verspi?.v, 50)
      + 0.18 * pctScore(stats["3P%"], 0.18, 0.46)
      + 0.12 * clamp(threeAttempts / 7 * 100, 0, 100),
    0,
    100
  );
  const rimPressure = clamp(
    0.55 * clamp(totalAttempts ? rimAttempts / totalAttempts * 170 : 0, 0, 100)
      + 0.45 * clamp(rimAttempts / 5 * 100, 0, 100),
    0,
    100
  );
  return {
    minutes: nullable(stats.MPG),
    usage: usage === null ? null : usage * 100,
    shootingGravity,
    rimPressure,
    playmaking: nullable(player?.verspi?.p),
    rebounding: nullable(player?.verspi?.r),
    defensiveEvents: nullable(player?.verspi?.d),
    height: nullable(player?.height),
    position: player?.posTier || "--"
  };
}

export function rankRotationReplacements(payload, similarityIndex, departing, destinationTeam, options = {}) {
  if (!payload || !similarityIndex || !departing || !destinationTeam) {
    return { loss: null, destinationTeam, destinationTier: null, eligibleCount: 0, results: [] };
  }
  const season = String(options.season || departing.season || "2025-26");
  const levels = new Set(options.levels || ["d1", "d2"]);
  const destinationTier = teamTier(payload, destinationTeam, season);
  const loss = buildRotationLossProfile(departing);
  const impactContext = buildTeamImpactContext(payload, season);
  const similarity = findSimilar(similarityIndex, departing.id, {
    method: "two-stage",
    pool: "all",
    season: "all",
    limit: payload.players.length
  });

  const candidates = similarity.results
    .filter(match => match.player.season === season)
    .filter(match => levels.has(match.player.model))
    .filter(match => !sameTeam(match.player, destinationTeam))
    .filter(match => Number(match.player.stats?.MPG) >= (Number(options.minimumMinutes) || 0));

  const results = candidates.map(match => {
    const player = match.player;
    const projection = projectPlayerImpactWithContext(impactContext, payload, player, destinationTeam);
    if (!projection) return null;
    const sizeAndPosition = sizePositionScore(departing, player);
    const roleSimilarity = clamp(match.score * 0.84 + sizeAndPosition * 0.16, 0, 100);
    const expectedTranslation = translationScore(player);
    const teamNeed = clamp(projection.opportunity, 0, 100);
    const opportunity = opportunityScore(departing, player);
    const conferenceAdjustment = conferenceScore(player, destinationTier);
    const projectedTeamImpact = clamp(
      projection.fit * 0.72 + clamp(50 + projection.adjEmGain * 9, 0, 100) * 0.28,
      0,
      100
    );
    const replacementScore = weightedScore({
      roleSimilarity,
      expectedTranslation,
      teamNeed,
      opportunity,
      conferenceAdjustment,
      projectedTeamImpact
    });
    return {
      player,
      replacementScore,
      roleSimilarity,
      expectedTranslation,
      teamNeed,
      opportunity,
      conferenceAdjustment,
      projectedTeamImpact,
      sizeAndPosition,
      adjEmGain: projection.adjEmGain,
      offenseChange: projection.offenseChange,
      defenseChange: projection.defenseChange,
      projectedRank: projection.projectedRank,
      bestNeed: projection.bestNeed,
      impactConfidence: player.teamImpact?.confidence || (player.model === "d2" ? player.projection?.confidence : "--"),
      similarityMethod: match.score
    };
  }).filter(Boolean)
    .sort((left, right) => right.replacementScore - left.replacementScore || right.projectedTeamImpact - left.projectedTeamImpact);

  return {
    loss,
    season,
    destinationTeam,
    destinationTier,
    eligibleCount: results.length,
    weights: replacementWeights(),
    results: results.map((result, index) => ({ ...result, modelRank: index + 1 }))
  };
}

export function replacementWeights() {
  return {
    roleSimilarity: 0.32,
    expectedTranslation: 0.16,
    teamNeed: 0.14,
    opportunity: 0.10,
    conferenceAdjustment: 0.10,
    projectedTeamImpact: 0.18
  };
}

function weightedScore(scores) {
  const weights = replacementWeights();
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + number(scores[key], 50) * weight, 0);
}

function translationScore(player) {
  const impactSimilarity = nullable(player.teamImpact?.similarity);
  const impactConfidence = { High: 92, Medium: 76, Low: 58 }[player.teamImpact?.confidence] || 64;
  if (player.model === "d2") {
    const success = nullable(player.projection?.score) ?? 50;
    return clamp(success * 0.64 + (impactSimilarity ?? 60) * 0.22 + impactConfidence * 0.14, 0, 100);
  }
  return clamp((impactSimilarity ?? 72) * 0.58 + impactConfidence * 0.27 + (nullable(player.projection?.score) ?? 74) * 0.15, 0, 100);
}

function opportunityScore(departing, candidate) {
  const departingMinutes = nullable(departing.stats?.MPG) ?? 24;
  const candidateMinutes = nullable(candidate.stats?.MPG) ?? 0;
  const minutesMatch = clamp(100 - Math.abs(departingMinutes - candidateMinutes) * 3, 0, 100);
  const roleReadiness = clamp(candidateMinutes / Math.max(12, departingMinutes) * 100, 0, 100);
  return minutesMatch * 0.65 + roleReadiness * 0.35;
}

function conferenceScore(player, destinationTier) {
  const destination = TIER_LEVEL[destinationTier] || 2;
  const source = player.model === "d2" ? 0 : (TIER_LEVEL[player.tier] || 2);
  const jump = destination - source;
  const base = jump > 0 ? 100 - jump * 17 : 100 + Math.abs(jump) * 2;
  const d2Evidence = player.model === "d2" ? ((nullable(player.projection?.score) ?? 50) - 50) * 0.34 : 0;
  return clamp(base + d2Evidence, 35, 100);
}

function sizePositionScore(left, right) {
  const leftHeight = nullable(left.height);
  const rightHeight = nullable(right.height);
  const heightScore = leftHeight === null || rightHeight === null ? 60 : 100 * Math.exp(-Math.abs(leftHeight - rightHeight) / 3.5);
  const positionScore = left.posTier && right.posTier
    ? left.posTier === right.posTier ? 100 : overlappingPosition(left.posTier, right.posTier) ? 68 : 36
    : 55;
  return heightScore * 0.62 + positionScore * 0.38;
}

function overlappingPosition(left, right) {
  const tokens = value => String(value).toLowerCase().match(/[a-z]+/g) || [];
  const leftTokens = new Set(tokens(left));
  return tokens(right).some(token => leftTokens.has(token));
}

function teamTier(payload, teamName, season) {
  const target = canonical(teamName);
  const direct = Object.entries(payload.teamTiers || {}).find(([team]) => canonical(team) === target);
  if (direct) return direct[1];
  return payload.players.find(player => player.model === "d1" && player.season === season && player.tier && sameTeam(player, teamName))?.tier || "Unclassified";
}

function sameTeam(player, teamName) {
  const target = canonical(teamName);
  return [player.team, player.statsTeam].filter(Boolean).some(team => canonical(team) === target);
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, "");
}

function pctScore(value, minimum, maximum) {
  const parsed = nullable(value);
  return parsed === null ? 50 : clamp((parsed - minimum) / (maximum - minimum) * 100, 0, 100);
}

function nullable(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value, fallback = 0) {
  return nullable(value) ?? fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}
