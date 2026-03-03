const STORAGE_KEYS = {
  USERS: "sudoku_users_v1",
  CURRENT_USER: "sudoku_current_user_v1",
  HISTORY: "sudoku_history_v1",
  USER_SETTINGS: "sudoku_user_settings_v1",
  THEME: "sudoku_theme_v1" // legacy migration key
};

const puzzles = {
  easy: [
    "530070000600195000098000060800060003400803001700020006060000280000419005000080079",
    "009000000080605020501078000000800090007040300030002000000530907020901050000000800"
  ],
  medium: [
    "000260701680070090190004500820100040004602900050003028009300074040050036703018000",
    "300000000005009000200504000020000700160000058704310600000890100000067080000005437"
  ],
  hard: [
    "000000907000420180000705026100904000050000040000507009920108000034059000507000000",
    "030000080000001905000080000000008406170000093906500000000030000509700000040000010"
  ]
};

const markerDescriptions = {
  fixed: "固定数字：题目给定数字，不能修改。",
  user: "用户填写：你手动填入的数字。",
  note: "候选笔记：仅在空格中显示候选数。",
  conflict: "冲突高亮：同一行/列/宫出现重复数字会标红。",
  selected: "当前选中/同组：显示当前格所在行、列和宫。",
  same: "同数字高亮：与当前选中格数字相同的格子会高亮。"
};

const state = {
  user: null,
  board: [],
  initialBoard: [],
  solution: [],
  notes: Array.from({ length: 81 }, () => new Set()),
  selectedCell: null,
  activeNumber: null,
  difficulty: "easy",
  notesMode: false,
  inputMode: "cell-first",
  timer: 0,
  timerId: null,
  mistakes: 0,
  score: 0,
  hintsUsed: 0,
  status: "idle",
  feedbackCell: null,
  feedbackType: null,
  streakMode: false,
  longPressTimer: null,
  activeHighlightNumber: null,
  markers: {
    fixed: true, user: true, note: true, conflict: true, selected: true, same: true
  }
};

const dom = {
  authSection: document.getElementById("authSection"),
  gameSection: document.getElementById("gameSection"),
  authForm: document.getElementById("authForm"),
  username: document.getElementById("username"),
  password: document.getElementById("password"),
  authMessage: document.getElementById("authMessage"),
  registerBtn: document.getElementById("registerBtn"),
  welcomeText: document.getElementById("welcomeText"),
  logoutBtn: document.getElementById("logoutBtn"),
  difficultySelect: document.getElementById("difficultySelect"),
  themeSelect: document.getElementById("themeSelect"),
  inputModeSelect: document.getElementById("inputModeSelect"),
  modeHint: document.getElementById("modeHint"),
  newGameBtn: document.getElementById("newGameBtn"),
  notesToggleBtn: document.getElementById("notesToggleBtn"),
  hintBtn: document.getElementById("hintBtn"),
  timer: document.getElementById("timer"),
  mistakes: document.getElementById("mistakes"),
  score: document.getElementById("score"),
  progress: document.getElementById("progress"),
  sudokuBoard: document.getElementById("sudokuBoard"),
  keypad: document.getElementById("keypad"),
  markerItems: document.getElementById("markerItems"),
  markerDescription: document.getElementById("markerDescription"),
  historyTableBody: document.getElementById("historyTableBody"),
  gameMessage: document.getElementById("gameMessage"),
  streakPanel: document.getElementById("streakPanel"),
  streakText: document.getElementById("streakText"),
  exitStreakBtn: document.getElementById("exitStreakBtn"),
  gameOverModal: document.getElementById("gameOverModal"),
  gameOverText: document.getElementById("gameOverText"),
  restartGameBtn: document.getElementById("restartGameBtn"),
  closeModalBtn: document.getElementById("closeModalBtn")
};

const loadJSON = (k, d) => JSON.parse(localStorage.getItem(k) || JSON.stringify(d));
const saveJSON = (k, v) => localStorage.setItem(k, JSON.stringify(v));

function defaultMarkers() {
  return { fixed: true, user: true, note: true, conflict: true, selected: true, same: true };
}

function defaultUserSettings() {
  return {
    theme: "classic",
    difficulty: "easy",
    inputMode: "cell-first",
    notesMode: false,
    markers: defaultMarkers()
  };
}

function loadUserSettings(username) {
  const allSettings = loadJSON(STORAGE_KEYS.USER_SETTINGS, {});
  const raw = allSettings[username] || {};
  const defaults = defaultUserSettings();

  // Migrate legacy global theme if this user has no theme setting yet.
  if (!raw.theme) {
    const legacyTheme = localStorage.getItem(STORAGE_KEYS.THEME);
    if (legacyTheme) raw.theme = legacyTheme;
  }

  return {
    ...defaults,
    ...raw,
    markers: {
      ...defaults.markers,
      ...(raw.markers || {})
    }
  };
}

function saveUserSettings(username) {
  if (!username) return;
  const allSettings = loadJSON(STORAGE_KEYS.USER_SETTINGS, {});
  allSettings[username] = {
    theme: dom.themeSelect.value,
    difficulty: dom.difficultySelect.value,
    inputMode: dom.inputModeSelect.value,
    notesMode: state.notesMode,
    markers: { ...state.markers }
  };
  saveJSON(STORAGE_KEYS.USER_SETTINGS, allSettings);
}

function syncMarkerButtons() {
  const buttons = dom.markerItems.querySelectorAll("button[data-marker]");
  buttons.forEach((btn) => {
    const marker = btn.dataset.marker;
    btn.classList.toggle("active", Boolean(state.markers[marker]));
  });
}

function applyUserSettings(username) {
  const settings = loadUserSettings(username);

  state.markers = { ...settings.markers };
  state.inputMode = settings.inputMode;
  state.notesMode = settings.notesMode;
  state.difficulty = settings.difficulty;

  dom.themeSelect.value = settings.theme;
  dom.difficultySelect.value = settings.difficulty;
  dom.inputModeSelect.value = settings.inputMode;
  dom.notesToggleBtn.textContent = `笔记模式：${state.notesMode ? "开" : "关"}`;

  applyTheme(settings.theme, false);
  syncMarkerButtons();
  updateModeHint();
}

function setMessage(el, text, type = "") {
  el.textContent = text;
  el.className = `message ${type}`.trim();
}

function hashPassword(password) {
  return btoa(unescape(encodeURIComponent(password))).split("").reverse().join("");
}

function registerUser() {
  const username = dom.username.value.trim();
  const password = dom.password.value;
  const users = loadJSON(STORAGE_KEYS.USERS, {});
  if (!username || password.length < 4) return setMessage(dom.authMessage, "请输入有效用户名和密码。", "error");
  if (users[username]) return setMessage(dom.authMessage, "用户名已存在，请直接登录。", "error");

  users[username] = { password: hashPassword(password), createdAt: Date.now() };
  saveJSON(STORAGE_KEYS.USERS, users);

  const settings = loadJSON(STORAGE_KEYS.USER_SETTINGS, {});
  settings[username] = defaultUserSettings();
  saveJSON(STORAGE_KEYS.USER_SETTINGS, settings);

  setMessage(dom.authMessage, "注册成功，请点击登录。", "success");
}

function loginUser(event) {
  event.preventDefault();
  const username = dom.username.value.trim();
  const password = dom.password.value;
  const users = loadJSON(STORAGE_KEYS.USERS, {});
  if (!users[username] || users[username].password !== hashPassword(password)) {
    return setMessage(dom.authMessage, "登录失败：用户名或密码错误。", "error");
  }
  state.user = username;
  localStorage.setItem(STORAGE_KEYS.CURRENT_USER, username);
  enterGame();
}

function logoutUser() {
  state.user = null;
  stopTimer();
  localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
  dom.gameSection.classList.add("hidden");
  dom.authSection.classList.remove("hidden");
}

function enterGame() {
  dom.authSection.classList.add("hidden");
  dom.gameSection.classList.remove("hidden");
  dom.welcomeText.textContent = `欢迎你，${state.user}`;
  applyUserSettings(state.user);
  refreshHistory();
  startNewGame();
}

function solveBoard(board) {
  function valid(b, idx, val) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    for (let i = 0; i < 9; i++) if (b[row * 9 + i] === val || b[i * 9 + col] === val) return false;
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) if (b[r * 9 + c] === val) return false;
    }
    return true;
  }
  function dfs() {
    const idx = board.indexOf(0);
    if (idx === -1) return true;
    for (let val = 1; val <= 9; val++) {
      if (valid(board, idx, val)) {
        board[idx] = val;
        if (dfs()) return true;
        board[idx] = 0;
      }
    }
    return false;
  }
  return dfs() ? board : null;
}

function getPuzzleBoard(difficulty) {
  const template = puzzles[difficulty][Math.floor(Math.random() * puzzles[difficulty].length)].split("").map(Number);
  return { puzzle: template, solution: solveBoard(template.slice()) };
}

function startNewGame() {
  const selectedDifficulty = dom.difficultySelect.value;
  state.difficulty = selectedDifficulty;
  const { puzzle, solution } = getPuzzleBoard(selectedDifficulty);
  Object.assign(state, {
    board: puzzle.slice(),
    initialBoard: puzzle.slice(),
    solution: solution.slice(),
    notes: Array.from({ length: 81 }, () => new Set()),
    selectedCell: null,
    activeNumber: null,
    timer: 0,
    mistakes: 0,
    score: 0,
    hintsUsed: 0,
    status: "playing",
    feedbackCell: null,
    feedbackType: null,
    streakMode: false,
    activeHighlightNumber: null
  });
  saveUserSettings(state.user);
  setMessage(dom.gameMessage, "新局开始：请先选择输入模式。", "success");
  updateStreakPanel();
  renderKeypad();
  renderBoard();
  updateStatus();
  updateModeHint();
  startTimer();
}

function startTimer() {
  stopTimer();
  state.timerId = setInterval(() => {
    state.timer += 1;
    updateStatus();
  }, 1000);
}

function stopTimer() {
  if (state.timerId) clearInterval(state.timerId);
  state.timerId = null;
}

function formatTime(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function updateStatus() {
  dom.timer.textContent = formatTime(state.timer);
  dom.mistakes.textContent = String(state.mistakes);
  dom.score.textContent = String(Math.max(0, Math.round(state.score)));
  dom.progress.textContent = `${state.board.filter(Boolean).length}/81`;
}

function renderBoard() {
  dom.sudokuBoard.innerHTML = "";
  const conflicts = state.markers.conflict ? findConflicts() : new Set();
  const selectedNumber = state.selectedCell !== null ? state.board[state.selectedCell] : null;
  const highlightNumber = state.activeHighlightNumber || selectedNumber;

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = "cell";
    const value = state.board[i];
    const isFixed = state.initialBoard[i] !== 0;

    if (isFixed && state.markers.fixed) cell.classList.add("fixed");
    if (!isFixed && value && state.markers.user) cell.classList.add("user");
    if (state.selectedCell === i && state.markers.selected) cell.classList.add("selected");
    if (state.selectedCell !== null && i !== state.selectedCell && isRelated(state.selectedCell, i) && state.markers.selected) cell.classList.add("related");
    if (state.markers.same && highlightNumber && value && value === highlightNumber) cell.classList.add("same-number");
    if (conflicts.has(i)) cell.classList.add("conflict");
    if (state.feedbackCell === i && state.feedbackType) cell.classList.add(state.feedbackType === "ok" ? "feedback-correct" : "feedback-wrong");

    if (value) {
      cell.textContent = String(value);
    } else if (state.markers.note && state.notes[i].size) {
      const box = document.createElement("div");
      box.className = "notes";
      for (let n = 1; n <= 9; n++) {
        const s = document.createElement("span");
        s.textContent = state.notes[i].has(n) ? String(n) : "";
        box.appendChild(s);
      }
      cell.appendChild(box);
    }

    cell.addEventListener("click", () => onCellClick(i));
    dom.sudokuBoard.appendChild(cell);
  }
}

function renderKeypad() {
  dom.keypad.innerHTML = "";
  [1, 2, 3, 4, 5, 6, 7, 8, 9, "清空"].forEach((item) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(item);
    if (item === "清空") btn.classList.add("ghost");
    if (state.activeNumber === item) btn.classList.add("active-number");
    btn.addEventListener("click", () => onKeypadClick(item));
    bindKeypadLongPress(btn, item);
    dom.keypad.appendChild(btn);
  });
}

function onCellClick(index) {
  state.selectedCell = index;
  state.activeHighlightNumber = state.board[index] || null;
  if (state.inputMode === "number-first" && state.activeNumber !== null) {
    onInput(state.activeNumber === "清空" ? 0 : state.activeNumber);
    return;
  }
  renderBoard();
}

function onKeypadClick(item) {
  const value = item === "清空" ? 0 : item;
  if (state.streakMode || state.inputMode === "number-first") {
    state.activeNumber = item;
    state.activeHighlightNumber = typeof item === "number" ? item : null;
    renderKeypad();
    updateStreakPanel();
    if (state.selectedCell !== null) onInput(value);
    setMessage(dom.gameMessage, item === "清空" ? "已选择清空工具，点击格子可清除。" : `已选择数字 ${item}，可连续点击空格快速填入。`, "success");
    return;
  }
  onInput(value);
}

function onInput(value) {
  const idx = state.selectedCell;
  if (state.status !== "playing") return;
  if (idx === null) {
    setMessage(dom.gameMessage, "请先点选一个空格，再输入数字，避免误触。", "error");
    return;
  }
  if (state.initialBoard[idx] !== 0) return setMessage(dom.gameMessage, "该格是题目给定数字，不能修改。", "error");

  if (value === 0) {
    state.board[idx] = 0;
    state.notes[idx].clear();
    state.feedbackCell = idx;
    state.feedbackType = "ok";
    setMessage(dom.gameMessage, "已清空该格。", "success");
    refreshAfterInput();
    return;
  }

  if (state.notesMode) {
    if (state.board[idx] !== 0) return setMessage(dom.gameMessage, "已有数字时不能添加笔记。", "error");
    state.notes[idx].has(value) ? state.notes[idx].delete(value) : state.notes[idx].add(value);
    setMessage(dom.gameMessage, `笔记已${state.notes[idx].has(value) ? "添加" : "移除"} ${value}。`, "success");
    renderBoard();
    return;
  }

  if (state.solution[idx] === value) {
    const fresh = state.board[idx] === 0;
    state.board[idx] = value;
    state.notes[idx].clear();
    if (fresh) {
      state.score += ({ easy: 15, medium: 22, hard: 30 }[state.difficulty] || 20) + Math.max(0, 20 - Math.floor(state.timer / 30));
    }
    state.feedbackCell = idx;
    state.feedbackType = "ok";
    setMessage(dom.gameMessage, `✅ 正确，填入 ${value}。`, "success");
  } else {
    state.mistakes += 1;
    state.score -= 20;
    state.feedbackCell = idx;
    state.feedbackType = "bad";
    setMessage(dom.gameMessage, `❌ 错误，${value} 不符合当前位置规则。还可再错 ${Math.max(0, 3 - state.mistakes)} 次。`, "error");
    if (state.mistakes >= 3) return endGame(false);
  }

  refreshAfterInput();
}

function refreshAfterInput() {
  renderBoard();
  updateStatus();
  setTimeout(() => {
    state.feedbackCell = null;
    state.feedbackType = null;
    renderBoard();
  }, 280);
  checkWin();
}

function useHint() {
  if (state.status !== "playing") return;
  const empties = state.board.map((v, i) => ({ v, i })).filter((x) => x.v === 0);
  if (!empties.length) return;
  const pick = empties[Math.floor(Math.random() * empties.length)].i;
  state.board[pick] = state.solution[pick];
  state.hintsUsed += 1;
  state.score -= 40;
  state.feedbackCell = pick;
  state.feedbackType = "ok";
  setMessage(dom.gameMessage, `提示已填入 ${state.solution[pick]}（扣 40 分）。`, "error");
  refreshAfterInput();
}

function checkWin() {
  if (state.board.every((v, i) => v === state.solution[i])) endGame(true);
}

function endGame(success) {
  state.status = "finished";
  stopTimer();
  if (success) {
    state.score += Math.max(0, 600 - state.timer * 2) - state.mistakes * 25 - state.hintsUsed * 40;
    setMessage(dom.gameMessage, `🎉 通关成功！最终得分 ${Math.max(0, Math.round(state.score))}。`, "success");
    saveResult();
    refreshHistory();
  } else {
    setMessage(dom.gameMessage, "失败：错误次数达到 3 次。", "error");
    showGameOverModal();
  }
  updateStatus();
}

function saveResult() {
  const history = loadJSON(STORAGE_KEYS.HISTORY, {});
  history[state.user] = history[state.user] || [];
  history[state.user].unshift({
    time: new Date().toLocaleString("zh-CN"),
    difficulty: state.difficulty,
    duration: formatTime(state.timer),
    mistakes: state.mistakes,
    score: Math.max(0, Math.round(state.score))
  });
  history[state.user] = history[state.user].slice(0, 30);
  saveJSON(STORAGE_KEYS.HISTORY, history);
}

function refreshHistory() {
  const history = loadJSON(STORAGE_KEYS.HISTORY, {})[state.user] || [];
  dom.historyTableBody.innerHTML = "";
  if (!history.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5">暂无记录，快来完成第一局吧！</td>';
    return dom.historyTableBody.appendChild(tr);
  }
  history.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${record.time}</td><td>${record.difficulty}</td><td>${record.duration}</td><td>${record.mistakes}</td><td>${record.score}</td>`;
    dom.historyTableBody.appendChild(tr);
  });
}

function isRelated(a, b) {
  const rowA = Math.floor(a / 9);
  const colA = a % 9;
  const rowB = Math.floor(b / 9);
  const colB = b % 9;
  return rowA === rowB || colA === colB || (Math.floor(rowA / 3) === Math.floor(rowB / 3) && Math.floor(colA / 3) === Math.floor(colB / 3));
}

function findConflicts() {
  const conflicts = new Set();
  for (let i = 0; i < 81; i++) {
    if (!state.board[i]) continue;
    for (let j = i + 1; j < 81; j++) {
      if (state.board[i] === state.board[j] && isRelated(i, j)) {
        conflicts.add(i);
        conflicts.add(j);
      }
    }
  }
  return conflicts;
}

function onKeyboardInput(event) {
  if (state.status !== "playing") return;
  if (/^[1-9]$/.test(event.key)) {
    if (state.inputMode === "number-first") {
      state.activeNumber = Number(event.key);
      state.activeHighlightNumber = Number(event.key);
      renderKeypad();
      setMessage(dom.gameMessage, `已选择数字 ${event.key}，请点击多个格子连填。`, "success");
      return;
    }
    onInput(Number(event.key));
  }
  if (["Backspace", "Delete", "0"].includes(event.key)) onInput(0);
}


function showGameOverModal() {
  dom.gameOverText.textContent = `错误次数已达到 3 次，本局结束。最终得分：${Math.max(0, Math.round(state.score))}`;
  dom.gameOverModal.classList.remove("hidden");
}

function hideGameOverModal() {
  dom.gameOverModal.classList.add("hidden");
}

function enterStreakMode(number) {
  state.streakMode = true;
  state.inputMode = "number-first";
  dom.inputModeSelect.value = "number-first";
  state.activeNumber = number;
  state.activeHighlightNumber = typeof number === "number" ? number : null;
  updateModeHint();
  updateStreakPanel();
  saveUserSettings(state.user);
  renderKeypad();
  renderBoard();
  setMessage(dom.gameMessage, `已进入数字连填模式：${number}。连续点击格子可快速填写。`, "success");
}

function exitStreakMode() {
  state.streakMode = false;
  state.activeNumber = null;
  state.activeHighlightNumber = null;
  updateStreakPanel();
  renderKeypad();
  renderBoard();
}

function updateStreakPanel() {
  if (!state.streakMode) {
    dom.streakPanel.classList.add("hidden");
    return;
  }
  dom.streakPanel.classList.remove("hidden");
  dom.streakText.textContent = `当前数字：${state.activeNumber ?? "-"}`;
}

function bindKeypadLongPress(button, item) {
  if (typeof item !== "number") return;
  const start = () => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = setTimeout(() => enterStreakMode(item), 420);
  };
  const cancel = () => {
    clearTimeout(state.longPressTimer);
    state.longPressTimer = null;
  };
  button.addEventListener("pointerdown", start);
  button.addEventListener("pointerup", cancel);
  button.addEventListener("pointerleave", cancel);
  button.addEventListener("pointercancel", cancel);
}

function applyTheme(theme, shouldPersist = true) {
  document.body.dataset.theme = theme === "classic" ? "" : theme;
  dom.themeSelect.value = theme;
  if (shouldPersist) saveUserSettings(state.user);
}

function updateModeHint() {
  const text = state.inputMode === "cell-first"
    ? "当前是“先选格再填数”：点击格子后，再点数字键盘或键盘 1-9 输入。"
    : "当前是“先选数字连填”：先点数字，再连续点击多个格子快速填写。";
  dom.modeHint.textContent = text;
}

function initEvents() {
  dom.authForm.addEventListener("submit", loginUser);
  dom.registerBtn.addEventListener("click", registerUser);
  dom.logoutBtn.addEventListener("click", logoutUser);
  dom.newGameBtn.addEventListener("click", startNewGame);
  dom.hintBtn.addEventListener("click", useHint);
  dom.exitStreakBtn.addEventListener("click", exitStreakMode);
  dom.restartGameBtn.addEventListener("click", () => { hideGameOverModal(); startNewGame(); });
  dom.closeModalBtn.addEventListener("click", hideGameOverModal);

  dom.notesToggleBtn.addEventListener("click", () => {
    state.notesMode = !state.notesMode;
    dom.notesToggleBtn.textContent = `笔记模式：${state.notesMode ? "开" : "关"}`;
    saveUserSettings(state.user);
    setMessage(dom.gameMessage, state.notesMode ? "笔记模式已开启。" : "笔记模式已关闭。", "success");
  });

  dom.inputModeSelect.addEventListener("change", () => {
    state.inputMode = dom.inputModeSelect.value;
    state.streakMode = false;
    state.activeNumber = null;
    state.activeHighlightNumber = null;
    saveUserSettings(state.user);
    renderKeypad();
    updateModeHint();
  });

  dom.difficultySelect.addEventListener("change", () => {
    state.difficulty = dom.difficultySelect.value;
    saveUserSettings(state.user);
  });

  dom.themeSelect.addEventListener("change", () => {
    applyTheme(dom.themeSelect.value);
  });

  dom.markerItems.addEventListener("click", (event) => {
    const btn = event.target.closest("button[data-marker]");
    if (!btn) return;
    const marker = btn.dataset.marker;
    state.markers[marker] = !state.markers[marker];
    btn.classList.toggle("active", state.markers[marker]);
    dom.markerDescription.textContent = markerDescriptions[marker];
    saveUserSettings(state.user);
    renderBoard();
  });

  document.addEventListener("keydown", onKeyboardInput);
}

function boot() {
  initEvents();
  // Visitor view fallback uses legacy global theme until login.
  const fallbackTheme = localStorage.getItem(STORAGE_KEYS.THEME) || "classic";
  applyTheme(fallbackTheme, false);

  hideGameOverModal();
  const remembered = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (remembered && loadJSON(STORAGE_KEYS.USERS, {})[remembered]) {
    state.user = remembered;
    enterGame();
  }
}

boot();
