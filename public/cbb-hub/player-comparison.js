import {
  CATS,
  STAT_COLS,
  bindSortHeaders,
  classForSaved,
  fmt,
  loadHubData,
  playerUrl,
  setupAuth,
  setupStateMultiSelect,
  showNotice,
  showAppWhenAuthed,
  sortHeader,
  sortRows,
  statCell,
  toggleSaved,
  watchSaved
} from "/cbb-hub/core.js?v=20260928-nbablend1";
import {
  buildSimilarityIndex,
  findSimilar,
  profileDifferences,
  profileFor
} from "/cbb-hub/comparison-model.js?v=20260922-classmulti1";

let user = null;
let payload = null;
let similarityIndex = null;
let savedMap = new Map();
let savedUnsub = () => {};
let activeUserId = null;
let playerById = new Map();
let visiblePlayers = [];
let activePlayerOption = -1;
let mainMatches = { eligibleCount: 0, shortlistCount: 0, results: [] };
let sameLevelMatches = { results: [] };
let crossLevelMatches = { results: [] };
let activeMatch = null;
let started = false;
let exportInProgress = false;
let teamFilterTimer = null;

const requestedId = new URLSearchParams(location.search).get("id") || "";
const state = {
  targetLevel: "d1",
  targetSeason: "2025-26",
  targetId: requestedId,
  method: "two-stage",
  pool: "all",
  candidateSeason: "same",
  classes: new Set(),
  archetype: "",
  position: "",
  teamSearch: "",
  states: new Set(),
  ranges: {},
  limit: 100,
  tableView: "overview",
  activeComparisonId: "",
  sortKey: "",
  sortDir: "desc"
};

const els = {
  targetLevel: document.getElementById("comparisonTargetLevel"),
  targetSeason: document.getElementById("comparisonTargetSeason"),
  playerSearch: document.getElementById("comparisonPlayerSearch"),
  playerOptions: document.getElementById("comparisonPlayerOptions"),
  method: document.getElementById("comparisonMethod"),
  pool: document.getElementById("comparisonPool"),
  candidateSeason: document.getElementById("comparisonCandidateSeason"),
  classFilter: document.getElementById("comparisonClassFilter"),
  classButton: document.getElementById("comparisonClassBtn"),
  classMenu: document.getElementById("comparisonClassMenu"),
  archetype: document.getElementById("comparisonArchetype"),
  position: document.getElementById("comparisonPosition"),
  teamSearch: document.getElementById("comparisonTeam"),
  stateFilter: document.getElementById("comparisonState"),
  rangeFilters: document.getElementById("comparisonRangeFilters"),
  rangeSummary: document.getElementById("comparisonRangeSummary"),
  rangeReset: document.getElementById("comparisonRangeReset"),
  limit: document.getElementById("comparisonLimit"),
  filterSummary: document.getElementById("comparisonFilterSummary"),
  radar: document.getElementById("comparisonRadar"),
  legend: document.getElementById("comparisonLegend"),
  readout: document.getElementById("comparisonReadout"),
  chartSubtitle: document.getElementById("comparisonChartSubtitle"),
  targetSnapshot: document.getElementById("comparisonTargetSnapshot"),
  guardrails: document.getElementById("comparisonGuardrails"),
  resultCount: document.getElementById("comparisonResultCount"),
  tableView: document.getElementById("comparisonTableView"),
  results: document.getElementById("comparisonResults"),
  exportButton: document.getElementById("exportComparison")
};

setupAuth().then(start);
window.addEventListener("hub-auth", event => start(event.detail));

async function start(currentUser) {
  user = currentUser;
  showAppWhenAuthed(user);
  if (!user) {
    savedUnsub();
    activeUserId = null;
    savedMap = new Map();
    return;
  }
  if (!payload) {
    els.resultCount.textContent = "Loading player model...";
    payload = await loadHubData();
    playerById = new Map(payload.players.map(player => [player.id, player]));
    const requested = playerById.get(state.targetId);
    if (requested) {
      state.targetLevel = requested.model;
      state.targetSeason = requested.season;
    }
    similarityIndex = buildSimilarityIndex(payload.players);
  }
  if (!started) {
    hydrateControls();
    bindControls();
    started = true;
  }
  if (activeUserId !== user.uid) {
    savedUnsub();
    activeUserId = user.uid;
    savedUnsub = watchSaved(user, map => {
      savedMap = map;
      if (similarityIndex) renderResultsTable();
    });
  }
  render();
}

function hydrateControls() {
  els.archetype.innerHTML = `<option value="">All archetypes</option>${payload.archetypes.map(value => `<option>${escapeHtml(value)}</option>`).join("")}`;
  setupClassFilter();
  setupStateMultiSelect(els.stateFilter, payload.states, state.states, () => {
    state.activeComparisonId = "";
    render();
  });
  renderRangeFilters();
  hydrateTargetSeasons();
  chooseDefaultPlayer();
  renderPlayerOptions();
}

function setupClassFilter() {
  const boxes = [...els.classMenu.querySelectorAll("input[type='checkbox']")];
  const update = () => {
    boxes.forEach(box => { box.checked = state.classes.has(box.value); });
    const selected = [...state.classes];
    els.classButton.textContent = selected.length ? `${selected.length} class${selected.length === 1 ? "" : "es"} selected` : "All classes";
    els.classButton.title = selected.length ? selected.join(", ") : "All classes";
  };
  els.classButton.onclick = () => {
    const opening = els.classMenu.classList.contains("hidden");
    els.classMenu.classList.toggle("hidden", !opening);
    els.classButton.setAttribute("aria-expanded", String(opening));
  };
  boxes.forEach(box => {
    box.onchange = () => {
      if (box.checked) state.classes.add(box.value);
      else state.classes.delete(box.value);
      state.activeComparisonId = "";
      update();
      render();
    };
  });
  document.addEventListener("click", event => {
    if (els.classFilter.contains(event.target)) return;
    els.classMenu.classList.add("hidden");
    els.classButton.setAttribute("aria-expanded", "false");
  });
  update();
}

function bindControls() {
  els.targetLevel.querySelectorAll("button[data-target-level]").forEach(button => {
    button.onclick = () => {
      state.targetLevel = button.dataset.targetLevel;
      hydrateTargetSeasons();
      chooseDefaultPlayer(true);
      closePlayerOptions();
      render();
    };
  });
  els.targetSeason.onchange = event => {
    state.targetSeason = event.target.value;
    chooseDefaultPlayer(true);
    closePlayerOptions();
    render();
  };
  els.method.querySelectorAll("button[data-method]").forEach(button => {
    button.onclick = () => {
      state.method = button.dataset.method;
      state.activeComparisonId = "";
      render();
    };
  });
  els.pool.querySelectorAll("button[data-pool]").forEach(button => {
    button.onclick = () => {
      state.pool = button.dataset.pool;
      state.activeComparisonId = "";
      render();
    };
  });
  els.tableView.querySelectorAll("button[data-table-view]").forEach(button => {
    button.onclick = () => {
      state.tableView = button.dataset.tableView;
      renderResultsTable();
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
      activePlayerOption = activePlayerOption < 0
        ? (direction > 0 ? 0 : visiblePlayers.length - 1)
        : (activePlayerOption + direction + visiblePlayers.length) % visiblePlayers.length;
      renderPlayerOptions(els.playerSearch.value === selectedPlayerLabel() ? "" : els.playerSearch.value, true);
    } else if (event.key === "Enter" && visiblePlayers.length && !els.playerOptions.classList.contains("hidden")) {
      event.preventDefault();
      selectPlayer(visiblePlayers[Math.max(0, activePlayerOption)]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      closePlayerOptions(true);
    }
  };
  els.playerSearch.onblur = () => setTimeout(() => closePlayerOptions(true), 100);
  document.addEventListener("mousedown", event => {
    if (!event.target.closest(".comparison-player-control")) closePlayerOptions(true);
  });

  [
    [els.candidateSeason, "candidateSeason"],
    [els.archetype, "archetype"],
    [els.position, "position"]
  ].forEach(([element, key]) => {
    element.onchange = event => {
      state[key] = event.target.value;
      state.activeComparisonId = "";
      render();
    };
  });
  els.teamSearch.oninput = event => {
    state.teamSearch = event.target.value.trim();
    state.activeComparisonId = "";
    clearTimeout(teamFilterTimer);
    teamFilterTimer = setTimeout(render, 120);
  };
  els.limit.onchange = event => {
    state.limit = Number(event.target.value);
    render();
  };
  els.rangeReset.onclick = () => {
    state.ranges = {};
    state.activeComparisonId = "";
    renderRangeFilters();
    render();
  };
  els.exportButton.onclick = exportComparison;
}

function renderRangeFilters() {
  const groups = [
    ["VERSPI+D", [...CATS.map(([key, label]) => [key, label]), ["height", "Height (in)"]]],
    ["Box stats", STAT_COLS.map(key => [key, key])]
  ];
  els.rangeFilters.innerHTML = groups.map(([title, definitions]) => `
    <div class="range-group">
      <h3>${title}</h3>
      <div class="range-grid">${definitions.map(([key, label]) => `
        <div class="range-item">
          <label><span>${label}</span></label>
          <div class="range-pair">
            <input data-comparison-range="${key}" data-bound="min" type="number" step="1" placeholder="min" ${rangeLimits(key)}>
            <input data-comparison-range="${key}" data-bound="max" type="number" step="1" placeholder="max" ${rangeLimits(key)}>
          </div>
        </div>`).join("")}</div>
    </div>`).join("");
  els.rangeFilters.querySelectorAll("input").forEach(input => {
    const value = state.ranges[input.dataset.comparisonRange]?.[input.dataset.bound];
    if (value !== undefined) input.value = value;
    input.oninput = () => {
      const key = input.dataset.comparisonRange;
      state.ranges[key] ||= {};
      state.ranges[key][input.dataset.bound] = input.value === "" ? undefined : Number(input.value);
      if (state.ranges[key].min === undefined && state.ranges[key].max === undefined) delete state.ranges[key];
      state.activeComparisonId = "";
      updateRangeSummary();
      render();
    };
  });
  updateRangeSummary();
}

function rangeLimits(key) {
  if (["FG%", "3P%", "FT%"].includes(key)) return 'min="0" max="100" inputmode="numeric"';
  if (key === "height") return 'min="48" max="100" inputmode="numeric"';
  if (CATS.some(([category]) => category === key)) return 'min="0" max="100" inputmode="numeric"';
  return "";
}

function updateRangeSummary() {
  const active = Object.values(state.ranges).filter(bounds => bounds.min !== undefined || bounds.max !== undefined).length;
  els.rangeSummary.textContent = active ? `${active} active range${active === 1 ? "" : "s"}` : "No active ranges";
}

function hydrateTargetSeasons() {
  const seasons = [...new Set(payload.players.filter(player => player.model === state.targetLevel).map(player => player.season))].sort().reverse();
  if (!seasons.includes(state.targetSeason)) state.targetSeason = seasons[0] || "";
  els.targetSeason.innerHTML = seasons.map(season => `<option ${season === state.targetSeason ? "selected" : ""}>${season}</option>`).join("");
}

function targetPlayers() {
  return payload.players
    .filter(player => player.model === state.targetLevel && player.season === state.targetSeason)
    .sort((left, right) => left.name.localeCompare(right.name) || left.team.localeCompare(right.team));
}

function chooseDefaultPlayer(force = false) {
  const existing = playerById.get(state.targetId);
  if (!force && existing?.model === state.targetLevel && existing?.season === state.targetSeason) {
    els.playerSearch.value = selectedPlayerLabel();
    return;
  }
  const players = targetPlayers();
  const rotationPlayer = players.find(player => Number(player.stats?.MPG) >= 20) || players[0];
  state.targetId = rotationPlayer?.id || "";
  state.activeComparisonId = "";
  els.playerSearch.value = selectedPlayerLabel();
}

function selectedPlayer() {
  return playerById.get(state.targetId);
}

function selectedPlayerLabel() {
  const player = selectedPlayer();
  return player ? `${player.name} - ${player.team}` : "";
}

function renderPlayerOptions(query = "", open = false) {
  const needle = query.trim().toLowerCase();
  visiblePlayers = targetPlayers()
    .filter(player => !needle || `${player.name} ${player.team} ${player.statsTeam || ""} ${player.archetype}`.toLowerCase().includes(needle))
    .sort((left, right) => {
      const leftStarts = needle && left.name.toLowerCase().startsWith(needle) ? 0 : 1;
      const rightStarts = needle && right.name.toLowerCase().startsWith(needle) ? 0 : 1;
      return leftStarts - rightStarts || left.name.localeCompare(right.name) || left.team.localeCompare(right.team);
    })
    .slice(0, 100);
  if (activePlayerOption >= visiblePlayers.length) activePlayerOption = visiblePlayers.length - 1;
  els.playerOptions.innerHTML = visiblePlayers.length
    ? visiblePlayers.map((player, index) => `<button type="button" role="option" data-player-id="${escapeHtml(player.id)}" aria-selected="${player.id === state.targetId}" class="${index === activePlayerOption ? "active" : ""}">
        <strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.team)} &middot; ${escapeHtml(player.class || "--")} &middot; ${escapeHtml(player.archetype)}</small>
      </button>`).join("")
    : `<p>No ${state.targetLevel.toUpperCase()} players match "${escapeHtml(query.trim())}".</p>`;
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
  activePlayerOption = -1;
  renderPlayerOptions(query, true);
}

function closePlayerOptions(restore = false) {
  els.playerOptions.classList.add("hidden");
  els.playerSearch.setAttribute("aria-expanded", "false");
  if (restore) els.playerSearch.value = selectedPlayerLabel();
  activePlayerOption = -1;
}

function selectPlayer(player) {
  if (!player || player.model !== state.targetLevel || player.season !== state.targetSeason) return;
  state.targetId = player.id;
  state.activeComparisonId = "";
  els.playerSearch.value = selectedPlayerLabel();
  closePlayerOptions();
  history.replaceState(null, "", `${location.pathname}?id=${encodeURIComponent(player.id)}`);
  render();
}

function comparisonOptions(overrides = {}) {
  return {
    method: state.method,
    pool: state.pool,
    season: state.candidateSeason,
    classes: state.classes,
    archetype: state.archetype,
    position: state.position,
    teamSearch: state.teamSearch,
    states: state.states,
    ranges: state.ranges,
    limit: state.limit,
    ...overrides
  };
}

function render() {
  const target = selectedPlayer();
  if (!payload || !similarityIndex || !target) return;
  document.title = `${target.name} - Player Comparison`;
  activateButtons(els.targetLevel, "targetLevel", state.targetLevel);
  activateButtons(els.method, "method", state.method);
  activateButtons(els.pool, "pool", state.pool);
  els.candidateSeason.value = state.candidateSeason;
  els.archetype.value = state.archetype;
  els.position.value = state.position;
  els.teamSearch.value = state.teamSearch;
  els.limit.value = String(state.limit);
  els.targetSnapshot.href = playerUrl(target);
  els.filterSummary.textContent = `${poolLabel()} · ${state.candidateSeason === "same" ? state.targetSeason : "all seasons"}`;

  mainMatches = findSimilar(similarityIndex, target.id, comparisonOptions());
  sameLevelMatches = findSimilar(similarityIndex, target.id, comparisonOptions({ pool: "same", limit: 5 }));
  crossLevelMatches = findSimilar(similarityIndex, target.id, comparisonOptions({ pool: "cross", limit: 5 }));
  const available = [...mainMatches.results, ...sameLevelMatches.results, ...crossLevelMatches.results];
  activeMatch = available.find(result => result.player.id === state.activeComparisonId) || mainMatches.results[0] || crossLevelMatches.results[0] || sameLevelMatches.results[0] || null;
  state.activeComparisonId = activeMatch?.player.id || "";
  renderVisual();
  renderGuardrails();
  renderResultsTable();
}

function renderVisual() {
  const target = selectedPlayer();
  const candidate = activeMatch?.player;
  const targetProfile = profileFor(similarityIndex, target.id, state.method);
  const candidateProfile = candidate ? profileFor(similarityIndex, candidate.id, state.method) : { values: [] };
  els.chartSubtitle.textContent = state.method === "verspi"
    ? "Division-and-season standardized VERSPI+D percentiles"
    : "Division-and-season standardized box + play-by-play style percentiles";
  els.radar.innerHTML = radarSvg(targetProfile.labels, targetProfile.values, candidateProfile.values, target.name, candidate?.name);
  els.legend.innerHTML = `<span><i class="target"></i>${escapeHtml(target.name)}</span>${candidate ? `<span><i class="candidate"></i>${escapeHtml(candidate.name)}</span>` : ""}`;
  if (!candidate || !activeMatch) {
    els.readout.innerHTML = `<div class="comparison-empty"><h2>No comparison available</h2><p>Adjust the candidate filters to find a matching player.</p></div>`;
    return;
  }
  const differences = profileDifferences(similarityIndex, target.id, candidate.id, state.method);
  const closest = differences.slice(0, 3);
  const largest = [...differences].sort((left, right) => right.gap - left.gap).slice(0, 3);
  els.readout.innerHTML = `
    <div class="comparison-match-heading">
      <div><span class="comparison-kicker">Active comparison</span><h2>${escapeHtml(candidate.name)}</h2><p>${escapeHtml(candidate.team)} &middot; ${candidate.model.toUpperCase()} &middot; ${escapeHtml(candidate.season)} &middot; ${escapeHtml(candidate.class || "--")}</p></div>
      <a class="comparison-link" href="${playerUrl(candidate)}">Open snapshot</a>
    </div>
    <div class="comparison-score-strip">
      <div class="primary"><strong>${score(activeMatch.score)}</strong><span>Similarity</span></div>
      <div><strong>${score(activeMatch.verspiScore)}</strong><span>VERSPI+D</span></div>
      <div><strong>${score(activeMatch.styleScore)}</strong><span>Box + PBP</span></div>
    </div>
    <div class="comparison-player-pair">
      ${playerMiniProfile(target)}
      ${playerMiniProfile(candidate)}
    </div>
    <div class="comparison-difference-grid">
      <div><h3>Closest dimensions</h3>${differenceList(closest, target, candidate)}</div>
      <div><h3>Largest differences</h3>${differenceList(largest, target, candidate)}</div>
    </div>
    <p class="comparison-method-note">${methodDescription()}</p>`;
}

function renderGuardrails() {
  els.guardrails.innerHTML = [
    ["Same-level comparisons", sameLevelMatches.results, selectedPlayer().model.toUpperCase()],
    ["Cross-level comparisons", crossLevelMatches.results, selectedPlayer().model === "d1" ? "D2" : "D1"]
  ].map(([title, results, level]) => `<div class="comparison-guardrail-block">
      <div class="comparison-guardrail-head"><h3>${title}</h3><span>${level}</span></div>
      <div class="comparison-guardrail-list">${results.length ? results.map(result => `
        <button type="button" data-comparison-id="${escapeHtml(result.player.id)}" class="${result.player.id === state.activeComparisonId ? "active" : ""}">
          <span><strong>${escapeHtml(result.player.name)}</strong><small>${escapeHtml(result.player.team)} &middot; ${escapeHtml(result.player.archetype)}</small></span>
          <b>${score(result.score)}</b>
        </button>`).join("") : `<p>No ${level} candidates match the current season and filters.</p>`}</div>
    </div>`).join("");
  bindComparisonSelectors(els.guardrails);
}

function renderResultsTable() {
  activateButtons(els.tableView, "tableView", state.tableView);
  const methodLabel = state.method === "two-stage" ? `two-stage shortlist of ${mainMatches.shortlistCount.toLocaleString()}` : state.method === "verspi" ? "VERSPI+D Mahalanobis" : "box + PBP style";
  els.resultCount.textContent = `${mainMatches.eligibleCount.toLocaleString()} eligible player-seasons · showing ${mainMatches.results.length.toLocaleString()} · ${methodLabel}`;
  if (!mainMatches.results.length) {
    els.results.innerHTML = `<p class="comparison-table-empty">No players match the current comparison filters.</p>`;
    return;
  }
  const extraHeaders = tableHeaders();
  const rows = sortRows(mainMatches.results, state, comparisonSortValue);
  els.results.innerHTML = `<div class="comparison-table-wrap"><table class="comparison-table">
    <thead><tr>${sortHeader("rank", "Rank", state, "numeric", "asc")}<th>Save</th>${sortHeader("score", "Similarity", state, "numeric")}${sortHeader("name", "Player", state)}${sortHeader("model", "Level", state)}${sortHeader("season", "Season", state)}${sortHeader("team", "Team", state)}${sortHeader("class", "Class", state)}${sortHeader("archetype", "Archetype", state)}${sortHeader("height", "Height", state, "numeric")}${extraHeaders}</tr></thead>
    <tbody>${rows.map(result => comparisonRow(result)).join("")}</tbody>
  </table></div>`;
  bindSortHeaders(els.results, state, renderResultsTable);
  bindComparisonSelectors(els.results);
  bindSaveButtons();
}

function comparisonSortValue(result, key) {
  const player = result.player;
  if (key === "rank") return Number(result.rank);
  if (key === "score") return Number(result.score);
  if (key === "name") return player.name || "";
  if (key === "model") return player.model || "";
  if (key === "season") return player.season || "";
  if (key === "team") return player.team || "";
  if (key === "class") return player.class || "";
  if (key === "archetype") return player.archetype || "";
  if (key === "height") return Number(player.height);
  if (key === "verspiScore") return Number(result.verspiScore);
  if (key === "styleScore") return Number(result.styleScore);
  if (CATS.some(([catKey]) => catKey === key)) return Number(player.verspi?.[key]);
  return Number(player.stats?.[key]);
}

function tableHeaders() {
  if (state.tableView === "verspi") return CATS.map(([key, label]) => sortHeader(key, label, state, "numeric")).join("");
  if (state.tableView === "box") return STAT_COLS.map(key => sortHeader(key, key, state, "numeric")).join("");
  return `${sortHeader("verspiScore", "VERSPI Match", state, "numeric")}${sortHeader("styleScore", "Style Match", state, "numeric")}${["MPG", "PTS/G", "AST/G", "REB/G", "FG%", "3P%"].map(key => sortHeader(key, key, state, "numeric")).join("")}`;
}

function comparisonRow(result) {
  const player = result.player;
  let extras;
  if (state.tableView === "verspi") {
    extras = CATS.map(([key]) => `<td>${fmt(player.verspi?.[key])}</td>`).join("");
  } else if (state.tableView === "box") {
    extras = STAT_COLS.map(key => `<td>${statCell(player, key)}</td>`).join("");
  } else {
    extras = `<td>${score(result.verspiScore)}</td><td>${score(result.styleScore)}</td>${["MPG", "PTS/G", "AST/G", "REB/G", "FG%", "3P%"].map(key => `<td>${statCell(player, key)}</td>`).join("")}`;
  }
  return `<tr data-comparison-id="${escapeHtml(player.id)}" class="${player.id === state.activeComparisonId ? "active" : ""}" aria-selected="${player.id === state.activeComparisonId}">
    <td>${result.rank}</td>
    <td><button class="${classForSaved(savedMap, player.id)} comparison-save-btn" data-save-id="${escapeHtml(player.id)}" type="button">${savedMap.has(player.id) ? "Saved" : "Save"}</button></td>
    <td><span class="comparison-score ${scoreTone(result.score)}">${score(result.score)}</span></td>
    <td><a href="${playerUrl(player)}"><strong>${escapeHtml(player.name)}</strong></a></td>
    <td><span class="comparison-level ${player.model}">${player.model.toUpperCase()}</span></td>
    <td>${escapeHtml(player.season)}</td>
    <td>${escapeHtml(player.team)}${player.draft2026 ? `<span class="drafted-badge">Drafted #${player.draft2026.pick}</span>` : ""}</td>
    <td>${escapeHtml(player.class || "--")}</td>
    <td>${escapeHtml(player.archetype || "--")}</td>
    <td>${heightLabel(player.height)}</td>
    ${extras}
  </tr>`;
}

function bindSaveButtons() {
  els.results.querySelectorAll("button[data-save-id]").forEach(button => {
    button.onclick = async event => {
      event.stopPropagation();
      const player = playerById.get(button.dataset.saveId);
      if (!player || button.disabled) return;
      const wasSaved = savedMap.has(player.id);
      button.disabled = true;
      button.textContent = wasSaved ? "Removing..." : "Saving...";
      try {
        const isSaved = await toggleSaved(user, player, savedMap);
        if (isSaved) savedMap.set(player.id, { id: player.id });
        else savedMap.delete(player.id);
        showNotice(isSaved ? `${player.name} saved.` : `${player.name} removed from saved players.`);
        renderResultsTable();
      } catch (error) {
        showNotice(error.message, "error");
        button.disabled = false;
        button.textContent = wasSaved ? "Saved" : "Save";
      }
    };
  });
}

function bindComparisonSelectors(root) {
  root.querySelectorAll("[data-comparison-id]").forEach(element => {
    element.onclick = event => {
      if (event.target.closest("a")) return;
      state.activeComparisonId = element.dataset.comparisonId;
      const available = [...mainMatches.results, ...sameLevelMatches.results, ...crossLevelMatches.results];
      activeMatch = available.find(result => result.player.id === state.activeComparisonId) || null;
      renderVisual();
      updateActiveSelections();
    };
  });
}

function updateActiveSelections() {
  document.querySelectorAll("[data-comparison-id]").forEach(element => {
    const active = element.dataset.comparisonId === state.activeComparisonId;
    element.classList.toggle("active", active);
    if (element.matches("tr")) element.setAttribute("aria-selected", String(active));
  });
}

function playerMiniProfile(player) {
  return `<div class="comparison-mini-profile">
    <strong>${escapeHtml(player.name)}</strong>
    <span>${escapeHtml(player.team)} &middot; ${player.model.toUpperCase()}${player.draft2026 ? ` &middot; Drafted #${player.draft2026.pick}` : ""}</span>
    <small>${escapeHtml(player.archetype || "--")} &middot; ${heightLabel(player.height)}</small>
  </div>`;
}

function differenceList(rows, target, candidate) {
  return `<ul>${rows.map(row => `<li><strong>${escapeHtml(row.label)}</strong><span>${Math.round(row.target)} vs ${Math.round(row.candidate)} percentile</span><b>${Math.round(row.gap)} gap</b></li>`).join("")}</ul>`;
}

function radarSvg(labels, targetValues, candidateValues, targetName, candidateName) {
  if (!labels.length) return `<p class="comparison-table-empty">No profile is available.</p>`;
  const size = 520;
  const center = size / 2;
  const radius = 174;
  const point = (index, value) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / labels.length;
    const distance = radius * value / 100;
    return [center + Math.cos(angle) * distance, center + Math.sin(angle) * distance];
  };
  const polygon = (values, fallback) => labels.map((_, index) => point(index, Number.isFinite(values[index]) ? values[index] : fallback).map(value => value.toFixed(1)).join(",")).join(" ");
  const grids = [20, 40, 60, 80, 100].map(value => `<polygon points="${polygon(labels.map(() => value), value)}"></polygon>`).join("");
  const axes = labels.map((label, index) => {
    const [x, y] = point(index, 100);
    const [labelX, labelY] = point(index, 118);
    const anchor = Math.abs(labelX - center) < 15 ? "middle" : labelX < center ? "end" : "start";
    return `<line x1="${center}" y1="${center}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}"></line><text x="${labelX.toFixed(1)}" y="${labelY.toFixed(1)}" text-anchor="${anchor}">${escapeHtml(label)}</text>`;
  }).join("");
  const candidateShape = candidateValues.length ? `<polygon class="candidate-shape" points="${polygon(candidateValues, 50)}"><title>${escapeHtml(candidateName || "Comparison player")}</title></polygon>` : "";
  return `<svg viewBox="0 0 ${size} ${size}" role="img" aria-label="Normalized similarity profile for ${escapeHtml(targetName)}${candidateName ? ` and ${escapeHtml(candidateName)}` : ""}">
    <g class="radar-grid">${grids}${axes}</g>
    ${candidateShape}
    <polygon class="target-shape" points="${polygon(targetValues, 50)}"><title>${escapeHtml(targetName)}</title></polygon>
    <circle class="radar-center" cx="${center}" cy="${center}" r="2"></circle>
  </svg>`;
}

function methodDescription() {
  if (state.method === "verspi") return "Mahalanobis distance across seven VERSPI+D components after each component is standardized within the player's division and season.";
  if (state.method === "box") return "Euclidean distance across nine interpretable style components built from division-and-season standardized box and play-by-play inputs.";
  return "Two-stage result: VERSPI+D Mahalanobis builds the broad shortlist; box and play-by-play style re-ranks it. Final score weights style 60% and VERSPI+D 40%.";
}

function poolLabel() {
  return state.pool === "same" ? `Only ${state.targetLevel.toUpperCase()}` : state.pool === "cross" ? `Only ${state.targetLevel === "d1" ? "D2" : "D1"}` : "Combined divisions";
}

function activateButtons(container, dataKey, activeValue) {
  container.querySelectorAll(`[data-${kebab(dataKey)}]`).forEach(button => {
    button.classList.toggle("active", button.dataset[dataKey] === activeValue);
  });
}

function kebab(value) {
  return value.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

function score(value) {
  return Number.isFinite(Number(value)) ? Number(value).toFixed(1) : "--";
}

function scoreTone(value) {
  return Number(value) >= 85 ? "strong" : Number(value) >= 72 ? "solid" : "watch";
}

function heightLabel(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches) || inches <= 0) return "--";
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}\"`;
}

function exportComparison() {
  if (exportInProgress || !selectedPlayer()) return;
  exportInProgress = true;
  const originalTitle = document.title;
  document.title = `${selectedPlayer().name} - Player Comparison`;
  document.body.classList.add("comparison-print-export");
  els.exportButton.disabled = true;
  const cleanup = () => {
    document.body.classList.remove("comparison-print-export");
    els.exportButton.disabled = false;
    document.title = originalTitle;
    exportInProgress = false;
  };
  window.addEventListener("afterprint", cleanup, { once: true });
  requestAnimationFrame(() => {
    window.print();
    setTimeout(() => { if (exportInProgress) cleanup(); }, 1500);
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
