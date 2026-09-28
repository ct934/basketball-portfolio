import {
  CATS,
  STAT_COLS,
  fmt,
  loadHubData,
  metric,
  setupAuth,
  showNotice,
  showAppWhenAuthed,
  similarity,
  statCell,
  watchSaved,
  toggleSaved,
  classForSaved
} from "./core.js?v=20260928-nbablend1";
import { rankSnapshotTeamFits } from "./snapshot-team-fit-model.mjs?v=20260912-features1";

let user = null;
let payload = null;
let player = null;
let savedMap = new Map();
let savedUnsub = () => {};
let activeUserId = null;
let exportInProgress = false;
let pbpDetails = null;
let pbpDetailsPromise = null;
const shotBenchmarkCache = new Map();
const exportProfileButton = document.getElementById("exportProfile");
const comparisonNavLink = document.getElementById("comparisonNavLink");
const PBP_SECTIONS = [
  {
    title: "Fouls / Free-Throw Generation",
    metrics: [
      ["sflDrawn", "SFLD/G", "number"], ["sfl2Drawn", "2SFLD/G", "number"],
      ["sfl3Drawn", "3SFLD/G", "number"], ["and1", "And1/G", "number"],
      ["fflDrawn", "FFLD/G", "number"]
    ]
  },
  {
    title: "Playmaking - Assists by Zone",
    metrics: [
      ["atr2Ast", "ATR2 AST", "int"], ["paint2Ast", "PAINT2 AST", "int"],
      ["lane2Ast", "LANE2 AST", "int"], ["atr2AstP40", "ATR2 AST/40", "number"],
      ["paint2AstP40", "PAINT2 AST/40", "number"], ["rimPaintAst40", "RIM+PAINT AST/40", "number"],
      ["rim3sAst", "RIM+3s AST", "int"], ["rim3sAst40", "RIM+3s AST/40", "number"]
    ]
  },
  {
    title: "Scoring Creation",
    metrics: [["ptsCreatedG", "Pts Created/G", "number"], ["uPtsG", "uPTS/G", "number"]]
  },
  {
    title: "Assisted vs. Unassisted Scoring Volume",
    metrics: [
      ["uFgmG", "uFGM/G", "number"], ["aFgmG", "aFGM/G", "number"],
      ["u2pmG", "u2PM/G", "number"], ["a2pmG", "a2PM/G", "number"],
      ["u3pmG", "u3PM/G", "number"], ["a3pmG", "a3PM/G", "number"],
      ["fgmAstdPct", "FGM ASTD%", "pct"], ["fgm3AstdPct", "3PM ASTD%", "pct"],
      ["fgm2AstdPct", "2PM ASTD%", "pct"]
    ]
  },
  {
    title: "Shot Zone - Rim / Dunks",
    metrics: [
      ["atr2AfgmG", "ATR2 aFGM/G", "number"], ["atr2UfgmG", "ATR2 uFGM/G", "number"],
      ["atr2AstdPct", "ATR2 ASTD%", "pct"], ["dunkUfgmG", "DUNK uFGM/G", "number"],
      ["dunkAfgmG", "DUNK aFGM/G", "number"], ["dunkAstdPct", "DUNK ASTD%", "pct"]
    ]
  }
];

exportProfileButton.onclick = exportProfile;

setupAuth().then(start);

window.addEventListener("hub-auth", e => start(e.detail));

async function start(u) {
  user = u;
  showAppWhenAuthed(user);
  exportProfileButton.classList.toggle("hidden", !user);
  if (!user) {
    savedUnsub();
    activeUserId = null;
    savedMap = new Map();
    return;
  }
  if (!payload) {
    payload = await loadHubData();
    const id = new URLSearchParams(location.search).get("id");
    player = payload.players.find(p => p.id === id) || payload.players[0];
  }
  if (activeUserId !== user.uid) {
    savedUnsub();
    activeUserId = user.uid;
    savedUnsub = watchSaved(user, map => { savedMap = map; render(); });
  }
  render();
  loadPbpDetails();
}

function loadPbpDetails() {
  if (!pbpDetailsPromise) {
    pbpDetailsPromise = fetch("/cbb-hub/data/pbp-details.json?v=20260909-pbp1", { cache: "no-cache" })
      .then(response => {
        if (!response.ok) throw new Error("Could not load PBP detail");
        return response.json();
      })
      .then(data => {
        pbpDetails = data.players || {};
        render();
        return pbpDetails;
      })
      .catch(error => {
        console.error("[player PBP] Could not load player detail:", error);
        pbpDetails = {};
        render();
        return pbpDetails;
      });
  }
  return pbpDetailsPromise;
}

function render() {
  if (!payload || !player || !user || exportInProgress) return;
  comparisonNavLink.href = `/cbb-hub/player-comparison.html?id=${encodeURIComponent(player.id)}`;
  const allYears = careerRows(player);
  const currentPool = payload.players.filter(p => p.model === player.model);
  const byBox = similarity(player, currentPool, "box", 6);
  const byVerspi = similarity(player, currentPool, "verspi", 6);
  const teamFits = rankSnapshotTeamFits(payload, player, { season: player.season, limit: 10, excludeCurrent: true });
  const profile = document.getElementById("profile");
  profile.innerHTML = `
    <section class="profile-overview-page">
      <div class="profile-overview-side">
        <section class="profile-card profile-info-card">
          <h2>Info</h2>
          <p><strong>${player.name}</strong></p>
          <p class="muted">${player.team} - ${player.season} - ${player.class || "--"} - ${formatHeight(player.height)}</p>
          ${player.draft2026 ? `<p><span class="drafted-badge">2026 NBA Draft · Pick #${player.draft2026.pick} · Round ${player.draft2026.round}</span></p>` : ""}
          ${player.transfer ? `<p class="transfer-line">Transferred from ${player.statsTeam || player.transfer.from}</p>` : ""}
          <p>${player.archetype}${player.secondary ? ` / ${player.secondary}` : ""}</p>
          <button id="saveProfile" class="${classForSaved(savedMap, player.id)}" type="button">${savedMap.has(player.id) ? "Saved" : "Save player"}</button>
        </section>
        <section class="profile-card profile-projection-card">
          <h2>${player.model === "d1" ? "NBA" : "D1"} Projection</h2>
          ${projectionPanel(player)}
        </section>
      </div>
      <section class="profile-card shot-profile-card">
        <h2>Shot Distribution</h2>
        ${shotChart(player)}
      </section>
    </section>
    <section class="profile-card profile-full stats-profile-card">
      <h2>Stats and Analysis</h2>
      ${multiYearTables(allYears)}
      ${pbpTables(player)}
    </section>
    <section class="profile-card profile-full snapshot-team-fit-card">
      <h2>Team Fit</h2>
      ${teamFitPanel(teamFits)}
    </section>
    <section class="profile-card profile-full comparison-profile-card">
      <h2>Current-year Similarity</h2>
      <h3 class="muted">Box + play-by-play</h3>
      ${compareList(byBox)}
      <h3 class="muted">VERSPI profile</h3>
      ${compareList(byVerspi)}
    </section>
  `;
  document.getElementById("saveProfile").onclick = async event => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const wasSaved = savedMap.has(player.id);
    button.disabled = true;
    button.textContent = wasSaved ? "Removing..." : "Saving...";
    try {
      const isSaved = await toggleSaved(user, player, savedMap);
      if (isSaved) savedMap.set(player.id, { id: player.id });
      else savedMap.delete(player.id);
      showNotice(isSaved ? `${player.name} saved.` : `${player.name} removed from saved players.`);
      render();
    } catch (error) {
      showNotice(error.message, "error");
    } finally {
      if (button.isConnected) {
        button.disabled = false;
        button.textContent = wasSaved ? "Saved" : "Save player";
      }
    }
  };
}

function teamFitPanel(fit) {
  if (!fit.results.length) return `<p class="muted">No D1 team data is available for ${escapeHtml(fit.season)}.</p>`;
  const impact = fit.impact || {};
  const sourceType = impact.estimated ? "Estimated historical impact" : "Individual impact model";
  return `<div class="snapshot-fit-heading">
      <p><strong>${escapeHtml(fit.season)} D1 destinations only.</strong> Every team is evaluated from the same season as this player.</p>
      <div><span>${escapeHtml(sourceType)}</span><b>${escapeHtml(impact.confidence || "--")} confidence</b><small>${escapeHtml(impact.source || "")}${impact.similarity == null ? "" : ` &middot; ${fmt(impact.similarity)} profile similarity`}</small></div>
    </div>
    <div class="table-wrap snapshot-fit-table-wrap"><table class="hub-table snapshot-fit-table">
      <thead><tr><th>Rank</th><th>Team</th><th>Tier</th><th>Fit</th><th>Impact</th><th>Role</th><th>Team Need</th><th>AdjEM</th><th>Change</th><th>Proj Rank</th><th>Offense</th><th>Defense</th><th>Best Need Match</th></tr></thead>
      <tbody>${fit.results.map((result, index) => `<tr>
        <td>${index + 1}</td><td><strong>${escapeHtml(result.team)}</strong></td><td><span class="pill ${teamFitTierClass(result.tier)}">${escapeHtml(result.tier)}</span></td>
        <td><span class="snapshot-fit-score">${fmt(result.fit)}</span></td><td>${fmt(result.impactFit)}</td><td>${fmt(result.roleFit)}</td><td>${fmt(result.opportunity)}</td>
        <td>${fmt(result.currentAdjEm)} &rarr; <strong>${fmt(result.projectedAdjEm)}</strong></td><td class="${changeClass(result.adjEmGain, 1)}">${signed(result.adjEmGain)}</td><td><strong>#${result.projectedRank}</strong></td>
        <td class="${changeClass(result.offenseChange, 1)}">${signed(result.offenseChange)}</td><td class="${changeClass(result.defenseChange, -1)}">${signed(result.defenseChange)}</td>
        <td>${escapeHtml(result.bestNeed?.label || "Balanced profile")}<small>${result.bestNeed ? `${Math.round(result.bestNeed.need)} need &middot; ${formatTeamFitChange(result.bestNeed)}` : "--"}</small></td>
      </tr>`).join("")}</tbody>
    </table></div>`;
}

function teamFitTierClass(tier) {
  return { "High Major": "tier-high", "Mid-Major": "tier-mid", "Low Major": "tier-low" }[tier] || "tier-none";
}

function formatTeamFitChange(need) {
  return `${signed(need.change)}${need.format === "pct" ? " pp" : ""}`;
}

function signed(value) {
  const number = Math.abs(Number(value)) < 0.05 ? 0 : Number(value);
  return Number.isFinite(number) ? `${number > 0 ? "+" : ""}${number.toFixed(1)}` : "--";
}

function changeClass(value, direction) {
  const number = Number(value);
  if (!Number.isFinite(number) || Math.abs(number) < 0.05) return "change-neutral";
  return number * direction > 0 ? "change-good" : "change-bad";
}

function careerRows(target) {
  const playerId = String(target.pbp?.playerId || "").trim();
  if (playerId) {
    return payload.players
      .filter(candidate => candidate.model === target.model && String(candidate.pbp?.playerId || "").trim() === playerId)
      .sort((a, b) => a.season.localeCompare(b.season));
  }

  const targetHeight = Number(target.height);
  const targetClass = classIndex(target.class);
  const targetYear = Number(target.season?.slice(0, 4));
  return payload.players.filter(candidate => {
    if (candidate.model !== target.model || candidate.name !== target.name) return false;
    const height = Number(candidate.height);
    if (Number.isFinite(targetHeight) && Number.isFinite(height) && Math.abs(height - targetHeight) > 1) return false;
    const candidateClass = classIndex(candidate.class);
    const candidateYear = Number(candidate.season?.slice(0, 4));
    if (targetClass !== null && candidateClass !== null && Number.isFinite(targetYear) && Number.isFinite(candidateYear)) {
      if (Math.abs((candidateClass - targetClass) - (candidateYear - targetYear)) > 1) return false;
    }
    return true;
  }).sort((a, b) => a.season.localeCompare(b.season));
}

function classIndex(value) {
  const index = ["Freshman", "Sophomore", "Junior", "Senior"].indexOf(value);
  return index < 0 ? null : index;
}

async function exportProfile() {
  if (!player || exportInProgress) return;
  await loadPbpDetails();
  exportInProgress = true;
  const originalTitle = document.title;
  exportProfileButton.disabled = true;
  exportProfileButton.textContent = "Preparing...";
  document.body.classList.add("profile-print-export");
  document.title = `VERSPID - ${player.name} - ${player.season}`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("profile-print-export");
    document.title = originalTitle;
    exportProfileButton.disabled = false;
    exportProfileButton.textContent = "Export snapshot";
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

function formatHeight(inches) {
  const total = Math.round(Number(inches));
  if (!Number.isFinite(total) || total <= 0) return "--";
  return `${Math.floor(total / 12)}'${total % 12}\"`;
}

function projectionPanel(p) {
  const proj = p.projection || {};
  if (p.model === "d2") {
    return `<div class="stat-grid">
      <div class="stat-tile"><strong>${fmt(proj.score)}</strong><span>Score</span></div>
      <div class="stat-tile"><strong>${fmt(proj.floor)}-${fmt(proj.ceiling)}</strong><span>80% Range</span></div>
      <div class="stat-tile"><strong>${proj.confidence || "--"}</strong><span>Confidence</span></div>
      <div class="stat-tile"><strong>${proj.outlook || "--"}</strong><span>Outlook</span></div>
    </div>`;
  }
  const status = p.season === "2025-26" ? "Outside 18+ MPG pool" : "Current year only";
  const tier = proj.score == null ? status : (proj.tier || "Modeled");
  const outlook = proj.score == null ? "--" : proj.outlookRate == null ? (proj.outlook || "--") : `${proj.outlook} (${fmt(proj.outlookRate)}%)`;
  return `<div class="stat-grid">
    <div class="stat-tile"><strong>${fmt(proj.score)}</strong><span>Translate</span></div>
    <div class="stat-tile"><strong>${fmt(proj.ceiling)}</strong><span>Ceiling${proj.ceilingTier && proj.ceilingTier !== "Unscored" ? ` - ${proj.ceilingTier}` : ""}</span></div>
    <div class="stat-tile"><strong>${tier}</strong><span>Projection tier</span></div>
    <div class="stat-tile"><strong>${outlook}</strong><span>Archetype outlook</span></div>
  </div>
  <p class="muted projection-note">${proj.score == null
    ? proj.source || "Outside the current model's projection pool."
    : `Translate is the exact College-to-NBA floor score: ${fmt(proj.compPct)} stick x 50% + ${fmt(proj.teamPct)} team x 22% + ${fmt(proj.archBase)} archetype x 12% + ${fmt(proj.youth)} youth x 16%. Ceiling is modeled separately.`}</p>`;
}

function multiYearTables(rows) {
  if (!rows.length) return `<p class="muted">No multi-year rows found.</p>`;
  return `<div class="two-table-stack">
    <div>
      <h3>VERSPI+D by year</h3>
      <div class="table-wrap"><table class="hub-table profile-data-table profile-verspi-table"><colgroup><col class="profile-col-season"><col class="profile-col-team"><col class="profile-col-class"><col class="profile-col-role"><col class="profile-col-role">${CATS.map(() => `<col class="profile-col-stat">`).join("")}<col class="profile-col-stat"></colgroup><thead><tr><th>Season</th><th>Team</th><th>Class</th><th>Archetype</th><th>2nd Role</th>${CATS.map(([,l]) => `<th>${l}</th>`).join("")}<th>${rows[0].model === "d1" ? "NBA Translate" : "D1 Projection"}</th></tr></thead><tbody>
        ${rows.map(p => `<tr><td>${p.season}</td><td>${p.statsTeam || p.team}</td><td>${p.class || "--"}</td><td>${p.archetype}</td><td>${p.secondary || "--"}</td>${CATS.map(([k]) => `<td>${fmt(p.verspi?.[k])}</td>`).join("")}<td>${fmt(p.projection?.score)}</td></tr>`).join("")}
      </tbody></table></div>
    </div>
    <div>
      <h3>Box stats by year</h3>
      <div class="table-wrap"><table class="hub-table profile-data-table profile-box-table"><colgroup><col class="profile-col-season"><col class="profile-col-team">${STAT_COLS.map(() => `<col class="profile-col-stat">`).join("")}</colgroup><thead><tr><th>Season</th><th>Team</th>${STAT_COLS.map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
        ${rows.map(p => `<tr><td>${p.season}</td><td>${p.statsTeam || p.team}</td>${STAT_COLS.map(c => `<td>${statCell(p, c)}</td>`).join("")}</tr>`).join("")}
      </tbody></table></div>
    </div>
  </div>`;
}

function pbpTables(p) {
  const details = pbpDetails?.[p.id];
  if (!pbpDetails) return `<h3>Current-year play-by-play detail</h3><p class="muted">Loading play-by-play detail...</p>`;
  if (!details) return `<h3>Current-year play-by-play detail</h3><p class="muted">No matched play-by-play detail for this player-season.</p>`;
  return `<div class="pbp-section-stack">
    <h3>Current-year play-by-play detail</h3>
    ${PBP_SECTIONS.map(section => `<section class="pbp-section">
      <h4>${escapeHtml(section.title)}</h4>
      <div class="table-wrap"><table class="hub-table pbp-table"><colgroup>${section.metrics.map(() => `<col class="pbp-col-stat">`).join("")}</colgroup>
        <thead><tr>${section.metrics.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}</tr></thead>
        <tbody><tr>${section.metrics.map(([key, , kind]) => `<td>${formatPbpValue(details[key], kind)}</td>`).join("")}</tr></tbody>
      </table></div>
    </section>`).join("")}
  </div>`;
}

function formatPbpValue(value, kind) {
  if (value === null || value === undefined || value === "") return "--";
  if (kind === "pct") return fmt(value, "pct");
  if (kind === "int") return fmt(value, "int");
  return fmt(value);
}

function shotChart(p) {
  const sourceZones = p.pbp?.zones || [];
  if (!sourceZones.length) return `<p class="muted">No matched play-by-play shot-zone data for this row yet.</p>`;
  const sourceByKey = new Map(sourceZones.map(zone => [zone.key, zone]));
  const zones = Object.fromEntries([
    ["atr2", "At rim"],
    ["paint2", "Paint (non-rim)"],
    ["mid2", "Midrange"],
    ["atb3", "Above break 3"],
    ["c3", "Corner 3"]
  ].map(([key, label]) => [key, normalizeZone(sourceByKey.get(key), key, label)]));
  const benchmarks = shotBenchmarks(p);
  const colors = Object.fromEntries(Object.entries(zones).map(([key, zone]) => [key, shotZoneColor(zone, benchmarks[key])]));
  const twoFgm = zones.atr2.fgm + zones.paint2.fgm + zones.mid2.fgm;
  const twoFga = zones.atr2.fga + zones.paint2.fga + zones.mid2.fga;
  const threeFgm = zones.atb3.fgm + zones.c3.fgm;
  const threeFga = zones.atb3.fga + zones.c3.fga;
  const totalFgm = twoFgm + threeFgm;
  const totalFga = twoFga + threeFga;
  const overallFg = totalFga ? totalFgm / totalFga * 100 : null;
  const twoPct = twoFga ? twoFgm / twoFga * 100 : null;
  const threePct = threeFga ? threeFgm / threeFga * 100 : null;
  const effectiveFg = totalFga ? (totalFgm + 0.5 * threeFgm) / totalFga * 100 : null;

  return `<div class="shot-court-wrap">
    <svg class="shot-court" viewBox="0 0 940 720" role="img" aria-labelledby="shotCourtTitle shotCourtDesc">
      <title id="shotCourtTitle">${escapeHtml(p.name)} shot chart</title>
      <desc id="shotCourtDesc">PBP field-goal percentage and makes over attempts at the rim, in the paint, from midrange, above the break, and from the corners.</desc>
      <rect x="1" y="1" width="938" height="718" rx="6" fill="${colors.atb3.fill}"><title>${zoneTitle(zones.atb3, benchmarks.atb3)}</title></rect>
      <path d="M1 430 C120 610 285 672 470 672 C655 672 820 610 939 430 L939 719 L1 719 Z" fill="#ffffff"><title>Beyond the charted above-the-break range</title></path>
      <path d="M70 0 L70 215 C96 410 245 520 470 520 C695 520 844 410 870 215 L870 0 Z" fill="${colors.mid2.fill}"><title>${zoneTitle(zones.mid2, benchmarks.mid2)}</title></path>
      <rect x="1" y="1" width="69" height="214" fill="${colors.c3.fill}"><title>${zoneTitle(zones.c3, benchmarks.c3)}</title></rect>
      <rect x="870" y="1" width="69" height="214" fill="${colors.c3.fill}"><title>${zoneTitle(zones.c3, benchmarks.c3)}</title></rect>
      <rect x="360" y="1" width="220" height="350" fill="${colors.paint2.fill}"><title>${zoneTitle(zones.paint2, benchmarks.paint2)}</title></rect>
      <circle cx="470" cy="100" r="82" fill="${colors.atr2.fill}"><title>${zoneTitle(zones.atr2, benchmarks.atr2)}</title></circle>

      <g class="shot-court-lines">
        <rect x="1" y="1" width="938" height="718" rx="6"/>
        <line x1="70" y1="0" x2="70" y2="215"/>
        <line x1="870" y1="0" x2="870" y2="215"/>
        <line x1="1" y1="215" x2="70" y2="215"/>
        <line x1="870" y1="215" x2="939" y2="215"/>
        <path d="M70 215 C96 410 245 520 470 520 C695 520 844 410 870 215"/>
        <path d="M1 430 C120 610 285 672 470 672 C655 672 820 610 939 430"/>
        <rect x="360" y="1" width="220" height="350"/>
        <circle cx="470" cy="100" r="82"/>
        <line x1="432" y1="46" x2="508" y2="46"/>
        <circle cx="470" cy="66" r="14"/>
      </g>

      ${svgZoneLabel(zones.mid2, colors.mid2.text, 205, 168)}
      ${svgZoneLabel(zones.paint2, colors.paint2.text, 470, 244)}
      ${svgZoneLabel(zones.atb3, colors.atb3.text, 470, 584)}
      ${svgZoneLabel(zones.atr2, colors.atr2.text, 470, 53, "compact")}
      <g transform="translate(905 122) rotate(-90)">
        <text class="shot-corner-label" x="0" y="0" text-anchor="middle" fill="${colors.c3.text}">C3 ${shotPct(zones.c3.fgPct)} · ${Math.round(zones.c3.fgm)}/${Math.round(zones.c3.fga)}</text>
      </g>

      <text class="shot-summary" x="16" y="574" fill="#172033">
        <tspan x="16">FGM/A ${Math.round(totalFgm)}/${Math.round(totalFga)}</tspan>
        <tspan x="16" dy="27">FG: ${shotPct(overallFg)}</tspan>
        <tspan x="16" dy="27">eFG: ${shotPct(effectiveFg)}</tspan>
        <tspan x="16" dy="27">2P: ${shotPct(twoPct)} (${Math.round(twoFgm)}/${Math.round(twoFga)})</tspan>
        <tspan x="16" dy="27">3P: ${shotPct(threePct)} (${Math.round(threeFgm)}/${Math.round(threeFga)})</tspan>
      </text>
    </svg>
    <div class="shot-chart-legend">
      <span><i class="shot-cold"></i>Below level average</span>
      <span><i class="shot-neutral"></i>Near level average</span>
      <span><i class="shot-hot"></i>Above level average</span>
    </div>
  </div>
  <p class="muted shot-creation">Creation: ${fmt(p.pbp.creation?.ptsCreatedG)} pts created/G · ${fmt(p.pbp.creation?.uPtsG)} unassisted pts/G · ${fmt(p.pbp.creation?.fgmAstdPct, "pct")} assisted FGM · ${fmt(p.pbp.creation?.rimPaintAst40)} rim + paint assists/40</p>`;
}

function normalizeZone(zone, key, label) {
  const fgm = Number(zone?.fgm) || 0;
  const fga = Number(zone?.fga) || 0;
  const fgPct = zone?.fgPct === null || zone?.fgPct === undefined
    ? (fga ? fgm / fga * 100 : null)
    : Number(zone.fgPct);
  return { key, label, fgm, fga, fgPct, fgaG: Number(zone?.fgaG) || 0 };
}

function shotBenchmarks(p) {
  const cacheKey = `${p.model}\u0000${p.season}`;
  if (shotBenchmarkCache.has(cacheKey)) return shotBenchmarkCache.get(cacheKey);
  const totals = {};
  payload.players.forEach(candidate => {
    if (candidate.model !== p.model || candidate.season !== p.season) return;
    (candidate.pbp?.zones || []).forEach(zone => {
      const fgm = Number(zone.fgm) || 0;
      const fga = Number(zone.fga) || 0;
      if (!fga) return;
      totals[zone.key] = totals[zone.key] || { fgm: 0, fga: 0 };
      totals[zone.key].fgm += fgm;
      totals[zone.key].fga += fga;
    });
  });
  const benchmarks = Object.fromEntries(Object.entries(totals).map(([key, total]) => [key, total.fgm / total.fga * 100]));
  shotBenchmarkCache.set(cacheKey, benchmarks);
  return benchmarks;
}

function shotZoneColor(zone, benchmark) {
  if (!zone.fga || !Number.isFinite(zone.fgPct) || !Number.isFinite(benchmark)) return { fill: "#e5e7eb", text: "#344054" };
  const delta = zone.fgPct - benchmark;
  if (delta >= 8) return { fill: "#dc2626", text: "#ffffff" };
  if (delta >= 3) return { fill: "#e49a9a", text: "#172033" };
  if (delta <= -8) return { fill: "#4a90d0", text: "#ffffff" };
  if (delta <= -3) return { fill: "#b9cfe4", text: "#172033" };
  return { fill: "#eceef1", text: "#172033" };
}

function svgZoneLabel(zone, color, x, y, extraClass = "") {
  return `<text class="shot-zone-label ${extraClass}" x="${x}" y="${y}" text-anchor="middle" fill="${color}">
    <tspan class="shot-zone-name" x="${x}">${zone.label}</tspan>
    <tspan class="shot-zone-rate" x="${x}" dy="34">${shotPct(zone.fgPct)}</tspan>
    <tspan class="shot-zone-count" x="${x}" dy="29">${Math.round(zone.fgm)}/${Math.round(zone.fga)}</tspan>
  </text>`;
}

function zoneTitle(zone, benchmark) {
  const comparison = Number.isFinite(benchmark) && Number.isFinite(zone.fgPct) && zone.fga
    ? `, ${(zone.fgPct - benchmark) >= 0 ? "+" : ""}${(zone.fgPct - benchmark).toFixed(1)} percentage points versus ${benchmark.toFixed(1)}% level average`
    : "";
  const volume = Number.isFinite(zone.fgaG) ? `, ${zone.fgaG.toFixed(1)} FGA/G` : "";
  return `${zone.label}: ${shotPct(zone.fgPct)}, ${Math.round(zone.fgm)}/${Math.round(zone.fga)}${volume}${comparison}`;
}

function shotPct(value) {
  return Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)}%` : "--";
}

function compareList(items) {
  if (!items.length) return `<p class="muted">No close matches available.</p>`;
  return `<div class="compare-list">${items.map(({ player, score }) => `
    <div class="compare-item"><span><strong>${player.name}</strong><br><span class="muted">${player.team} - ${player.archetype}</span></span><span class="pill blue">${fmt(score)}</span></div>
  `).join("")}</div>`;
}

function escapeHtml(value) {
  return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
