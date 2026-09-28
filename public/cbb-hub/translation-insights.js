import {
  bindSortHeaders,
  loadHubData,
  setupAuth,
  setupStateMultiSelect,
  showNotice,
  showAppWhenAuthed,
  sortHeader,
  sortRows
} from "/cbb-hub/core.js?v=20260928-nbablend1";
import {
  latestMovementSeason,
  movementRows,
  rankTransferImpactMatches,
  rankHypotheticalTransferMatches
} from "/cbb-hub/transfer-comparison-model.mjs?v=20260922-states1";

let user = null;
let payload = null;
let started = false;
let transferExportInProgress = false;
let movementSortState = { sortKey: "", sortDir: "desc" };
let comparisonSortState = { sortKey: "", sortDir: "desc" };
let state = {
  level: "d2d1",
  group: 0,
  impactRoute: "all",
  movementSearch: "",
  movementArchetype: "",
  movementSeason: "",
  movementStates: new Set(),
  comparisonLevel: "d1",
  comparisonPool: "same",
  comparisonMode: "hypothetical",
  comparisonSeason: "",
  comparisonArchetype: "all",
  comparisonTier: "",
  comparisonSelectedId: "",
  comparisonSearch: "",
  comparisonDestination: "",
  comparisonMyTeam: "",
  comparisonStates: new Set()
};

const els = {
  level: document.getElementById("insightLevel"),
  sample: document.getElementById("insightSample"),
  insightsGrid: document.getElementById("insightsGrid"),
  skill: document.getElementById("skillSurvival"),
  groups: document.getElementById("impactGroups"),
  impact: document.getElementById("archetypeImpact"),
  impactTitle: document.getElementById("impactTitle"),
  impactSubtitle: document.getElementById("impactSubtitle"),
  impactRouteControls: document.getElementById("impactRouteControls"),
  impactRoute: document.getElementById("impactRoute"),
  movementCard: document.getElementById("movementCard"),
  movementTitle: document.getElementById("movementTitle"),
  movementSubtitle: document.getElementById("movementSubtitle"),
  movementSearch: document.getElementById("movementSearch"),
  movementArchetype: document.getElementById("movementArchetype"),
  movementSeason: document.getElementById("movementSeason"),
  movementState: document.getElementById("movementState"),
  movementBoard: document.getElementById("movementBoard"),
  comparisonCard: document.getElementById("transferComparisonCard"),
  comparisonMode: document.getElementById("transferComparisonMode"),
  comparisonLevel: document.getElementById("transferComparisonLevel"),
  comparisonPool: document.getElementById("transferComparisonPool"),
  comparisonSearch: document.getElementById("transferComparisonSearch"),
  comparisonPicker: document.getElementById("transferComparisonPicker"),
  comparisonSeason: document.getElementById("transferComparisonSeason"),
  comparisonArchetype: document.getElementById("transferComparisonArchetype"),
  comparisonTier: document.getElementById("transferComparisonTier"),
  comparisonDestinationField: document.getElementById("transferComparisonDestinationField"),
  comparisonDestination: document.getElementById("transferComparisonDestination"),
  comparisonDestinations: document.getElementById("transferComparisonDestinations"),
  comparisonMyTeamField: document.getElementById("transferComparisonMyTeamField"),
  comparisonMyTeam: document.getElementById("transferComparisonMyTeam"),
  comparisonMyTeamOptions: document.getElementById("transferComparisonMyTeamOptions"),
  comparisonState: document.getElementById("transferComparisonState"),
  comparisonExport: document.getElementById("exportTransferComparison"),
  comparisonSelected: document.getElementById("transferComparisonSelected"),
  comparisonResults: document.getElementById("transferComparisonResults")
};

setupAuth().then(start);
window.addEventListener("hub-auth", event => start(event.detail));

async function start(currentUser) {
  user = currentUser;
  showAppWhenAuthed(user);
  if (!user) return;
  if (!payload) payload = await loadHubData();
  if (!started) {
    state.level = payload.translationInsights?.default || "d2d1";
    setupStateMultiSelect(els.movementState, payload.states, state.movementStates, () => renderMovementBoard(activeMovementBoard()), { label: "Destination state" });
    setupStateMultiSelect(els.comparisonState, payload.states, state.comparisonStates, renderTransferComparison, { label: "Candidate school state" });
    hydrateMovementFilters(activeMovementBoard());
    hydrateTransferComparison(true);
    bindControls();
    started = true;
  }
  render();
}

function bindControls() {
  els.level.querySelectorAll("button[data-insight-level]").forEach(button => {
    button.onclick = () => {
      state.level = button.dataset.insightLevel;
      state.group = 0;
      state.impactRoute = "all";
      state.movementArchetype = "";
      state.movementSeason = "";
      if (state.level === "transfercompare") hydrateTransferComparison();
      else hydrateMovementFilters(activeMovementBoard());
      render();
    };
  });
  els.impactRoute.onchange = event => {
    state.impactRoute = event.target.value;
    renderArchetypeImpact(payload.translationInsights?.[state.level]?.impact);
  };
  els.movementSearch.oninput = event => {
    state.movementSearch = event.target.value.trim().toLowerCase();
    renderMovementBoard(activeMovementBoard());
  };
  els.movementArchetype.onchange = event => {
    state.movementArchetype = event.target.value;
    renderMovementBoard(activeMovementBoard());
  };
  els.movementSeason.onchange = event => {
    state.movementSeason = event.target.value;
    renderMovementBoard(activeMovementBoard());
  };
  els.comparisonMode.querySelectorAll("button[data-transfer-mode]").forEach(button => {
    button.onclick = () => {
      state.comparisonMode = button.dataset.transferMode;
      els.comparisonMode.querySelectorAll("button[data-transfer-mode]").forEach(other => {
        other.classList.toggle("active", other === button);
      });
      updateComparisonModeVisibility();
      renderTransferComparison();
    };
  });
  els.comparisonLevel.querySelectorAll("button[data-transfer-level]").forEach(button => {
    button.onclick = () => {
      state.comparisonLevel = button.dataset.transferLevel;
      state.comparisonSelectedId = "";
      state.comparisonSearch = "";
      state.comparisonDestination = "";
      state.comparisonTier = "";
      if (els.comparisonTier) els.comparisonTier.value = "";
      hydrateTransferComparison(true);
      renderTransferComparison();
    };
  });
  els.comparisonPool.querySelectorAll("button[data-transfer-pool]").forEach(button => {
    button.onclick = () => {
      state.comparisonPool = button.dataset.transferPool;
      state.comparisonDestination = "";
      state.comparisonTier = "";
      els.comparisonTier.value = "";
      hydrateComparisonDestinations();
      updateComparisonModeVisibility();
      renderTransferComparison();
    };
  });
  els.comparisonSearch.onfocus = renderTransferPicker;
  els.comparisonSearch.oninput = event => {
    state.comparisonSearch = event.target.value.trim().toLowerCase();
    renderTransferPicker();
  };
  els.comparisonSearch.onkeydown = event => {
    if (event.key !== "Enter") return;
    const first = els.comparisonPicker.querySelector("button[data-transfer-reference]");
    if (!first) return;
    event.preventDefault();
    selectTransferReference(first.dataset.transferReference);
  };
  els.comparisonSeason.onchange = event => {
    state.comparisonSeason = event.target.value;
    hydrateComparisonDestinations();
    renderTransferComparison();
  };
  els.comparisonArchetype.onchange = event => {
    state.comparisonArchetype = event.target.value;
    renderTransferComparison();
  };
  els.comparisonTier.onchange = event => {
    state.comparisonTier = event.target.value;
    renderTransferComparison();
  };
  els.comparisonDestination.oninput = event => {
    state.comparisonDestination = event.target.value.trim();
    renderTransferComparison();
  };
  els.comparisonMyTeam.oninput = event => {
    state.comparisonMyTeam = event.target.value.trim();
    renderTransferComparison();
  };
  els.comparisonExport.onclick = exportTransferComparison;
  document.addEventListener("click", event => {
    if (!event.target.closest(".transfer-reference-control")) els.comparisonPicker.classList.add("hidden");
  });
}

function activeMovementBoard() {
  return payload?.translationInsights?.[state.level]?.movementBoard;
}

function comparisonMovementBoard() {
  const insightKey = state.comparisonLevel === "d2" ? "d2d1" : "d1team";
  return payload?.translationInsights?.[insightKey]?.movementBoard;
}

function comparisonCandidateLevel() {
  if (state.comparisonPool !== "cross") return state.comparisonLevel;
  return state.comparisonLevel === "d1" ? "d2" : "d1";
}

function comparisonCandidateBoard() {
  const insightKey = comparisonCandidateLevel() === "d2" ? "d2d1" : "d1team";
  return payload?.translationInsights?.[insightKey]?.movementBoard;
}

function hydrateMovementFilters(board) {
  const rows = board?.rows || [];
  const archetypes = [...new Set(rows.map(row => row.archetype).filter(Boolean))].sort();
  const seasons = [...new Set(rows.map(row => row.season).filter(Boolean))].sort().reverse();
  els.movementArchetype.innerHTML = `<option value="">All archetypes</option>${archetypes.map(value => `<option>${escapeHtml(value)}</option>`).join("")}`;
  els.movementSeason.innerHTML = `<option value="">All seasons</option>${seasons.map(value => `<option>${escapeHtml(value)}</option>`).join("")}`;
  els.movementArchetype.value = state.movementArchetype;
  els.movementSeason.value = state.movementSeason;
}

function render() {
  const showComparison = state.level === "transfercompare";
  els.insightsGrid.classList.toggle("hidden", showComparison);
  els.comparisonCard.classList.toggle("hidden", !showComparison);
  const insight = payload.translationInsights?.[state.level];
  els.level.querySelectorAll("button[data-insight-level]").forEach(button => {
    button.classList.toggle("active", button.dataset.insightLevel === state.level);
  });
  if (showComparison) {
    els.sample.textContent = "Current-season matches ranked by destination-team impact";
    renderTransferComparison();
    return;
  }
  if (!insight) {
    els.sample.textContent = "Translation insight data is unavailable.";
    els.skill.innerHTML = `<p class="muted">No skill-survival sample is available.</p>`;
    els.groups.replaceChildren();
    els.impact.innerHTML = `<p class="muted">No impact sample is available.</p>`;
    els.movementCard.classList.add("hidden");
    return;
  }
  els.sample.textContent = `${insight.label} · ${Number(insight.skill.sample || 0).toLocaleString()} matched players`;
  renderSkillSurvival(insight.skill);
  renderArchetypeImpact(insight.impact);
  const showMovement = Boolean(insight.movementBoard);
  els.movementCard.classList.toggle("hidden", !showMovement);
  if (showMovement) {
    els.movementTitle.textContent = insight.movementBoard.title || (state.level === "d2d1" ? "D2-to-D1 Player Movement Board" : "D1 Player Movement Board");
    els.movementSubtitle.textContent = insight.movementBoard.subtitle || "Estimated destination-team impact";
    renderMovementBoard(insight.movementBoard);
  }
}

function renderSkillSurvival(skill) {
  els.skill.innerHTML = `
    <div class="insight-scroll">
      <table class="insight-matrix skill-survival-matrix">
        <colgroup><col class="insight-label-col">${skill.columns.map(() => `<col class="insight-metric-col">`).join("")}</colgroup>
        <thead><tr><th>Archetype</th>${skill.columns.map(column => `<th>${escapeHtml(column)}</th>`).join("")}</tr></thead>
        <tbody>${skill.rows.map(row => `<tr>
          <th>${escapeHtml(row.archetype)} <small>n=${row.n}</small></th>
          ${skill.columns.map(column => {
            const value = Number(row.cells?.[column]);
            return `<td class="${survivalClass(value)}">${Number.isFinite(value) ? value.toFixed(1) : "--"}</td>`;
          }).join("")}
        </tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="insight-note">${escapeHtml(skill.method)}</p>`;
}

function renderArchetypeImpact(impact) {
  const groups = impact.groups || [];
  state.group = Math.min(state.group, Math.max(0, groups.length - 1));
  const group = groups[state.group] || { name: "Impact", columns: [] };
  const isNba = state.level === "d1nba";
  const isD1Team = state.level === "d1team";
  const routeBreakdowns = impact.routeBreakdowns || [];
  const selectedRoute = routeBreakdowns.find(route => route.key === state.impactRoute) || null;
  const displayedRows = selectedRoute?.rows || impact.rows || [];
  const displayedSample = selectedRoute?.sample ?? impact.sample ?? 0;
  const displayedPanel = selectedRoute?.panelSample ?? impact.panelSample ?? 0;
  const displayedClusters = selectedRoute?.clusters ?? impact.clusters ?? 0;
  els.impactRouteControls.classList.toggle("hidden", !isD1Team || !routeBreakdowns.length);
  if (isD1Team && routeBreakdowns.length) {
    els.impactRoute.innerHTML = `<option value="all">All D1 transfers (${Number(impact.sample || 0).toLocaleString()})</option>${routeBreakdowns.map(route => `<option value="${escapeHtml(route.key)}">${escapeHtml(route.label)} (${Number(route.sample || 0).toLocaleString()})</option>`).join("")}`;
    els.impactRoute.value = selectedRoute?.key || "all";
  }
  els.impactTitle.textContent = isNba ? "NBA Outcome Impact" : isD1Team ? "D1 Transfer Team Impact" : "Team Impact";
  els.impactSubtitle.textContent = isNba
    ? "Above/below expected results"
    : isD1Team
      ? selectedRoute ? `${selectedRoute.label} adjusted effect` : "Adjusted destination-team effect"
      : "Next-season D1 team change";
  els.groups.innerHTML = groups.map((item, index) => `
    <button class="${index === state.group ? "active" : ""}" data-insight-group="${index}" type="button">${escapeHtml(item.name)}</button>
  `).join("");
  els.groups.classList.toggle("single", groups.length <= 1);
  els.groups.querySelectorAll("button[data-insight-group]").forEach(button => {
    button.onclick = () => {
      state.group = Number(button.dataset.insightGroup);
      renderArchetypeImpact(impact);
    };
  });

  els.impact.innerHTML = `
    <div class="insight-scroll">
      <table class="insight-matrix archetype-impact-matrix">
        <colgroup><col class="insight-label-col">${group.columns.map(() => `<col class="insight-metric-col">`).join("")}</colgroup>
        <thead><tr><th>Archetype</th>${group.columns.map(key => `<th>${escapeHtml(impact.metrics?.[key]?.label || key)}</th>`).join("")}</tr></thead>
        <tbody>${displayedRows.length ? displayedRows.map(row => `<tr class="${row.suppressed ? "impact-row-suppressed" : ""}">
          <th title="${escapeHtml(row.suppressed ? row.note : `Matched-control check: ${row.matchedN || 0} clean treated seasons; directional agreement ${row.agreement || "Limited"}.`)}">${escapeHtml(row.arch)} <small>n=${row.n}</small></th>
          ${group.columns.map(key => {
            const cell = row.cells?.[key];
            const metric = impact.metrics?.[key] || {};
            if (isD1Team && row.suppressed) {
              return `<td class="heat-neutral impact-suppressed" title="${escapeHtml(row.note || "Adjusted estimate suppressed because the sample is too small.")}">n&lt;15</td>`;
            }
            const directionless = isD1Team && Number(metric.direction) === 0;
            const colorClass = directionless ? shiftClass(Number(cell?.eff), isD1Team) : heatClass(Number(cell?.eff), isD1Team);
            const colorNote = directionless
              ? "Color shows direction and relative size, not whether the change is better or worse."
              : "Green is favorable after accounting for metric direction; red is unfavorable.";
            const uncertainty = isD1Team && Number.isFinite(Number(cell?.se))
              ? ` Clustered SE ${formatUncertainty(cell.se, metric.format)}${Number.isFinite(Number(cell?.z)) ? `; |z| ${Number(cell.z).toFixed(2)}` : ""}.`
              : "";
            const matched = isD1Team && Number.isFinite(Number(cell?.matched))
              ? ` Matched-control estimate ${formatInsightValue(cell.matched, metric.format)}.`
              : "";
            return `<td class="${colorClass}${isD1Team && Number(cell?.z) < 1 ? " impact-uncertain" : ""}" title="${escapeHtml(colorNote + uncertainty + matched)}"><span>${formatInsightValue(cell?.excess, metric.format)}</span>${isD1Team && Number.isFinite(Number(cell?.se)) ? `<small>SE ${formatUncertainty(cell.se, metric.format)}</small>` : ""}</td>`;
          }).join("")}
        </tr>`).join("") : `<tr><td colspan="${group.columns.length + 1}" class="insight-empty">No matched transfers for this path.</td></tr>`}</tbody>
      </table>
    </div>
    <p class="insight-note">${escapeHtml(impact.method)} ${isD1Team ? `Transfer sample: ${Number(displayedSample).toLocaleString()}. Model panel: ${Number(displayedPanel).toLocaleString()} team-seasons across ${Number(displayedClusters).toLocaleString()} programs. Green/red indicates favorable/unfavorable movement. Blue/orange on pace, shot mix, and point distribution indicates positive/negative movement only.` : `Sample: ${Number(displayedSample).toLocaleString()}.`}</p>`;
}

function renderMovementBoard(board) {
  if (!board) return;
  const needle = state.movementSearch;
  const filtered = (board.rows || []).filter(row => {
    const searchMatch = !needle || `${row.player} ${row.from} ${row.to}`.toLowerCase().includes(needle);
    const archetypeMatch = !state.movementArchetype || row.archetype === state.movementArchetype;
    const seasonMatch = !state.movementSeason || row.season === state.movementSeason;
    const stateMatch = !state.movementStates.size || state.movementStates.has(payload.schoolStates?.[row.to] || "");
    return searchMatch && archetypeMatch && seasonMatch && stateMatch;
  });
  const sorted = sortRows(filtered, movementSortState, (row, key) => movementSortValue(row, key, board));
  const visible = sorted.slice(0, 500);
  els.movementBoard.innerHTML = `
    <p class="movement-count">Showing ${visible.length.toLocaleString()} of ${filtered.length.toLocaleString()} matched ${escapeHtml(board.moveLabel || "D1")} moves</p>
    <div class="projection-table-wrap movement-board-wrap">
      <table class="projection-table movement-board-table">
        <colgroup><col class="movement-player-col"><col class="movement-team-col"><col class="movement-team-col"><col class="movement-season-col"><col class="movement-role-col"><col class="movement-mpg-col">${(board.columns || []).map(() => `<col class="movement-metric-col">`).join("")}</colgroup>
        <thead><tr>
          ${sortHeader("player", "Player", movementSortState)}${sortHeader("from", "From", movementSortState)}${sortHeader("to", "To", movementSortState)}${sortHeader("season", "Arrival", movementSortState)}${sortHeader("archetype", "Archetype", movementSortState)}${sortHeader("mpg", "Prior MPG", movementSortState, "numeric")}
          ${(board.columns || []).map((column, index) => sortHeader(`col:${index}`, column.label, movementSortState, "numeric")).join("")}
        </tr></thead>
        <tbody>${visible.map(row => `<tr>
          <td><strong>${escapeHtml(row.player)}</strong></td>
          <td>${escapeHtml(row.from)}${row.fromTier ? `<small class="movement-tier-label">${escapeHtml(row.fromTier)}</small>` : ""}</td>
          <td>${escapeHtml(row.to)}${row.toTier ? `<small class="movement-tier-label">${escapeHtml(row.toTier)}</small>` : ""}</td>
          <td>${escapeHtml(row.season)}</td>
          <td>${escapeHtml(row.archetype)}</td>
          <td>${Number.isFinite(Number(row.mpg)) ? Number(row.mpg).toFixed(1) : "--"}</td>
          ${(board.columns || []).map((column, index) => {
            const value = row.values?.[index];
            return `<td class="${movementValueClass(value, Number(column.direction))}">${formatInsightValue(value, column.format)}</td>`;
          }).join("")}
        </tr>`).join("")}</tbody>
      </table>
    </div>
    <p class="insight-note">${escapeHtml(board.method)}</p>`;
  bindSortHeaders(els.movementBoard, movementSortState, () => renderMovementBoard(board));
}

function movementSortValue(row, key) {
  if (key === "player") return row.player || "";
  if (key === "from") return row.from || "";
  if (key === "to") return row.to || "";
  if (key === "season") return row.season || "";
  if (key === "archetype") return row.archetype || "";
  if (key === "mpg") return Number(row.mpg);
  if (key.startsWith("col:")) return Number(row.values?.[Number(key.slice(4))]);
  return "";
}

function hydrateTransferComparison(resetSelection = false) {
  const board = comparisonMovementBoard();
  const rows = movementRows(board, state.comparisonLevel);
  const seasons = [...new Set(rows.map(row => row.season).filter(Boolean))].sort().reverse();
  if (!state.comparisonSeason || !seasons.includes(state.comparisonSeason)) {
    state.comparisonSeason = latestMovementSeason(board);
  }
  els.comparisonSeason.innerHTML = seasons.map(season => `<option value="${escapeHtml(season)}">${escapeHtml(season)} (${rows.filter(row => row.season === season).length.toLocaleString()} transfers)</option>`).join("");
  els.comparisonSeason.value = state.comparisonSeason;
  hydrateComparisonDestinations();
  hydrateMyTeamOptions();
  const selectedExists = rows.some(row => row.movementId === state.comparisonSelectedId);
  if (resetSelection || !selectedExists) {
    const defaultRow = rows.find(row => row.season === state.comparisonSeason) || rows[0];
    state.comparisonSelectedId = defaultRow?.movementId || "";
  }
  const selected = rows.find(row => row.movementId === state.comparisonSelectedId);
  els.comparisonSearch.value = selected ? transferLabel(selected) : "";
  els.comparisonPicker.classList.add("hidden");
  els.comparisonLevel.querySelectorAll("button[data-transfer-level]").forEach(button => {
    button.classList.toggle("active", button.dataset.transferLevel === state.comparisonLevel);
  });
  els.comparisonMode.querySelectorAll("button[data-transfer-mode]").forEach(button => {
    button.classList.toggle("active", button.dataset.transferMode === state.comparisonMode);
  });
  els.comparisonPool.querySelectorAll("button[data-transfer-pool]").forEach(button => {
    const active = button.dataset.transferPool === state.comparisonPool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  updateComparisonModeVisibility();
}

function updateComparisonModeVisibility() {
  const isHypothetical = state.comparisonMode === "hypothetical";
  els.comparisonMyTeamField.classList.toggle("hidden", !isHypothetical);
  els.comparisonDestinationField.classList.toggle("hidden", isHypothetical);
  const tierApplies = comparisonCandidateLevel() !== "d2";
  els.comparisonTier.disabled = !tierApplies;
  els.comparisonTier.title = tierApplies ? "" : "D2 schools aren't classified into conference tiers";
}

function hydrateMyTeamOptions() {
  const schools = [...new Set(Object.keys(payload.teamTiers || {}))].sort((left, right) => left.localeCompare(right));
  els.comparisonMyTeamOptions.innerHTML = schools.map(school => `<option value="${escapeHtml(school)}"></option>`).join("");
  if (!state.comparisonMyTeam) {
    state.comparisonMyTeam = schools.find(school => school === "Drexel") || "";
  }
  els.comparisonMyTeam.value = state.comparisonMyTeam;
}

function latestPlayerSeason() {
  const seasons = payload.seasons || [];
  return [...seasons].sort().at(-1) || state.comparisonSeason;
}

function computeTransferRanking() {
  const board = comparisonMovementBoard();
  const candidateBoard = comparisonCandidateBoard();
  const candidateLevel = comparisonCandidateLevel();
  if (state.comparisonMode === "hypothetical") {
    const candidateSeason = latestPlayerSeason();
    const ranked = rankHypotheticalTransferMatches(payload, board, state.comparisonSelectedId, state.comparisonMyTeam, {
      level: state.comparisonLevel,
      candidateBoard,
      archetype: state.comparisonArchetype,
      tier: state.comparisonTier,
      candidateLevel,
      candidateSeason,
      states: state.comparisonStates,
      limit: 100
    });
    return { ...ranked, mode: "hypothetical", season: candidateSeason, destination: ranked.teamName };
  }
  const ranked = rankTransferImpactMatches(board, state.comparisonSelectedId, {
    level: state.comparisonLevel,
    candidateBoard,
    candidateLevel,
    season: state.comparisonSeason,
    archetype: state.comparisonArchetype,
    tier: state.comparisonTier,
    destination: state.comparisonDestination,
    states: state.comparisonStates,
    schoolStates: payload.schoolStates,
    limit: 100
  });
  return { ...ranked, mode: "realized" };
}

function hydrateComparisonDestinations() {
  const rows = movementRows(comparisonCandidateBoard(), comparisonCandidateLevel())
    .filter(row => !state.comparisonSeason || row.season === state.comparisonSeason);
  const destinations = [...new Set(rows.map(row => row.to).filter(Boolean))].sort((left, right) => left.localeCompare(right));
  els.comparisonDestinations.innerHTML = destinations.map(team => `<option value="${escapeHtml(team)}"></option>`).join("");
  els.comparisonDestination.value = state.comparisonDestination;
}

function renderTransferPicker() {
  const rows = movementRows(comparisonMovementBoard(), state.comparisonLevel);
  const needle = state.comparisonSearch;
  const matches = rows.filter(row => !needle || `${row.player} ${row.from} ${row.to} ${row.season} ${row.archetype}`.toLowerCase().includes(needle))
    .sort((left, right) => String(right.season).localeCompare(String(left.season)) || String(left.player).localeCompare(String(right.player)))
    .slice(0, 14);
  els.comparisonPicker.innerHTML = matches.length ? matches.map(row => `<button type="button" role="option" data-transfer-reference="${escapeHtml(row.movementId)}">
      <strong>${escapeHtml(row.player)}</strong>
      <span>${escapeHtml(row.from)} &rarr; ${escapeHtml(row.to)} &middot; ${escapeHtml(row.season)}</span>
      <small>${escapeHtml(row.archetype || "Unclassified")}</small>
    </button>`).join("") : `<p>No matching transfers.</p>`;
  els.comparisonPicker.classList.remove("hidden");
  els.comparisonPicker.querySelectorAll("button[data-transfer-reference]").forEach(button => {
    button.onclick = () => selectTransferReference(button.dataset.transferReference);
  });
}

function selectTransferReference(movementId) {
  const row = movementRows(comparisonMovementBoard(), state.comparisonLevel).find(item => item.movementId === movementId);
  if (!row) return;
  state.comparisonSelectedId = row.movementId;
  state.comparisonSearch = "";
  els.comparisonSearch.value = transferLabel(row);
  els.comparisonPicker.classList.add("hidden");
  renderTransferComparison();
}

function renderTransferComparison() {
  const board = comparisonMovementBoard();
  if (!board) {
    els.comparisonSelected.innerHTML = "";
    els.comparisonResults.innerHTML = `<p class="insight-empty">Transfer movement data is unavailable.</p>`;
    return;
  }
  els.comparisonLevel.querySelectorAll("button[data-transfer-level]").forEach(button => {
    button.classList.toggle("active", button.dataset.transferLevel === state.comparisonLevel);
  });
  els.comparisonPool.querySelectorAll("button[data-transfer-pool]").forEach(button => {
    const active = button.dataset.transferPool === state.comparisonPool;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  const ranked = computeTransferRanking();
  if (!ranked.selected) {
    els.comparisonSelected.innerHTML = "";
    els.comparisonResults.innerHTML = `<p class="insight-empty">No transfers are available.</p>`;
    return;
  }
  state.comparisonSelectedId = ranked.selected.movementId;
  els.comparisonExport.disabled = !ranked.results.length || transferExportInProgress;
  renderSelectedTransfer(ranked);
  renderTransferMatches(ranked, board);
}

function renderSelectedTransfer(ranked) {
  const row = ranked.selected;
  els.comparisonSelected.innerHTML = `<div class="transfer-selected-band">
    <div class="transfer-selected-identity">
      <span>Reference transfer</span>
      <h3>${escapeHtml(row.player)}</h3>
      <p>${escapeHtml(row.from)} &rarr; ${escapeHtml(row.to)} &middot; ${escapeHtml(row.season)}</p>
      <small>${escapeHtml(row.archetype || "Unclassified")} &middot; ${Number.isFinite(Number(row.mpg)) ? `${Number(row.mpg).toFixed(1)} prior MPG` : "Prior MPG unavailable"}${tierRoute(row)}</small>
    </div>
    <div class="transfer-impact-signature">
      ${ranked.columns.map(column => `<div>
        <span>${escapeHtml(column.label)}</span>
        <strong class="${movementValueClass(row.values?.[column.referenceIndex], Number(column.direction))}">${formatInsightValue(row.values?.[column.referenceIndex], column.format)}</strong>
      </div>`).join("")}
    </div>
  </div>`;
}

function renderTransferMatches(ranked, board) {
  const isHypothetical = ranked.mode === "hypothetical";
  const topMatches = ranked.results.slice(0, 3);
  const sortedResults = sortRows(ranked.results, comparisonSortState, (result, key) => transferResultSortValue(result, key, ranked));
  const tableRows = sortedResults.map(result => {
    const row = result.row;
    return `<tr data-transfer-result="${escapeHtml(row.movementId || row.playerId || "")}">
      <td>${result.rank}</td>
      <td><span class="transfer-similarity ${similarityTone(result.score)}">${result.score.toFixed(1)}</span><small class="transfer-score-detail">Impact ${result.impactScore.toFixed(1)}</small></td>
      <td>${isHypothetical
        ? `<strong>${escapeHtml(row.player)}</strong>`
        : `<button class="transfer-reference-link" data-transfer-reference="${escapeHtml(row.movementId)}" type="button"><strong>${escapeHtml(row.player)}</strong></button>`}</td>
      <td>${escapeHtml(row.from)} <span aria-hidden="true">&rarr;</span> ${escapeHtml(row.to)}${tierRoute(row)}</td>
      <td>${escapeHtml(row.class || "--")}</td>
      <td>${heightFeetInches(row.height)}</td>
      <td>${escapeHtml(row.archetype || "--")}</td>
      <td>${escapeHtml(row.fromTier || "--")}</td>
      <td>${Number.isFinite(Number(row.mpg)) ? Number(row.mpg).toFixed(1) : "--"}</td>
      ${ranked.columns.map(column => `<td class="${movementValueClass(row.values?.[column.candidateIndex], Number(column.direction))}">${formatInsightValue(row.values?.[column.candidateIndex], column.format)}</td>`).join("")}
    </tr>`;
  }).join("");
  const summaryLabel = isHypothetical
    ? `${escapeHtml(ranked.season)} ${comparisonCandidateLevel().toUpperCase()} players evaluated for a move to ${escapeHtml(ranked.destination || "your team")}`
    : `${escapeHtml(ranked.season)} eligible ${comparisonCandidateLevel().toUpperCase()} transfers${ranked.destination ? ` to ${escapeHtml(ranked.destination)}` : ""}`;
  const methodLine = isHypothetical
    ? `Overall match is 90% projected-impact similarity and 10% context, comparing each player's <em>hypothetical</em> impact if added to ${escapeHtml(ranked.destination || "your team")} against the reference transfer's real impact.`
    : "Overall match is 90% destination-impact similarity and 10% context. The separate impact score shows the five-metric match before archetype, prior minutes, and tier path are considered.";
  els.comparisonResults.innerHTML = `
    <div class="transfer-match-summary">
      <div><strong>${ranked.eligibleCount.toLocaleString()}</strong><span>${summaryLabel}</span></div>
      <div><strong>${ranked.results.length.toLocaleString()}</strong><span>closest matches shown</span></div>
      <p>${methodLine}</p>
    </div>
    ${topMatches.length ? `<div class="transfer-top-matches">${topMatches.map(result => transferMatchCard(result, isHypothetical)).join("")}</div>` : ""}
    <div class="projection-table-wrap transfer-comparison-table-wrap">
      <table class="projection-table transfer-comparison-table">
        <thead><tr>${sortHeader("rank", "Rank", comparisonSortState, "numeric", "asc")}${sortHeader("score", "Match", comparisonSortState, "numeric")}${sortHeader("player", "Player", comparisonSortState)}${sortHeader("to", isHypothetical ? "Hypothetical move" : "Transfer", comparisonSortState)}${sortHeader("class", "Class", comparisonSortState)}${sortHeader("height", "Height", comparisonSortState, "numeric")}${sortHeader("archetype", "Archetype", comparisonSortState)}${sortHeader("fromTier", "Conference Tier", comparisonSortState)}${sortHeader("mpg", "Prior MPG", comparisonSortState, "numeric")}${ranked.columns.map((column, index) => sortHeader(`col:${index}`, column.label, comparisonSortState, "numeric")).join("")}</tr></thead>
        <tbody>${tableRows || `<tr><td colspan="${ranked.columns.length + 9}" class="insight-empty">No ${isHypothetical ? "eligible players match the selected filters" : "transfers match the selected season, archetype, and destination filters"}.</td></tr>`}</tbody>
      </table>
    </div>
    <p class="insight-note">Compared by metric key with pooled robust scaling across ${state.comparisonPool === "cross" ? "both divisions" : `the ${state.comparisonLevel.toUpperCase()} reference division`} for ${ranked.columns.map(column => escapeHtml(column.label)).join(", ")}. ${escapeHtml(board.method || "")}</p>`;
  bindSortHeaders(els.comparisonResults, comparisonSortState, () => renderTransferMatches(ranked, board));
  if (!isHypothetical) {
    els.comparisonResults.querySelectorAll("button[data-transfer-reference]").forEach(button => {
      button.onclick = () => selectTransferReference(button.dataset.transferReference);
    });
  }
}

function exportTransferComparison() {
  if (transferExportInProgress) return;
  const board = comparisonMovementBoard();
  const ranked = computeTransferRanking();
  if (!ranked.selected || !ranked.results.length) {
    showNotice("There are no transfer comparisons to export.", "error");
    return;
  }

  transferExportInProgress = true;
  const originalTitle = document.title;
  const originalText = els.comparisonExport.textContent;
  els.comparisonExport.disabled = true;
  els.comparisonExport.textContent = "Preparing...";
  const filterSummary = ranked.mode === "hypothetical" ? [
    `${comparisonCandidateLevel().toUpperCase()} candidates (${state.comparisonPool === "cross" ? "cross division" : "same division"})`,
    `${ranked.season} pool`,
    state.comparisonArchetype === "same" ? `Same archetype (${ranked.selected.archetype || "Unclassified"})` : "All archetypes",
    state.comparisonTier ? `Tier: ${state.comparisonTier}` : "All tiers",
    `My team: ${ranked.destination || "not set"}`
  ].join(" | ") : [
    `${state.comparisonLevel.toUpperCase()} reference → ${comparisonCandidateLevel().toUpperCase()} candidates`,
    `${state.comparisonSeason} candidates`,
    state.comparisonArchetype === "same" ? `Same archetype (${ranked.selected.archetype || "Unclassified"})` : "All archetypes",
    state.comparisonTier ? `Tier: ${state.comparisonTier}` : "All tiers",
    state.comparisonDestination ? `Destination: ${state.comparisonDestination}` : "All destinations"
  ].join(" | ");
  const stage = document.createElement("section");
  stage.className = "transfer-export-stage";
  stage.innerHTML = `<header class="transfer-export-heading">
      <span>VERSPID Transfer Compare</span>
      <h1>${escapeHtml(ranked.selected.player)} Impact Matches</h1>
      <p>${escapeHtml(filterSummary)} &middot; ${ranked.results.length.toLocaleString()} closest matches</p>
    </header>
    <section class="transfer-export-reference">${els.comparisonSelected.innerHTML}</section>
    <section class="transfer-export-results">${els.comparisonResults.innerHTML}</section>`;
  document.body.append(stage);
  document.body.classList.add("transfer-print-export");
  document.title = `VERSPID - ${ranked.selected.player} - Transfer Compare`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("transfer-print-export");
    stage.remove();
    document.title = originalTitle;
    transferExportInProgress = false;
    els.comparisonExport.textContent = originalText;
    els.comparisonExport.disabled = false;
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

function transferMatchCard(result, isHypothetical = false) {
  const row = result.row;
  const inner = `<span class="transfer-match-rank">#${result.rank}</span>
    <span class="transfer-similarity ${similarityTone(result.score)}">${result.score.toFixed(1)}</span>
    <strong>${escapeHtml(row.player)}</strong>
    <span>${escapeHtml(row.from)} &rarr; ${escapeHtml(row.to)}</span>
    <small>${escapeHtml(row.archetype || "--")}${row.fromTier ? ` &middot; ${escapeHtml(row.fromTier)}` : ""} &middot; Impact ${result.impactScore.toFixed(1)} &middot; Context ${result.contextScore.toFixed(1)}</small>`;
  return isHypothetical
    ? `<div class="transfer-match-card transfer-match-card-static">${inner}</div>`
    : `<button class="transfer-match-card" data-transfer-reference="${escapeHtml(row.movementId)}" type="button">${inner}</button>`;
}

function transferLabel(row) {
  return `${row.player} | ${row.from} to ${row.to} | ${row.season}`;
}

function heightFeetInches(inches) {
  const total = Math.round(Number(inches));
  if (!Number.isFinite(total) || total <= 0) return "--";
  return `${Math.floor(total / 12)}'${total % 12}"`;
}

function transferResultSortValue(result, key, ranked) {
  const row = result.row;
  if (key === "rank") return Number(result.rank);
  if (key === "score") return Number(result.score);
  if (key === "player") return row.player || "";
  if (key === "to") return row.to || "";
  if (key === "class") return row.class || "";
  if (key === "height") return Number(row.height);
  if (key === "archetype") return row.archetype || "";
  if (key === "fromTier") return row.fromTier || "";
  if (key === "mpg") return Number(row.mpg);
  if (key.startsWith("col:")) {
    const column = ranked.columns[Number(key.slice(4))];
    return column ? Number(row.values?.[column.candidateIndex]) : "";
  }
  return "";
}

function tierRoute(row) {
  return row.fromTier || row.toTier ? `<span class="transfer-tier-route">${escapeHtml(row.fromTier || "--")} &rarr; ${escapeHtml(row.toTier || "--")}</span>` : "";
}

function similarityTone(score) {
  if (score >= 85) return "strong";
  if (score >= 72) return "good";
  if (score >= 58) return "moderate";
  return "loose";
}

function movementValueClass(value, direction) {
  const number = Number(value);
  if (!Number.isFinite(number) || !direction || Math.abs(number) < 0.005) return "change-neutral";
  return number * direction > 0 ? "change-good" : "change-bad";
}

function survivalClass(value) {
  return heatClass((Number(value) - 50) / 12);
}

function heatClass(effect, d1TeamScale = false) {
  const neutral = d1TeamScale ? 0.012 : 0.035;
  const medium = d1TeamScale ? 0.035 : 0.14;
  const strong = d1TeamScale ? 0.075 : 0.32;
  if (!Number.isFinite(effect) || Math.abs(effect) < neutral) return "heat-neutral";
  const prefix = effect > 0 ? "heat-positive" : "heat-negative";
  const strength = Math.abs(effect) >= strong ? 3 : Math.abs(effect) >= medium ? 2 : 1;
  return `${prefix}-${strength}`;
}

function shiftClass(effect, d1TeamScale = false) {
  const neutral = d1TeamScale ? 0.012 : 0.035;
  const medium = d1TeamScale ? 0.035 : 0.14;
  const strong = d1TeamScale ? 0.075 : 0.32;
  if (!Number.isFinite(effect) || Math.abs(effect) < neutral) return "heat-neutral";
  const prefix = effect > 0 ? "heat-shift-positive" : "heat-shift-negative";
  const strength = Math.abs(effect) >= strong ? 3 : Math.abs(effect) >= medium ? 2 : 1;
  return `${prefix}-${strength}`;
}

function formatInsightValue(value, format = "points") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (format === "score") return number.toFixed(1);
  if (format === "plain") return number.toFixed(1).replace(/\.0$/, "");
  const sign = number > 0 ? "+" : "";
  if (format === "integer") return `${sign}${Math.round(number).toLocaleString()}`;
  if (format === "decimal") return `${sign}${number.toFixed(3)}`;
  if (format === "pp") return `${sign}${number.toFixed(1)} pp`;
  const digits = Math.abs(number) >= 10 ? 1 : 2;
  return `${sign}${number.toFixed(digits).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1")}`;
}

function formatUncertainty(value, format = "points") {
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  if (format === "pp") return `${number.toFixed(1)} pp`;
  if (format === "integer") return Math.round(number).toLocaleString();
  if (format === "decimal") return number.toFixed(3);
  return number.toFixed(Math.abs(number) >= 10 ? 1 : 2).replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1");
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
