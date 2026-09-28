import {
  CATS,
  STAT_COLS,
  deleteBoard as removeBoardDocument,
  fmt,
  loadHubData,
  matchesStateFilter,
  playerUrl,
  saveBoard,
  setupAuth,
  setupStateMultiSelect,
  showNotice,
  showAppWhenAuthed,
  statCell,
  watchBoards,
  watchSaved
} from "/cbb-hub/core.js?v=20260928-nbablend1";

let user = null;
let payload = null;
let playerById = new Map();
let savedMap = new Map();
let boards = [];
let activeBoard = null;
let activeUserId = null;
let savedUnsub = () => {};
let boardsUnsub = () => {};
let started = false;
let dirty = false;
let saveRevision = 0;
let saveChain = Promise.resolve();
let exportInProgress = false;

const state = {
  search: "",
  targetFilter: "all",
  levels: new Set(["d1", "d2"]),
  states: new Set(),
  tableSort: "",
  tableDirection: "asc",
  statMode: "verspi"
};

const els = {
  boardSelect: document.getElementById("boardSelect"),
  boardName: document.getElementById("boardName"),
  newBoardName: document.getElementById("newBoardName"),
  createBoard: document.getElementById("createBoard"),
  deleteBoard: document.getElementById("deleteBoard"),
  boardView: document.getElementById("boardView"),
  boardStatMode: document.getElementById("boardStatMode"),
  newColumnName: document.getElementById("newColumnName"),
  addColumn: document.getElementById("addColumn"),
  exportButton: document.getElementById("exportBoard"),
  saveStatus: document.getElementById("boardSaveStatus"),
  playerSearch: document.getElementById("boardPlayerSearch"),
  targetFilter: document.getElementById("boardTargetFilter"),
  levelFilter: document.getElementById("boardLevelFilter"),
  stateFilter: document.getElementById("boardState"),
  libraryCount: document.getElementById("savedLibraryCount"),
  library: document.getElementById("savedPlayerLibrary"),
  empty: document.getElementById("boardEmpty"),
  surface: document.getElementById("boardSurface"),
  title: document.getElementById("boardTitle"),
  summary: document.getElementById("boardSummary"),
  columns: document.getElementById("boardColumns"),
  table: document.getElementById("boardTable")
};

setupAuth().then(start);
window.addEventListener("hub-auth", event => start(event.detail));

async function start(currentUser) {
  user = currentUser;
  showAppWhenAuthed(user);
  if (!user) {
    savedUnsub();
    boardsUnsub();
    activeUserId = null;
    savedMap = new Map();
    boards = [];
    activeBoard = null;
    return;
  }
  if (!payload) {
    payload = await loadHubData();
    playerById = new Map(payload.players.map(player => [player.id, player]));
  }
  if (!started) {
    setupStateMultiSelect(els.stateFilter, payload.states, state.states, () => {
      renderLibrary();
      renderBoard();
    });
    bindControls();
    started = true;
  }
  if (activeUserId !== user.uid) {
    savedUnsub();
    boardsUnsub();
    activeUserId = user.uid;
    savedUnsub = watchSaved(user, map => {
      savedMap = map;
      renderLibrary();
      renderBoard();
    });
    boardsUnsub = watchBoards(user, nextBoards => {
      boards = nextBoards.map(normalizeBoard);
      if (!activeBoard) {
        activeBoard = boards[0] || null;
      } else if (!dirty) {
        activeBoard = boards.find(board => board.id === activeBoard.id) || boards[0] || null;
      }
      render();
    });
  }
  render();
}

function bindControls() {
  els.boardSelect.onchange = event => {
    activeBoard = boards.find(board => board.id === event.target.value) || null;
    dirty = false;
    render();
  };
  els.boardName.onchange = event => {
    if (!activeBoard) return;
    const name = event.target.value.trim();
    if (!name) {
      event.target.value = activeBoard.name;
      return;
    }
    mutateBoard(board => { board.name = name.slice(0, 80); });
  };
  els.newBoardName.onkeydown = event => {
    if (event.key === "Enter") createBoard();
  };
  els.createBoard.onclick = createBoard;
  els.deleteBoard.onclick = deleteActiveBoard;
  els.newColumnName.onkeydown = event => {
    if (event.key === "Enter") addColumn();
  };
  els.addColumn.onclick = addColumn;
  els.exportButton.onclick = exportBoard;
  els.boardView.querySelectorAll("button[data-board-view]").forEach(button => {
    button.onclick = () => {
      if (!activeBoard || activeBoard.view === button.dataset.boardView) return;
      mutateBoard(board => { board.view = button.dataset.boardView; });
    };
  });
  els.boardStatMode.querySelectorAll("button[data-board-stat-mode]").forEach(button => {
    button.onclick = () => {
      if (state.statMode === button.dataset.boardStatMode) return;
      state.statMode = button.dataset.boardStatMode;
      state.tableSort = "";
      els.boardStatMode.querySelectorAll("button[data-board-stat-mode]").forEach(other => {
        other.classList.toggle("active", other === button);
      });
      if (activeBoard?.view === "table") renderBoardTable(orderedBoardItems(activeBoard));
    };
  });
  els.playerSearch.oninput = event => {
    state.search = event.target.value.trim().toLowerCase();
    renderLibrary();
  };
  els.targetFilter.onchange = event => {
    state.targetFilter = event.target.value;
    renderLibrary();
  };
  els.levelFilter.querySelectorAll("button[data-board-level]").forEach(button => {
    button.onclick = () => {
      const level = button.dataset.boardLevel;
      if (state.levels.has(level)) state.levels.delete(level);
      else state.levels.add(level);
      button.classList.toggle("active", state.levels.has(level));
      renderLibrary();
    };
  });
}

function createBoard() {
  const name = els.newBoardName.value.trim() || `Board ${boards.length + 1}`;
  activeBoard = normalizeBoard({
    id: uniqueId("board"),
    name,
    view: "board",
    columns: [
      { id: uniqueId("column"), name: "Priority" },
      { id: uniqueId("column"), name: "Watch" },
      { id: uniqueId("column"), name: "Long-Term" }
    ],
    items: []
  });
  els.newBoardName.value = "";
  dirty = true;
  syncActiveBoard();
  render();
  persistActiveBoard();
  showNotice(`${activeBoard.name} created.`);
}

async function deleteActiveBoard() {
  if (!activeBoard || !user) return;
  const doomed = activeBoard;
  if (!window.confirm(`Delete "${doomed.name}"? This cannot be undone.`)) return;
  els.deleteBoard.disabled = true;
  try {
    await saveChain;
    await removeBoardDocument(user, doomed.id);
    boards = boards.filter(board => board.id !== doomed.id);
    activeBoard = boards[0] || null;
    dirty = false;
    render();
    showNotice(`${doomed.name} deleted.`);
  } catch (error) {
    showNotice(error.message, "error");
    els.deleteBoard.disabled = false;
  }
}

function addColumn() {
  if (!activeBoard) return;
  if (activeBoard.columns.length >= 20) {
    showNotice("A board can contain up to 20 columns.", "error");
    return;
  }
  const name = els.newColumnName.value.trim();
  if (!name) {
    els.newColumnName.focus();
    return;
  }
  mutateBoard(board => {
    board.columns.push({ id: uniqueId("column"), name: name.slice(0, 50) });
  });
  els.newColumnName.value = "";
}

function render() {
  renderBoardPicker();
  renderLibrary();
  renderBoard();
}

function renderBoardPicker() {
  const options = [...boards];
  if (activeBoard && !options.some(board => board.id === activeBoard.id)) options.push(activeBoard);
  options.sort((left, right) => left.name.localeCompare(right.name));
  els.boardSelect.innerHTML = options.length
    ? options.map(board => `<option value="${escapeHtml(board.id)}" ${board.id === activeBoard?.id ? "selected" : ""}>${escapeHtml(board.name)}</option>`).join("")
    : `<option value="">No boards yet</option>`;
  els.boardSelect.disabled = !options.length;
  els.boardName.disabled = !activeBoard;
  els.boardName.value = activeBoard?.name || "";
  els.deleteBoard.disabled = !activeBoard;
  els.addColumn.disabled = !activeBoard;
  els.exportButton.disabled = !activeBoard || !activeBoard.items.length || exportInProgress;
  els.boardView.querySelectorAll("button[data-board-view]").forEach(button => {
    button.disabled = !activeBoard;
    button.classList.toggle("active", (activeBoard?.view || "board") === button.dataset.boardView);
  });
  els.boardStatMode.classList.toggle("hidden", (activeBoard?.view || "board") !== "table");
  if (!activeBoard) els.saveStatus.textContent = "Select or create a board";
}

function renderLibrary() {
  if (!payload) return;
  const activeIds = new Set((activeBoard?.items || []).map(item => item.playerId));
  const players = [...savedMap.entries()].map(([id, saved]) => ({
    player: playerById.get(id) || saved,
    saved
  })).filter(({ player, saved }) => {
    if (!state.levels.has(player.model)) return false;
    if (!matchesStateFilter(player, state.states)) return false;
    if (state.search && !`${player.name} ${player.team} ${player.archetype || ""}`.toLowerCase().includes(state.search)) return false;
    if (state.targetFilter === "portal" && !saved.portalTarget) return false;
    if (state.targetFilter === "draft" && !saved.draftTarget) return false;
    if (state.targetFilter === "both" && !(saved.portalTarget && saved.draftTarget)) return false;
    if (state.targetFilter === "none" && (saved.portalTarget || saved.draftTarget)) return false;
    return true;
  }).sort((left, right) => targetWeight(right.saved) - targetWeight(left.saved)
    || String(left.player.name).localeCompare(String(right.player.name))
    || String(left.player.team).localeCompare(String(right.player.team)));

  els.libraryCount.textContent = `${players.length.toLocaleString()} of ${savedMap.size.toLocaleString()} saved players`;
  if (!savedMap.size) {
    els.library.innerHTML = `<div class="board-library-empty"><p>No saved players yet.</p><a href="/cbb-hub/index.html">Open Players</a></div>`;
    return;
  }
  if (!players.length) {
    els.library.innerHTML = `<div class="board-library-empty"><p>No saved players match these filters.</p></div>`;
    return;
  }
  els.library.innerHTML = players.map(({ player, saved }) => {
    const added = activeIds.has(player.id);
    return `<article class="board-library-card" draggable="${Boolean(activeBoard && !added)}" data-library-player-id="${escapeHtml(player.id)}">
      <div class="board-library-card-main">
        <a href="${playerUrl(player)}">${escapeHtml(player.name)}</a>
        <span>${escapeHtml(player.team || "--")} &middot; ${String(player.model || "").toUpperCase()} &middot; ${escapeHtml(player.season || "--")}${player.draft2026 ? ` &middot; Drafted #${player.draft2026.pick}` : ""}</span>
        <small>${escapeHtml(player.archetype || "--")} &middot; ${escapeHtml(player.class || "--")}</small>
      </div>
      <div class="board-library-card-actions">
        ${targetBadges(saved)}
        <button data-add-player="${escapeHtml(player.id)}" type="button" ${!activeBoard || added ? "disabled" : ""}>${added ? "Added" : "Add"}</button>
      </div>
    </article>`;
  }).join("");
  els.library.querySelectorAll("button[data-add-player]").forEach(button => {
    button.onclick = () => addPlayerToBoard(button.dataset.addPlayer);
  });
  bindDraggablePlayers(els.library);
}

function renderBoard() {
  const hasBoard = Boolean(activeBoard);
  els.empty.classList.toggle("hidden", hasBoard);
  els.surface.classList.toggle("hidden", !hasBoard);
  if (!hasBoard) return;
  activeBoard = normalizeBoard(activeBoard);
  const ordered = orderedBoardItems(activeBoard);
  const portalCount = ordered.filter(item => savedMap.get(item.playerId)?.portalTarget).length;
  const draftCount = ordered.filter(item => savedMap.get(item.playerId)?.draftTarget).length;
  const ratedCount = ordered.filter(item => item.stars > 0).length;
  els.title.textContent = activeBoard.name;
  els.summary.textContent = `${ordered.length} players · ${portalCount} portal · ${draftCount} draft · ${ratedCount} rated`;
  const tableView = activeBoard.view === "table";
  els.columns.classList.toggle("hidden", tableView);
  els.table.classList.toggle("hidden", !tableView);
  if (tableView) renderBoardTable(ordered.filter(item => matchesStateFilter(playerForItem(item), state.states)));
  else renderBoardColumns(ordered);
}

function renderBoardColumns(ordered) {
  const rankById = new Map(ordered.map((item, index) => [item.playerId, index + 1]));
  els.columns.innerHTML = `<div class="board-columns" style="--board-column-count:${activeBoard.columns.length}">${activeBoard.columns.map(column => {
    const items = activeBoard.items.filter(item => item.columnId === column.id).sort((left, right) => left.order - right.order);
    return `<section class="board-column" data-column-id="${escapeHtml(column.id)}">
      <header class="board-column-head">
        <input data-column-name="${escapeHtml(column.id)}" value="${escapeAttr(column.name)}" maxlength="50" aria-label="Column name">
        <span>${items.length}</span>
        <button data-delete-column="${escapeHtml(column.id)}" type="button" title="Delete column" aria-label="Delete ${escapeAttr(column.name)} column" ${activeBoard.columns.length === 1 ? "disabled" : ""}>&times;</button>
      </header>
      <div class="board-column-dropzone" data-drop-column="${escapeHtml(column.id)}">
        ${items.length ? items.map(item => boardPlayerCard(item, rankById.get(item.playerId))).join("") : `<p>Drop saved players here</p>`}
      </div>
    </section>`;
  }).join("")}</div>`;
  bindBoardInteractions();
}

function boardPlayerCard(item, rank) {
  const player = playerForItem(item);
  const saved = savedMap.get(item.playerId) || {};
  return `<article class="board-player-card" draggable="true" data-board-player-id="${escapeHtml(item.playerId)}">
    <div class="board-player-card-head">
      <span class="board-rank">#${rank}</span>
      <span class="comparison-level ${escapeHtml(player.model || "d1")}">${String(player.model || "").toUpperCase()}</span>
      <button data-remove-player="${escapeHtml(item.playerId)}" type="button" title="Remove from board" aria-label="Remove ${escapeAttr(player.name)}">&times;</button>
    </div>
    <a class="board-player-name" href="${playerUrl(player)}">${escapeHtml(player.name || "Unknown player")}</a>
    <span class="board-player-meta">${escapeHtml(player.team || "--")} &middot; ${escapeHtml(player.classShort || player.class || "--")}${player.draft2026 ? ` &middot; Drafted #${player.draft2026.pick}` : ""}</span>
    <small>${escapeHtml(player.archetype || "--")}</small>
    <div class="board-card-targets">${targetBadges(saved)}</div>
    ${starControl(item)}
    <label class="board-move-control"><span>Column</span><select data-move-player="${escapeHtml(item.playerId)}">${columnOptions(item.columnId)}</select></label>
    <label class="board-note-control"><span>Notes</span><textarea data-player-notes="${escapeHtml(item.playerId)}" rows="2" maxlength="500" placeholder="Add note...">${escapeHtml(item.notes || "")}</textarea></label>
  </article>`;
}

function renderBoardTable(ordered) {
  const useStats = state.statMode === "stats";
  const displayed = sortBoardItems(ordered);
  const rows = displayed.map(item => {
    const player = playerForItem(item);
    const saved = savedMap.get(item.playerId) || {};
    return `<tr>
      <td><select class="board-table-stars" data-star-select="${escapeHtml(item.playerId)}" aria-label="Star rating for ${escapeAttr(player.name)}">${[0,1,2,3,4,5].map(value => `<option value="${value}" ${value === item.stars ? "selected" : ""}>${value ? `${value} star${value === 1 ? "" : "s"}` : "Not rated"}</option>`).join("")}</select></td>
      <td><a class="player-name" href="${playerUrl(player)}">${escapeHtml(player.name || "Unknown player")}</a></td>
      <td><span class="comparison-level ${escapeHtml(player.model || "d1")}">${String(player.model || "").toUpperCase()}</span></td>
      <td>${escapeHtml(player.team || "--")}${player.draft2026 ? `<span class="drafted-badge">Drafted #${player.draft2026.pick}</span>` : ""}</td>
      <td>${targetBadges(saved)}</td>
      <td><select data-move-player="${escapeHtml(item.playerId)}">${columnOptions(item.columnId)}</select></td>
      <td>${escapeHtml(player.classShort || player.class || "--")}</td>
      <td>${escapeHtml(player.archetype || "--")}</td>
      ${useStats
        ? STAT_COLS.map(key => `<td>${statCell(player, key)}</td>`).join("")
        : `${CATS.map(([key]) => `<td>${fmt(player.verspi?.[key])}</td>`).join("")}<td>${fmt(player.projection?.score)}</td>`}
      <td><input class="board-table-note" data-player-notes="${escapeHtml(item.playerId)}" maxlength="500" value="${escapeAttr(item.notes || "")}" placeholder="Add note..."></td>
      <td><button class="board-remove-button" data-remove-player="${escapeHtml(item.playerId)}" type="button">Remove</button></td>
    </tr>`;
  }).join("");
  const statHeaders = useStats
    ? STAT_COLS.map(key => sortHeader(`stat:${key}`, key, "numeric")).join("")
    : `${CATS.map(([key, label]) => sortHeader(`verspi:${key}`, label, "numeric")).join("")}${sortHeader("projection", "Projection", "numeric")}`;
  els.table.innerHTML = ordered.length ? `<div class="table-wrap"><table class="hub-table board-only-table">
    <thead><tr>${sortHeader("stars", "Stars", "numeric")}${sortHeader("player", "Player")}${sortHeader("level", "Level")}${sortHeader("team", "Team")}${sortHeader("targets", "Targets")}${sortHeader("column", "Column")}${sortHeader("class", "Class")}${sortHeader("archetype", "Archetype")}${statHeaders}<th>Notes</th><th></th></tr></thead>
    <tbody>${rows}</tbody>
  </table></div>` : `<div class="board-table-empty"><p>No players are on this board yet.</p></div>`;
  bindBoardInteractions();
}

function bindBoardInteractions() {
  els.surface.querySelectorAll("input[data-column-name]").forEach(input => {
    input.onchange = () => {
      const name = input.value.trim();
      if (!name) {
        input.value = activeBoard.columns.find(column => column.id === input.dataset.columnName)?.name || "Column";
        return;
      }
      mutateBoard(board => {
        const column = board.columns.find(entry => entry.id === input.dataset.columnName);
        if (column) column.name = name.slice(0, 50);
      });
    };
  });
  els.surface.querySelectorAll("button[data-delete-column]").forEach(button => {
    button.onclick = () => deleteColumn(button.dataset.deleteColumn);
  });
  els.surface.querySelectorAll("button[data-remove-player]").forEach(button => {
    button.onclick = () => removePlayerFromBoard(button.dataset.removePlayer);
  });
  els.surface.querySelectorAll("button[data-star-player]").forEach(button => {
    button.onclick = () => setPlayerStars(button.dataset.starPlayer, Number(button.dataset.stars));
  });
  els.surface.querySelectorAll("select[data-star-select]").forEach(select => {
    select.onchange = () => setPlayerStars(select.dataset.starSelect, Number(select.value));
  });
  els.surface.querySelectorAll("select[data-move-player]").forEach(select => {
    select.onchange = () => moveBoardPlayer(select.dataset.movePlayer, select.value);
  });
  els.surface.querySelectorAll("textarea[data-player-notes],input[data-player-notes]").forEach(input => {
    input.onchange = () => mutateBoard(board => {
      const item = board.items.find(entry => entry.playerId === input.dataset.playerNotes);
      if (item) item.notes = input.value.slice(0, 500);
    });
  });
  els.surface.querySelectorAll("button[data-board-sort]").forEach(button => {
    button.onclick = () => {
      const key = button.dataset.boardSort;
      if (state.tableSort === key) state.tableDirection = state.tableDirection === "asc" ? "desc" : "asc";
      else {
        state.tableSort = key;
        state.tableDirection = button.dataset.sortType === "numeric" ? "desc" : "asc";
      }
      renderBoardTable(orderedBoardItems(activeBoard));
    };
  });
  bindDraggablePlayers(els.surface);
  els.surface.querySelectorAll("[data-drop-column]").forEach(dropzone => {
    dropzone.ondragover = event => {
      event.preventDefault();
      dropzone.classList.add("drag-over");
    };
    dropzone.ondragleave = event => {
      if (!dropzone.contains(event.relatedTarget)) dropzone.classList.remove("drag-over");
    };
    dropzone.ondrop = event => {
      event.preventDefault();
      dropzone.classList.remove("drag-over");
      const playerId = event.dataTransfer.getData("text/plain");
      const beforeId = event.target.closest("[data-board-player-id]")?.dataset.boardPlayerId || "";
      moveBoardPlayer(playerId, dropzone.dataset.dropColumn, beforeId);
    };
  });
}

function bindDraggablePlayers(root) {
  root.querySelectorAll("[draggable='true'][data-library-player-id],[draggable='true'][data-board-player-id]").forEach(card => {
    card.ondragstart = event => {
      const playerId = card.dataset.libraryPlayerId || card.dataset.boardPlayerId;
      event.dataTransfer.setData("text/plain", playerId);
      event.dataTransfer.effectAllowed = card.dataset.libraryPlayerId ? "copyMove" : "move";
      card.classList.add("dragging");
    };
    card.ondragend = () => card.classList.remove("dragging");
  });
}

function addPlayerToBoard(playerId) {
  if (!activeBoard || activeBoard.items.some(item => item.playerId === playerId) || !savedMap.has(playerId)) return;
  if (activeBoard.items.length >= 500) {
    showNotice("A board can contain up to 500 players.", "error");
    return;
  }
  const columnId = activeBoard.columns[0]?.id;
  if (!columnId) return;
  mutateBoard(board => {
    const order = board.items.filter(item => item.columnId === columnId).length;
    board.items.push({ playerId, columnId, order, stars: 0, notes: "" });
  });
}

function removePlayerFromBoard(playerId) {
  if (!activeBoard) return;
  mutateBoard(board => { board.items = board.items.filter(item => item.playerId !== playerId); });
}

function moveBoardPlayer(playerId, columnId, beforeId = "") {
  if (!activeBoard || !activeBoard.columns.some(column => column.id === columnId)) return;
  const existing = activeBoard.items.find(item => item.playerId === playerId);
  if (!existing && !savedMap.has(playerId)) return;
  if (!existing && activeBoard.items.length >= 500) {
    showNotice("A board can contain up to 500 players.", "error");
    return;
  }
  if (existing?.columnId === columnId && beforeId === playerId) return;
  mutateBoard(board => {
    const item = board.items.find(entry => entry.playerId === playerId) || { playerId, stars: 0, notes: "", order: 0 };
    const grouped = new Map(board.columns.map(column => [column.id, board.items
      .filter(entry => entry.playerId !== playerId && entry.columnId === column.id)
      .sort((left, right) => left.order - right.order)]));
    item.columnId = columnId;
    const destination = grouped.get(columnId);
    const beforeIndex = beforeId ? destination.findIndex(entry => entry.playerId === beforeId) : -1;
    destination.splice(beforeIndex >= 0 ? beforeIndex : destination.length, 0, item);
    board.items = board.columns.flatMap(column => grouped.get(column.id).map((entry, order) => ({ ...entry, columnId: column.id, order })));
  });
}

function setPlayerStars(playerId, stars) {
  if (!activeBoard) return;
  mutateBoard(board => {
    const item = board.items.find(entry => entry.playerId === playerId);
    if (item) item.stars = Math.max(0, Math.min(5, stars));
  });
}

function deleteColumn(columnId) {
  if (!activeBoard || activeBoard.columns.length <= 1) return;
  const column = activeBoard.columns.find(entry => entry.id === columnId);
  const fallback = activeBoard.columns.find(entry => entry.id !== columnId);
  const count = activeBoard.items.filter(item => item.columnId === columnId).length;
  const message = count
    ? `Delete "${column?.name}" and move its ${count} player${count === 1 ? "" : "s"} to "${fallback.name}"?`
    : `Delete "${column?.name}"?`;
  if (!window.confirm(message)) return;
  mutateBoard(board => {
    board.columns = board.columns.filter(entry => entry.id !== columnId);
    board.items.forEach(item => { if (item.columnId === columnId) item.columnId = fallback.id; });
  });
}

function mutateBoard(callback) {
  if (!activeBoard) return;
  callback(activeBoard);
  activeBoard = normalizeBoard(activeBoard);
  dirty = true;
  syncActiveBoard();
  render();
  persistActiveBoard();
}

function syncActiveBoard() {
  const index = boards.findIndex(board => board.id === activeBoard.id);
  if (index >= 0) boards[index] = activeBoard;
  else boards.push(activeBoard);
}

function persistActiveBoard() {
  if (!activeBoard || !user) return;
  const snapshot = normalizeBoard(activeBoard);
  const revision = ++saveRevision;
  els.saveStatus.textContent = "Saving...";
  saveChain = saveChain.then(() => saveBoard(user, snapshot)).then(() => {
    if (revision === saveRevision) {
      dirty = false;
      els.saveStatus.textContent = "Saved";
    }
  }).catch(error => {
    els.saveStatus.textContent = "Could not save";
    showNotice(error.message, "error");
  });
}

function normalizeBoard(board) {
  const seenColumns = new Set();
  const columns = (board?.columns || []).filter(column => column?.id && !seenColumns.has(column.id) && seenColumns.add(column.id))
    .map(column => ({ id: String(column.id), name: String(column.name || "Column") }));
  if (!columns.length) columns.push({ id: uniqueId("column"), name: "Priority" });
  const validColumns = new Set(columns.map(column => column.id));
  const seenPlayers = new Set();
  const items = (board?.items || []).filter(item => item?.playerId && !seenPlayers.has(item.playerId) && seenPlayers.add(item.playerId)).map(item => ({
    playerId: String(item.playerId),
    columnId: validColumns.has(item.columnId) ? String(item.columnId) : columns[0].id,
    order: Math.max(0, Number(item.order) || 0),
    stars: Math.max(0, Math.min(5, Number(item.stars) || 0)),
    notes: String(item.notes || "")
  }));
  columns.forEach(column => {
    items.filter(item => item.columnId === column.id).sort((left, right) => left.order - right.order)
      .forEach((item, order) => { item.order = order; });
  });
  return {
    id: String(board?.id || uniqueId("board")),
    name: String(board?.name || "Untitled Board"),
    view: board?.view === "table" ? "table" : "board",
    columns,
    items,
    createdAt: board?.createdAt || null
  };
}

function orderedBoardItems(board) {
  return board.columns.flatMap(column => board.items.filter(item => item.columnId === column.id).sort((left, right) => left.order - right.order));
}

function sortHeader(key, label, type = "text") {
  const active = state.tableSort === key;
  const direction = active ? state.tableDirection : "none";
  const arrow = active ? (state.tableDirection === "asc" ? "&#9650;" : "&#9660;") : "&#8597;";
  return `<th aria-sort="${direction === "none" ? "none" : direction === "asc" ? "ascending" : "descending"}"><button class="board-sort-button${active ? " active" : ""}" data-board-sort="${escapeHtml(key)}" data-sort-type="${type}" type="button">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button></th>`;
}

function sortBoardItems(items) {
  if (!state.tableSort) return items;
  const direction = state.tableDirection === "desc" ? -1 : 1;
  return [...items].sort((left, right) => {
    const a = boardSortValue(left, state.tableSort);
    const b = boardSortValue(right, state.tableSort);
    const aMissing = a === null || a === undefined || a === "" || (typeof a === "number" && !Number.isFinite(a));
    const bMissing = b === null || b === undefined || b === "" || (typeof b === "number" && !Number.isFinite(b));
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (aMissing) return 0;
    if (typeof a === "number" && typeof b === "number") return (a - b) * direction;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" }) * direction;
  });
}

function boardSortValue(item, key) {
  const player = playerForItem(item);
  const saved = savedMap.get(item.playerId) || {};
  if (key === "stars") return Number(item.stars);
  if (key === "player") return player.name || "";
  if (key === "level") return player.model || "";
  if (key === "team") return player.team || "";
  if (key === "targets") return targetWeight(saved);
  if (key === "column") return activeBoard.columns.find(column => column.id === item.columnId)?.name || "";
  if (key === "class") return classSortValue(player.classShort || player.class);
  if (key === "archetype") return player.archetype || "";
  if (key === "projection") return numberOrNull(player.projection?.score);
  if (key.startsWith("verspi:")) return numberOrNull(player.verspi?.[key.slice(7)]);
  if (key.startsWith("stat:")) return numberOrNull(player.stats?.[key.slice(5)]);
  return "";
}

function classSortValue(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "fr" || normalized === "freshman") return 0;
  if (normalized === "so" || normalized === "sophomore") return 1;
  if (normalized === "jr" || normalized === "junior") return 2;
  if (normalized === "sr" || normalized === "senior") return 3;
  return 9;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function exportBoard() {
  if (!activeBoard || !activeBoard.items.length || exportInProgress) return;
  exportInProgress = true;
  const originalTitle = document.title;
  const originalText = els.exportButton.textContent;
  els.exportButton.disabled = true;
  els.exportButton.textContent = "Preparing...";
  const useStats = state.statMode === "stats";
  const ordered = orderedBoardItems(activeBoard);
  const statHeaderCells = useStats
    ? STAT_COLS.map(key => `<th>${escapeHtml(key)}</th>`).join("")
    : `${CATS.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join("")}<th>Projection</th>`;
  const stage = document.createElement("section");
  stage.className = "board-export-stage";
  stage.innerHTML = `<header class="board-export-heading">
      <span>VERSPID Board Builder</span>
      <h1>${escapeHtml(activeBoard.name)}</h1>
      <p>${ordered.length.toLocaleString()} players &middot; ${activeBoard.columns.length.toLocaleString()} columns &middot; ${useStats ? "Box Stats" : "VERSPI+D"} view &middot; exported ${escapeHtml(new Date().toLocaleDateString())}</p>
    </header>
    ${activeBoard.columns.map(column => {
      const items = activeBoard.items.filter(item => item.columnId === column.id).sort((left, right) => left.order - right.order);
      return `<section class="board-export-column">
        <h2>${escapeHtml(column.name)} <span>${items.length}</span></h2>
        ${items.length ? `<table class="board-export-table">
          <thead><tr><th>Stars</th><th>Player</th><th>Level</th><th>Team</th><th>Targets</th><th>Class</th><th>Archetype</th>${statHeaderCells}<th>Notes</th></tr></thead>
          <tbody>${items.map(item => {
            const player = playerForItem(item);
            const saved = savedMap.get(item.playerId) || {};
            const statCells = useStats
              ? STAT_COLS.map(key => `<td>${statCell(player, key)}</td>`).join("")
              : `${CATS.map(([key]) => `<td>${fmt(player.verspi?.[key])}</td>`).join("")}<td>${fmt(player.projection?.score)}</td>`;
            return `<tr><td>${item.stars ? `${item.stars} &#9733;` : "NR"}</td><td><strong>${escapeHtml(player.name || "Unknown player")}</strong></td><td>${escapeHtml(String(player.model || "").toUpperCase())}</td><td>${escapeHtml(player.team || "--")}${player.draft2026 ? ` · Drafted #${player.draft2026.pick}` : ""}</td><td>${escapeHtml(targetLabel(saved))}</td><td>${escapeHtml(player.classShort || player.class || "--")}</td><td>${escapeHtml(player.archetype || "--")}</td>${statCells}<td>${escapeHtml(item.notes || "")}</td></tr>`;
          }).join("")}</tbody>
        </table>` : `<p class="board-export-empty">No players in this column.</p>`}
      </section>`;
    }).join("")}`;
  document.body.append(stage);
  document.body.classList.add("board-print-export");
  document.title = `VERSPID - ${activeBoard.name}`;

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.body.classList.remove("board-print-export");
    stage.remove();
    document.title = originalTitle;
    exportInProgress = false;
    els.exportButton.textContent = originalText;
    els.exportButton.disabled = !activeBoard?.items.length;
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

function playerForItem(item) {
  return playerById.get(item.playerId) || savedMap.get(item.playerId) || {
    id: item.playerId,
    name: "Unavailable player",
    team: "--",
    model: "d1",
    season: "--",
    verspi: {},
    projection: {}
  };
}

function starControl(item) {
  return `<div class="board-star-control" role="group" aria-label="Star rating">
    <button class="board-not-rated${item.stars === 0 ? " active" : ""}" data-star-player="${escapeHtml(item.playerId)}" data-stars="0" type="button" title="Not rated">NR</button>
    ${[1,2,3,4,5].map(value => `<button class="board-star${value <= item.stars ? " active" : ""}" data-star-player="${escapeHtml(item.playerId)}" data-stars="${value}" type="button" aria-label="${value} star${value === 1 ? "" : "s"}">&#9733;</button>`).join("")}
  </div>`;
}

function columnOptions(selectedId) {
  return activeBoard.columns.map(column => `<option value="${escapeHtml(column.id)}" ${column.id === selectedId ? "selected" : ""}>${escapeHtml(column.name)}</option>`).join("");
}

function targetBadges(saved) {
  const badges = [];
  if (saved.portalTarget) badges.push(`<span class="target-badge portal">Portal</span>`);
  if (saved.draftTarget) badges.push(`<span class="target-badge draft">NBA Draft</span>`);
  return badges.length ? badges.join("") : `<span class="target-badge none">No target</span>`;
}

function targetLabel(saved) {
  if (saved.portalTarget && saved.draftTarget) return "Transfer Portal + NBA Draft";
  if (saved.portalTarget) return "Transfer Portal";
  if (saved.draftTarget) return "NBA Draft";
  return "No target";
}

function targetWeight(saved) {
  return Number(Boolean(saved.portalTarget)) + Number(Boolean(saved.draftTarget));
}

function uniqueId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
