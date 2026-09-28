import {
  CATS,
  STAT_COLS,
  bindSortHeaders,
  fmt,
  loadHubData,
  playerUrl,
  setupAuth,
  showNotice,
  showAppWhenAuthed,
  sortHeader,
  sortRows,
  statCell
} from "/cbb-hub/core.js?v=20260928-nbablend1";

// Maps the "Sort teams" dropdown's existing option values to the raw
// analysis field each one actually sorts by, so the dropdown and the new
// click-to-sort column headers below share one underlying state.
const SORT_DROPDOWN_MAP = { fit: "fit", gain: "adjEmGain", need: "opportunity", rank: "projectedRank", quality: "currentAdjEm" };
const SORT_DROPDOWN_REVERSE = Object.fromEntries(Object.entries(SORT_DROPDOWN_MAP).map(([k, v]) => [v, k]));

const CATEGORY_METRICS = {
  v: ["FTRate", "FG3Rate"],
  e: ["AdjOE", "eFG", "FG3Pct", "FG2Pct", "FTPct"],
  r: ["ORPct", "D_ORPct"],
  s: ["TOPct", "NSTRate", "D_TOPct", "OppStlRate"],
  p: ["ARate"],
  i: ["AdjEM", "AdjOE", "AdjDE"],
  d: ["AdjDE", "D_eFG", "D_TOPct", "D_ORPct", "D_FTRate", "OppFG3Pct", "OppFG2Pct", "BlockPct", "StlRate"]
};

let user = null;
let payload = null;
let projectionModel = null;
let metricDefs = [];
let teamRows = [];
let seasonMetricValues = new Map();
let currentPlayers = [];
let playerById = new Map();
let teamTierBySeason = new Map();
let latestTeamTier = new Map();
let definedTeamTiers = new Map();
let visiblePlayers = [];
let activePlayerIndex = -1;
let started = false;
let exportInProgress = false;

const state = {
  playerLevel: "d1",
  playerId: "",
  season: "2025-26",
  teamSearch: "",
  tier: "",
  sortKey: "fit",
  sortDir: "desc",
  excludeCurrent: true,
  expandedTeam: ""
};

const els = {
  levels: document.getElementById("fitPlayerLevel"),
  playerSearch: document.getElementById("fitPlayerSearch"),
  playerOptions: document.getElementById("fitPlayerOptions"),
  season: document.getElementById("fitSeason"),
  teamSearch: document.getElementById("fitTeamSearch"),
  tier: document.getElementById("fitTier"),
  sort: document.getElementById("fitSort"),
  excludeCurrent: document.getElementById("fitExcludeCurrent"),
  playerSummary: document.getElementById("fitPlayerSummary"),
  resultCount: document.getElementById("fitResultCount"),
  results: document.getElementById("fitResults"),
  exportButton: document.getElementById("exportPlayerFit")
};

setupAuth().then(start);
window.addEventListener("hub-auth", event => start(event.detail));

async function start(currentUser) {
  user = currentUser;
  showAppWhenAuthed(user);
  if (!user) return;
  if (!payload) {
    payload = await loadHubData();
    indexData();
  }
  if (!started) {
    hydrateControls();
    bindControls();
    started = true;
  }
  render();
}

function indexData() {
  projectionModel = payload.teamProjectionModel || { defs: [], teams: [], caps: [] };
  metricDefs = projectionModel.defs.map((definition, index) => ({
    key: definition[0],
    label: definition[1],
    group: definition[2],
    direction: Number(definition[3]),
    format: definition[4],
    index
  }));
  teamRows = projectionModel.teams.map(row => ({ team: row.t, season: row.s, metrics: row.m }));
  currentPlayers = payload.players.filter(player => player.season === "2025-26" && player.teamImpact);
  playerById = new Map(currentPlayers.map(player => [player.id, player]));
  definedTeamTiers = new Map(Object.entries(payload.teamTiers || {}).map(([team, tier]) => [canonical(team), tier]));

  for (const season of payload.seasons) {
    const rows = teamRows.filter(row => row.season === season);
    metricDefs.forEach(definition => {
      const values = rows
        .map(row => row.metrics[definition.index])
        .filter(value => value !== null && value !== undefined && Number.isFinite(Number(value)))
        .map(Number)
        .sort((a, b) => a - b);
      seasonMetricValues.set(`${season}\u0000${definition.key}`, values);
    });
  }

  payload.players
    .filter(player => player.model === "d1" && player.tier)
    .sort((a, b) => a.season.localeCompare(b.season))
    .forEach(player => {
      [player.team, player.statsTeam].filter(Boolean).forEach(team => {
        const key = canonical(team);
        teamTierBySeason.set(`${player.season}\u0000${key}`, player.tier);
        latestTeamTier.set(key, player.tier);
      });
    });
}

function hydrateControls() {
  els.season.innerHTML = payload.seasons.map(season => `<option ${season === state.season ? "selected" : ""}>${season}</option>`).join("");
  chooseDefaultPlayer();
  renderPlayerOptions();
}

function bindControls() {
  els.levels.querySelectorAll("button[data-fit-level]").forEach(button => {
    button.onclick = () => {
      state.playerLevel = button.dataset.fitLevel;
      chooseDefaultPlayer();
      closePlayerOptions();
      render();
    };
  });

  els.playerSearch.onfocus = () => {
    els.playerSearch.select();
    showPlayerOptions(els.playerSearch.value === selectedPlayerLabel() ? "" : els.playerSearch.value);
  };
  els.playerSearch.onclick = () => showPlayerOptions(els.playerSearch.value === selectedPlayerLabel() ? "" : els.playerSearch.value);
  els.playerSearch.oninput = event => showPlayerOptions(event.target.value);
  els.playerSearch.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (els.playerOptions.classList.contains("hidden")) showPlayerOptions("");
      if (!visiblePlayers.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activePlayerIndex = activePlayerIndex < 0
        ? (direction > 0 ? 0 : visiblePlayers.length - 1)
        : (activePlayerIndex + direction + visiblePlayers.length) % visiblePlayers.length;
      renderPlayerOptions(els.playerSearch.value === selectedPlayerLabel() ? "" : els.playerSearch.value, true);
    } else if (event.key === "Enter" && visiblePlayers.length && !els.playerOptions.classList.contains("hidden")) {
      event.preventDefault();
      selectPlayer(visiblePlayers[Math.max(0, activePlayerIndex)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePlayerOptions(true);
    }
  };
  els.playerSearch.onblur = () => setTimeout(() => closePlayerOptions(true), 100);
  document.addEventListener("mousedown", event => {
    if (!event.target.closest(".player-fit-combobox")) closePlayerOptions(true);
  });

  els.season.onchange = event => {
    state.season = event.target.value;
    state.expandedTeam = "";
    renderResults();
  };
  els.teamSearch.oninput = event => {
    state.teamSearch = event.target.value.trim().toLowerCase();
    state.expandedTeam = "";
    renderResults();
  };
  els.tier.onchange = event => {
    state.tier = event.target.value;
    state.expandedTeam = "";
    renderResults();
  };
  els.sort.onchange = event => {
    state.sortKey = SORT_DROPDOWN_MAP[event.target.value] || "fit";
    state.sortDir = state.sortKey === "projectedRank" ? "asc" : "desc";
    renderResults();
  };
  els.excludeCurrent.onchange = event => {
    state.excludeCurrent = event.target.checked;
    state.expandedTeam = "";
    renderResults();
  };
  els.exportButton.onclick = exportPlayerFit;
}

function playersForLevel() {
  return currentPlayers
    .filter(player => player.model === state.playerLevel)
    .sort((a, b) => a.name.localeCompare(b.name) || a.team.localeCompare(b.team));
}

function chooseDefaultPlayer() {
  const existing = playerById.get(state.playerId);
  if (existing?.model === state.playerLevel) {
    els.playerSearch.value = selectedPlayerLabel();
    return;
  }
  const players = playersForLevel();
  const highestImpact = [...players].sort((a, b) => Number(b.teamImpact?.score || 0) - Number(a.teamImpact?.score || 0))[0];
  state.playerId = highestImpact?.id || players[0]?.id || "";
  state.expandedTeam = "";
  els.playerSearch.value = selectedPlayerLabel();
}

function selectedPlayer() {
  return playerById.get(state.playerId);
}

function selectedPlayerLabel() {
  const player = selectedPlayer();
  return player ? `${player.name} - ${player.team}` : "";
}

function renderPlayerOptions(query = "", open = false) {
  const needle = query.trim().toLowerCase();
  visiblePlayers = playersForLevel()
    .filter(player => !needle || `${player.name} ${player.team} ${player.statsTeam || ""} ${player.archetype}`.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aStarts = needle && a.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = needle && b.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.name.localeCompare(b.name) || a.team.localeCompare(b.team);
    })
    .slice(0, 100);
  if (activePlayerIndex >= visiblePlayers.length) activePlayerIndex = visiblePlayers.length - 1;
  els.playerOptions.innerHTML = visiblePlayers.length
    ? visiblePlayers.map((player, index) => `<button type="button" role="option" data-player-id="${escapeHtml(player.id)}" aria-selected="${player.id === state.playerId}" class="${index === activePlayerIndex ? "active" : ""}">
        <strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} &middot; ${escapeHtml(player.class || "--")} &middot; ${escapeHtml(player.archetype)}</small>
      </button>`).join("")
    : `<p>No ${state.playerLevel.toUpperCase()} players match "${escapeHtml(query.trim())}".</p>`;
  els.playerOptions.querySelectorAll("button[data-player-id]").forEach(button => {
    button.onmousedown = event => {
      event.preventDefault();
      selectPlayer(playerById.get(button.dataset.playerId));
    };
  });
  if (open) {
    els.playerOptions.classList.remove("hidden");
    els.playerSearch.setAttribute("aria-expanded", "true");
    els.playerOptions.querySelector("button.active")?.scrollIntoView({ block: "nearest" });
  }
}

function showPlayerOptions(query = "") {
  activePlayerIndex = -1;
  renderPlayerOptions(query, true);
}

function closePlayerOptions(restore = false) {
  els.playerOptions.classList.add("hidden");
  els.playerSearch.setAttribute("aria-expanded", "false");
  if (restore) els.playerSearch.value = selectedPlayerLabel();
  activePlayerIndex = -1;
}

function selectPlayer(player) {
  if (!player || player.model !== state.playerLevel) return;
  state.playerId = player.id;
  state.expandedTeam = "";
  els.playerSearch.value = selectedPlayerLabel();
  closePlayerOptions();
  render();
}

function render() {
  if (!payload || !user) return;
  els.levels.querySelectorAll("button[data-fit-level]").forEach(button => {
    button.classList.toggle("active", button.dataset.fitLevel === state.playerLevel);
  });
  renderPlayerSummary();
  renderResults();
}

function renderPlayerSummary() {
  const player = selectedPlayer();
  if (!player) {
    els.playerSummary.innerHTML = `<p class="muted">No player is available for this level.</p>`;
    return;
  }
  const impact = player.teamImpact || {};
  const secondRole = player.secondary || player.secondRole;
  els.playerSummary.innerHTML = `
    <div class="fit-player-heading">
      <div>
        <span class="fit-kicker">Selected ${player.model.toUpperCase()} player</span>
        <h2>${escapeHtml(player.name)}</h2>
        <p>${escapeHtml(player.team)} &middot; ${escapeHtml(player.class || "--")} &middot; ${heightLabel(player.height)} &middot; ${escapeHtml(player.archetype)}${secondRole ? ` / ${escapeHtml(secondRole)}` : ""}</p>
      </div>
      <a class="fit-profile-link" href="${playerUrl(player)}">Open snapshot</a>
    </div>
    <div class="fit-player-model-strip">
      <div><strong>${fmt(impact.score)}</strong><span>Transfer impact</span></div>
      <div><strong>${escapeHtml(impact.confidence || "--")}</strong><span>Confidence</span></div>
      <div><strong>${fmt(impact.similarity)}</strong><span>Profile similarity</span></div>
      <div><strong>${Number(impact.sample || 0).toLocaleString()}</strong><span>Comparable moves</span></div>
      <div class="fit-player-impact"><strong>Modeled impact</strong><span>${impactHighlights(player, 4)}</span></div>
    </div>
    <div class="fit-player-data-grid">
      <div>
        <h3>VERSPI+D</h3>
        <div class="fit-verspi-row">${CATS.map(([key, label, className]) => {
          const value = numberOrNull(player.verspi?.[key]);
          return `<span class="fit-verspi ${className}"><b>${value === null ? "--" : Math.round(value)}</b><small>${label}</small></span>`;
        }).join("")}</div>
      </div>
      <div>
        <h3>Box Stats</h3>
        <div class="fit-box-row">${STAT_COLS.map(key => `<span><b>${statCell(player, key)}</b><small>${escapeHtml(key)}</small></span>`).join("")}</div>
      </div>
    </div>`;
}

function renderResults() {
  const player = selectedPlayer();
  if (!player) {
    els.resultCount.textContent = "No player selected";
    els.results.innerHTML = "";
    return;
  }
  const analyses = filteredTeamAnalyses(player);
  const shown = analyses.slice(0, 100);
  els.resultCount.innerHTML = `${analyses.length.toLocaleString()} D1 destinations &middot; showing top ${shown.length.toLocaleString()} &middot; ${state.season}`;
  els.results.innerHTML = shown.length ? `<div class="fit-table-wrap"><table class="fit-table">
    <thead><tr>
      <th>Rank</th>${sortHeader("team", "Team", state)}${sortHeader("tier", "Tier", state)}${sortHeader("fit", "Fit", state, "numeric")}${sortHeader("impactFit", "Impact Match", state, "numeric")}${sortHeader("roleFit", "Role Match", state, "numeric")}${sortHeader("opportunity", "Team Need", state, "numeric")}${sortHeader("currentAdjEm", "AdjEM", state, "numeric")}${sortHeader("adjEmGain", "AdjEM Change", state, "numeric")}${sortHeader("projectedRank", "Proj Rank", state, "numeric", "asc")}${sortHeader("offenseChange", "Offense", state, "numeric")}${sortHeader("defenseChange", "Defense", state, "numeric")}<th>Best Need Match</th>
    </tr></thead>
    <tbody>${shown.map((analysis, index) => teamRowsHtml(analysis, index + 1)).join("")}</tbody>
  </table></div>` : `<p class="muted fit-empty">No D1 teams match these filters.</p>`;
  bindSortHeaders(els.results, state, renderResults);
  if (SORT_DROPDOWN_REVERSE[state.sortKey]) els.sort.value = SORT_DROPDOWN_REVERSE[state.sortKey];

  els.results.querySelectorAll("tr[data-fit-team]").forEach(row => {
    row.onclick = event => {
      if (event.target.closest("a,button")) return;
      const key = row.dataset.fitTeam;
      state.expandedTeam = state.expandedTeam === key ? "" : key;
      renderResults();
    };
  });
}

function filteredTeamAnalyses(player = selectedPlayer()) {
  if (!player) return [];
  const needle = state.teamSearch;
  const analyses = teamRows
    .filter(team => team.season === state.season)
    .filter(team => !needle || team.team.toLowerCase().includes(needle))
    .filter(team => !state.excludeCurrent || !sameCurrentTeam(player, team.team))
    .map(team => analyzeTeam(player, team))
    .filter(analysis => !state.tier || analysis.tier === state.tier);
  return sortRows(analyses, state, teamSortValue);
}

function sortKeyLabel(key) {
  return {
    fit: "Fit score", team: "Team", tier: "Conference tier", impactFit: "Impact match", roleFit: "Role match",
    opportunity: "Team need", currentAdjEm: "Current AdjEM", adjEmGain: "Projected AdjEM gain",
    projectedRank: "Projected rank", offenseChange: "Offense change", defenseChange: "Defense change"
  }[key] || "Fit score";
}

function teamSortValue(analysis, key) {
  if (key === "team") return analysis.team.team || "";
  if (key === "tier") return analysis.tier || "";
  if (key === "offenseChange") return Number(analysis.offenseChange);
  if (key === "defenseChange") return Number(analysis.defenseChange);
  const value = analysis[key];
  return typeof value === "number" ? value : Number(value);
}

function exportPlayerFit() {
  const player = selectedPlayer();
  if (!player || exportInProgress) return;
  const analyses = filteredTeamAnalyses(player).slice(0, 100);
  if (!analyses.length) {
    showNotice("There are no matching destinations to export.", "error");
    return;
  }

  exportInProgress = true;
  const originalTitle = document.title;
  const originalButtonText = els.exportButton.textContent;
  els.exportButton.disabled = true;
  els.exportButton.textContent = "Preparing...";

  const sortLabel = sortKeyLabel(state.sortKey);
  const filterSummary = [
    `${state.season} team data`,
    state.tier || "All conference tiers",
    `Sorted by ${sortLabel}`,
    state.teamSearch ? `Team search: ${state.teamSearch}` : "All matching teams",
    state.excludeCurrent ? "Current team excluded" : "Current team included"
  ].join(" | ");
  const stage = document.createElement("section");
  stage.className = "fit-export-stage";
  stage.innerHTML = `
    <header class="fit-export-heading">
      <span>VERSPID Player Fit</span>
      <h1>${escapeHtml(player.name)} Destination Report</h1>
      <p>${escapeHtml(filterSummary)} | ${analyses.length.toLocaleString()} destinations</p>
    </header>
    <section class="fit-export-summary">${els.playerSummary.innerHTML}</section>
    <section class="fit-export-ranking">
      <h2>Top ${analyses.length.toLocaleString()} D1 Team Fits</h2>
      <table class="fit-table">
        ${fitTableColgroup()}
        <thead>${fitTableHeader()}</thead>
        <tbody>${analyses.map((analysis, index) => teamRowsHtml(analysis, index + 1, false)).join("")}</tbody>
      </table>
    </section>
    <section class="fit-export-details">
      <h2>Destination Analysis</h2>
      ${analyses.map((analysis, index) => `<section class="fit-export-team">
        <span class="fit-export-rank">Fit rank ${index + 1}</span>
        ${expandedTeamContent(analysis)}
      </section>`).join("")}
    </section>`;
  document.body.append(stage);
  document.body.classList.add("fit-print-export");
  document.title = `VERSPID - ${player.name} - Player Fit`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("fit-print-export");
    stage.remove();
    document.title = originalTitle;
    els.exportButton.disabled = false;
    els.exportButton.textContent = originalButtonText;
    exportInProgress = false;
  };

  window.addEventListener("afterprint", cleanup, { once: true });
  try {
    window.print();
  } catch (error) {
    cleanup();
    showNotice("The export dialog could not be opened.", "error");
    return;
  }
  setTimeout(cleanup, 60000);
}

function fitTableHeader() {
  return `<tr>
    <th>Rank</th><th>Team</th><th>Tier</th><th>Fit</th><th>Impact Match</th><th>Role Match</th><th>Team Need</th><th>AdjEM</th><th>AdjEM Change</th><th>Proj Rank</th><th>Offense</th><th>Defense</th><th>Best Need Match</th>
  </tr>`;
}

function fitTableColgroup() {
  return `<colgroup><col class="fit-col-rank"><col class="fit-col-team"><col class="fit-col-tier">${Array.from({ length: 9 }, () => `<col class="fit-col-number">`).join("")}<col class="fit-col-need"></colgroup>`;
}

function analyzeTeam(player, team) {
  const percentiles = new Map(metricDefs.map(definition => [definition.key, orientedPercentile(team, definition)]));
  const categoryNeeds = {};
  CATS.forEach(([key]) => {
    const values = (CATEGORY_METRICS[key] || []).map(metric => percentiles.get(metric)).filter(Number.isFinite);
    categoryNeeds[key] = values.length ? 100 - average(values) : 50;
  });
  const scores = fitComponents(player, { percentiles, categoryNeeds });
  const projection = projectPlayerToTeam(player, team, percentiles);
  const adjEmDefinition = metricDef("AdjEM");
  const adjO = metricDef("AdjOE");
  const adjD = metricDef("AdjDE");
  const currentAdjEm = numberOrZero(team.metrics[adjEmDefinition.index]);
  const projectedAdjEm = numberOrZero(projection.metrics[adjEmDefinition.index]);
  const needs = alignedNeeds(team, projection, percentiles);
  return {
    team,
    tier: teamTier(team),
    percentiles,
    categoryNeeds,
    projection,
    needs,
    ...scores,
    currentAdjEm,
    projectedAdjEm,
    adjEmGain: projectedAdjEm - currentAdjEm,
    offenseChange: metricChange(team, projection, adjO),
    defenseChange: metricChange(team, projection, adjD),
    currentRank: projectedRank(team, "AdjEM"),
    projectedRank: projectedRank(projection, "AdjEM")
  };
}

function fitComponents(player, context) {
  let impactTotal = 0;
  let impactWeight = 0;
  metricDefs.forEach(definition => {
    if (!definition.direction) return;
    const weakness = 100 - (context.percentiles.get(definition.key) ?? 50);
    const importance = definition.key === "AdjEM" ? 2 : definition.key === "AdjOE" || definition.key === "AdjDE" ? 1.4 : 1;
    const weight = importance * (0.4 + weakness / 100);
    const normalized = clamp(playerDelta(player, definition) * definition.direction / impactScale(definition), -1, 1);
    impactTotal += normalized * weight;
    impactWeight += weight;
  });
  const impactFit = clamp(50 + (impactWeight ? impactTotal / impactWeight * 35 : 0), 0, 100);

  let roleTotal = 0;
  let roleWeight = 0;
  CATS.forEach(([key]) => {
    const value = numberOrNull(player.verspi?.[key]);
    if (value === null) return;
    const weight = 0.3 + context.categoryNeeds[key] / 100;
    roleTotal += value * weight;
    roleWeight += weight;
  });
  const roleFit = clamp(roleWeight ? roleTotal / roleWeight : 50, 0, 100);
  const quality = clamp(average(CATS.map(([key]) => numberOrNull(player.verspi?.[key]))) ?? 50, 0, 100);
  const opportunity = clamp(average(Object.values(context.categoryNeeds).sort((a, b) => b - a).slice(0, 3)) ?? 50, 0, 100);
  const fit = clamp(impactFit * 0.70 + roleFit * 0.20 + quality * 0.10, 0, 100);
  return { fit, impactFit, roleFit, quality, opportunity };
}

function projectPlayerToTeam(player, team, percentiles) {
  const metrics = metricDefs.map(definition => {
    const current = numberOrNull(team.metrics[definition.index]);
    if (current === null) return null;
    const rawChange = playerDelta(player, definition);
    const oriented = definition.direction ? rawChange * definition.direction : 0;
    const percentile = percentiles.get(definition.key) ?? 50;
    const needMultiplier = oriented > 0 ? 0.85 + 0.45 * (1 - percentile / 100) : 1;
    const adjustedChange = rawChange * needMultiplier;
    const cap = Number(projectionModel.cohortCaps?.[definition.index] || projectionModel.caps?.[definition.index] || Math.abs(adjustedChange) || 1);
    return current + clamp(adjustedChange, -cap, cap);
  });
  const adjO = metricDef("AdjOE");
  const adjD = metricDef("AdjDE");
  const adjEm = metricDef("AdjEM");
  if (adjO && adjD && adjEm && metrics[adjO.index] !== null && metrics[adjD.index] !== null) {
    metrics[adjEm.index] = metrics[adjO.index] - metrics[adjD.index];
  }
  return { team: team.team, season: team.season, metrics };
}

function alignedNeeds(team, projection, percentiles) {
  return metricDefs
    .filter(definition => definition.direction)
    .map(definition => {
      const current = numberOrNull(team.metrics[definition.index]);
      const projected = numberOrNull(projection.metrics[definition.index]);
      const change = current === null || projected === null ? 0 : projected - current;
      const improvement = change * definition.direction;
      const need = 100 - (percentiles.get(definition.key) ?? 50);
      const importance = definition.key === "AdjEM" ? 2 : definition.key === "AdjOE" || definition.key === "AdjDE" ? 1.4 : 1;
      const match = improvement / impactScale(definition) * (0.4 + need / 100) * importance;
      return { definition, current, projected, change, improvement, need, match };
    })
    .sort((a, b) => b.match - a.match);
}

function teamRowsHtml(analysis, rank, forceExpanded = null) {
  const key = `${analysis.team.season}::${canonical(analysis.team.team)}`;
  const expanded = forceExpanded === null ? state.expandedTeam === key : forceExpanded;
  const bestNeed = analysis.needs[0];
  return `<tr class="fit-team-row ${expanded ? "expanded" : ""}" data-fit-team="${escapeHtml(key)}" aria-expanded="${expanded}">
      <td>${rank}</td>
      <td><strong>${escapeHtml(analysis.team.team)}</strong><span class="cell-note">Current #${analysis.currentRank}</span></td>
      <td><span class="pill ${tierClass(analysis.tier)}">${escapeHtml(analysis.tier || "Unclassified")}</span></td>
      <td><span class="fit-score">${fmt(analysis.fit)}</span></td>
      <td>${scoreBar(analysis.impactFit)}</td>
      <td>${scoreBar(analysis.roleFit)}</td>
      <td>${scoreBar(analysis.opportunity)}</td>
      <td>${fmt(analysis.currentAdjEm)} <span class="fit-arrow">&rarr;</span> <strong>${fmt(analysis.projectedAdjEm)}</strong></td>
      <td class="${analysis.adjEmGain >= 0 ? "change-good" : "change-bad"}">${signed(analysis.adjEmGain)}</td>
      <td><strong>#${analysis.projectedRank}</strong></td>
      <td class="${changeDirectionClass(analysis.offenseChange, 1)}">${signed(analysis.offenseChange)}</td>
      <td class="${changeDirectionClass(analysis.defenseChange, -1)}">${signed(analysis.defenseChange)}</td>
      <td>${bestNeed ? escapeHtml(bestNeed.definition.label) : "Balanced profile"}<span class="cell-note">${bestNeed ? `${Math.round(bestNeed.need)} need &middot; ${formatChange(bestNeed.definition, bestNeed.change)}` : "--"}</span></td>
    </tr>${expanded ? expandedTeamHtml(analysis) : ""}`;
}

function expandedTeamHtml(analysis) {
  return `<tr class="fit-detail-row"><td colspan="13">${expandedTeamContent(analysis)}</td></tr>`;
}

function expandedTeamContent(analysis) {
  const player = selectedPlayer();
  const impact = player.teamImpact || {};
  const groups = [...new Set(metricDefs.map(definition => definition.group))];
  const topNeeds = analysis.needs.slice(0, 6);
  return `<div class="fit-detail">
      <div class="fit-detail-heading">
        <div><h3>${escapeHtml(player.name)} at ${escapeHtml(analysis.team.team)}</h3><p>${escapeHtml(analysis.team.season)} destination projection</p></div>
        <div class="fit-detail-ranks"><span><b>#${analysis.currentRank}</b> current</span><span><b>#${analysis.projectedRank}</b> projected</span></div>
      </div>
      <div class="fit-component-grid">
        ${componentTile("Fit score", analysis.fit, "Weighted final score")}
        ${componentTile("Impact match", analysis.impactFit, "70% of fit")}
        ${componentTile("Role match", analysis.roleFit, "20% of fit")}
        ${componentTile("VERSPI quality", analysis.quality, "10% of fit")}
        ${componentTile("Team opportunity", analysis.opportunity, "Top three needs")}
        <div class="fit-component-tile"><strong>${escapeHtml(impact.confidence || "--")}</strong><span>Model confidence</span><small>${Number(impact.sample || 0).toLocaleString()} comps &middot; ${fmt(impact.similarity)} similarity</small></div>
      </div>
      <div class="fit-support-grid">
        <section>
          <h4>Best Need Matches</h4>
          <div class="fit-need-list">${topNeeds.map(need => `<div class="fit-need-row">
            <span><strong>${escapeHtml(need.definition.label)}</strong><small>${Math.round(need.need)} team need &middot; current ${formatMetric(need.definition, need.current)}</small></span>
            <span class="${changeDirectionClass(need.change, need.definition.direction)}"><b>${formatChange(need.definition, need.change)}</b><small>to ${formatMetric(need.definition, need.projected)}</small></span>
          </div>`).join("")}</div>
        </section>
        <section>
          <h4>Historical Transfer Comparisons</h4>
          <div class="fit-comp-list">${(impact.comps || []).length ? impact.comps.map(comp => `<div>
            <span><strong>${escapeHtml(comp.name)}</strong><small>${escapeHtml(comp.from)} &rarr; ${escapeHtml(comp.to)} &middot; ${escapeHtml(comp.season || "")}</small></span>
            <b>${fmt(comp.similarity)}</b>
          </div>`).join("") : `<p class="muted">No historical comparisons are available.</p>`}</div>
          <p class="fit-method">${Number(projectionModel.training?.transfers || 0).toLocaleString()} historical arrivals into D1. ${escapeHtml(projectionModel.training?.method || impact.method || "")}</p>
        </section>
      </div>
      <div class="fit-metric-wrap"><table class="projection-table fit-metric-table">
        <thead><tr><th>Team metric</th><th>Current</th><th>Team percentile</th><th>Projected</th><th>Change</th></tr></thead>
        <tbody>${groups.map(group => `<tr class="metric-group"><th colspan="5">${escapeHtml(group)}</th></tr>${metricDefs.filter(definition => definition.group === group).map(definition => {
          const current = numberOrNull(analysis.team.metrics[definition.index]);
          const projected = numberOrNull(analysis.projection.metrics[definition.index]);
          const change = current === null || projected === null ? null : projected - current;
          const percentile = analysis.percentiles.get(definition.key);
          return `<tr><td>${escapeHtml(definition.label)}</td><td>${formatMetric(definition, current)}</td><td>${definition.direction ? `${Math.round(percentile)}th` : "Style"}</td><td>${formatMetric(definition, projected)}</td><td class="${changeDirectionClass(change, definition.direction)}">${formatChange(definition, change)}</td></tr>`;
        }).join("")}`).join("")}</tbody>
      </table></div>
    </div>`;
}

function componentTile(label, value, note) {
  return `<div class="fit-component-tile"><strong>${fmt(value)}</strong><span>${escapeHtml(label)}</span><small>${escapeHtml(note)}</small></div>`;
}

function scoreBar(value) {
  const score = clamp(Number(value) || 0, 0, 100);
  return `<span class="fit-mini-score"><b>${fmt(score)}</b><span><i style="width:${score}%"></i></span></span>`;
}

function orientedPercentile(team, definition) {
  const value = numberOrNull(team?.metrics?.[definition.index]);
  const values = seasonMetricValues.get(`${state.season}\u0000${definition.key}`) || [];
  if (value === null || !values.length || !definition.direction) return 50;
  const below = upperBound(values, value) / values.length * 100;
  return definition.direction > 0 ? below : 100 - below;
}

function upperBound(values, target) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (values[mid] <= target) low = mid + 1;
    else high = mid;
  }
  return low;
}

function projectedRank(team, key) {
  const definition = metricDef(key);
  const value = numberOrNull(team.metrics[definition.index]);
  const values = seasonMetricValues.get(`${state.season}\u0000${key}`) || [];
  if (value === null || !values.length) return "--";
  if (definition.direction >= 0) return 1 + values.length - upperBound(values, value);
  return upperBound(values, value);
}

function teamTier(team) {
  const key = canonical(team.team);
  // definedTeamTiers (payload.teamTiers) is the actively-maintained, canonical
  // source covering all 367 schools - it must win. The per-player-derived
  // maps are only a fallback for a team that somehow isn't in that list at
  // all; checking them FIRST (as this used to) let a stale/out-of-sync
  // player.tier value from an older season silently override a corrected
  // team tier - which is exactly how a school could show the wrong tier here
  // while every other page (which reads payload.teamTiers directly) showed
  // it correctly.
  return definedTeamTiers.get(key) || teamTierBySeason.get(`${team.season}\u0000${key}`) || latestTeamTier.get(key) || "";
}

function metricDef(key) {
  return metricDefs.find(definition => definition.key === key);
}

function playerDelta(player, definition) {
  return Number(player.teamImpact?.delta?.[definition.index] || 0);
}

function impactScale(definition) {
  return Number(projectionModel.predictionCaps?.[definition.index] || projectionModel.caps?.[definition.index] || 1);
}

function metricChange(current, projected, definition) {
  const before = numberOrNull(current?.metrics?.[definition.index]);
  const after = numberOrNull(projected?.metrics?.[definition.index]);
  return before === null || after === null ? 0 : after - before;
}

function impactHighlights(player, limit) {
  return metricDefs
    .filter(definition => definition.direction)
    .map(definition => ({ definition, delta: playerDelta(player, definition) }))
    .sort((a, b) => Math.abs(b.delta / impactScale(b.definition)) - Math.abs(a.delta / impactScale(a.definition)))
    .slice(0, limit)
    .map(({ definition, delta }) => `${escapeHtml(definition.label)} ${formatChange(definition, delta)}`)
    .join(" &middot; ");
}

function sameCurrentTeam(player, teamName) {
  return [player.team, player.statsTeam].filter(Boolean).some(team => canonical(team) === canonical(teamName));
}

function tierClass(tier) {
  return {
    "High Major": "tier-high",
    "Mid-Major": "tier-mid",
    "Low Major": "tier-low"
  }[tier] || "tier-none";
}

function heightLabel(value) {
  const inches = Math.round(Number(value));
  if (!Number.isFinite(inches) || inches <= 0) return "--";
  return `${Math.floor(inches / 12)}'${inches % 12}\"`;
}

function formatMetric(definition, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return definition.format === "pct" ? `${Number(value).toFixed(1)}%` : fmt(value);
}

function formatChange(definition, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const rounded = Math.abs(Number(value)) < 0.05 ? 0 : Number(value);
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${definition.format === "pct" ? " pp" : ""}`;
}

function signed(value) {
  const number = Math.abs(Number(value)) < 0.05 ? 0 : Number(value);
  return `${number > 0 ? "+" : ""}${fmt(number)}`;
}

function changeDirectionClass(change, direction) {
  if (change === null || change === undefined || !direction || Math.abs(Number(change)) < 0.05) return "change-neutral";
  return Number(change) * direction > 0 ? "change-good" : "change-bad";
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function numberOrZero(value) {
  return numberOrNull(value) ?? 0;
}

function average(values) {
  const clean = values.filter(value => value !== null && value !== undefined && Number.isFinite(Number(value))).map(Number);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
