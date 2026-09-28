import { auth, db } from "../firebase-init.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  collection,
  doc,
  deleteField,
  getDoc,
  onSnapshot,
  query,
  setDoc,
  updateDoc,
  deleteDoc,
  where,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Your uid - the only account that can approve registrations, write player
// corrections, and write board-ranking metadata (see firestore.rules).
export const ADMIN_UID = "kvVMmR7vjQPQ7ROJVRYk9JVg4ld2";

// --- Optional: email notification when someone registers -------------------
// Uses EmailJS (emailjs.com) because it can send mail straight from the
// browser with no backend/Cloud Functions required. To turn this on:
//   1. Create a free EmailJS account, an Email Service, and an Email
//      Template with variables {{applicant_email}} and {{requested_at}}.
//   2. Fill in the three constants below with your Service ID, Template ID,
//      and Public Key from the EmailJS dashboard.
//   3. Add this to every page's <head>, alongside the other CDN scripts:
//        <script src="https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js"></script>
// Until configured, registration still works fully - it just skips the
// email and relies on the in-app "Pending accounts" panel (index.html,
// admin only) instead.
const EMAILJS_SERVICE_ID = "YOUR_EMAILJS_SERVICE_ID";
const EMAILJS_TEMPLATE_ID = "YOUR_EMAILJS_TEMPLATE_ID";
const EMAILJS_PUBLIC_KEY = "YOUR_EMAILJS_PUBLIC_KEY";
const ADMIN_NOTIFY_EMAIL = "chinhtv1712@gmail.com";

async function notifyAdminOfRegistration(applicantEmail) {
  if (EMAILJS_SERVICE_ID.startsWith("YOUR_") || typeof window.emailjs === "undefined") return;
  try {
    await window.emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
      to_email: ADMIN_NOTIFY_EMAIL,
      applicant_email: applicantEmail,
      requested_at: new Date().toLocaleString()
    }, { publicKey: EMAILJS_PUBLIC_KEY });
  } catch (error) {
    console.warn("[registration email] EmailJS send failed:", error);
  }
}

export const CATS = [
  ["v", "Vol", "volume"],
  ["e", "Eff", "efficiency"],
  ["r", "Reb", "rebounding"],
  ["s", "Sec", "security"],
  ["p", "Play", "playmaking"],
  ["i", "Imp", "impact"],
  ["d", "Def", "defense"]
];

export const STAT_COLS = ["GP", "MPG", "PTS/G", "REB/G", "AST/G", "STL/G", "BLK/G", "TOV/G", "FG%", "3P%", "FT%"];

let dataPromise;
export function loadHubData() {
  if (!dataPromise) dataPromise = Promise.all([
    fetch("/cbb-hub/data/hub-data.json?v=20260928-nbablend1", { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error("Could not load hub data");
      return r.json();
    }),
    fetch("/cbb-hub/data/school-states.tsv?v=20260922-states1", { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error("Could not load school/state mapping");
      return r.text();
    }),
    fetch("/cbb-hub/data/2026-draft.tsv?v=20260922-draft1", { cache: "no-cache" }).then(r => {
      if (!r.ok) throw new Error("Could not load 2026 draft results");
      return r.text();
    })
  ])
    .then(async ([data, schoolStateText, draftText]) => {
      let entries = {};
      try {
        const snap = await getDoc(doc(db, "meta", "playerCorrections"));
        entries = snap.exists() ? (snap.data().entries || {}) : {};
      } catch (error) {
        console.warn("[player corrections] Could not load corrections, showing uncorrected data:", error);
      }
      data.schoolStates = parseSchoolStates(schoolStateText);
      data.states = [...new Set(Object.values(data.schoolStates))].sort((left, right) => left.localeCompare(right));
      data.draft2026 = parseDraftResults(draftText);
      const draftByName = new Map(data.draft2026.map(record => [draftIdentity(record.player), record]));
      const latestDraftPlayerIds = new Map();
      data.players.filter(player => player.model === "d1" && draftByName.has(draftIdentity(player.name))).forEach(player => {
        const identity = draftIdentity(player.name);
        const current = latestDraftPlayerIds.get(identity);
        if (!current || String(player.season).localeCompare(String(current.season)) > 0) latestDraftPlayerIds.set(identity, player);
      });
      data.players = applyPlayerCorrections(data.players, entries).map(player => {
        const draftRecord = draftByName.get(draftIdentity(player.name));
        const drafted = draftRecord && latestDraftPlayerIds.get(draftIdentity(player.name))?.id === player.id;
        return {
          ...player,
          schoolState: data.schoolStates[player.team] || "",
          draft2026: drafted ? draftRecord : null,
          projection: drafted ? { ...player.projection, draft26: draftRecord.pick } : player.projection
        };
      });
      data.playerCorrections = entries;
      return data;
    });
  return dataPromise;
}

function parseDraftResults(text) {
  return String(text || "").split(/\r?\n/).slice(1).map(line => {
    const [pick, player, school, round] = line.split("\t");
    return { pick: Number(pick), player: String(player || "").trim(), school: String(school || "").trim(), round: Number(round), status: "Drafted" };
  }).filter(record => Number.isFinite(record.pick) && record.player);
}

function draftIdentity(value) {
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/\b(jr|sr|ii|iii|iv|v)\b/g, "").replace(/[^a-z0-9]+/g, "");
}

export function draftStatusLabel(player) {
  return player?.draft2026?.pick ? `Drafted #${player.draft2026.pick}` : "";
}

function parseSchoolStates(text) {
  const entries = {};
  String(text || "").split(/\r?\n/).slice(1).forEach(line => {
    const splitAt = line.indexOf("\t");
    if (splitAt < 1) return;
    const school = line.slice(0, splitAt).trim();
    const state = line.slice(splitAt + 1).trim();
    if (school && state) entries[school] = state;
  });
  return entries;
}

export function matchesStateFilter(player, selectedStates) {
  return !selectedStates?.size || selectedStates.has(player?.schoolState || "");
}

export function setupStateMultiSelect(container, states, selectedStates, onChange, options = {}) {
  if (!container) return { update() {} };
  const label = options.label || "State";
  container.classList.add("state-multi-select");
  container.innerHTML = `
    <span>${escapeMarkup(label)}</span>
    <button class="state-multi-trigger" type="button" aria-expanded="false">All states</button>
    <div class="state-multi-menu hidden">
      <div class="state-multi-menu-head"><strong>Select states</strong><button type="button" data-state-reset>Reset</button></div>
      <div class="state-option-grid">${states.map(state => `<label><input type="checkbox" value="${escapeAttribute(state)}"> <span>${escapeMarkup(state)}</span></label>`).join("")}</div>
    </div>`;
  const trigger = container.querySelector(".state-multi-trigger");
  const menu = container.querySelector(".state-multi-menu");
  const boxes = [...container.querySelectorAll("input[type='checkbox']")];
  const update = () => {
    boxes.forEach(box => { box.checked = selectedStates.has(box.value); });
    const selected = [...selectedStates].sort((left, right) => left.localeCompare(right));
    trigger.textContent = selected.length ? `${selected.length} state${selected.length === 1 ? "" : "s"} selected` : "All states";
    trigger.title = selected.length ? selected.join(", ") : "All states";
  };
  trigger.onclick = () => {
    const opening = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !opening);
    trigger.setAttribute("aria-expanded", String(opening));
  };
  boxes.forEach(box => box.onchange = () => {
    if (box.checked) selectedStates.add(box.value);
    else selectedStates.delete(box.value);
    update();
    onChange?.();
  });
  container.querySelector("[data-state-reset]").onclick = () => {
    selectedStates.clear();
    update();
    onChange?.();
  };
  document.addEventListener("click", event => {
    if (container.contains(event.target)) return;
    menu.classList.add("hidden");
    trigger.setAttribute("aria-expanded", "false");
  });
  update();
  return { update };
}

function escapeMarkup(value) {
  return String(value ?? "").replace(/[&<>]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]);
}

function escapeAttribute(value) {
  return escapeMarkup(value).replace(/"/g, "&quot;");
}

// A manual correction overrides a player's school when the underlying model
// has it wrong (mis-scraped team, stale season, etc). Two distinct edit modes:
//   "fix"      - the CURRENT value was simply wrong; overwrite it, no history kept.
//   "transfer" - the player genuinely moved to a new school the model doesn't know
//                about yet; reuses the same `transfer`/`statsTeam` shape the data
//                pipeline already produces for detected transfers, so every page
//                that already renders "from <old school>" picks it up for free.
// Corrections live in a single `meta/playerCorrections` doc (public read, admin
// write only - see firestore.rules) so every visitor sees the corrected model,
// not just the signed-in editor.
export function applyPlayerCorrections(players, entries) {
  if (!entries || !Object.keys(entries).length) return players;
  return players.map(player => {
    const correction = entries[player.id];
    if (!correction || !correction.team) return player;
    const correctionSource = { team: player.team, statsTeam: player.statsTeam ?? null, transfer: player.transfer ?? null };
    if (correction.mode === "transfer") {
      const from = correction.previousTeam || player.statsTeam || player.team;
      return {
        ...player,
        team: correction.team,
        statsTeam: player.statsTeam || player.team,
        transfer: { status: "Transferred", from, to: correction.team, manual: true },
        corrected: true,
        correctionMode: "transfer",
        correctionSource
      };
    }
    return { ...player, team: correction.team, corrected: true, correctionMode: "fix", correctionSource };
  });
}

export async function savePlayerCorrection(user, playerId, correction) {
  if (!user) throw new Error("Sign in first");
  const team = String(correction.team || "").trim();
  if (!team) throw new Error("Enter a school name");
  try {
    await setDoc(doc(db, "meta", "playerCorrections"), {
      entries: {
        [playerId]: {
          mode: correction.mode === "transfer" ? "transfer" : "fix",
          team,
          previousTeam: correction.mode === "transfer" ? String(correction.previousTeam || "").trim() || null : null,
          updatedAt: serverTimestamp()
        }
      }
    }, { merge: true });
  } catch (error) {
    console.error("[player corrections] Save failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export async function clearPlayerCorrection(user, playerId) {
  if (!user) throw new Error("Sign in first");
  try {
    await updateDoc(doc(db, "meta", "playerCorrections"), {
      [`entries.${playerId}`]: deleteField()
    });
  } catch (error) {
    console.error("[player corrections] Clear failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export function setupAuth() {
  const statusEls = [...document.querySelectorAll("#authStatus")];
  const signOutButtons = [...document.querySelectorAll("#authBtn")];
  const forms = [...document.querySelectorAll("#authForm")];
  const toggleButtons = [...document.querySelectorAll("#authToggleMode")];
  const forgotButtons = [...document.querySelectorAll("#authForgot")];
  const errorEls = [...document.querySelectorAll("#authError")];
  const pendingEls = [...document.querySelectorAll("#authPending")];
  let mode = "signin";
  let approvalUnsub = () => {};

  const setText = text => statusEls.forEach(el => { if (el) el.textContent = text; });
  const setSignOutButtons = user => signOutButtons.forEach(btn => {
    if (!btn) return;
    btn.classList.toggle("hidden", !user);
    btn.textContent = "Sign out";
    btn.onclick = () => signOut(auth);
  });
  const showError = message => errorEls.forEach(el => {
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("hidden", !message);
  });
  const showPending = message => {
    pendingEls.forEach(el => {
      if (!el) return;
      el.textContent = message || "";
      el.classList.toggle("hidden", !message);
    });
    forms.forEach(form => form.classList.toggle("hidden", Boolean(message)));
  };
  const applyMode = (clearError = false) => {
    forms.forEach(form => {
      const submitBtn = form.querySelector("#authSubmit");
      if (submitBtn) submitBtn.textContent = mode === "register" ? "Create account" : "Sign in";
      const passwordInput = form.querySelector("#authPassword");
      if (passwordInput) passwordInput.autocomplete = mode === "register" ? "new-password" : "current-password";
    });
    toggleButtons.forEach(btn => {
      btn.textContent = mode === "register" ? "Already have an account? Sign in" : "New here? Create an account";
    });
    forgotButtons.forEach(btn => btn.classList.toggle("hidden", mode === "register"));
    if (clearError) showError("");
  };

  toggleButtons.forEach(btn => btn.onclick = () => {
    mode = mode === "register" ? "signin" : "register";
    applyMode(true);
  });
  forgotButtons.forEach(btn => btn.onclick = async () => {
    const email = document.querySelector("#authEmail")?.value.trim();
    if (!email) {
      showError("Enter your email above first, then tap Forgot password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      showNotice(`Password reset email sent to ${email}.`);
    } catch (error) {
      showError(firebaseAuthMessage(error));
    }
  });
  forms.forEach(form => form.onsubmit = async event => {
    event.preventDefault();
    const email = form.querySelector("#authEmail")?.value.trim();
    const password = form.querySelector("#authPassword")?.value;
    const submitBtn = form.querySelector("#authSubmit");
    if (!email || !password) return;
    showError("");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = mode === "register" ? "Creating account..." : "Signing in...";
    }
    try {
      if (mode === "register") {
        await registerAccount(email, password);
        mode = "signin";
        showPending(`Account created for ${email}. It needs to be approved before you can sign in - check back once that happens.`);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (error) {
      showError(firebaseAuthMessage(error));
    } finally {
      if (submitBtn) submitBtn.disabled = false;
      applyMode();
    }
  });

  applyMode(true);
  setSignOutButtons(null);
  return new Promise(resolve => {
    onAuthStateChanged(auth, async user => {
      approvalUnsub();
      approvalUnsub = () => {};
      if (!user) {
        setText("Signed out");
        setSignOutButtons(null);
        showPending("");
        resolve(null);
        window.dispatchEvent(new CustomEvent("hub-auth", { detail: null }));
        return;
      }
      setSignOutButtons(user);
      if (user.uid === ADMIN_UID) {
        setText(user.email);
        showPending("");
        resolve(user);
        window.dispatchEvent(new CustomEvent("hub-auth", { detail: user }));
        return;
      }
      try {
        // Recover Auth accounts whose initial registration-document write was
        // interrupted or rejected by an older deployed ruleset.
        await ensureRegistrationRecord(user);
        approvalUnsub = onSnapshot(doc(db, "registrations", user.uid), regSnap => {
          const approved = regSnap.exists() && regSnap.data().approved === true;
          if (approved) {
            setText(user.email);
            showPending("");
            resolve(user);
            window.dispatchEvent(new CustomEvent("hub-auth", { detail: user }));
          } else if (regSnap.data()?.denied === true) {
            setText(`${user.email} (access denied)`);
            showPending(`Access for ${user.email} was not approved. Contact the administrator if you believe this is a mistake.`);
            resolve(null);
            window.dispatchEvent(new CustomEvent("hub-auth", { detail: null }));
          } else {
            setText(`${user.email} (pending approval)`);
            showPending(`Your account (${user.email}) is registered but still waiting for approval. This page will unlock automatically once an administrator approves it.`);
            resolve(null);
            window.dispatchEvent(new CustomEvent("hub-auth", { detail: null }));
          }
        }, error => {
          console.error("[auth] Approval listener failed:", error);
          setText("Signed out");
          showPending("Could not verify your account status. Try signing in again.");
          resolve(null);
          window.dispatchEvent(new CustomEvent("hub-auth", { detail: null }));
        });
      } catch (error) {
        console.error("[auth] Could not check approval status:", error);
        setText("Signed out");
        showPending("Could not verify your account status. Try signing in again.");
        resolve(null);
        window.dispatchEvent(new CustomEvent("hub-auth", { detail: null }));
      }
    });
  });
}

// Creates the Firebase Auth account, files a pending `registrations/{uid}`
// doc (approved: false), best-effort emails you via EmailJS, then signs the
// new account back out - it has no access anywhere in the app until you
// approve it (see firestore.rules' isApproved() and the admin panel in
// hub.js / index.html).
export async function registerAccount(email, password) {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  try {
    await ensureRegistrationRecord(credential.user);
    await notifyAdminOfRegistration(email);
  } catch (error) {
    console.error("[registrations] Could not file approval request:", error);
    throw new Error("Your sign-in account was created, but its approval request could not be saved. Sign in once with the same email to retry the request.");
  } finally {
    await signOut(auth);
  }
  return credential.user.uid;
}

// Return the user's registration and create a pending request when Firebase
// Auth contains the user but Firestore does not. Re-reading after a failed
// create safely handles the initial auth callback racing the sign-up flow.
export async function ensureRegistrationRecord(user) {
  if (!user || user.uid === ADMIN_UID) return null;
  const ref = doc(db, "registrations", user.uid);
  let snap = await getDoc(ref);
  if (snap.exists()) return snap;
  try {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email || "",
      approved: false,
      requestedAt: serverTimestamp()
    });
  } catch (error) {
    snap = await getDoc(ref);
    if (snap.exists()) return snap;
    throw error;
  }
  return getDoc(ref);
}

// Admin-only (enforced by firestore.rules `list`/`update`/`delete` rules on
// /registrations - a non-admin caller just gets an empty list / a thrown
// permission error).
export function watchPendingRegistrations(callback, onError = () => {}) {
  const pendingQuery = query(collection(db, "registrations"), where("approved", "==", false));
  return onSnapshot(pendingQuery, snap => {
    callback(snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(registration => registration.denied !== true)
      .sort((a, b) => (a.email || "").localeCompare(b.email || "")));
  }, error => {
    console.error("[registrations] Could not load pending accounts:", error);
    callback([]);
    onError(new Error(firebaseMessage(error)));
  });
}

export async function approveRegistration(uid) {
  try {
    await updateDoc(doc(db, "registrations", uid), {
      approved: true,
      approvedAt: serverTimestamp(),
      approvedBy: auth.currentUser?.uid || ADMIN_UID
    });
  } catch (error) {
    console.error("[registrations] Approve failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

// Keep a denied tombstone instead of deleting the registration. That prevents
// the missing-record recovery path from treating a deliberately denied user
// as an interrupted sign-up and filing a new pending request.
export async function denyRegistration(uid) {
  try {
    await updateDoc(doc(db, "registrations", uid), {
      approved: false,
      denied: true,
      deniedAt: serverTimestamp(),
      deniedBy: auth.currentUser?.uid || ADMIN_UID
    });
  } catch (error) {
    console.error("[registrations] Deny failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

function firebaseAuthMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("auth/email-already-in-use")) return "An account with that email already exists. Try signing in instead.";
  if (code.includes("auth/invalid-email")) return "Enter a valid email address.";
  if (code.includes("auth/weak-password")) return "Password must be at least 6 characters.";
  if (code.includes("auth/wrong-password") || code.includes("auth/invalid-credential")) return "Incorrect email or password.";
  if (code.includes("auth/user-not-found")) return "No account found with that email.";
  if (code.includes("auth/too-many-requests")) return "Too many attempts. Wait a bit and try again.";
  return error?.message || "Something went wrong. Please try again.";
}

export function watchSaved(user, callback) {
  if (!user) {
    callback(new Map());
    return () => {};
  }
  return onSnapshot(
    collection(db, "users", user.uid, "savedPlayers"),
    snap => {
      const map = new Map();
      snap.forEach(d => map.set(d.id, d.data()));
      callback(map);
    },
    error => {
      console.error("[saved players] Could not load saved players:", error);
      showNotice(firebaseMessage(error), "error");
      callback(new Map());
    }
  );
}

function savedPlayerFields(player) {
  return {
    id: player.id,
    model: player.model,
    name: player.name,
    team: player.team,
    season: player.season,
    class: player.class || "",
    archetype: player.archetype || "",
    projection: player.projection || null
  };
}

export async function savePlayer(user, player) {
  if (!user) throw new Error("Sign in first");
  try {
    await setDoc(doc(db, "users", user.uid, "savedPlayers", player.id), {
      ...savedPlayerFields(player),
      savedAt: serverTimestamp()
    }, { merge: true });
    return true;
  } catch (error) {
    console.error("[saved players] Save operation failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export async function toggleSaved(user, player, savedMap) {
  if (!user) throw new Error("Sign in first");
  const ref = doc(db, "users", user.uid, "savedPlayers", player.id);
  const shouldSave = !savedMap.has(player.id);
  try {
    if (!shouldSave) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { ...savedPlayerFields(player), savedAt: serverTimestamp() }, { merge: true });
    }
    return shouldSave;
  } catch (error) {
    console.error("[saved players] Save operation failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export async function updateSavedTargets(user, player, targets) {
  if (!user) throw new Error("Sign in first");
  try {
    await setDoc(doc(db, "users", user.uid, "savedPlayers", player.id), {
      ...savedPlayerFields(player),
      portalTarget: Boolean(targets.portalTarget),
      draftTarget: Boolean(targets.draftTarget),
      targetUpdatedAt: serverTimestamp()
    }, { merge: true });
  } catch (error) {
    console.error("[saved players] Target update failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export function watchBoards(user, callback) {
  if (!user) {
    callback([]);
    return () => {};
  }
  return onSnapshot(
    collection(db, "users", user.uid, "boards"),
    snap => callback(snap.docs.map(boardDoc => ({ id: boardDoc.id, ...boardDoc.data() }))
      .sort((left, right) => String(left.name || "").localeCompare(String(right.name || "")))),
    error => {
      console.error("[boards] Could not load boards:", error);
      showNotice(firebaseMessage(error), "error");
      callback([]);
    }
  );
}

export async function saveBoard(user, board) {
  if (!user) throw new Error("Sign in first");
  const cleanBoard = {
    id: String(board.id),
    name: String(board.name || "Untitled Board").trim().slice(0, 80) || "Untitled Board",
    view: board.view === "table" ? "table" : "board",
    columns: (board.columns || []).slice(0, 20).map(column => ({
      id: String(column.id),
      name: String(column.name || "Column").trim().slice(0, 50) || "Column"
    })),
    items: (board.items || []).slice(0, 500).map(item => ({
      playerId: String(item.playerId),
      columnId: String(item.columnId),
      order: Math.max(0, Number(item.order) || 0),
      stars: Math.max(0, Math.min(5, Number(item.stars) || 0)),
      notes: String(item.notes || "").slice(0, 500)
    })),
    updatedAt: serverTimestamp()
  };
  if (!board.createdAt) cleanBoard.createdAt = serverTimestamp();
  try {
    await setDoc(doc(db, "users", user.uid, "boards", cleanBoard.id), cleanBoard, { merge: true });
  } catch (error) {
    console.error("[boards] Save failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export async function deleteBoard(user, boardId) {
  if (!user) throw new Error("Sign in first");
  try {
    await deleteDoc(doc(db, "users", user.uid, "boards", String(boardId)));
  } catch (error) {
    console.error("[boards] Delete failed:", error);
    throw new Error(firebaseMessage(error));
  }
}

export function showNotice(message, type = "success") {
  let notice = document.getElementById("hubNotice");
  if (!notice) {
    notice = document.createElement("div");
    notice.id = "hubNotice";
    notice.className = "hub-notice";
    notice.setAttribute("role", "status");
    notice.setAttribute("aria-live", "polite");
    document.body.appendChild(notice);
  }
  notice.className = `hub-notice ${type}`;
  notice.textContent = message;
  notice.classList.add("visible");
  clearTimeout(showNotice.timer);
  showNotice.timer = setTimeout(() => notice.classList.remove("visible"), 4500);
}

function firebaseMessage(error) {
  const code = String(error?.code || "");
  if (code.includes("permission-denied")) return "Saving is blocked by Firestore permissions. Deploy the latest firestore.rules, then sign in again.";
  if (code.includes("unauthenticated")) return "Your sign-in session expired. Sign in again to save players.";
  if (code.includes("unavailable") || code.includes("network")) return "Saving is temporarily unavailable. Check your connection and try again.";
  return "The player could not be saved. Please try again.";
}

export function fmt(value, kind = "number") {
  if (value === null || value === undefined || value === "") return "--";
  const n = Number(value);
  if (Number.isNaN(n)) return String(value);
  if (kind === "pct") return `${(n <= 1 ? n * 100 : n).toFixed(1)}%`;
  if (kind === "int") return Math.round(n).toString();
  return Math.abs(n) >= 100 ? Math.round(n).toString() : n.toFixed(1);
}

export function catVal(player, key) {
  const value = player?.verspi?.[key];
  return value === null || value === undefined ? null : Number(value);
}

export function scoreClass(score) {
  if (score >= 78) return "green";
  if (score >= 64) return "gold";
  return "gray";
}

export function metric(player, key) {
  const found = CATS.find(c => c[0] === key);
  const value = catVal(player, key);
  const safe = Math.max(0, Math.min(100, value || 0));
  return `<span class="metric ${found?.[2] || ""}"><strong>${value == null ? "--" : Math.round(value)}</strong><span class="bar"><span style="width:${safe}%"></span></span></span>`;
}

export function statCell(player, key) {
  const kind = key.includes("%") ? "pct" : "number";
  return fmt(player.stats?.[key], kind);
}

export function playerUrl(player) {
  return `/cbb-hub/player.html?id=${encodeURIComponent(player.id)}`;
}

export function similarity(target, players, mode, limit = 5) {
  const targetPlayerId = String(target.pbp?.playerId || "").trim();
  const targetName = identityName(target.name);
  const same = players.filter(p => {
    if (p.id === target.id || p.model !== target.model || p.season !== target.season) return false;
    const candidatePlayerId = String(p.pbp?.playerId || "").trim();
    if (targetPlayerId && candidatePlayerId === targetPlayerId) return false;
    return identityName(p.name) !== targetName;
  });
  const vec = p => mode === "verspi"
    ? CATS.map(([k]) => catVal(p, k)).filter(v => v !== null)
    : (p.features || []).map(Number);
  const t = vec(target);
  if (!t.length) return [];
  return same.map(p => {
    const v = vec(p);
    const len = Math.min(t.length, v.length);
    if (!len) return null;
    let dist = 0;
    for (let i = 0; i < len; i++) dist += Math.pow((t[i] || 0) - (v[i] || 0), 2);
    const score = Math.max(0, 100 - Math.sqrt(dist) * (mode === "verspi" ? 1.2 : 18));
    return { player: p, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, limit);
}

function identityName(value) {
  const parts = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .match(/[a-z0-9]+/g) || [];
  while (parts.length && ["jr", "sr", "ii", "iii", "iv", "v"].includes(parts.at(-1))) parts.pop();
  return parts.join("");
}

export function classForSaved(savedMap, id) {
  return savedMap.has(id) ? "save-btn saved" : "save-btn";
}

// --- Shared click-to-sort table headers -------------------------------------
// Every ranked/results table in the hub (Players, Team Builder, Player Fit,
// Compare, Translation Insights) uses this so they all sort exactly like the
// Board Builder table: click a header to sort by it, click again to flip
// direction, numeric columns default to descending on first click.
export function sortHeader(key, label, activeState, type = "text", defaultDir) {
  const active = activeState.sortKey === key;
  const direction = active ? activeState.sortDir : "none";
  const arrow = active ? (activeState.sortDir === "asc" ? "&#9650;" : "&#9660;") : "&#8597;";
  const ariaSort = direction === "none" ? "none" : direction === "asc" ? "ascending" : "descending";
  const safeLabel = String(label || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const defaultAttr = defaultDir ? ` data-sort-default="${defaultDir}"` : "";
  return `<th aria-sort="${ariaSort}"><button class="board-sort-button${active ? " active" : ""}" data-sort-key="${key}" data-sort-type="${type}"${defaultAttr} type="button">${safeLabel} <span aria-hidden="true">${arrow}</span></button></th>`;
}

// Binds every sort-header button inside `container` so clicking it updates
// `sortState` (an object with sortKey/sortDir you keep in your page's own
// state) and calls `onChange()` to re-render. Call this again after every
// re-render, same as any other event binding in these files.
export function bindSortHeaders(container, sortState, onChange) {
  container.querySelectorAll("button[data-sort-key]").forEach(button => {
    button.onclick = () => {
      const key = button.dataset.sortKey;
      if (sortState.sortKey === key) {
        sortState.sortDir = sortState.sortDir === "asc" ? "desc" : "asc";
      } else {
        sortState.sortKey = key;
        sortState.sortDir = button.dataset.sortDefault || (button.dataset.sortType === "numeric" ? "desc" : "asc");
      }
      onChange();
    };
  });
}

// Sorts `rows` by whatever sortState currently points to. `valueForKey(row,
// key)` should return a number or string for that row/column - missing
// values (null/undefined/empty/NaN) always sort to the bottom regardless of
// direction, matching Board Builder's table.
export function sortRows(rows, sortState, valueForKey) {
  if (!sortState.sortKey) return rows;
  const direction = sortState.sortDir === "desc" ? -1 : 1;
  return [...rows].sort((left, right) => {
    const a = valueForKey(left, sortState.sortKey);
    const b = valueForKey(right, sortState.sortKey);
    const aMissing = a === null || a === undefined || a === "" || (typeof a === "number" && !Number.isFinite(a));
    const bMissing = b === null || b === undefined || b === "" || (typeof b === "number" && !Number.isFinite(b));
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing) return 0;
    if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}

export function showAppWhenAuthed(user) {
  document.querySelector("#gate")?.classList.toggle("hidden", !!user);
  document.querySelector("#app")?.classList.toggle("hidden", !user);
  document.querySelector("#profile")?.classList.toggle("hidden", !user);
  document.querySelector("#builder")?.classList.toggle("hidden", !user);
}
