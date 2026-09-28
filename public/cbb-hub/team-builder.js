import {
  CATS,
  STAT_COLS,
  fmt,
  loadHubData,
  matchesStateFilter,
  setupAuth,
  setupStateMultiSelect,
  showAppWhenAuthed
} from "/cbb-hub/core.js?v=20260928-nbablend1";

let user = null;
let payload = null;
let projectionModel = null;
let metricDefs = [];
let teamRows = [];
let teamBySeason = new Map();
let seasonMetricValues = new Map();
let playersById = new Map();
let started = false;
let visibleTeams = [];
let activeTeamIndex = -1;
let teamQuery = "";
let state = {
  team: "",
  season: "2025-26",
  search: "",
  roster: [],
  poolLevels: new Set(["d1", "d2"]),
  poolTier: "",
  states: new Set(),
  poolRanges: {}
};

const els = {
  team: document.getElementById("teamSelect"),
  teamOptions: document.getElementById("teamOptions"),
  season: document.getElementById("seasonSelect"),
  search: document.getElementById("search"),
  poolLevels: document.getElementById("poolLevels"),
  poolTier: document.getElementById("poolTier"),
  poolState: document.getElementById("poolState"),
  poolRanges: document.getElementById("poolRangeFilters"),
  poolFilterCount: document.getElementById("poolFilterCount"),
  poolFilterReset: document.getElementById("poolFilterReset"),
  poolSummary: document.getElementById("poolSummary"),
  needs: document.getElementById("teamNeeds"),
  pool: document.getElementById("playerPool"),
  roster: document.getElementById("roster"),
  summary: document.getElementById("fitSummary"),
  history: document.getElementById("teamMatches")
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
  teamBySeason = new Map(teamRows.map(row => [`${row.season}\u0000${canonical(row.team)}`, row]));
  playersById = new Map(payload.players.map(player => [player.id, player]));
  for (const season of payload.seasons) {
    const rows = teamRows.filter(row => row.season === season);
    metricDefs.forEach(definition => {
      const values = rows.map(row => row.metrics[definition.index]).filter(value => value !== null && value !== undefined).sort((a, b) => a - b);
      seasonMetricValues.set(`${season}\u0000${definition.key}`, values);
    });
  }
}

function hydrateControls() {
  els.season.innerHTML = payload.seasons.map(season => `<option ${season === state.season ? "selected" : ""}>${season}</option>`).join("");
  const teams = teamsForSeason();
  state.team = teams.includes("Duke") ? "Duke" : teams[0] || "";
  els.team.value = state.team;
  renderTeamOptions();
  setupStateMultiSelect(els.poolState, payload.states, state.states, renderPool);
  renderPoolRangeFilters();
}

function bindControls() {
  els.season.onchange = event => {
    state.season = event.target.value;
    state.roster = [];
    const teams = teamsForSeason();
    if (!teams.includes(state.team)) state.team = teams[0] || "";
    els.team.value = state.team;
    renderTeamOptions();
    closeTeamOptions();
    render();
  };

  els.team.onfocus = () => {
    els.team.select();
    showTeamOptions(els.team.value === state.team ? "" : els.team.value);
  };
  els.team.onclick = () => showTeamOptions(els.team.value === state.team ? "" : els.team.value);
  els.team.oninput = event => showTeamOptions(event.target.value);
  els.team.onkeydown = event => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (els.teamOptions.classList.contains("hidden")) showTeamOptions(els.team.value === state.team ? "" : els.team.value);
      if (!visibleTeams.length) return;
      const direction = event.key === "ArrowDown" ? 1 : -1;
      activeTeamIndex = activeTeamIndex < 0
        ? (direction > 0 ? 0 : visibleTeams.length - 1)
        : (activeTeamIndex + direction + visibleTeams.length) % visibleTeams.length;
      renderTeamOptions(teamQuery, true);
    } else if (event.key === "Enter") {
      if (!els.teamOptions.classList.contains("hidden") && visibleTeams.length) {
        event.preventDefault();
        selectTeam(visibleTeams[Math.max(0, activeTeamIndex)]);
      }
    } else if (event.key === "Escape") {
      event.preventDefault();
      closeTeamOptions(true);
    }
  };
  els.team.onblur = () => setTimeout(() => closeTeamOptions(true), 100);
  document.addEventListener("mousedown", event => {
    if (!event.target.closest(".team-combobox")) closeTeamOptions(true);
  });
  els.search.oninput = event => {
    state.search = event.target.value.trim().toLowerCase();
    renderPool();
  };
  els.poolLevels.querySelectorAll("button[data-pool-level]").forEach(button => {
    button.onclick = () => {
      const level = button.dataset.poolLevel;
      if (state.poolLevels.has(level)) {
        if (state.poolLevels.size === 1) return;
        state.poolLevels.delete(level);
      } else {
        state.poolLevels.add(level);
      }
      renderPool();
    };
  });
  els.poolTier.onchange = event => {
    state.poolTier = event.target.value;
    renderPool();
  };
  els.poolFilterReset.onclick = () => {
    state.poolRanges = {};
    renderPoolRangeFilters();
    renderPool();
  };
}

function renderPoolRangeFilters() {
  const groups = [
    ["Fit score", [["fit", "Fit"]]],
    ["VERSPI+D", CATS.map(([key, label]) => [`verspi:${key}`, label])],
    ["Box stats", STAT_COLS.map(key => [`stats:${key}`, key])]
  ];
  els.poolRanges.innerHTML = groups.map(([title, metrics]) => `<section class="pool-range-group">
    <h3>${escapeHtml(title)}</h3>
    <div class="pool-range-grid">${metrics.map(([key, label]) => {
      const bounds = state.poolRanges[key] || {};
      return `<label class="pool-range-item"><span>${escapeHtml(label)}</span><span>
        <input type="number" inputmode="decimal" placeholder="min" data-pool-range="${escapeHtml(key)}" data-bound="min" value="${bounds.min ?? ""}">
        <input type="number" inputmode="decimal" placeholder="max" data-pool-range="${escapeHtml(key)}" data-bound="max" value="${bounds.max ?? ""}">
      </span></label>`;
    }).join("")}</div>
  </section>`).join("");
  els.poolRanges.querySelectorAll("input[data-pool-range]").forEach(input => {
    input.oninput = () => {
      const key = input.dataset.poolRange;
      state.poolRanges[key] = state.poolRanges[key] || {};
      state.poolRanges[key][input.dataset.bound] = input.value === "" ? undefined : Number(input.value);
      updatePoolFilterCount();
      renderPool();
    };
  });
  updatePoolFilterCount();
}

function updatePoolFilterCount() {
  const active = Object.values(state.poolRanges).filter(bounds => bounds.min !== undefined || bounds.max !== undefined).length;
  els.poolFilterCount.textContent = `${active} active`;
}

function teamsForSeason() {
  return [...new Set(teamRows.filter(row => row.season === state.season).map(row => row.team).filter(Boolean))].sort();
}

function renderTeamOptions(query = "", open = false) {
  const teams = teamsForSeason();
  if (!teams.includes(state.team)) state.team = teams[0] || "";
  const needle = query.trim().toLowerCase();
  visibleTeams = teams
    .filter(team => !needle || team.toLowerCase().includes(needle))
    .sort((a, b) => {
      const aStarts = needle && a.toLowerCase().startsWith(needle) ? 0 : 1;
      const bStarts = needle && b.toLowerCase().startsWith(needle) ? 0 : 1;
      return aStarts - bStarts || a.localeCompare(b);
    });
  if (activeTeamIndex >= visibleTeams.length) activeTeamIndex = visibleTeams.length - 1;
  els.teamOptions.innerHTML = visibleTeams.length
    ? visibleTeams.map((team, index) => `<button type="button" role="option" data-team="${escapeHtml(team)}" aria-selected="${team === state.team}" class="${index === activeTeamIndex ? "active" : ""}">${escapeHtml(team)}</button>`).join("")
    : `<p>No schools match "${escapeHtml(query.trim())}".</p>`;
  els.teamOptions.querySelectorAll("button[data-team]").forEach(button => {
    button.onmousedown = event => {
      event.preventDefault();
      selectTeam(button.dataset.team);
    };
  });
  if (open) {
    els.teamOptions.classList.remove("hidden");
    els.team.setAttribute("aria-expanded", "true");
    els.teamOptions.querySelector("button.active")?.scrollIntoView({ block: "nearest" });
  }
}

function showTeamOptions(query = "") {
  teamQuery = query;
  activeTeamIndex = -1;
  renderTeamOptions(teamQuery, true);
}

function closeTeamOptions(restore = false) {
  els.teamOptions.classList.add("hidden");
  els.team.setAttribute("aria-expanded", "false");
  if (restore) els.team.value = state.team;
  teamQuery = "";
  activeTeamIndex = -1;
}

function selectTeam(team) {
  if (!teamsForSeason().includes(team)) return;
  const changed = state.team !== team;
  state.team = team;
  els.team.value = team;
  if (changed) state.roster = [];
  closeTeamOptions();
  render();
}

function selectedTeam() {
  return teamBySeason.get(`${state.season}\u0000${canonical(state.team)}`);
}

function metricDef(key) {
  return metricDefs.find(definition => definition.key === key);
}

function metricValue(team, key) {
  const definition = metricDef(key);
  return definition && team ? team.metrics[definition.index] : null;
}

function orientedPercentile(team, definition) {
  const value = team?.metrics?.[definition.index];
  const values = seasonMetricValues.get(`${state.season}\u0000${definition.key}`) || [];
  if (value === null || value === undefined || !values.length || !definition.direction) return 50;
  const below = values.filter(item => item <= value).length / values.length * 100;
  return definition.direction > 0 ? below : 100 - below;
}

const CATEGORY_METRICS = {
  v: ["FTRate", "FG3Rate"],
  e: ["AdjOE", "eFG", "FG3Pct", "FG2Pct", "FTPct"],
  r: ["ORPct", "D_ORPct"],
  s: ["TOPct", "NSTRate", "D_TOPct", "OppStlRate"],
  p: ["ARate"],
  i: ["AdjEM", "AdjOE", "AdjDE"],
  d: ["AdjDE", "D_eFG", "D_TOPct", "D_ORPct", "D_FTRate", "OppFG3Pct", "OppFG2Pct", "BlockPct", "StlRate"]
};

function fitContext() {
  const team = selectedTeam();
  const percentiles = new Map(metricDefs.map(definition => [definition.key, orientedPercentile(team, definition)]));
  const categoryNeeds = {};
  CATS.forEach(([key]) => {
    const values = (CATEGORY_METRICS[key] || []).map(metric => percentiles.get(metric)).filter(value => value !== undefined);
    categoryNeeds[key] = values.length ? 100 - average(values) : 50;
  });
  return { team, percentiles, categoryNeeds };
}

function playerDelta(player, definitionOrKey) {
  const definition = typeof definitionOrKey === "string" ? metricDef(definitionOrKey) : definitionOrKey;
  if (!definition) return 0;
  return Number(player.teamImpact?.delta?.[definition.index] || 0);
}

function impactScale(definition) {
  return Number(projectionModel.predictionCaps?.[definition.index] || projectionModel.caps?.[definition.index] || 1);
}

function fitScore(player, context = fitContext()) {
  let impactTotal = 0;
  let impactWeight = 0;
  metricDefs.forEach(definition => {
    if (!definition.direction) return;
    const weakness = 100 - (context.percentiles.get(definition.key) ?? 50);
    const importance = (definition.key === "AdjEM" ? 2 : definition.key === "AdjOE" || definition.key === "AdjDE" ? 1.4 : 1);
    const weight = importance * (0.4 + weakness / 100);
    const normalized = clamp(playerDelta(player, definition) * definition.direction / impactScale(definition), -1, 1);
    impactTotal += normalized * weight;
    impactWeight += weight;
  });
  const impactFit = 50 + (impactWeight ? impactTotal / impactWeight * 35 : 0);

  let roleTotal = 0;
  let roleWeight = 0;
  CATS.forEach(([key]) => {
    const value = Number(player.verspi?.[key]);
    if (Number.isNaN(value)) return;
    const weight = 0.3 + context.categoryNeeds[key] / 100;
    roleTotal += value * weight;
    roleWeight += weight;
  });
  const roleFit = roleWeight ? roleTotal / roleWeight : 50;
  const quality = average(CATS.map(([key]) => Number(player.verspi?.[key])).filter(Number.isFinite)) ?? 50;
  return clamp(impactFit * 0.70 + roleFit * 0.20 + quality * 0.10, 0, 100);
}

function availablePlayers(context = fitContext()) {
  return payload.players
    .filter(player => player.season === "2025-26" && player.teamImpact && !state.roster.includes(player.id))
    .filter(player => state.poolLevels.has(player.model))
    .filter(player => canonical(player.team) !== canonical(state.team))
    .filter(player => !state.poolTier || player.model !== "d1" || player.tier === state.poolTier)
    .filter(player => matchesStateFilter(player, state.states))
    .filter(player => !state.search || `${player.name} ${player.team} ${player.statsTeam || ""} ${player.archetype}`.toLowerCase().includes(state.search))
    .map(player => ({ player, fit: fitScore(player, context) }))
    .filter(item => matchesPoolRanges(item))
    .sort((a, b) => b.fit - a.fit)
    .slice(0, 100);
}

function matchesPoolRanges({ player, fit }) {
  for (const [key, bounds] of Object.entries(state.poolRanges)) {
    let value;
    if (key === "fit") value = fit;
    else if (key.startsWith("verspi:")) value = player.verspi?.[key.slice(7)];
    else if (key.startsWith("stats:")) {
      const stat = key.slice(6);
      value = player.stats?.[stat];
      if (stat.includes("%") && value !== null && value !== undefined && Math.abs(Number(value)) <= 1) value = Number(value) * 100;
    }
    value = value === null || value === undefined || value === "" ? null : Number(value);
    if (bounds.min !== undefined && (!Number.isFinite(value) || value < bounds.min)) return false;
    if (bounds.max !== undefined && (!Number.isFinite(value) || value > bounds.max)) return false;
  }
  return true;
}

function rosterPlayers() {
  return state.roster.map(id => playersById.get(id)).filter(Boolean);
}

function render() {
  if (!payload || !user) return;
  renderNeeds();
  renderPool();
  renderRoster();
  renderTeamProjection();
  renderHistory();
}

function renderNeeds() {
  const team = selectedTeam();
  const weakest = metricDefs
    .filter(definition => definition.direction)
    .map(definition => ({ definition, percentile: orientedPercentile(team, definition) }))
    .sort((a, b) => a.percentile - b.percentile)
    .slice(0, 8);
  els.needs.innerHTML = weakest.map(({ definition, percentile }) => `
    <div class="need-metric">
      <span><strong>${escapeHtml(definition.label)}</strong><small>${formatMetric(definition, metricValue(team, definition.key))}</small></span>
      <div class="bar"><span style="width:${clamp(percentile, 2, 100)}%"></span></div>
      <b>${Math.round(percentile)}th</b>
    </div>
  `).join("");
}

function renderPool() {
  const context = fitContext();
  const matches = availablePlayers(context);
  els.poolLevels.querySelectorAll("button[data-pool-level]").forEach(button => {
    button.classList.toggle("active", state.poolLevels.has(button.dataset.poolLevel));
  });
  els.poolTier.disabled = !state.poolLevels.has("d1");
  els.poolSummary.textContent = `${matches.length} best match${matches.length === 1 ? "" : "es"}`;
  els.pool.innerHTML = matches.length ? matches.map(({ player, fit }) => `
    <div class="pool-item">
      <span>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${player.model.toUpperCase()} · ${escapeHtml(player.team)}${player.model === "d1" && player.tier ? ` · ${escapeHtml(player.tier)}` : ""} · ${escapeHtml(player.archetype)}${player.draft2026 ? ` · Drafted #${player.draft2026.pick}` : ""}</small>
        <small class="impact-line">${impactSummary(player, 2)}</small>
      </span>
      <span class="pool-action"><b>${fmt(fit)}</b><button data-add="${player.id}" type="button">Add</button></span>
    </div>
  `).join("") : `<p class="muted">No players match that search.</p>`;
  els.pool.querySelectorAll("button[data-add]").forEach(button => button.onclick = () => {
    state.roster.push(button.dataset.add);
    render();
  });
}

function renderRoster() {
  const players = rosterPlayers();
  els.roster.innerHTML = players.length ? players.map(player => {
    const comps = (player.teamImpact?.comps || []).map(comp => `${escapeHtml(comp.name)}: ${escapeHtml(comp.from)} → ${escapeHtml(comp.to)}`).join(" · ");
    return `<div class="roster-item">
      <span>
        <strong>${escapeHtml(player.name)}</strong>
        <small>${player.model.toUpperCase()} · ${escapeHtml(player.archetype)} · ${player.teamImpact.confidence} confidence · ${player.teamImpact.sample} comparable transfers</small>
        <small class="impact-line">${impactSummary(player, 4)}</small>
        <small class="comp-line">Closest moves: ${comps || "No close historical moves"}</small>
      </span>
      <button data-remove="${player.id}" type="button">Remove</button>
    </div>`;
  }).join("") : `<p class="muted">Add players from the fit list to update the team projection.</p>`;
  els.roster.querySelectorAll("button[data-remove]").forEach(button => button.onclick = () => {
    state.roster = state.roster.filter(id => id !== button.dataset.remove);
    render();
  });
}

function projectedTeam() {
  const base = selectedTeam();
  const players = rosterPlayers();
  if (!base) return null;
  const metrics = metricDefs.map(definition => {
    const current = base.metrics[definition.index];
    if (current === null || current === undefined) return null;
    const rawChange = players.reduce((sum, player) => sum + playerDelta(player, definition), 0);
    const oriented = definition.direction ? rawChange * definition.direction : 0;
    const percentile = orientedPercentile(base, definition);
    const needMultiplier = oriented > 0 ? 0.85 + 0.45 * (1 - percentile / 100) : 1;
    const adjustedChange = rawChange * needMultiplier;
    const cohortCap = Number(projectionModel.cohortCaps?.[definition.index] || projectionModel.caps?.[definition.index] || Math.abs(adjustedChange) || 1);
    const rosterCap = cohortCap * (1 + 0.12 * Math.max(0, Math.min(players.length - 1, 5)));
    return current + clamp(adjustedChange, -rosterCap, rosterCap);
  });
  const adjO = metricDef("AdjOE");
  const adjD = metricDef("AdjDE");
  const adjEm = metricDef("AdjEM");
  if (adjO && adjD && adjEm && metrics[adjO.index] !== null && metrics[adjD.index] !== null) {
    metrics[adjEm.index] = metrics[adjO.index] - metrics[adjD.index];
  }
  return { team: base.team, season: base.season, metrics };
}

function renderTeamProjection() {
  const current = selectedTeam();
  const projected = projectedTeam();
  if (!current || !projected) {
    els.summary.innerHTML = `<p class="muted">No KenPom team row is available for this school and season.</p>`;
    return;
  }

  const headlineKeys = ["AdjEM", "AdjOE", "AdjDE", "AdjTempo"];
  const rank = projectedRank(projected, "AdjEM");
  const groups = [...new Set(metricDefs.map(definition => definition.group))];
  els.summary.innerHTML = `
    <div class="projection-kpis">
      ${headlineKeys.map(key => {
        const definition = metricDef(key);
        const currentValue = current.metrics[definition.index];
        const projectedValue = projected.metrics[definition.index];
        return `<div class="projection-kpi">
          <strong>${formatMetric(definition, projectedValue)}</strong>
          <span>${escapeHtml(definition.label)}</span>
          <small>${formatChange(definition, projectedValue - currentValue)}</small>
        </div>`;
      }).join("")}
      <div class="projection-kpi">
        <strong>#${rank}</strong>
        <span>Projected AdjEM rank</span>
        <small>${rosterPlayers().length} addition${rosterPlayers().length === 1 ? "" : "s"}</small>
      </div>
    </div>
    <div class="projection-table-wrap">
      <table class="projection-table">
        <thead><tr><th>Team metric</th><th>Current</th><th>Projected</th><th>Change</th></tr></thead>
        <tbody>${groups.map(group => `
          <tr class="metric-group"><th colspan="4">${escapeHtml(group)}</th></tr>
          ${metricDefs.filter(definition => definition.group === group).map(definition => {
            const currentValue = current.metrics[definition.index];
            const projectedValue = projected.metrics[definition.index];
            const change = projectedValue === null || currentValue === null ? null : projectedValue - currentValue;
            return `<tr>
              <td>${escapeHtml(definition.label)}</td>
              <td>${formatMetric(definition, currentValue)}</td>
              <td>${formatMetric(definition, projectedValue)}</td>
              <td class="${changeClass(definition, change)}">${formatChange(definition, change)}</td>
            </tr>`;
          }).join("")}
        `).join("")}</tbody>
      </table>
    </div>
    <p class="model-note">${projectionModel.training?.transfers?.toLocaleString() || "--"} historical D1 transfer outcomes · ${escapeHtml(projectionModel.training?.method || "")}</p>`;
}

function renderHistory() {
  const history = teamRows.filter(row => canonical(row.team) === canonical(state.team)).sort((a, b) => a.season.localeCompare(b.season));
  const keys = ["AdjEM", "AdjOE", "AdjDE", "AdjTempo", "eFG", "TOPct", "ORPct", "D_eFG"];
  els.history.innerHTML = history.length ? `<div class="projection-table-wrap"><table class="projection-table history-table">
    <thead><tr><th>Season</th>${keys.map(key => `<th>${escapeHtml(metricDef(key).label)}</th>`).join("")}</tr></thead>
    <tbody>${history.map(row => `<tr><td>${row.season}</td>${keys.map(key => {
      const definition = metricDef(key);
      return `<td>${formatMetric(definition, row.metrics[definition.index])}</td>`;
    }).join("")}</tr>`).join("")}</tbody>
  </table></div>` : `<p class="muted">No historical team rows found.</p>`;
}

function impactSummary(player, limit) {
  const ranked = metricDefs
    .filter(definition => definition.direction)
    .map(definition => ({ definition, delta: playerDelta(player, definition) }))
    .sort((a, b) => Math.abs(b.delta / impactScale(b.definition)) - Math.abs(a.delta / impactScale(a.definition)))
    .slice(0, limit);
  return ranked.map(({ definition, delta }) => `${escapeHtml(definition.label)} ${formatChange(definition, delta)}`).join(" · ");
}

function projectedRank(projected, key) {
  const definition = metricDef(key);
  const value = projected.metrics[definition.index];
  const values = seasonMetricValues.get(`${state.season}\u0000${key}`) || [];
  if (value === null || value === undefined || !values.length) return "--";
  return definition.direction >= 0
    ? 1 + values.filter(item => item > value).length
    : 1 + values.filter(item => item < value).length;
}

function formatMetric(definition, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return definition.format === "pct" ? `${Number(value).toFixed(1)}%` : fmt(value);
}

function formatChange(definition, value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  const rounded = Math.abs(value) < 0.05 ? 0 : value;
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(1)}${definition.format === "pct" ? " pp" : ""}`;
}

function changeClass(definition, change) {
  if (change === null || !definition.direction || Math.abs(change) < 0.05) return "change-neutral";
  return change * definition.direction > 0 ? "change-good" : "change-bad";
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
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
