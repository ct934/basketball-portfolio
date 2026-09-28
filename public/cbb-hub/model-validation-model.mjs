const STAT_KEYS = ["GP", "MPG", "PTS", "REB", "AST", "STL", "BLK", "TOV", "FG", "3P", "FT"];
const TARGETS = ["minutes", "efficiency", "impact"];
const MODEL_KEYS = ["model", "scoring", "warp", "minutes", "constant", "archetype"];

export function buildValidationRecords(source, payload) {
  const movementRows = payload?.translationInsights?.d2d1?.movementBoard?.rows || [];
  const movementByPlayer = new Map(movementRows.map(row => [`${identity(row.player)}|${row.season}`, row]));
  const tiers = new Map(Object.entries(payload?.teamTiers || {}).map(([team, tier]) => [canonical(team), tier]));
  const scatterBuckets = new Map();
  (source.scatter || []).forEach(point => {
    const key = `${point.arch}|${point.s}`;
    if (!scatterBuckets.has(key)) scatterBuckets.set(key, []);
    scatterBuckets.get(key).push(Number(point.q));
  });
  return (source.players || []).map((player, index) => {
    // NOTE: source.scatter carries no player identifier (name/id) - only
    // {arch, q, s} - so matching it back to a specific player can only be
    // done via the (archetype, success) pair, which is not guaranteed
    // unique. When more than one player shares the exact same archetype and
    // success score, there is no way to tell whose WARP value is whose, so
    // we deliberately leave `warp` null rather than silently attributing one
    // player's WARP/40 to a different player. This affects a real but
    // modest slice of the pool (~15% in a recent export) - the durable fix
    // is for the data export that builds `scatter` to include a player
    // name/id per point.
    const bucketKey = `${player.arch}|${player.success}`;
    const bucket = scatterBuckets.get(bucketKey) || [];
    const warp = bucket.length === 1 ? bucket.shift() : null;
    const movement = movementByPlayer.get(`${identity(player.name)}|${player.d1}`) || null;
    const destinationTier = movement ? tiers.get(canonical(movement.to)) || "Unclassified" : "Unclassified";
    const d2 = player.d2s || [];
    const d1 = player.d1s || [];
    return {
      id: `${index}:${player.name}:${player.d1}`,
      name: player.name,
      trainSeason: player.d2,
      testSeason: player.d1,
      archetype: player.arch || "Unknown",
      position: player.tier || "Unknown",
      height: finite(player.ht),
      heightGroup: heightGroup(player.ht),
      from: movement?.from || "D2",
      to: movement?.to || "D1",
      conferencePath: `D2 → ${destinationTier === "Unclassified" ? "D1" : destinationTier}`,
      warp,
      d2Stats: Object.fromEntries(STAT_KEYS.map((key, statIndex) => [key, finite(d2[statIndex])])),
      verspi: [player.v, player.e, player.p, player.rb, player.s, player.i, player.d].map(finite),
      actual: {
        minutes: finite(d1[1]),
        efficiency: shootingEfficiency(d1[8], d1[9], d1[10]),
        impact: finite(player.success)
      }
    };
  }).filter(record => record.testSeason && TARGETS.every(key => Number.isFinite(record.actual[key])));
}

export function runWalkForwardValidation(records, options = {}) {
  const seasons = [...new Set(records.map(record => record.testSeason))].sort();
  const minimumTrainingSeason = options.minimumTrainingSeason || seasons[0];
  const folds = [];
  const predictions = [];
  seasons.forEach(testSeason => {
    const train = records.filter(record => record.testSeason < testSeason && record.testSeason >= minimumTrainingSeason);
    const test = records.filter(record => record.testSeason === testSeason);
    if (train.length < 40 || !test.length) return;
    const featureContext = buildFeatureContext(train, records);
    const targetModels = Object.fromEntries(TARGETS.map(target => [target, fitTargetModels(train, target, featureContext)]));
    const foldPredictions = test.map(record => predictRecord(record, train, targetModels, featureContext));
    predictions.push(...foldPredictions);
    folds.push({
      testSeason,
      trainingSeasons: [...new Set(train.map(record => record.testSeason))].sort(),
      trainCount: train.length,
      testCount: test.length,
      metrics: summarizePredictions(foldPredictions)
    });
  });
  return {
    records: predictions,
    folds,
    overall: summarizePredictions(predictions),
    confidence: groupedAccuracy(predictions, record => record.confidence, ["High", "Medium", "Low"]),
    breakdowns: {
      archetype: groupedAccuracy(predictions, record => record.archetype),
      position: groupedAccuracy(predictions, record => record.position),
      conferencePath: groupedAccuracy(predictions, record => record.conferencePath),
      heightGroup: groupedAccuracy(predictions, record => record.heightGroup, ["Under 6'3\"", "6'3\"–6'6\"", "6'7\"–6'9\"", "6'10\"+"])
    },
    modelKeys: MODEL_KEYS
  };
}

export function summarizePredictions(records) {
  return Object.fromEntries(MODEL_KEYS.map(model => [model, summarizeModel(records, model)]));
}

// D1 -> NBA hits & misses: exp_val/act_val/out_delta/verdict already come
// pre-computed from college-nba-translation.html's own pipeline (the
// "Expected" value is generated from the college profile only, before NBA
// outcomes existed) - this just reshapes that same board for reuse here.
export function buildNbaHitMissRecords(nbaSource) {
  return (nbaSource.players || [])
    .filter(player => Number.isFinite(player.exp_val) && Number.isFinite(player.act_val))
    .map((player, index) => ({
      id: `nba:${index}:${player.nba_real_name}`,
      name: player.nba_real_name,
      team: player.teamMarket || "--",
      archetype: player.archetype || "Unknown",
      classYear: player["CLASS YR"] || "--",
      drafted: Boolean(player.drafted),
      draftPick: finite(player.draft_pick),
      expected: finite(player.exp_val),
      actual: finite(player.act_val),
      delta: finite(player.out_delta),
      verdict: player.verdict || "--",
      bestBpm: finite(player.nba_best_bpm_q),
      careerMinutes: finite(player.nba_total_min)
    }));
}

// D2 -> D1 hits & misses: this source has no single pre-baked "Expected"
// value the way the NBA board does, but it does carry `cd2` - each player's
// 7-category D2 percentile profile (Volume/Efficiency/Playmaking/Rebounding/
// Security/Impact/Defense) at the time they were still in D2, i.e. before
// the D1 season this predicts. Averaging that gives an "Expected" figure on
// the same 0-100 scale as `success` (the realized D1 outcome), so the two
// are directly comparable. Use the same outcome language and +/-10 point
// tolerance as the D1 -> NBA board so the two paths can be read side by side.
export function buildD2D1HitMissRecords(d2d1Source, payload = null) {
  const movementRows = payload?.translationInsights?.d2d1?.movementBoard?.rows || [];
  const movementByPlayer = new Map(movementRows.map(row => [`${identity(row.player)}|${row.season}`, row]));
  return (d2d1Source.players || [])
    .filter(player => Array.isArray(player.cd2) && player.cd2.length && Number.isFinite(player.success))
    .map((player, index) => {
      const expected = average(player.cd2.map(Number).filter(Number.isFinite));
      const movement = movementByPlayer.get(`${identity(player.name)}|${player.d1}`) || null;
      return {
        id: `d2d1:${index}:${player.name}`,
        name: player.name,
        trainSeason: player.d2,
        testSeason: player.d1,
        archetype: player.arch || "Unknown",
        position: player.tier || "Unknown",
        team: movement?.to || "--",
        expected,
        actual: player.success,
        delta: Number.isFinite(expected) ? player.success - expected : null,
        verdict: translationVerdict(player.success - expected)
      };
    })
    .filter(record => Number.isFinite(record.expected));
}

function translationVerdict(delta) {
  if (delta >= 10) return "Exceeded";
  if (delta <= -10) return "Fell short";
  return "Met";
}

function fitTargetModels(train, target, featureContext) {
  return {
    model: fitRidge(train.map(record => featureVector(record, featureContext)), train.map(record => record.actual[target]), 1.4),
    scoring: fitUnivariate(train, target, record => record.d2Stats.PTS),
    warp: fitUnivariate(train, target, record => record.warp),
    minutes: fitUnivariate(train, target, record => record.d2Stats.MPG),
    constant: { mean: average(train.map(record => record.actual[target])) },
    archetype: groupMeans(train, target, record => record.archetype)
  };
}

function predictRecord(record, train, targetModels, featureContext) {
  const predictions = {};
  TARGETS.forEach(target => {
    const models = targetModels[target];
    predictions[target] = {
      model: clamp(predictRidge(models.model, featureVector(record, featureContext)), targetMinimum(target), targetMaximum(target)),
      scoring: clamp(predictUnivariate(models.scoring, record.d2Stats.PTS), targetMinimum(target), targetMaximum(target)),
      warp: clamp(predictUnivariate(models.warp, record.warp), targetMinimum(target), targetMaximum(target)),
      minutes: clamp(predictUnivariate(models.minutes, record.d2Stats.MPG), targetMinimum(target), targetMaximum(target)),
      constant: models.constant.mean,
      archetype: models.archetype.byGroup.get(record.archetype) ?? models.archetype.overall
    };
  });
  return {
    ...record,
    predictions,
    confidence: confidenceLevel(record, train, featureContext)
  };
}

function buildFeatureContext(train, allRecords) {
  const archetypes = [...new Set(allRecords.map(record => record.archetype))].sort();
  const positions = [...new Set(allRecords.map(record => record.position))].sort();
  const conferencePaths = [...new Set(allRecords.map(record => record.conferencePath))].sort();
  const numeric = train.map(rawNumericFeatures);
  const means = numeric[0].map((_, index) => average(numeric.map(row => row[index]).filter(Number.isFinite)) ?? 0);
  const sds = means.map((mean, index) => standardDeviation(numeric.map(row => row[index]).filter(Number.isFinite), mean) || 1);
  return { archetypes, positions, conferencePaths, means, sds };
}

function rawNumericFeatures(record) {
  return [
    ...STAT_KEYS.map(key => record.d2Stats[key]),
    record.warp,
    record.height
  ];
}

function featureVector(record, context) {
  const numeric = rawNumericFeatures(record).map((value, index) => ((Number.isFinite(value) ? value : context.means[index]) - context.means[index]) / context.sds[index]);
  const archetype = context.archetypes.map(value => value === record.archetype ? 1 : 0);
  const position = context.positions.map(value => value === record.position ? 1 : 0);
  const conferencePath = context.conferencePaths.map(value => value === record.conferencePath ? 1 : 0);
  return [...numeric, ...archetype, ...position, ...conferencePath];
}

function confidenceLevel(record, train, context) {
  const vector = featureVector(record, context).slice(0, context.means.length);
  const distances = train.map(candidate => {
    const candidateVector = featureVector(candidate, context).slice(0, context.means.length);
    return Math.sqrt(average(vector.map((value, index) => (value - candidateVector[index]) ** 2)) || 0);
  }).sort((left, right) => left - right).slice(0, 12);
  const similarity = Math.exp(-(average(distances) || 2) / 2.2);
  const games = clamp((record.d2Stats.GP || 0) / 30, 0, 1);
  const minutes = clamp((record.d2Stats.MPG || 0) / 30, 0, 1);
  const evidence = similarity * 0.55 + games * 0.2 + minutes * 0.25;
  return evidence >= 0.82 ? "High" : evidence >= 0.70 ? "Medium" : "Low";
}

function summarizeModel(records, model) {
  const valid = records.filter(record => TARGETS.every(target => Number.isFinite(record.predictions?.[target]?.[model])));
  const metrics = {};
  TARGETS.forEach(target => {
    const errors = valid.map(record => record.predictions[target][model] - record.actual[target]);
    metrics[target] = {
      mae: average(errors.map(Math.abs)) ?? 0,
      rmse: Math.sqrt(average(errors.map(error => error ** 2)) ?? 0),
      bias: average(errors) ?? 0
    };
  });
  const rotation = valid.map(record => ({ predicted: record.predictions.minutes[model] >= 18, actual: record.actual.minutes >= 18 }));
  const correct = rotation.filter(row => row.predicted === row.actual).length;
  const truePositive = rotation.filter(row => row.predicted && row.actual).length;
  const predictedPositive = rotation.filter(row => row.predicted).length;
  const actualPositive = rotation.filter(row => row.actual).length;
  return {
    n: valid.length,
    metrics,
    rotationHitRate: valid.length ? correct / valid.length * 100 : 0,
    rotationPrecision: predictedPositive ? truePositive / predictedPositive * 100 : 0,
    rotationRecall: actualPositive ? truePositive / actualPositive * 100 : 0
  };
}

function groupedAccuracy(records, groupFor, order = []) {
  const groups = new Map();
  records.forEach(record => {
    const group = groupFor(record) || "Unknown";
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(record);
  });
  const rows = [...groups].map(([group, groupRecords]) => ({ group, ...summarizeModel(groupRecords, "model") }));
  return rows.sort((left, right) => {
    const leftOrder = order.indexOf(left.group), rightOrder = order.indexOf(right.group);
    if (leftOrder >= 0 || rightOrder >= 0) return (leftOrder < 0 ? 999 : leftOrder) - (rightOrder < 0 ? 999 : rightOrder);
    return right.n - left.n || left.group.localeCompare(right.group);
  });
}

function fitUnivariate(records, target, valueFor) {
  const rows = records.map(record => [finite(valueFor(record)), record.actual[target]]).filter(([value, outcome]) => Number.isFinite(value) && Number.isFinite(outcome));
  const meanX = average(rows.map(row => row[0])) ?? 0;
  const meanY = average(rows.map(row => row[1])) ?? 0;
  const denominator = rows.reduce((sum, row) => sum + (row[0] - meanX) ** 2, 0);
  const slope = denominator ? rows.reduce((sum, row) => sum + (row[0] - meanX) * (row[1] - meanY), 0) / denominator : 0;
  return { meanX, meanY, slope };
}

function predictUnivariate(model, value) {
  return Number.isFinite(value) ? model.meanY + model.slope * (value - model.meanX) : model.meanY;
}

function groupMeans(records, target, groupFor) {
  const grouped = new Map();
  records.forEach(record => {
    const group = groupFor(record);
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group).push(record.actual[target]);
  });
  return {
    overall: average(records.map(record => record.actual[target])) ?? 0,
    byGroup: new Map([...grouped].map(([group, values]) => [group, average(values) ?? 0]))
  };
}

function fitRidge(features, outcomes, lambda) {
  const width = (features[0]?.length || 0) + 1;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0));
  const vector = Array(width).fill(0);
  features.forEach((featuresRow, rowIndex) => {
    const row = [1, ...featuresRow];
    row.forEach((left, leftIndex) => {
      vector[leftIndex] += left * outcomes[rowIndex];
      row.forEach((right, rightIndex) => { matrix[leftIndex][rightIndex] += left * right; });
    });
  });
  for (let index = 1; index < width; index++) matrix[index][index] += lambda;
  return { coefficients: solveLinearSystem(matrix, vector) || Array(width).fill(0) };
}

function predictRidge(model, features) {
  return [1, ...features].reduce((sum, value, index) => sum + value * model.coefficients[index], 0);
}

function solveLinearSystem(matrix, vector) {
  const size = matrix.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    if (Math.abs(augmented[pivot][column]) < 1e-10) return null;
    [augmented[column], augmented[pivot]] = [augmented[pivot], augmented[column]];
    const divisor = augmented[column][column];
    for (let index = column; index <= size; index++) augmented[column][index] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let index = column; index <= size; index++) augmented[row][index] -= factor * augmented[column][index];
    }
  }
  return augmented.map(row => row[size]);
}

function shootingEfficiency(fg, three, ft) {
  const values = [[finite(fg), 0.55], [finite(three), 0.30], [finite(ft), 0.15]].filter(([value]) => Number.isFinite(value));
  const weight = values.reduce((sum, row) => sum + row[1], 0);
  return weight ? values.reduce((sum, row) => sum + row[0] * row[1], 0) / weight * 100 : null;
}

function heightGroup(value) {
  const height = Number(value);
  if (!Number.isFinite(height)) return "Unknown";
  if (height < 75) return "Under 6'3\"";
  if (height < 79) return "6'3\"–6'6\"";
  if (height < 82) return "6'7\"–6'9\"";
  return "6'10\"+";
}

function targetMinimum(target) { return target === "efficiency" ? 20 : 0; }
function targetMaximum(target) { return target === "minutes" ? 40.5 : target === "efficiency" ? 80 : 100; }
function identity(value) { return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z0-9]+/g, ""); }
function canonical(value) { return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, ""); }
function finite(value) { const number = Number(value); return value === null || value === undefined || value === "" || !Number.isFinite(number) ? null : number; }
function average(values) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null; }
function standardDeviation(values, mean) { return values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : 0; }
function clamp(value, minimum, maximum) { return Math.max(minimum, Math.min(maximum, value)); }
