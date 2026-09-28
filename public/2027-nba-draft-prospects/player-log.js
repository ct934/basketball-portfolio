// ============================================================================
// player-log.js  —  renders a player's scouting-report log.
//   • Renders every report stored in Firestore (newest first).
//   • The Preseason Report is normally a DB record too (via admin "Import
//     starter data"), which makes it editable in the admin panel.
//   • Fallback: until that DB record exists, a built-in static preseason
//     entry is shown so the log is never empty. Once the DB has a preseason
//     report for the player, the static fallback is suppressed (no dupes).
// ============================================================================

import { db } from "../firebase-init.js";
import {
  collection, query, where, getDocs,
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Built-in fallback preseason reports (link to the static preseason.html).
const PRESEASON = {
  "anthony-thompson": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Second Round",
    "role": "Bench Player",
    "summary": "The biggest question surrounding his projection is his mentality and competitiveness."
  },
  "babatunde-oladotun": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Late Lottery – Early 20s",
    "role": "High-End Rotation Player",
    "summary": "He has one of the wider ranges in the class."
  },
  "brandon-mccoy": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 8",
    "role": "Fringe All-Star",
    "summary": "The biggest swing skill is his shooting."
  },
  "braylon-mullins": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Draft Follow",
    "role": "Role Projection TBD",
    "summary": "Outlook to come."
  },
  "bruce-branch-iii": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 10",
    "role": "Fringe All-Star",
    "summary": "At this stage, he projects as an ideal play-finishing wing who excels within his role."
  },
  "caleb-holt": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 5",
    "role": "All-Star Potential",
    "summary": "At this stage, his game resembles Isaiah Joe's—a movement shooter who punishes closeouts while providing secondary offensive value."
  },
  "cameron-williams": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Lottery",
    "role": "High-End Rotation Player",
    "summary": "At this stage, his game resembles Jabari Smith Jr.—a floor-spacing forward with excellent touch and shooting upside."
  },
  "christian-collins": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Draft Follow",
    "role": "Role Projection TBD",
    "summary": "Outlook to come."
  },
  "dame-sarr": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Draft Follow",
    "role": "Role Projection TBD",
    "summary": "Outlook to come."
  },
  "jason-crowe-jr": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Lottery",
    "role": "High-End Sixth Man",
    "summary": "Ace Bailey provides an interesting comparison as a pure scorer coming out of high school, but Bailey's 6'9\" size gives him much more defensive upside."
  },
  "jordan-smith-jr": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 5",
    "role": "All-Star Potential",
    "summary": "His physical profile and downhill explosiveness resemble Scoot Henderson coming out of high school, though he is not at the same level as a prospect."
  },
  "luigi-suigo": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 8",
    "role": "All-Star Potential",
    "summary": "If he develops a consistent interior scoring package while continuing to improve as a perimeter shooter, he has the potential to become one of the toughest matchups in college basketball."
  },
  "miikka-muurinen": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Lottery",
    "role": "Fringe All-Star",
    "summary": "His development will largely depend on his offensive growth."
  },
  "stefan-joksimovic": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 5",
    "role": "All-Star Potential",
    "summary": "He has a similar developmental profile to Egor Demin—a tall, skilled guard with shooting potential, positional size, and the ability to attack downhill."
  },
  "trey-mckenney-jr": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Draft Follow",
    "role": "Role Projection TBD",
    "summary": "Outlook to come."
  },
  "tyran-stokes": {
    "dateLabel": "Jul 5, 2026",
    "draft": "Top 3",
    "role": "All-NBA Potential",
    "summary": "Physically, he resembles Ben Simmons coming out of high school, though with more perimeter skill and less overwhelming physical dominance."
  }
};

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function staticPreseasonEntry(slug) {
  const p = PRESEASON[slug];
  if (!p) return "";
  return `
      <a class="log-entry" href="./preseason.html">
        <div class="log-left">
          <span class="log-date">${esc(p.dateLabel)}</span>
          <span class="log-title">Preseason Report</span>
          <p class="log-summary">${esc(p.summary)}</p>
        </div>
        <div class="log-right">
          <span class="log-draft">${esc(p.draft)}</span>
          <span class="log-role">${esc(p.role)}</span>
        </div>
      </a>`;
}

async function renderLog() {
  const container = document.querySelector("[data-player-log]");
  if (!container) return;
  const slug = container.getAttribute("data-slug");
  const countEl = document.querySelector("[data-log-count]");

  let reports = [];
  try {
    const q = query(collection(db, "reports"), where("playerSlug", "==", slug));
    const snap = await getDocs(q);
    snap.forEach((d) => reports.push({ id: d.id, ...d.data() }));
    reports.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  } catch (err) {
    console.error("Failed to load reports:", err);
    // Firestore unavailable — fall back to the static preseason entry below.
  }

  // Does the DB already contain a preseason report for this player?
  const dbHasPreseason = reports.some(
    (r) => r.reportType === "preseason" ||
           (r.title || "").toLowerCase() === "preseason report"
  );

  const firestoreHtml = reports.map((r) => `
      <a class="log-entry" href="../../report.html?id=${encodeURIComponent(r.id)}">
        <div class="log-left">
          <span class="log-date">${esc(r.dateLabel || r.date)}</span>
          <span class="log-title">${esc(r.title)}</span>
          <p class="log-summary">${esc(r.summary)}</p>
        </div>
        <div class="log-right">
          <span class="log-draft">${esc(r.draftProjection)}</span>
          <span class="log-role">${esc(r.roleProjection)}</span>
        </div>
      </a>`).join("");

  const fallback = dbHasPreseason ? "" : staticPreseasonEntry(slug);
  const total = reports.length + (fallback ? 1 : 0);
  if (countEl) {
    countEl.textContent = total === 1 ? "1 Report" : `${total} Reports`;
  }

  container.innerHTML = (firestoreHtml + fallback) ||
    '<p class="report-line" style="opacity:0.6;padding:1.4rem 0.5rem;">No reports logged yet.</p>';
}

renderLog();
