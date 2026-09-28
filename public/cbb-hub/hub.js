import {
  ADMIN_UID,
  CATS,
  STAT_COLS,
  approveRegistration,
  bindSortHeaders,
  classForSaved,
  clearPlayerCorrection,
  denyRegistration,
  fmt,
  loadHubData,
  matchesStateFilter,
  metric,
  playerUrl,
  savePlayerCorrection,
  scoreClass,
  setupAuth,
  setupStateMultiSelect,
  showNotice,
  showAppWhenAuthed,
  similarity,
  sortHeader,
  sortRows,
  statCell,
  toggleSaved,
  updateSavedTargets,
  watchPendingRegistrations,
  watchSaved
} from "./core.js?v=20260928-nbablend1";

let user = null;
let payload = null;
let savedMap = new Map();
let savedUnsub = () => {};
let pendingRegistrations = [];
let pendingRegistrationError = "";
let pendingUnsub = () => {};
let started = false;
let activeUserId = null;
let exportInProgress = false;
let stateFilterControl = null;
let state = {
  tab: "players",
  model: "d1",
  view: "verspi",
  search: "",
  season: "2025-26",
  classes: new Set(),
  states: new Set(),
  archetype: "",
  tiers: new Set(),
  multiOnly: false,
  sortKey: "projection",
  sortDir: "desc",
  ranges: {}
};

const els = {};
["search","modelSelect","seasonSelect","classSelectBtn","classMenu","stateFilter","archSelect","sortSelect","rangeFilters","rangeToggle","rangeReset","countLine","tableHead","tableBody","tierFilters","multiOnly","exportTable","exportHeading","adminTab","adminPanel"].forEach(id => els[id] = document.getElementById(id));

setupAuth().then(start);

window.addEventListener("hub-auth", e => start(e.detail));

async function start(u) {
  user = u;
  showAppWhenAuthed(user);
  if (!user) {
    savedUnsub();
    pendingUnsub();
    activeUserId = null;
    savedMap = new Map();
    pendingRegistrations = [];
    pendingRegistrationError = "";
    return;
  }
  if (!payload) payload = await loadHubData();
  if (!started) {
    hydrateControls();
    bindControls();
    started = true;
  }
  els.adminTab?.classList.toggle("hidden", user.uid !== ADMIN_UID);
  if (activeUserId !== user.uid) {
    savedUnsub();
    pendingUnsub();
    activeUserId = user.uid;
    savedUnsub = watchSaved(user, map => { savedMap = map; render(); });
    pendingUnsub = user.uid === ADMIN_UID
      ? watchPendingRegistrations(list => {
        pendingRegistrations = list;
        pendingRegistrationError = "";
        if (state.tab === "admin") renderAdminPanel();
      }, error => {
        pendingRegistrationError = error.message || "Could not load pending accounts.";
        if (state.tab === "admin") renderAdminPanel();
      })
      : () => {};
  }
  render();
}

function hydrateControls() {
  els.seasonSelect.innerHTML = payload.seasons.map(s => `<option ${s === state.season ? "selected" : ""}>${s}</option>`).join("");
  els.archSelect.innerHTML = `<option value="">All archetypes</option>` + payload.archetypes.map(a => `<option>${a}</option>`).join("");
  stateFilterControl = setupStateMultiSelect(els.stateFilter, payload.states, state.states, render);
  renderRanges();
}

function bindControls() {
  document.querySelectorAll(".tab").forEach(btn => btn.onclick = () => {
    state.tab = btn.dataset.tab;
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    render();
  });
  els.modelSelect.onchange = e => { state.model = e.target.value; state.tiers.clear(); render(); };
  els.search.oninput = e => { state.search = e.target.value.toLowerCase(); render(); };
  els.seasonSelect.onchange = e => { state.season = e.target.value; render(); };
  els.classSelectBtn.onclick = () => els.classMenu.classList.toggle("hidden");
  els.classMenu.querySelectorAll("input").forEach(box => box.onchange = () => {
    if (box.checked) state.classes.add(box.value);
    else state.classes.delete(box.value);
    updateClassLabel();
    render();
  });
  document.addEventListener("click", e => {
    if (!e.target.closest("#classSelectBox")) els.classMenu.classList.add("hidden");
  });
  els.archSelect.onchange = e => { state.archetype = e.target.value; render(); };
  els.sortSelect.onchange = e => {
    state.sortKey = e.target.value;
    state.sortDir = e.target.value === "name" ? "asc" : "desc";
    render();
  };
  els.multiOnly.onclick = () => { state.multiOnly = !state.multiOnly; els.multiOnly.classList.toggle("active", state.multiOnly); render(); };
  document.querySelectorAll(".segmented button").forEach(btn => btn.onclick = () => {
    state.view = btn.dataset.view;
    document.querySelectorAll(".segmented button").forEach(b => b.classList.toggle("active", b === btn));
    render();
  });
  els.tierFilters.querySelectorAll("button").forEach(btn => btn.onclick = () => {
    const tier = btn.dataset.tier;
    if (!tier) state.tiers.clear();
    else if (state.tiers.has(tier)) state.tiers.delete(tier);
    else state.tiers.add(tier);
    render();
  });
  els.rangeToggle.onclick = () => {
    const collapsed = els.rangeFilters.classList.toggle("hidden");
    els.rangeToggle.setAttribute("aria-expanded", String(!collapsed));
    updateRangeHeader();
  };
  els.rangeReset.onclick = () => {
    state.search = "";
    state.classes.clear();
    state.states.clear();
    stateFilterControl?.update();
    state.archetype = "";
    state.tiers.clear();
    state.multiOnly = false;
    state.ranges = {};
    els.search.value = "";
    els.archSelect.value = "";
    els.classMenu.querySelectorAll("input").forEach(box => { box.checked = false; });
    els.multiOnly.classList.remove("active");
    updateClassLabel();
    renderRanges();
    render();
  };
  els.exportTable.onclick = exportTable;
}

function renderRanges() {
  const verspi = [...CATS.map(([key, label]) => [key, label]), ["height", "Height (in)"]];
  const stats = STAT_COLS.map(k => [k, k, "Box stats"]);
  const group = (title, defs) => `
    <div class="range-group">
      <h3>${title}</h3>
      <div class="range-grid">${defs.map(([key, label]) => `
        <div class="range-item">
          <label><span>${label}</span></label>
          <div class="range-pair">
            <input data-range="${key}" data-bound="min" type="number" step="1" placeholder="min" ${isPercentStat(key) ? 'min="0" max="100" inputmode="numeric"' : key === "height" ? 'min="48" max="100" inputmode="numeric"' : ""}>
            <input data-range="${key}" data-bound="max" type="number" step="1" placeholder="max" ${isPercentStat(key) ? 'min="0" max="100" inputmode="numeric"' : key === "height" ? 'min="48" max="100" inputmode="numeric"' : ""}>
          </div>
        </div>
      `).join("")}</div>
    </div>`;
  els.rangeFilters.innerHTML = group("VERSPI+D", verspi) + group("Box stats", stats);
  els.rangeFilters.querySelectorAll("input").forEach(input => {
    const old = state.ranges[input.dataset.range]?.[input.dataset.bound];
    if (old !== undefined) input.value = old;
    input.oninput = () => {
      const key = input.dataset.range;
      state.ranges[key] = state.ranges[key] || {};
      state.ranges[key][input.dataset.bound] = input.value === "" ? undefined : Number(input.value);
      updateRangeHeader();
      render();
    };
  });
  updateRangeHeader();
}

function isPercentStat(key) {
  return key === "FG%" || key === "3P%" || key === "FT%";
}

function updateRangeHeader() {
  const active = Object.values(state.ranges).reduce((count, bounds) =>
    count + (bounds.min !== undefined || bounds.max !== undefined ? 1 : 0), 0);
  const collapsed = els.rangeFilters.classList.contains("hidden");
  els.rangeToggle.textContent = `${collapsed ? "Show" : "Hide"} filters${active ? ` (${active} active)` : ""}`;
}

function updateClassLabel() {
  const selected = [...state.classes];
  els.classSelectBtn.textContent = selected.length ? selected.join(", ") : "All classes";
  els.classSelectBtn.title = els.classSelectBtn.textContent;
}

function tierClass(tier) {
  return {
    "High Major": "tier-high",
    "Mid-Major": "tier-mid",
    "Low Major": "tier-low"
  }[tier] || "tier-none";
}

function escapeAttr(value) {
  return String(value || "").replace(/"/g, "&quot;");
}

// Registration emails are user-submitted (unlike the rest of this file's data,
// which comes from the model pipeline), so the admin panel needs real HTML
// escaping, not just the attribute-only escapeAttr above.
function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function expandShell(p, expanded = false, comparisonPool = null) {
  return `<tr class="expand-row${expanded ? "" : " hidden"}" data-expand="${p.id}"><td colspan="30">
    <div class="expand-grid" data-expand-content="${p.id}"${expanded ? ' data-loaded="1"' : ""}>${expanded ? expandContent(p, comparisonPool) : ""}</div>
  </td></tr>`;
}

function fillExpand(p) {
  const slot = document.querySelector(`[data-expand-content="${CSS.escape(p.id)}"]`);
  if (!slot || slot.dataset.loaded) return;
  slot.innerHTML = expandContent(p);
  slot.dataset.loaded = "1";
}

function expandContent(p, comparisonPool = null) {
  const sameSeason = comparisonPool || payload.players.filter(x => x.model === p.model && x.season === p.season);
  const byBox = similarity(p, sameSeason, "box", 4);
  const byVerspi = similarity(p, sameSeason, "verspi", 4);
  const opposite = state.view === "verspi" ? statGrid(p) : verspiGrid(p);
  return `
    <div class="mini-card"><h3>${state.view === "verspi" ? "Box stats" : "VERSPI+D"}</h3>${opposite}</div>
    <div class="mini-card"><h3>Similar by box + PBP</h3>${compareList(byBox)}</div>
    <div class="mini-card"><h3>Similar by VERSPI</h3>${compareList(byVerspi)}</div>
    <div class="mini-card"><h3>Projection logic</h3>${projectionDetail(p)}</div>
  `;
}

function filteredPlayers() {
  if (!payload) return [];
  const savedIds = new Set(savedMap.keys());
  const filtered = payload.players.filter(p => {
    if (state.tab === "saved" && !savedIds.has(p.id)) return false;
    if (p.model !== state.model) return false;
    if (p.season !== state.season) return false;
    if (state.classes.size && !state.classes.has(p.class)) return false;
    if (!matchesStateFilter(p, state.states)) return false;
    if (state.archetype && p.archetype !== state.archetype) return false;
    if (state.search && !(p.name + " " + p.team + " " + (p.statsTeam || "")).toLowerCase().includes(state.search)) return false;
    if (state.model === "d1" && state.tiers.size && !state.tiers.has(p.tier)) return false;
    if (state.multiOnly && (!p.secondary || p.versatility < 75)) return false;
    for (const [key, bounds] of Object.entries(state.ranges)) {
      const raw = key === "height" ? (p.height ?? p.verspi?.height) : CATS.some(c => c[0] === key) ? p.verspi?.[key] : p.stats?.[key];
      let val = raw == null ? null : Number(raw);
      if (val !== null && isPercentStat(key) && Math.abs(val) <= 1) val *= 100;
      if (bounds.min !== undefined && (val == null || val < bounds.min)) return false;
      if (bounds.max !== undefined && (val == null || val > bounds.max)) return false;
    }
    return true;
  });
  return sortRows(filtered, state, playerSortValue);
}

function playerSortValue(player, key) {
  if (key === "name") return player.name || "";
  if (key === "team") return player.team || "";
  if (key === "tier") return state.model === "d1" ? (player.tier || "") : (player.model || "").toUpperCase();
  if (key === "class") return player.classShort || player.class || "";
  if (key === "season") return player.season || "";
  if (key === "archetype") return player.archetype || "";
  if (key === "secondary") return player.secondary || "";
  if (key === "height") return Number(player.height);
  if (key === "projection") return Number(player.projection?.score);
  if (CATS.some(([catKey]) => catKey === key)) return Number(player.verspi?.[key]);
  if (STAT_COLS.includes(key)) return Number(player.stats?.[key]);
  return "";
}

function render() {
  if (!payload || !user || exportInProgress) return;
  const isAdminTab = state.tab === "admin";
  document.querySelector(".control-panel")?.classList.toggle("hidden", isAdminTab);
  els.exportHeading?.classList.toggle("hidden", isAdminTab);
  document.querySelector(".table-status-row")?.classList.toggle("hidden", isAdminTab);
  document.querySelector(".table-wrap")?.classList.toggle("hidden", isAdminTab);
  els.adminPanel?.classList.toggle("hidden", !isAdminTab);
  if (isAdminTab) {
    renderAdminPanel();
    return;
  }
  els.tierFilters.style.display = state.model === "d1" ? "flex" : "none";
  els.tierFilters.querySelectorAll("button").forEach(btn => btn.classList.toggle("active", state.tiers.has(btn.dataset.tier)));
  const rows = filteredPlayers();
  const modeled = rows.filter(p => p.projection?.score != null).length;
  const projectionContext = state.model === "d1"
    ? state.season === "2025-26"
      ? ` - ${modeled.toLocaleString()} in the NBA model; the rest are outside its 18+ MPG pool`
      : " - NBA projections are only available for active 2025-26 players"
    : "";
  els.countLine.textContent = `${rows.length.toLocaleString()} players${projectionContext}${rows.length > 500 ? " - showing top 500, refine filters to see more" : ""} - click a row for detail`;
  renderHead();
  els.tableBody.innerHTML = rows.slice(0, 500).map(player => rowHtml(player)).join("");
  els.tableBody.querySelectorAll(".player-row").forEach(tr => tr.onclick = e => {
    if (e.target.closest("a,button")) return;
    const id = tr.dataset.id;
    const player = payload.players.find(p => p.id === id);
    const exp = document.querySelector(`tr[data-expand="${CSS.escape(id)}"]`);
    const opening = Boolean(exp?.classList.contains("hidden"));
    if (opening) {
      collapseExpandedRows();
      if (player) fillExpand(player);
      exp?.classList.remove("hidden");
      tr.setAttribute("aria-expanded", "true");
    } else {
      exp?.classList.add("hidden");
      tr.setAttribute("aria-expanded", "false");
    }
  });
  els.tableBody.querySelectorAll(".save-btn").forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    const player = payload.players.find(p => p.id === btn.dataset.id);
    if (!player || btn.disabled) return;
    const wasSaved = savedMap.has(player.id);
    btn.disabled = true;
    btn.textContent = wasSaved ? "Removing..." : "Saving...";
    try {
      const isSaved = await toggleSaved(user, player, savedMap);
      if (isSaved) savedMap.set(player.id, { id: player.id });
      else savedMap.delete(player.id);
      showNotice(isSaved ? `${player.name} saved.` : `${player.name} removed from saved players.`);
      render();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (btn.isConnected) {
        btn.disabled = false;
        btn.textContent = wasSaved ? "Saved" : "Save";
      }
    }
  });
  els.tableBody.querySelectorAll("button[data-target-kind]").forEach(btn => btn.onclick = async e => {
    e.stopPropagation();
    const player = payload.players.find(p => p.id === btn.dataset.id);
    if (!player || btn.disabled) return;
    const saved = savedMap.get(player.id) || { id: player.id };
    const key = btn.dataset.targetKind === "draft" ? "draftTarget" : "portalTarget";
    const next = { ...saved, [key]: !saved[key] };
    btn.disabled = true;
    try {
      await updateSavedTargets(user, player, next);
      savedMap.set(player.id, next);
      showNotice(`${player.name} ${next[key] ? "added to" : "removed from"} the ${key === "draftTarget" ? "NBA Draft" : "Transfer Portal"} target list.`);
      render();
    } catch (error) {
      showNotice(error.message, "error");
      btn.disabled = false;
    }
  });
  els.tableBody.querySelectorAll("button[data-edit-team]").forEach(btn => btn.onclick = e => {
    e.stopPropagation();
    const player = payload.players.find(p => p.id === btn.dataset.editTeam);
    if (player) openEditTeamModal(player);
  });
}

function renderHead() {
  els.tableHead.closest("table")?.classList.toggle("stats-view", state.view === "stats");
  els.tableHead.innerHTML = tableHeadHtml();
  bindSortHeaders(els.tableHead, state, render);
  if (["projection", "name", ...CATS.map(([key]) => key)].includes(state.sortKey)) {
    els.sortSelect.value = state.sortKey;
  }
}

function tableHeadHtml() {
  const extra = state.view === "verspi"
    ? CATS.map(([key, label]) => sortHeader(key, label, state, "numeric")).join("")
    : STAT_COLS.map(c => sortHeader(c, c, state, "numeric")).join("");
  const projectionHead = state.model === "d1"
    ? `${sortHeader("projection", "Translate", state, "numeric")}<th>Ceiling</th><th>Projection tier</th><th>Archetype outlook</th>`
    : `${sortHeader("projection", "D1 Score", state, "numeric")}<th>80% Range</th><th>Conf</th><th>Outlook</th>`;
  return `<tr>
    <th>Save</th>${state.tab === "saved" ? "<th>Targets</th>" : ""}${sortHeader("name", "Player", state)}${sortHeader("team", "Team", state)}${sortHeader("tier", state.model === "d1" ? "Tier" : "Level", state)}${sortHeader("class", "Class", state)}${sortHeader("season", "Season", state)}
    ${sortHeader("archetype", "Archetype", state)}${sortHeader("secondary", "2nd Role", state)}${sortHeader("height", "Ht", state, "numeric")}${extra}${projectionHead}
  </tr>`;
}

function rowHtml(p, expanded = false, comparisonPool = null) {
  expanded = expanded === true;
  const extra = state.view === "verspi"
    ? CATS.map(([key]) => `<td>${metric(p, key)}</td>`).join("")
    : STAT_COLS.map(c => `<td>${statCell(p, c)}</td>`).join("");
  const proj = p.projection || {};
  const d1Tier = proj.score != null
    ? (proj.tier || "Modeled")
    : p.season === "2025-26" ? "Outside 18+ MPG pool" : "Current year only";
  const projectionCells = p.model === "d1"
    ? `<td><span class="pill ${scoreClass(proj.score)}">${fmt(proj.score)}</span></td>
       <td><span class="pill ${scoreClass(proj.ceiling)}">${fmt(proj.ceiling)}</span>${proj.ceilingTier && proj.ceilingTier !== "Unscored" ? `<span class="cell-note">${proj.ceilingTier}</span>` : ""}</td>
       <td><span class="pill ${proj.score == null ? "gray" : "green"}">${d1Tier}</span></td>
       <td>${proj.score == null ? "--" : (proj.outlook || "--")}${proj.outlookRate != null ? `<span class="cell-note">${fmt(proj.outlookRate)}% historical rotation</span>` : ""}</td>`
    : `<td><span class="pill ${scoreClass(proj.score)}">${fmt(proj.score)}</span></td>
       <td>${fmt(proj.floor)}-${fmt(proj.ceiling)}</td>
       <td><span class="pill gold">${proj.confidence || "--"}</span></td>
       <td><span class="pill green">${proj.outlook || "--"}</span></td>`;
  return `<tr class="player-row" data-id="${p.id}" aria-expanded="${expanded}">
    <td><button class="${classForSaved(savedMap, p.id)}" data-id="${p.id}" type="button">${savedMap.has(p.id) ? "Saved" : "Save"}</button></td>
    ${state.tab === "saved" ? `<td>${savedTargetControls(p)}</td>` : ""}
    <td><a class="player-name" href="${playerUrl(p)}">${p.name}</a></td>
    <td class="team-cell"><strong>${p.team}</strong>${p.draft2026 ? `<span class="drafted-badge">Drafted #${p.draft2026.pick}</span>` : ""}${p.transfer ? `<span class="cell-note">from ${p.statsTeam || p.transfer.from}</span>` : ""}${p.corrected && p.correctionMode === "fix" ? `<span class="cell-note">edited</span>` : ""}${user.uid === ADMIN_UID ? `<button class="edit-team-btn" data-edit-team="${p.id}" type="button" title="Edit school" aria-label="Edit school for ${escapeAttr(p.name)}">&#9998;</button>` : ""}</td>
    <td><span class="pill ${p.model === "d1" ? tierClass(p.tier) : "tier-d2"}">${p.model === "d1" ? (p.tier || "--") : "D2"}</span></td>
    <td>${p.classShort || p.class || "--"}</td>
    <td class="muted">${p.season}</td>
    <td>${p.archetype}</td>
    <td class="muted">${p.secondary || "--"}</td>
    <td>${formatHeight(p.height)}</td>
    ${extra}
    ${projectionCells}
  </tr>${expandShell(p, expanded, comparisonPool)}`;
}

function savedTargetControls(player) {
  const saved = savedMap.get(player.id) || {};
  return `<div class="saved-target-controls" role="group" aria-label="Targets for ${escapeAttr(player.name)}">
    <button class="target-chip portal${saved.portalTarget ? " active" : ""}" data-id="${player.id}" data-target-kind="portal" type="button" aria-pressed="${Boolean(saved.portalTarget)}">Portal</button>
    <button class="target-chip draft${saved.draftTarget ? " active" : ""}" data-id="${player.id}" data-target-kind="draft" type="button" aria-pressed="${Boolean(saved.draftTarget)}">NBA Draft</button>
  </div>`;
}

async function exportTable() {
  if (exportInProgress) return;
  const rows = filteredPlayers();
  if (!rows.length) {
    showNotice("No players match the current filters.", "error");
    return;
  }

  exportInProgress = true;
  const originalTitle = document.title;
  const button = els.exportTable;
  collapseExpandedRows();
  const comparisonPool = payload.players.filter(p => p.model === state.model && p.season === state.season);
  const viewLabel = state.view === "verspi" ? "VERSPI+D" : "Box Stats";
  const sectionLabel = state.tab === "saved" ? "Saved Players" : "Players";
  const filterParts = [state.model.toUpperCase(), state.season, viewLabel];
  if (state.classes.size) filterParts.push([...state.classes].join(" + "));
  if (state.states.size) filterParts.push([...state.states].join(" + "));
  if (state.archetype) filterParts.push(state.archetype);
  if (state.tiers.size) filterParts.push([...state.tiers].join(" + "));
  if (state.search) filterParts.push(`Search: ${state.search}`);

  button.disabled = true;
  document.title = `VERSPID - ${sectionLabel} - ${state.model.toUpperCase()} ${state.season}`;
  const exportStage = document.createElement("section");
  exportStage.className = "table-export-stage";
  const exportHeading = document.createElement("div");
  exportHeading.className = "print-only";
  const heading = document.createElement("h1");
  const summary = document.createElement("p");
  heading.textContent = `VERSPID - ${sectionLabel}`;
  summary.textContent = `${filterParts.join(" | ")} | ${rows.length.toLocaleString()} players`;
  exportHeading.append(heading, summary);

  const exportWrap = document.createElement("div");
  exportWrap.className = "table-wrap";
  const exportTableElement = document.createElement("table");
  exportTableElement.className = `hub-table${state.view === "stats" ? " stats-view" : ""}`;
  exportTableElement.innerHTML = `<thead>${tableHeadHtml()}</thead><tbody></tbody>`;
  exportWrap.append(exportTableElement);
  exportStage.append(exportHeading, exportWrap);
  document.body.append(exportStage);

  const markup = [];
  const batchSize = 20;
  for (let start = 0; start < rows.length; start += batchSize) {
    const end = Math.min(start + batchSize, rows.length);
    for (let index = start; index < end; index += 1) {
      markup.push(rowHtml(rows[index], true, comparisonPool));
    }
    button.textContent = `Preparing ${end.toLocaleString()}/${rows.length.toLocaleString()}`;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  exportTableElement.tBodies[0].innerHTML = markup.join("");
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  document.body.classList.add("table-print-export");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("table-print-export");
    document.title = originalTitle;
    exportStage.remove();
    button.disabled = false;
    button.textContent = "Export table";
    exportInProgress = false;
    render();
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

function collapseExpandedRows() {
  els.tableBody.querySelectorAll(".expand-row").forEach(row => row.classList.add("hidden"));
  els.tableBody.querySelectorAll(".player-row[aria-expanded='true']").forEach(row => row.setAttribute("aria-expanded", "false"));
}

function projectionDetail(p) {
  const proj = p.projection || {};
  if (p.model !== "d1") {
    return `<p class="muted">${proj.source || "D2-to-D1 model estimate"}. The 80% range and confidence come from the D2 translation model.</p>`;
  }
  if (proj.score == null) {
    return `<p class="muted">${proj.source || "Unscored"}.</p>`;
  }
  return `<p class="muted">Exact output from the current College-to-NBA translation model. Translate asks whether the player can stick in an NBA rotation; Ceiling is a separate upside model.</p>
    <div class="projection-breakdown">
      <span><strong>${fmt(proj.compPct)}</strong> stick x 50%</span>
      <span><strong>${fmt(proj.teamPct)}</strong> team x 22%</span>
      <span><strong>${fmt(proj.archBase)}</strong> archetype x 12%</span>
      <span><strong>${fmt(proj.youth)}</strong> youth x 16%</span>
    </div>`;
}

function formatHeight(inches) {
  const total = Math.round(Number(inches));
  if (!Number.isFinite(total) || total <= 0) return "--";
  return `${Math.floor(total / 12)}'${total % 12}\"`;
}

function statGrid(p) {
  return `<div class="stat-grid">${STAT_COLS.map(c => `<div class="stat-tile"><strong>${statCell(p, c)}</strong><span>${c}</span></div>`).join("")}</div>`;
}

function verspiGrid(p) {
  return `<div class="verspi-grid">${CATS.map(([k, label]) => `<div class="stat-tile"><strong>${fmt(p.verspi?.[k])}</strong><span>${label}</span></div>`).join("")}</div>`;
}

function compareList(items) {
  if (!items.length) return `<p class="muted">No close matches in this slice.</p>`;
  return `<div class="compare-list">${items.map(({ player, score }) => `
    <div class="compare-item"><span><strong>${player.name}</strong><br><span class="muted">${player.team} - ${player.archetype}</span></span><span class="pill blue">${fmt(score)}</span></div>
  `).join("")}</div>`;
}

// --- Admin: pending account approvals ---------------------------------------
// Only visible/reachable by ADMIN_UID (see start(), which hides #adminTab for
// everyone else, and firestore.rules, which blocks the underlying query for
// everyone else regardless of what the UI shows).
function renderAdminPanel() {
  const subtitle = document.getElementById("adminPanelSubtitle");
  const list = document.getElementById("adminPanelList");
  if (subtitle) {
    subtitle.textContent = pendingRegistrationError
      ? "Pending registrations could not be loaded"
      : pendingRegistrations.length
      ? `${pendingRegistrations.length.toLocaleString()} account${pendingRegistrations.length === 1 ? "" : "s"} waiting for approval`
      : "No pending registrations";
  }
  if (!list) return;
  list.innerHTML = pendingRegistrationError
    ? `<p class="auth-error">${escapeHtml(pendingRegistrationError)} Check that the current Firestore rules are deployed.</p>`
    : pendingRegistrations.length ? pendingRegistrations.map(reg => `
    <div class="admin-pending-row">
      <div><strong>${escapeHtml(reg.email || "Unknown email")}</strong><span class="muted">Requested ${reg.requestedAt?.toDate ? reg.requestedAt.toDate().toLocaleString() : "recently"}</span></div>
      <div class="admin-pending-actions">
        <button class="board-command primary" data-approve-uid="${escapeHtml(reg.id)}" type="button">Approve</button>
        <button class="board-command danger" data-deny-uid="${escapeHtml(reg.id)}" type="button">Deny</button>
      </div>
    </div>
  `).join("") : `<p class="muted">No one is waiting on approval right now.</p>`;
  list.querySelectorAll("[data-approve-uid]").forEach(btn => btn.onclick = async () => {
    btn.disabled = true;
    try {
      await approveRegistration(btn.dataset.approveUid);
      showNotice("Account approved - they can sign in now.");
    } catch (error) {
      showNotice(error.message, "error");
      btn.disabled = false;
    }
  });
  list.querySelectorAll("[data-deny-uid]").forEach(btn => btn.onclick = async () => {
    if (!confirm("Deny this registration? They will not get access to the hub.")) return;
    btn.disabled = true;
    try {
      await denyRegistration(btn.dataset.denyUid);
      showNotice("Registration denied.");
    } catch (error) {
      showNotice(error.message, "error");
      btn.disabled = false;
    }
  });
}

// --- Quick school correction modal -----------------------------------------
// Two edit modes, per how the mistake actually happened:
//   "fix"      - the model just has the wrong school; overwrite it, no history.
//   "transfer" - the player really did move; keep the old school on record as
//                a normal transfer (reuses the same from/to shape the pipeline
//                already uses, so it renders identically to a detected move).
let editModalEl = null;
function ensureEditModal() {
  if (editModalEl) return editModalEl;
  editModalEl = document.createElement("div");
  editModalEl.className = "edit-team-modal hidden";
  editModalEl.innerHTML = `
    <div class="edit-team-backdrop" data-edit-close></div>
    <form class="edit-team-dialog" role="dialog" aria-modal="true" aria-labelledby="editTeamTitle">
      <h2 id="editTeamTitle">Edit school</h2>
      <p class="edit-team-player muted"></p>
      <div class="edit-team-mode segmented" role="group" aria-label="Edit type">
        <button type="button" class="active" data-edit-mode="fix">Fix directly</button>
        <button type="button" data-edit-mode="transfer">Transferred from here</button>
      </div>
      <label class="edit-team-field" data-fix-field>
        <span>Correct school</span>
        <input type="text" data-edit-team-input maxlength="80" placeholder="e.g. Drexel" required>
      </label>
      <label class="edit-team-field hidden" data-transfer-field>
        <span>New school (destination)</span>
        <input type="text" data-edit-team-input maxlength="80" placeholder="e.g. Drexel" required>
      </label>
      <p class="edit-team-from muted hidden" data-transfer-from-note></p>
      <p class="edit-team-error hidden" data-edit-error></p>
      <div class="edit-team-actions">
        <button type="button" class="muted-button" data-edit-clear hidden>Remove correction</button>
        <div class="edit-team-actions-right">
          <button type="button" data-edit-close>Cancel</button>
          <button type="submit" class="board-command primary" data-edit-save>Save</button>
        </div>
      </div>
    </form>`;
  document.body.append(editModalEl);
  editModalEl.querySelectorAll("[data-edit-close]").forEach(el => el.addEventListener("click", closeEditTeamModal));
  editModalEl.querySelectorAll("[data-edit-mode]").forEach(btn => btn.addEventListener("click", () => setEditMode(btn.dataset.editMode)));
  editModalEl.querySelector("form").addEventListener("submit", submitEditTeamModal);
  editModalEl.querySelector("[data-edit-clear]").addEventListener("click", clearEditTeamModal);
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && !editModalEl.classList.contains("hidden")) closeEditTeamModal();
  });
  return editModalEl;
}

let editModalPlayer = null;
function openEditTeamModal(player) {
  if (user.uid !== ADMIN_UID) return;
  editModalPlayer = player;
  const modal = ensureEditModal();
  modal.querySelector(".edit-team-player").textContent = `${player.name} - currently listed at ${player.team}`;
  modal.querySelector("[data-edit-clear]").hidden = !player.corrected;
  modal.querySelector("[data-edit-error]").classList.add("hidden");
  modal.querySelectorAll("[data-edit-team-input]").forEach(input => { input.value = ""; });
  modal.querySelector("[data-fix-field] input").value = player.team;
  setEditMode(player.correctionMode === "transfer" ? "transfer" : "fix");
  modal.classList.remove("hidden");
  modal.querySelector(`[data-${player.correctionMode === "transfer" ? "transfer" : "fix"}-field] input`)?.focus();
}

function closeEditTeamModal() {
  editModalEl?.classList.add("hidden");
  editModalPlayer = null;
}

function setEditMode(mode) {
  const modal = ensureEditModal();
  modal.querySelectorAll("[data-edit-mode]").forEach(btn => btn.classList.toggle("active", btn.dataset.editMode === mode));
  modal.querySelector("[data-fix-field]").classList.toggle("hidden", mode !== "fix");
  modal.querySelector("[data-transfer-field]").classList.toggle("hidden", mode !== "transfer");
  const fromNote = modal.querySelector("[data-transfer-from-note]");
  if (mode === "transfer" && editModalPlayer) {
    fromNote.textContent = `Will record as transferred from ${editModalPlayer.statsTeam || editModalPlayer.team}.`;
    fromNote.classList.remove("hidden");
  } else {
    fromNote.classList.add("hidden");
  }
}

async function submitEditTeamModal(event) {
  event.preventDefault();
  if (!editModalPlayer) return;
  const modal = ensureEditModal();
  const mode = modal.querySelector("[data-edit-mode].active").dataset.editMode;
  const input = modal.querySelector(mode === "fix" ? "[data-fix-field] input" : "[data-transfer-field] input");
  const team = input.value.trim();
  const errorEl = modal.querySelector("[data-edit-error]");
  if (!team) {
    errorEl.textContent = "Enter a school name.";
    errorEl.classList.remove("hidden");
    return;
  }
  const saveBtn = modal.querySelector("[data-edit-save]");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  try {
    const previousTeam = mode === "transfer" ? (editModalPlayer.statsTeam || editModalPlayer.team) : null;
    await savePlayerCorrection(user, editModalPlayer.id, { mode, team, previousTeam });
    stashOriginalModelValues(editModalPlayer);
    if (mode === "transfer") {
      Object.assign(editModalPlayer, {
        team,
        statsTeam: editModalPlayer.statsTeam || editModalPlayer.team,
        transfer: { status: "Transferred", from: previousTeam, to: team, manual: true },
        corrected: true,
        correctionMode: "transfer"
      });
    } else {
      Object.assign(editModalPlayer, { team, corrected: true, correctionMode: "fix" });
    }
    showNotice(`${editModalPlayer.name}'s school was updated.`);
    closeEditTeamModal();
    render();
  } catch (error) {
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save";
  }
}

// The first time a player is corrected (whether that correction was already
// loaded from Firestore or is happening right now), stash the pristine
// pre-correction fields so "Remove correction" can restore them exactly
// without needing to refetch the ~30MB model file.
function stashOriginalModelValues(player) {
  if (player.correctionSource) return;
  player.correctionSource = {
    team: player.team,
    statsTeam: player.statsTeam ?? null,
    transfer: player.transfer ?? null
  };
}

async function clearEditTeamModal() {
  if (!editModalPlayer) return;
  const modal = ensureEditModal();
  const clearBtn = modal.querySelector("[data-edit-clear]");
  clearBtn.disabled = true;
  try {
    await clearPlayerCorrection(user, editModalPlayer.id);
    const original = editModalPlayer.correctionSource || { team: editModalPlayer.team, statsTeam: null, transfer: null };
    Object.assign(editModalPlayer, {
      team: original.team,
      statsTeam: original.statsTeam,
      transfer: original.transfer,
      corrected: false,
      correctionMode: undefined,
      correctionSource: undefined
    });
    showNotice(`${editModalPlayer.name}'s school correction was removed.`);
    closeEditTeamModal();
    render();
  } catch (error) {
    const errorEl = modal.querySelector("[data-edit-error]");
    errorEl.textContent = error.message;
    errorEl.classList.remove("hidden");
  } finally {
    clearBtn.disabled = false;
  }
}
