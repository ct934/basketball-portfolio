import { loadHubData, setupAuth, setupStateMultiSelect, showAppWhenAuthed, bindSortHeaders, sortHeader, sortRows } from "/cbb-hub/core.js?v=20260928-nbablend1";
import { buildValidationRecords, runWalkForwardValidation, buildNbaHitMissRecords, buildD2D1HitMissRecords } from "/cbb-hub/model-validation-model.mjs?v=20260922-states1";

const MODEL_LABELS = {
  model: "Walk-forward ridge model",
  scoring: "D2 scoring average alone",
  warp: "D2 WARP/40 alone",
  minutes: "Previous-season minutes alone",
  constant: "Same projection for every transfer",
  archetype: "Archetype average"
};
const TARGET_LABELS = { minutes: "D1 MPG", efficiency: "Efficiency index", impact: "Impact score" };
const COLORS = { High: "#0f9f72", Medium: "#2563eb", Low: "#d97706" };

let user = null;
let payload = null;
let validation = null;
let nbaHitMiss = [];
let d2d1HitMiss = [];
let started = false;
let loading = false;
const state = { target: "minutes", chartModel: "model", errorMetric: "mae", breakdown: "archetype", hitMissBoard: "d2d1" };
const hitMissStates = new Set();
const nbaFilters = { search: "", archetype: "", verdict: "" };
const nbaSort = { sortKey: "expected", sortDir: "desc" };
const d2d1Filters = { search: "", archetype: "", verdict: "" };
const d2d1Sort = { sortKey: "expected", sortDir: "desc" };

const els = {
  status: document.getElementById("validationStatus"),
  summary: document.getElementById("validationSummary"),
  target: document.getElementById("validationTarget"),
  chartModel: document.getElementById("validationChartModel"),
  chartNote: document.getElementById("validationChartNote"),
  scatter: document.getElementById("validationScatter"),
  confidence: document.getElementById("validationConfidence"),
  errorMetric: document.getElementById("validationErrorMetric"),
  baselines: document.getElementById("validationBaselines"),
  folds: document.getElementById("validationFolds"),
  breakdown: document.getElementById("validationBreakdown"),
  breakdownTable: document.getElementById("validationBreakdownTable"),
  boardButtons: [...document.querySelectorAll("[data-hitmiss-board]")],
  boardSearch: document.getElementById("hitMissSearch"),
  boardArchetype: document.getElementById("hitMissArchetype"),
  boardVerdict: document.getElementById("hitMissVerdict"),
  boardState: document.getElementById("hitMissState"),
  boardCount: document.getElementById("hitMissCount"),
  boardTable: document.getElementById("hitMissTable"),
  boardNote: document.getElementById("hitMissNote")
};

setupAuth().then(start);
window.addEventListener("hub-auth", event => start(event.detail));

async function start(currentUser) {
  user = currentUser;
  showAppWhenAuthed(user);
  if (!user || validation || loading) return;
  loading = true;
  els.status.textContent = "Loading historical D2→D1 outcomes...";
  try {
    const [hubPayload, source, nbaSource] = await Promise.all([loadHubData(), loadHistoricalSource(), loadNbaSource()]);
    payload = hubPayload;
    const records = buildValidationRecords(source, payload);
    validation = runWalkForwardValidation(records);
    d2d1HitMiss = buildD2D1HitMissRecords(source, payload);
    nbaHitMiss = buildNbaHitMissRecords(nbaSource);
    hydrateControls();
    setupStateMultiSelect(els.boardState, payload.states, hitMissStates, renderHitMissBoard, { label: "School state" });
    bindControls();
    render();
    started = true;
  } catch (error) {
    console.error("[model validation] Could not build backtest:", error);
    els.status.textContent = "Validation data could not be loaded.";
    els.status.classList.add("error");
  } finally {
    loading = false;
  }
}

async function loadNbaSource() {
  const response = await fetch("/college-nba-translation.html?v=20260928-nbablend1", { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load D1→NBA source");
  const source = await response.text();
  const marker = '<script id="DATA" type="application/json">';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error("D1→NBA source does not contain a DATA script tag");
  const contentStart = start + marker.length;
  const end = source.indexOf("</script>", contentStart);
  if (end < 0) throw new Error("D1→NBA DATA script tag is not closed");
  return JSON.parse(source.slice(contentStart, end));
}

async function loadHistoricalSource() {
  const response = await fetch("/archetype-translation.html?v=20260915-validation1", { cache: "no-cache" });
  if (!response.ok) throw new Error("Could not load historical D2→D1 source");
  const source = await response.text();
  const marker = "var DATA = ";
  const markerIndex = source.indexOf(marker);
  if (markerIndex < 0) throw new Error("Historical source does not contain DATA");
  const start = source.indexOf("{", markerIndex + marker.length);
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < source.length; index++) {
    const character = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === "{") depth++;
    else if (character === "}") {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(start, index + 1));
    }
  }
  throw new Error("Historical DATA object is incomplete");
}

function hydrateControls() {
  els.chartModel.innerHTML = validation.modelKeys.map(key => `<option value="${key}">${escapeHtml(MODEL_LABELS[key])}</option>`).join("");
  hydrateBoardFilters();
}

function bindControls() {
  if (started) return;
  els.target.onchange = event => { state.target = event.target.value; renderScatter(); };
  els.chartModel.onchange = event => { state.chartModel = event.target.value; renderScatter(); };
  els.errorMetric.onchange = event => { state.errorMetric = event.target.value; renderTables(); };
  els.breakdown.onchange = event => { state.breakdown = event.target.value; renderBreakdown(); };
  els.boardButtons.forEach(button => button.onclick = () => selectHitMissBoard(button.dataset.hitmissBoard));
  els.boardSearch.oninput = event => { activeBoardFilters().search = event.target.value.trim().toLowerCase(); renderHitMissBoard(); };
  els.boardArchetype.onchange = event => { activeBoardFilters().archetype = event.target.value; renderHitMissBoard(); };
  els.boardVerdict.onchange = event => { activeBoardFilters().verdict = event.target.value; renderHitMissBoard(); };
}

function render() {
  const core = validation.overall.model;
  const testedSeasons = validation.folds.map(fold => fold.testSeason);
  els.status.textContent = `${core.n.toLocaleString()} untouched predictions · ${testedSeasons[0]}–${testedSeasons.at(-1)}`;
  els.summary.innerHTML = [
    summaryCard("Test transfers", core.n.toLocaleString(), `${validation.folds.length} next-season folds`),
    summaryCard("Minutes MAE", core.metrics.minutes.mae.toFixed(2), "D1 MPG"),
    summaryCard("Efficiency MAE", core.metrics.efficiency.mae.toFixed(2), "percentage-point index"),
    summaryCard("Impact MAE", core.metrics.impact.mae.toFixed(2), "0–100 success score"),
    summaryCard("Rotation hit rate", `${core.rotationHitRate.toFixed(1)}%`, `Precision ${core.rotationPrecision.toFixed(1)}% · Recall ${core.rotationRecall.toFixed(1)}%`)
  ].join("");
  renderScatter();
  renderConfidence();
  renderTables();
  renderHitMissBoard();
}

function activeBoardRows() { return state.hitMissBoard === "nba" ? nbaHitMiss : d2d1HitMiss; }
function activeBoardFilters() { return state.hitMissBoard === "nba" ? nbaFilters : d2d1Filters; }

function hydrateBoardFilters() {
  const rows = activeBoardRows();
  const filters = activeBoardFilters();
  const archetypes = [...new Set(rows.map(record => record.archetype))].sort();
  const verdictOrder = ["Exceeded", "Met", "Fell short"];
  const verdicts = verdictOrder.filter(verdict => rows.some(record => record.verdict === verdict));
  els.boardArchetype.innerHTML = `<option value="">All archetypes</option>${archetypes.map(value => `<option${value === filters.archetype ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  els.boardVerdict.innerHTML = `<option value="">All verdicts</option>${verdicts.map(value => `<option${value === filters.verdict ? " selected" : ""}>${escapeHtml(value)}</option>`).join("")}`;
  els.boardSearch.value = filters.search;
  els.boardSearch.placeholder = state.hitMissBoard === "nba" ? "Player or college..." : "Player name...";
}

function selectHitMissBoard(board) {
  if (board !== "nba" && board !== "d2d1") return;
  state.hitMissBoard = board;
  els.boardButtons.forEach(button => {
    const active = button.dataset.hitmissBoard === board;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  hydrateBoardFilters();
  renderHitMissBoard();
}

function renderHitMissBoard() {
  if (state.hitMissBoard === "nba") renderNbaHitMiss();
  else renderD2D1HitMiss();
}

function summaryCard(label, value, note) {
  return `<article class="builder-card validation-summary-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><small>${escapeHtml(note)}</small></article>`;
}

function renderScatter() {
  const target = state.target;
  const model = state.chartModel;
  const rows = validation.records.map(record => ({
    actual: record.actual[target],
    predicted: record.predictions[target][model],
    confidence: record.confidence,
    name: record.name,
    season: record.testSeason
  })).filter(row => Number.isFinite(row.actual) && Number.isFinite(row.predicted));
  const values = rows.flatMap(row => [row.actual, row.predicted]);
  const rawMin = Math.min(...values), rawMax = Math.max(...values);
  const padding = Math.max(1, (rawMax - rawMin) * 0.08);
  const minimum = Math.max(state.target === "efficiency" ? 20 : 0, rawMin - padding);
  const maximum = rawMax + padding;
  els.chartNote.textContent = `${MODEL_LABELS[model]} · ${TARGET_LABELS[target]} · n=${rows.length}`;
  els.scatter.innerHTML = scatterSvg(rows, minimum, maximum, TARGET_LABELS[target]);
}

function scatterSvg(rows, minimum, maximum, label) {
  const width = 760, height = 420, left = 58, right = 18, top = 18, bottom = 52;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const x = value => left + (value - minimum) / (maximum - minimum || 1) * plotWidth;
  const y = value => top + plotHeight - (value - minimum) / (maximum - minimum || 1) * plotHeight;
  const ticks = Array.from({ length: 6 }, (_, index) => minimum + (maximum - minimum) * index / 5);
  const grid = ticks.map(value => `<line x1="${x(value)}" y1="${top}" x2="${x(value)}" y2="${top + plotHeight}"/><line x1="${left}" y1="${y(value)}" x2="${left + plotWidth}" y2="${y(value)}"/><text x="${x(value)}" y="${height - 28}" text-anchor="middle">${value.toFixed(0)}</text><text x="${left - 10}" y="${y(value) + 4}" text-anchor="end">${value.toFixed(0)}</text>`).join("");
  const points = rows.map(row => `<circle cx="${x(row.actual).toFixed(1)}" cy="${y(row.predicted).toFixed(1)}" r="4" fill="${COLORS[row.confidence]}" fill-opacity=".62"><title>${escapeHtml(row.name)} · ${row.season}\nActual ${row.actual.toFixed(1)} · Predicted ${row.predicted.toFixed(1)} · ${row.confidence} confidence</title></circle>`).join("");
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Predicted versus actual ${escapeHtml(label)}">
    <g class="validation-grid">${grid}</g>
    <line class="validation-diagonal" x1="${x(minimum)}" y1="${y(minimum)}" x2="${x(maximum)}" y2="${y(maximum)}"/>
    ${points}
    <text class="validation-axis-label" x="${left + plotWidth / 2}" y="${height - 5}" text-anchor="middle">Actual ${escapeHtml(label)}</text>
    <text class="validation-axis-label" transform="translate(15 ${top + plotHeight / 2}) rotate(-90)" text-anchor="middle">Predicted ${escapeHtml(label)}</text>
  </svg><div class="validation-legend"><span><i style="background:${COLORS.High}"></i>High</span><span><i style="background:${COLORS.Medium}"></i>Medium</span><span><i style="background:${COLORS.Low}"></i>Low confidence</span></div>`;
}

function renderConfidence() {
  els.confidence.innerHTML = `<div class="validation-confidence-grid">${validation.confidence.map(row => `
    <article class="validation-confidence ${row.group.toLowerCase()}">
      <div><span>${escapeHtml(row.group)} confidence</span><strong>n=${row.n}</strong></div>
      <dl><dt>Minutes MAE</dt><dd>${row.metrics.minutes.mae.toFixed(2)}</dd><dt>Efficiency MAE</dt><dd>${row.metrics.efficiency.mae.toFixed(2)}</dd><dt>Impact MAE</dt><dd>${row.metrics.impact.mae.toFixed(2)}</dd><dt>Rotation hit</dt><dd>${row.rotationHitRate.toFixed(1)}%</dd></dl>
    </article>`).join("")}</div>`;
}

function renderTables() {
  renderBaselines();
  renderFolds();
  renderBreakdown();
}

function renderBaselines() {
  const error = state.errorMetric;
  els.baselines.innerHTML = `<div class="fit-table-wrap"><table class="fit-table validation-table"><thead><tr><th>Method</th><th>Minutes ${error.toUpperCase()}</th><th>Efficiency ${error.toUpperCase()}</th><th>Impact ${error.toUpperCase()}</th><th>Rotation hit</th><th>Precision</th><th>Recall</th></tr></thead><tbody>${validation.modelKeys.map(key => {
    const result = validation.overall[key];
    return `<tr class="${key === "model" ? "validation-primary-row" : ""}"><td><strong>${escapeHtml(MODEL_LABELS[key])}</strong>${key === "model" ? `<span class="cell-note">Earlier seasons only</span>` : ""}</td><td>${result.metrics.minutes[error].toFixed(2)}</td><td>${result.metrics.efficiency[error].toFixed(2)}</td><td>${result.metrics.impact[error].toFixed(2)}</td><td>${result.rotationHitRate.toFixed(1)}%</td><td>${result.rotationPrecision.toFixed(1)}%</td><td>${result.rotationRecall.toFixed(1)}%</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderFolds() {
  const error = state.errorMetric;
  els.folds.innerHTML = `<div class="fit-table-wrap"><table class="fit-table validation-table"><thead><tr><th>Test season</th><th>Training seasons</th><th>Train n</th><th>Test n</th><th>Minutes ${error.toUpperCase()}</th><th>Efficiency ${error.toUpperCase()}</th><th>Impact ${error.toUpperCase()}</th><th>Rotation hit</th></tr></thead><tbody>${validation.folds.map(fold => {
    const result = fold.metrics.model;
    return `<tr><td><strong>${fold.testSeason}</strong></td><td>${escapeHtml(fold.trainingSeasons.join(", "))}</td><td>${fold.trainCount}</td><td>${fold.testCount}</td><td>${result.metrics.minutes[error].toFixed(2)}</td><td>${result.metrics.efficiency[error].toFixed(2)}</td><td>${result.metrics.impact[error].toFixed(2)}</td><td>${result.rotationHitRate.toFixed(1)}%</td></tr>`;
  }).join("")}</tbody></table></div>`;
}

function renderBreakdown() {
  const error = state.errorMetric;
  const rows = validation.breakdowns[state.breakdown] || [];
  els.breakdownTable.innerHTML = `<div class="fit-table-wrap"><table class="fit-table validation-table"><thead><tr><th>Group</th><th>n</th><th>Minutes ${error.toUpperCase()}</th><th>Efficiency ${error.toUpperCase()}</th><th>Impact ${error.toUpperCase()}</th><th>Rotation hit</th><th>Impact bias</th></tr></thead><tbody>${rows.map(row => `<tr class="${row.n < 15 ? "validation-small-sample" : ""}"><td><strong>${escapeHtml(row.group)}</strong>${row.n < 15 ? `<span class="cell-note">Small sample</span>` : ""}</td><td>${row.n}</td><td>${row.metrics.minutes[error].toFixed(2)}</td><td>${row.metrics.efficiency[error].toFixed(2)}</td><td>${row.metrics.impact[error].toFixed(2)}</td><td>${row.rotationHitRate.toFixed(1)}%</td><td class="${Math.abs(row.metrics.impact.bias) < 1 ? "" : row.metrics.impact.bias > 0 ? "negative" : "positive"}">${signed(row.metrics.impact.bias)}</td></tr>`).join("")}</tbody></table></div>`;
}

// --- D1 -> NBA hits & misses ------------------------------------------------
function filteredNbaHitMiss() {
  const filtered = nbaHitMiss.filter(record => {
    if (hitMissStates.size && !hitMissStates.has(payload.schoolStates?.[record.team] || "")) return false;
    if (nbaFilters.archetype && record.archetype !== nbaFilters.archetype) return false;
    if (nbaFilters.verdict && record.verdict !== nbaFilters.verdict) return false;
    if (nbaFilters.search && !`${record.name} ${record.team}`.toLowerCase().includes(nbaFilters.search)) return false;
    return true;
  });
  return sortRows(filtered, nbaSort, nbaSortValue);
}

function nbaSortValue(record, key) {
  if (key === "name") return record.name || "";
  if (key === "archetype") return record.archetype || "";
  if (key === "classYear") return record.classYear || "";
  if (key === "draftPick") return record.drafted ? Number(record.draftPick) : 61;
  if (key === "expected") return Number(record.expected);
  if (key === "actual") return Number(record.actual);
  if (key === "delta") return Number(record.delta);
  if (key === "verdict") return record.verdict || "";
  if (key === "bestBpm") return Number(record.bestBpm);
  if (key === "careerMinutes") return Number(record.careerMinutes);
  return "";
}

function renderNbaHitMiss() {
  const rows = filteredNbaHitMiss();
  els.boardCount.textContent = `D1 → NBA · ${rows.length.toLocaleString()} of ${nbaHitMiss.length.toLocaleString()} players`;
  els.boardTable.innerHTML = `<div class="fit-table-wrap"><table class="fit-table validation-table">
    <thead><tr>${sortHeader("name", "Player", nbaSort)}${sortHeader("archetype", "Archetype", nbaSort)}${sortHeader("classYear", "Class", nbaSort)}${sortHeader("draftPick", "Pick", nbaSort, "numeric", "asc")}${sortHeader("expected", "Expected", nbaSort, "numeric")}${sortHeader("actual", "Actual", nbaSort, "numeric")}${sortHeader("delta", "Δ", nbaSort, "numeric")}${sortHeader("verdict", "Verdict", nbaSort)}${sortHeader("bestBpm", "Best BPM", nbaSort, "numeric")}${sortHeader("careerMinutes", "Career Min", nbaSort, "numeric")}</tr></thead>
    <tbody>${rows.map(record => `<tr>
      <td><strong>${escapeHtml(record.name)}</strong><span class="cell-note">${escapeHtml(record.team)}</span></td>
      <td>${escapeHtml(record.archetype)}</td>
      <td>${escapeHtml(record.classYear)}</td>
      <td>${record.drafted ? `<span class="pill">#${Math.round(record.draftPick)}</span>` : `<span class="pill muted-pill">UDFA</span>`}</td>
      <td>${Math.round(record.expected)}</td>
      <td>${Math.round(record.actual)}</td>
      <td class="${record.delta >= 0 ? "positive" : "negative"}">${signed(record.delta)}</td>
      <td><span class="validation-verdict ${verdictTone(record.verdict)}">${escapeHtml(record.verdict)}</span></td>
      <td>${record.bestBpm == null ? "--" : record.bestBpm.toFixed(1)}</td>
      <td>${record.careerMinutes == null ? "--" : Math.round(record.careerMinutes).toLocaleString()}</td>
    </tr>`).join("") || `<tr><td colspan="10" class="insight-empty">No players match these filters.</td></tr>`}</tbody>
  </table></div>`;
  els.boardNote.textContent = "Expected and Actual are 0–100 percentiles among matched players. Expected uses the college profile before the NBA outcome existed.";
  bindSortHeaders(els.boardTable, nbaSort, renderNbaHitMiss);
}

// --- D2 -> D1 hits & misses --------------------------------------------------
function filteredD2D1HitMiss() {
  const filtered = d2d1HitMiss.filter(record => {
    if (hitMissStates.size && !hitMissStates.has(payload.schoolStates?.[record.team] || "")) return false;
    if (d2d1Filters.archetype && record.archetype !== d2d1Filters.archetype) return false;
    if (d2d1Filters.verdict && record.verdict !== d2d1Filters.verdict) return false;
    if (d2d1Filters.search && !record.name.toLowerCase().includes(d2d1Filters.search)) return false;
    return true;
  });
  return sortRows(filtered, d2d1Sort, d2d1SortValue);
}

function d2d1SortValue(record, key) {
  if (key === "name") return record.name || "";
  if (key === "archetype") return record.archetype || "";
  if (key === "position") return record.position || "";
  if (key === "testSeason") return record.testSeason || "";
  if (key === "expected") return Number(record.expected);
  if (key === "actual") return Number(record.actual);
  if (key === "delta") return Number(record.delta);
  if (key === "verdict") return record.verdict || "";
  return "";
}

function renderD2D1HitMiss() {
  const rows = filteredD2D1HitMiss();
  els.boardCount.textContent = `D2 → D1 · ${rows.length.toLocaleString()} of ${d2d1HitMiss.length.toLocaleString()} players`;
  els.boardTable.innerHTML = `<div class="fit-table-wrap"><table class="fit-table validation-table">
    <thead><tr>${sortHeader("name", "Player", d2d1Sort)}${sortHeader("archetype", "Archetype", d2d1Sort)}${sortHeader("position", "Position", d2d1Sort)}${sortHeader("testSeason", "D1 Season", d2d1Sort)}${sortHeader("expected", "Expected", d2d1Sort, "numeric")}${sortHeader("actual", "Actual", d2d1Sort, "numeric")}${sortHeader("delta", "Δ", d2d1Sort, "numeric")}${sortHeader("verdict", "Verdict", d2d1Sort)}</tr></thead>
    <tbody>${rows.map(record => `<tr>
      <td><strong>${escapeHtml(record.name)}</strong><span class="cell-note">${escapeHtml(record.team)} · ${escapeHtml(record.trainSeason)} → ${escapeHtml(record.testSeason)}</span></td>
      <td>${escapeHtml(record.archetype)}</td>
      <td>${escapeHtml(record.position)}</td>
      <td>${escapeHtml(record.testSeason)}</td>
      <td>${Math.round(record.expected)}</td>
      <td>${Math.round(record.actual)}</td>
      <td class="${record.delta >= 0 ? "positive" : "negative"}">${signed(record.delta)}</td>
      <td><span class="validation-verdict ${verdictTone(record.verdict)}">${escapeHtml(record.verdict)}</span></td>
    </tr>`).join("") || `<tr><td colspan="8" class="insight-empty">No players match these filters.</td></tr>`}</tbody>
  </table></div>`;
  els.boardNote.textContent = "Expected is the player’s pre-transfer D2 percentile profile; Actual is realized D1 success. Exceeded and Fell short mean the result finished at least 10 points above or below expectation; all other results Met expectation.";
  bindSortHeaders(els.boardTable, d2d1Sort, renderD2D1HitMiss);
}

function verdictTone(verdict) {
  const positive = new Set(["Exceeded"]);
  const negative = new Set(["Fell short"]);
  if (positive.has(verdict)) return "verdict-positive";
  if (negative.has(verdict)) return "verdict-negative";
  return "verdict-neutral";
}

function signed(value) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}`; }
function escapeHtml(value) { return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
