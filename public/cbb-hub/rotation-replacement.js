import {
  bindSortHeaders,
  fmt,
  loadHubData,
  matchesStateFilter,
  playerUrl,
  setupAuth,
  setupStateMultiSelect,
  showAppWhenAuthed,
  sortHeader,
  sortRows,
  watchSaved
} from "/cbb-hub/core.js?v=20260928-nbablend1";
import { buildSimilarityIndex } from "/cbb-hub/comparison-model.js?v=20260915-replacement1";
import { rankRotationReplacements } from "/cbb-hub/rotation-replacement-model.mjs?v=20260915-replacement2";

let user = null;
let payload = null;
let similarityIndex = null;
let latestSeason = "2025-26";
let teamPlayers = new Map();
let ranking = { results: [] };
let savedMap = new Map();
let savedUnsub = () => {};
let activeUserId = null;
let buildRevision = 0;
let started = false;

const state = {
  team: "",
  playerId: "",
  search: "",
  tier: "",
  archetype: "",
  states: new Set(),
  minimumMinutes: 20,
  levels: new Set(["d1", "d2"]),
  limit: 50,
  availability: "all",
  expandedId: "",
  sortKey: "replacementScore",
  sortDir: "desc"
};

const els = {
  team: document.getElementById("replacementTeam"),
  player: document.getElementById("replacementPlayer"),
  search: document.getElementById("replacementSearch"),
  tier: document.getElementById("replacementTier"),
  archetype: document.getElementById("replacementArchetype"),
  stateFilter: document.getElementById("replacementState"),
  minutes: document.getElementById("replacementMinutes"),
  levels: document.getElementById("replacementLevels"),
  limit: document.getElementById("replacementLimit"),
  availability: document.getElementById("replacementAvailability"),
  status: document.getElementById("replacementStatus"),
  loss: document.getElementById("replacementLoss"),
  count: document.getElementById("replacementCount"),
  results: document.getElementById("replacementResults")
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
    els.status.textContent = "Loading player model...";
    payload = await loadHubData();
    latestSeason = payload.seasons?.at(-1) || "2025-26";
    indexTeams();
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
      if (ranking.results.length) renderResults();
    });
  }
  await rebuildRanking();
}

function indexTeams() {
  const historicalPlayers = new Map();
  payload.players.filter(player => player.model === "d1" && payload.seasons.includes(player.season)).forEach(player => {
    const team = player.statsTeam || player.team;
    const key = canonical(team);
    if (!historicalPlayers.has(key)) historicalPlayers.set(key, []);
    historicalPlayers.get(key).push(player);
  });
  const currentTeams = [...new Set((payload.teamProjectionModel?.teams || [])
    .filter(row => row.s === latestSeason)
    .map(row => row.t))].sort((left, right) => left.localeCompare(right));
  teamPlayers = new Map(currentTeams.map(team => {
    const players = (historicalPlayers.get(canonical(team)) || []).sort((left, right) => {
      const seasonOrder = String(right.season).localeCompare(String(left.season));
      return seasonOrder || Number(right.stats?.MPG || 0) - Number(left.stats?.MPG || 0);
    });
    return [team, players];
  }).filter(([, players]) => players.length));
}

function hydrateControls() {
  const teams = [...teamPlayers.keys()];
  state.team = teams.includes("Duke") ? "Duke" : teams[0] || "";
  els.team.innerHTML = teams.map(team => `<option>${escapeHtml(team)}</option>`).join("");
  els.team.value = state.team;
  els.archetype.innerHTML = `<option value="">All archetypes</option>${payload.archetypes.map(value => `<option>${escapeHtml(value)}</option>`).join("")}`;
  setupStateMultiSelect(els.stateFilter, payload.states, state.states, renderResults);
  hydratePlayers();
}

function hydratePlayers() {
  const players = teamPlayers.get(state.team) || [];
  if (!players.some(player => player.id === state.playerId)) state.playerId = players[0]?.id || "";
  els.player.innerHTML = players.map(player => `<option value="${escapeAttr(player.id)}">${escapeHtml(player.name)} · ${escapeHtml(player.season)} · ${fmt(player.stats?.MPG)} MPG · ${escapeHtml(player.archetype)}</option>`).join("");
  els.player.value = state.playerId;
}

function bindControls() {
  els.team.onchange = async event => {
    state.team = event.target.value;
    state.playerId = "";
    state.expandedId = "";
    hydratePlayers();
    await rebuildRanking();
  };
  els.player.onchange = async event => {
    state.playerId = event.target.value;
    state.expandedId = "";
    await rebuildRanking();
  };
  els.search.oninput = event => { state.search = event.target.value.trim().toLowerCase(); renderResults(); };
  els.tier.onchange = event => { state.tier = event.target.value; renderResults(); };
  els.archetype.onchange = event => { state.archetype = event.target.value; renderResults(); };
  els.minutes.onchange = event => { state.minimumMinutes = Number(event.target.value); renderResults(); };
  els.limit.onchange = event => { state.limit = Number(event.target.value); renderResults(); };
  els.availability.onchange = event => { state.availability = event.target.value; renderResults(); };
  els.levels.querySelectorAll("button[data-level]").forEach(button => {
    button.onclick = () => {
      const level = button.dataset.level;
      if (state.levels.has(level) && state.levels.size > 1) state.levels.delete(level);
      else state.levels.add(level);
      button.classList.toggle("active", state.levels.has(level));
      renderResults();
    };
  });
}

async function rebuildRanking() {
  const departing = selectedPlayer();
  if (!departing || !state.team) return;
  const revision = ++buildRevision;
  els.status.textContent = "Ranking D1 and D2 candidates...";
  els.count.textContent = "Building replacement board...";
  els.results.innerHTML = `<p class="muted replacement-loading">Comparing role profiles and projecting team impact...</p>`;
  await new Promise(resolve => requestAnimationFrame(() => resolve()));
  const next = rankRotationReplacements(payload, similarityIndex, departing, state.team, { season: latestSeason });
  if (revision !== buildRevision) return;
  ranking = next;
  els.status.textContent = `${next.eligibleCount.toLocaleString()} candidates modeled · ${latestSeason}`;
  renderLoss();
  renderResults();
}

function selectedPlayer() {
  return (teamPlayers.get(state.team) || []).find(player => player.id === state.playerId) || null;
}

function renderLoss() {
  const player = selectedPlayer();
  const loss = ranking.loss;
  if (!player || !loss) {
    els.loss.innerHTML = `<p class="muted">Select a departing player to build the lost-role profile.</p>`;
    return;
  }
  els.loss.innerHTML = `
    <div class="replacement-loss-heading">
      <div><span class="fit-kicker">Rotation loss profile</span><h2>${escapeHtml(player.name)}</h2><p>${escapeHtml(state.team)} · ${escapeHtml(player.class || "--")} · ${heightLabel(player.height)} · ${escapeHtml(player.posTier || "--")} · ${escapeHtml(player.archetype)}</p></div>
      <a class="fit-profile-link" href="${playerUrl(player)}">Open snapshot</a>
    </div>
    <div class="replacement-loss-grid">
      ${lossMetric("Minutes", loss.minutes, "MPG")}
      ${lossMetric("Usage", loss.usage, "%")}
      ${lossMetric("Shooting gravity", loss.shootingGravity)}
      ${lossMetric("Rim pressure", loss.rimPressure)}
      ${lossMetric("Playmaking", loss.playmaking)}
      ${lossMetric("Rebounding", loss.rebounding)}
      ${lossMetric("Defensive events", loss.defensiveEvents)}
      <div class="replacement-loss-tile"><strong>${heightLabel(loss.height)}</strong><span>Size / ${escapeHtml(loss.position)}</span></div>
    </div>
    <p class="replacement-method-note">Overall score: 32% role similarity, 16% expected translation, 14% team need, 10% available opportunity, 10% conference adjustment, and 18% projected team impact.</p>`;
}

function lossMetric(label, value, suffix = "") {
  const missing = value === null || value === undefined || !Number.isFinite(Number(value));
  const display = missing ? "--" : Number(value).toFixed(suffix ? 1 : 0);
  const unit = !missing && suffix ? `<small>${suffix === "%" ? "" : " "}${escapeHtml(suffix)}</small>` : "";
  return `<div class="replacement-loss-tile"><strong>${display}${unit}</strong><span>${escapeHtml(label)}</span></div>`;
}

function filteredResults() {
  const filtered = ranking.results.filter(result => {
    const player = result.player;
    if (!state.levels.has(player.model)) return false;
    if (state.availability === "targets" && !savedMap.get(player.id)?.portalTarget) return false;
    if (Number(player.stats?.MPG || 0) < state.minimumMinutes) return false;
    if (state.tier === "D2" && player.model !== "d2") return false;
    if (state.tier && state.tier !== "D2" && (player.model !== "d1" || player.tier !== state.tier)) return false;
    if (state.archetype && player.archetype !== state.archetype) return false;
    if (!matchesStateFilter(player, state.states)) return false;
    if (state.search && !`${player.name} ${player.team} ${player.statsTeam || ""} ${player.archetype}`.toLowerCase().includes(state.search)) return false;
    return true;
  });
  return sortRows(filtered, state, replacementSortValue);
}

function renderResults() {
  if (!ranking.results.length) return;
  const filtered = filteredResults();
  const shown = filtered.slice(0, state.limit);
  els.count.innerHTML = `${filtered.length.toLocaleString()} match filters · showing ${shown.length.toLocaleString()} · destination ${escapeHtml(state.team)} (${escapeHtml(ranking.destinationTier || "Unclassified")})`;
  els.results.innerHTML = shown.length ? `<div class="fit-table-wrap replacement-table-wrap"><table class="fit-table replacement-table">
    <thead><tr>
      <th>Rank</th>${sortHeader("player", "Player", state)}${sortHeader("level", "Level", state)}${sortHeader("class", "Class", state)}${sortHeader("height", "Height", state, "numeric")}${sortHeader("mpg", "MPG", state, "numeric")}${sortHeader("replacementScore", "Replacement", state, "numeric")}${sortHeader("roleSimilarity", "Role", state, "numeric")}${sortHeader("expectedTranslation", "Translation", state, "numeric")}${sortHeader("teamNeed", "Need", state, "numeric")}${sortHeader("opportunity", "Opportunity", state, "numeric")}${sortHeader("conferenceAdjustment", "Level Adj.", state, "numeric")}${sortHeader("projectedTeamImpact", "Impact", state, "numeric")}${sortHeader("adjEmGain", "AdjEM Δ", state, "numeric")}<th>Best team need</th>
    </tr></thead>
    <tbody>${shown.map((result, index) => resultRows(result, index + 1)).join("")}</tbody>
  </table></div>` : `<p class="muted fit-empty">No candidates match these filters.</p>`;
  bindSortHeaders(els.results, state, renderResults);
  els.results.querySelectorAll("tr[data-replacement-id]").forEach(row => {
    row.onclick = event => {
      if (event.target.closest("a,button")) return;
      state.expandedId = state.expandedId === row.dataset.replacementId ? "" : row.dataset.replacementId;
      renderResults();
    };
  });
}

function resultRows(result, rank) {
  const player = result.player;
  const expanded = state.expandedId === player.id;
  const sourceTier = player.model === "d2" ? "D2" : (player.tier || "D1");
  return `<tr class="replacement-row${expanded ? " expanded" : ""}" data-replacement-id="${escapeAttr(player.id)}">
      <td>${rank}</td>
      <td><a class="player-name" href="${playerUrl(player)}">${escapeHtml(player.name)}</a><span class="cell-note">${escapeHtml(player.team)} · ${escapeHtml(player.archetype)}${player.draft2026 ? ` · Drafted #${player.draft2026.pick}` : ""}</span></td>
      <td><span class="pill">${escapeHtml(sourceTier)}</span></td>
      <td>${escapeHtml(player.classShort || player.class || "--")}</td>
      <td>${heightLabel(player.height)}</td>
      <td>${fmt(player.stats?.MPG)}</td>
      <td><strong class="replacement-score ${scoreTone(result.replacementScore)}">${Math.round(result.replacementScore)}</strong></td>
      <td>${scoreCell(result.roleSimilarity)}</td>
      <td>${scoreCell(result.expectedTranslation)}</td>
      <td>${scoreCell(result.teamNeed)}</td>
      <td>${scoreCell(result.opportunity)}</td>
      <td>${scoreCell(result.conferenceAdjustment)}</td>
      <td>${scoreCell(result.projectedTeamImpact)}</td>
      <td class="${result.adjEmGain >= 0 ? "positive" : "negative"}">${signed(result.adjEmGain)}</td>
      <td>${escapeHtml(result.bestNeed?.label || "--")}</td>
    </tr>
    <tr class="replacement-detail-row${expanded ? "" : " hidden"}"><td colspan="15">${replacementDetail(result)}</td></tr>`;
}

function replacementDetail(result) {
  const player = result.player;
  return `<div class="replacement-detail">
    <div><span>Role foundation</span><strong>${Math.round(result.similarityMethod)}</strong><small>Box + PBP style before size adjustment</small></div>
    <div><span>Size / position</span><strong>${Math.round(result.sizeAndPosition)}</strong><small>${heightLabel(player.height)} · ${escapeHtml(player.posTier || "--")}</small></div>
    <div><span>Projected offense</span><strong>${signed(result.offenseChange)}</strong><small>Adjusted efficiency change</small></div>
    <div><span>Projected defense</span><strong>${signed(result.defenseChange)}</strong><small>Lower defensive efficiency is better</small></div>
    <div><span>Projected team rank</span><strong>${escapeHtml(result.projectedRank)}</strong><small>After modeled addition</small></div>
    <div><span>Model confidence</span><strong>${escapeHtml(result.impactConfidence || "--")}</strong><small>Historical impact evidence</small></div>
  </div>`;
}

function replacementSortValue(result, key) {
  if (key === "player") return result.player.name;
  if (key === "level") return result.player.model === "d2" ? "D2" : result.player.tier || "D1";
  if (key === "class") return result.player.classShort || result.player.class || "";
  if (key === "height") return Number(result.player.height);
  if (key === "mpg") return Number(result.player.stats?.MPG);
  return result[key];
}

function scoreCell(value) {
  return `<span class="replacement-component ${scoreTone(value)}">${Math.round(Number(value) || 0)}</span>`;
}

function scoreTone(value) {
  return value >= 78 ? "green" : value >= 64 ? "gold" : "gray";
}

function signed(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "--";
  return `${parsed > 0 ? "+" : ""}${parsed.toFixed(2)}`;
}

function heightLabel(value) {
  const inches = Number(value);
  if (!Number.isFinite(inches)) return "--";
  return `${Math.floor(inches / 12)}'${Math.round(inches % 12)}\"`;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/"/g, "&quot;");
}

function canonical(value) {
  return String(value || "").toLowerCase().replace(/&/g, "and").replace(/\bst\.?\b/g, "state").replace(/[^a-z0-9]+/g, "");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
