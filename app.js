const STORAGE_KEYS = {
  USERS: "sudoku_users_v1",
  CURRENT_USER: "sudoku_current_user_v1",
  HISTORY: "sudoku_history_v1"
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

const state = {
  user: null,
  board: [],
  initialBoard: [],
  solution: [],
  notes: Array.from({ length: 81 }, () => new Set()),
  selectedCell: null,
  difficulty: "easy",
  notesMode: false,
  timer: 0,
  timerId: null,
  mistakes: 0,
  score: 0,
  hintsUsed: 0,
  status: "idle"
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
  newGameBtn: document.getElementById("newGameBtn"),
  notesToggleBtn: document.getElementById("notesToggleBtn"),
  hintBtn: document.getElementById("hintBtn"),
  timer: document.getElementById("timer"),
  mistakes: document.getElementById("mistakes"),
  score: document.getElementById("score"),
  progress: document.getElementById("progress"),
  sudokuBoard: document.getElementById("sudokuBoard"),
  keypad: document.getElementById("keypad"),
  historyTableBody: document.getElementById("historyTableBody"),
  gameMessage: document.getElementById("gameMessage")
};

function loadUsers() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || "{}");
}

function saveUsers(users) {
  localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
}

function loadHistory() {
  return JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || "{}");
}

function saveHistory(history) {
  localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
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
  const users = loadUsers();

  if (users[username]) {
    setMessage(dom.authMessage, "用户名已存在，请直接登录。", "error");
    return;
  }

  users[username] = { password: hashPassword(password), createdAt: Date.now() };
  saveUsers(users);
  setMessage(dom.authMessage, "注册成功，请点击登录。", "success");
}

function loginUser(event) {
  event.preventDefault();
  const username = dom.username.value.trim();
  const password = dom.password.value;
  const users = loadUsers();

  if (!users[username] || users[username].password !== hashPassword(password)) {
    setMessage(dom.authMessage, "登录失败：用户名或密码错误。", "error");
    return;
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
  setMessage(dom.gameMessage, "");
}

function enterGame() {
  dom.authSection.classList.add("hidden");
  dom.gameSection.classList.remove("hidden");
  dom.welcomeText.textContent = `欢迎你，${state.user}`;
  refreshHistory();
  startNewGame();
}

function createSolvedBoard() {
  const board = Array(81).fill(0);

  function isValid(pos, num) {
    const row = Math.floor(pos / 9);
    const col = pos % 9;

    for (let i = 0; i < 9; i++) {
      if (board[row * 9 + i] === num || board[i * 9 + col] === num) return false;
    }

    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let r = boxRow; r < boxRow + 3; r++) {
      for (let c = boxCol; c < boxCol + 3; c++) {
        if (board[r * 9 + c] === num) return false;
      }
    }
    return true;
  }

  function fill(pos = 0) {
    if (pos === 81) return true;
    if (board[pos] !== 0) return fill(pos + 1);
    const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9].sort(() => Math.random() - 0.5);
    for (const num of nums) {
      if (isValid(pos, num)) {
        board[pos] = num;
        if (fill(pos + 1)) return true;
        board[pos] = 0;
      }
    }
    return false;
  }

  fill();
  return board;
}

function getPuzzleBoard(difficulty) {
  const canned = puzzles[difficulty];
  if (Math.random() < 0.7) {
    const template = canned[Math.floor(Math.random() * canned.length)].split("").map(Number);
    const solution = solveBoard(template.slice());
    if (solution) return { puzzle: template, solution };
  }
  const solution = createSolvedBoard();
  const puzzle = solution.slice();
  const removeCount = { easy: 40, medium: 50, hard: 57 }[difficulty] || 45;
  const cells = Array.from({ length: 81 }, (_, i) => i).sort(() => Math.random() - 0.5);
  for (let i = 0; i < removeCount; i++) puzzle[cells[i]] = 0;
  return { puzzle, solution };
}

function solveBoard(board) {
  function valid(b, idx, val) {
    const row = Math.floor(idx / 9);
    const col = idx % 9;
    for (let i = 0; i < 9; i++) {
      if (b[row * 9 + i] === val || b[i * 9 + col] === val) return false;
    }
    const br = Math.floor(row / 3) * 3;
    const bc = Math.floor(col / 3) * 3;
    for (let r = br; r < br + 3; r++) {
      for (let c = bc; c < bc + 3; c++) {
        if (b[r * 9 + c] === val) return false;
      }
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

function startNewGame() {
  const difficulty = dom.difficultySelect.value;
  state.difficulty = difficulty;
  const { puzzle, solution } = getPuzzleBoard(difficulty);
  state.board = puzzle.slice();
  state.initialBoard = puzzle.slice();
  state.solution = solution.slice();
  state.notes = Array.from({ length: 81 }, () => new Set());
  state.selectedCell = null;
  state.timer = 0;
  state.mistakes = 0;
  state.score = 0;
  state.hintsUsed = 0;
  state.status = "playing";
  setMessage(dom.gameMessage, "新局开始，加油！", "success");
  renderBoard();
  renderKeypad();
  updateStatus();
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
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }
}

function formatTime(totalSeconds) {
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");
  return `${mm}:${ss}`;
}

function updateStatus() {
  dom.timer.textContent = formatTime(state.timer);
  dom.mistakes.textContent = String(state.mistakes);
  dom.score.textContent = String(Math.max(0, state.score));
  const progress = state.board.filter(Boolean).length;
  dom.progress.textContent = `${progress}/81`;
}

function renderBoard() {
  dom.sudokuBoard.innerHTML = "";
  const conflicts = findConflicts();

  for (let i = 0; i < 81; i++) {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.type = "button";
    const value = state.board[i];
    const fixed = state.initialBoard[i] !== 0;
    const selected = state.selectedCell === i;

    if (fixed) cell.classList.add("fixed");
    if (selected) cell.classList.add("selected");
    if (state.selectedCell !== null && isRelated(state.selectedCell, i)) cell.classList.add("related");
    if (conflicts.has(i)) cell.classList.add("conflict");

    if (value) {
      cell.textContent = String(value);
    } else if (state.notes[i].size) {
      const notesBox = document.createElement("div");
      notesBox.className = "notes";
      for (let n = 1; n <= 9; n++) {
        const p = document.createElement("span");
        p.textContent = state.notes[i].has(n) ? String(n) : "";
        notesBox.appendChild(p);
      }
      cell.appendChild(notesBox);
    }

    cell.addEventListener("click", () => {
      state.selectedCell = i;
      renderBoard();
    });

    dom.sudokuBoard.appendChild(cell);
  }
}

function renderKeypad() {
  dom.keypad.innerHTML = "";
  [1, 2, 3, 4, 5, 6, 7, 8, 9, "清空"].forEach((num) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = String(num);
    btn.className = num === "清空" ? "ghost" : "";
    btn.addEventListener("click", () => onInput(num === "清空" ? 0 : num));
    dom.keypad.appendChild(btn);
  });
}

function onInput(value) {
  const idx = state.selectedCell;
  if (idx === null || state.status !== "playing") return;
  if (state.initialBoard[idx] !== 0) return;

  if (value === 0) {
    state.board[idx] = 0;
    state.notes[idx].clear();
    renderBoard();
    updateStatus();
    return;
  }

  if (state.notesMode) {
    if (state.board[idx] !== 0) return;
    if (state.notes[idx].has(value)) state.notes[idx].delete(value);
    else state.notes[idx].add(value);
    renderBoard();
    return;
  }

  if (state.solution[idx] === value) {
    const wasEmpty = state.board[idx] === 0;
    state.board[idx] = value;
    state.notes[idx].clear();
    if (wasEmpty) state.score += getScoreForMove();
    setMessage(dom.gameMessage, "填写正确。", "success");
  } else {
    state.mistakes += 1;
    state.score -= 20;
    setMessage(dom.gameMessage, "填写错误，已扣分。", "error");
    if (state.mistakes >= 3) {
      endGame(false);
      return;
    }
  }

  renderBoard();
  updateStatus();
  checkWin();
}

function getScoreForMove() {
  const base = { easy: 15, medium: 22, hard: 30 }[state.difficulty] || 20;
  const speedBonus = Math.max(0, 20 - Math.floor(state.timer / 30));
  return base + speedBonus;
}

function useHint() {
  if (state.status !== "playing") return;
  const emptyCells = state.board
    .map((val, idx) => ({ val, idx }))
    .filter((item) => item.val === 0);

  if (!emptyCells.length) return;

  const pick = emptyCells[Math.floor(Math.random() * emptyCells.length)].idx;
  state.board[pick] = state.solution[pick];
  state.notes[pick].clear();
  state.hintsUsed += 1;
  state.score -= 40;
  setMessage(dom.gameMessage, "已使用提示，扣除 40 分。", "error");
  renderBoard();
  updateStatus();
  checkWin();
}

function checkWin() {
  const solved = state.board.every((val, idx) => val === state.solution[idx]);
  if (solved) endGame(true);
}

function endGame(success) {
  state.status = "finished";
  stopTimer();

  if (success) {
    const clearBonus = Math.max(0, 600 - state.timer * 2);
    const mistakePenalty = state.mistakes * 25;
    const hintPenalty = state.hintsUsed * 40;
    state.score += clearBonus - mistakePenalty - hintPenalty;
    setMessage(dom.gameMessage, `通关成功！最终得分 ${Math.max(0, state.score)}。`, "success");
    saveResult();
    refreshHistory();
  } else {
    setMessage(dom.gameMessage, "失败：错误次数达到 3 次。请再试一次。", "error");
  }

  updateStatus();
}

function saveResult() {
  const history = loadHistory();
  history[state.user] = history[state.user] || [];
  history[state.user].unshift({
    time: new Date().toLocaleString("zh-CN"),
    difficulty: state.difficulty,
    duration: formatTime(state.timer),
    mistakes: state.mistakes,
    score: Math.max(0, Math.round(state.score))
  });
  history[state.user] = history[state.user].slice(0, 30);
  saveHistory(history);
}

function refreshHistory() {
  const history = loadHistory()[state.user] || [];
  dom.historyTableBody.innerHTML = "";
  if (!history.length) {
    const tr = document.createElement("tr");
    tr.innerHTML = '<td colspan="5">暂无记录，快来完成第一局吧！</td>';
    dom.historyTableBody.appendChild(tr);
    return;
  }

  history.forEach((record) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${record.time}</td>
      <td>${record.difficulty}</td>
      <td>${record.duration}</td>
      <td>${record.mistakes}</td>
      <td>${record.score}</td>
    `;
    dom.historyTableBody.appendChild(tr);
  });
}

function isRelated(a, b) {
  if (a === b) return true;
  const rowA = Math.floor(a / 9);
  const colA = a % 9;
  const rowB = Math.floor(b / 9);
  const colB = b % 9;
  return (
    rowA === rowB ||
    colA === colB ||
    (Math.floor(rowA / 3) === Math.floor(rowB / 3) && Math.floor(colA / 3) === Math.floor(colB / 3))
  );
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
  if (state.selectedCell === null || state.status !== "playing") return;
  if (/^[1-9]$/.test(event.key)) onInput(Number(event.key));
  if (event.key === "Backspace" || event.key === "Delete" || event.key === "0") onInput(0);
}

function initEvents() {
  dom.authForm.addEventListener("submit", loginUser);
  dom.registerBtn.addEventListener("click", registerUser);
  dom.logoutBtn.addEventListener("click", logoutUser);
  dom.newGameBtn.addEventListener("click", startNewGame);
  dom.difficultySelect.addEventListener("change", () => {
    state.difficulty = dom.difficultySelect.value;
  });
  dom.notesToggleBtn.addEventListener("click", () => {
    state.notesMode = !state.notesMode;
    dom.notesToggleBtn.textContent = `笔记模式：${state.notesMode ? "开" : "关"}`;
  });
  dom.hintBtn.addEventListener("click", useHint);
  document.addEventListener("keydown", onKeyboardInput);
}

function boot() {
  initEvents();
  const remembered = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
  if (remembered && loadUsers()[remembered]) {
    state.user = remembered;
    enterGame();
  }
}

boot();
