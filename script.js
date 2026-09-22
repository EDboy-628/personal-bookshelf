// 保留原存储键，旧版数组备份可直接导入。
const STORAGE_KEY = "bookshelf.books.v1";
const RECOVERY_KEY = "bookshelf.before-import.v1";
const EXPORT_KEY = "bookshelf.last-export.v1";
const DRAG_TYPE = "application/x-bookshelf-id";
const SHELF_TITLES = { reading: "在读", finished: "已读", want: "想读" };
const $ = (id) => document.getElementById(id);
let loadError = "";
let draggedId = null;
let editingId = null;
let pendingImport = null;
let importRequest = 0;
const deletedBooks = [];

function defaultBooks() {
  return [
    { name: "知行合一·投资进阶", author: "交易者手册", status: "reading", progress: 62, rating: 0, tags: ["交易", "精进"] },
    { name: "聪明的投资者", author: "本杰明·格雷厄姆", status: "finished", progress: 100, rating: 5, tags: ["价值投资"] },
    { name: "乌合之众", author: "古斯塔夫·勒庞", status: "finished", progress: 100, rating: 4, tags: ["心理学"] },
    { name: "周易", author: "佚名", status: "want", progress: 0, rating: 0, tags: ["命理", "国学"] },
    { name: "原则", author: "瑞·达利欧", status: "want", progress: 0, rating: 0, tags: ["管理"] },
  ];
}

function newId() {
  return globalThis.crypto?.randomUUID?.() || `book-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function withStatus(book, status) {
  return {
    ...book,
    status,
    progress: status === "finished" ? 100 : status === "want" ? 0 : book.progress,
    rating: status === "finished" ? book.rating : 0,
  };
}

function validateBooks(value) {
  if (!Array.isArray(value)) throw new Error("备份内容必须是书籍数组。");
  const ids = new Set();
  return value.map((entry, index) => {
    const fail = (reason) => { throw new Error(`第 ${index + 1} 本书：${reason}`); };
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail("书籍格式不正确。");
    if (typeof entry.name !== "string" || !entry.name.trim()) fail("书名不能为空。");
    if (!Object.hasOwn(SHELF_TITLES, entry.status)) fail("阅读状态不正确。");
    if (entry.author !== undefined && typeof entry.author !== "string") fail("作者应为文字。");
    if (entry.tags !== undefined && (!Array.isArray(entry.tags) || entry.tags.some((tag) => typeof tag !== "string"))) fail("标签应为文字数组。");
    const progress = entry.progress ?? 0;
    const rating = entry.rating ?? 0;
    if (typeof progress !== "number" || !Number.isFinite(progress) || progress < 0 || progress > 100) fail("进度必须在 0–100 之间。");
    if (!Number.isInteger(rating) || rating < 0 || rating > 5) fail("评分必须是 0–5 的整数。");
    let id = typeof entry.id === "string" && entry.id.trim() ? entry.id : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    return withStatus({
      ...entry,
      id,
      name: entry.name.trim(),
      author: (entry.author || "").trim(),
      tags: [...new Set((entry.tags || []).map((tag) => tag.trim()).filter(Boolean))],
      progress,
      rating,
      tone: Number.isInteger(entry.tone) && entry.tone >= 1 && entry.tone <= 5 ? entry.tone : (index % 5) + 1,
    }, entry.status);
  });
}

function loadBooks() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return validateBooks(saved === null ? defaultBooks() : JSON.parse(saved));
  } catch {
    loadError = "无法读取本地书架。原数据未改动，请导出原始数据留存，或导入有效备份。";
    return [];
  }
}

let books = loadBooks();

function notify(message, error = false) {
  $("notice").textContent = message;
  $("notice").classList.remove("hidden");
  $("notice").classList.toggle("notice-error", error);
  const dialog = document.querySelector("dialog[open]");
  if (dialog) {
    let feedback = dialog.querySelector(".dialog-feedback");
    if (!feedback) {
      feedback = document.createElement("p");
      feedback.className = "dialog-feedback";
      feedback.setAttribute("role", "status");
      dialog.appendChild(feedback);
    }
    feedback.textContent = message;
  }
}

function commitBooks(next, { snapshot = false } = {}) {
  if (loadError && !snapshot) {
    notify(loadError, true);
    return false;
  }
  try {
    next = validateBooks(next);
    if (snapshot) localStorage.setItem(RECOVERY_KEY, loadError ? localStorage.getItem(STORAGE_KEY) || "[]" : JSON.stringify(books));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    notify(`保存失败，当前书架未改动。${error.message}`, true);
    return false;
  }
  books = next;
  loadError = "";
  refresh();
  return true;
}

function createBookSpine(book) {
  const spine = document.createElement("button");
  spine.type = "button";
  spine.className = `book-spine tone-${book.tone}`;
  spine.dataset.bookId = book.id;
  spine.draggable = true;
  spine.title = `${book.name}${book.author ? " — " + book.author : ""}`;
  const detail = book.status === "reading" ? `${book.progress}%` : book.status === "finished" ? (book.rating ? `${book.rating} 星` : "未评分") : "";
  spine.setAttribute("aria-label", `${spine.title}，${SHELF_TITLES[book.status]} ${detail}，点击编辑`);
  if (book.status === "reading") spine.classList.add("bookmark");
  if (book.status === "finished" && book.rating >= 4) spine.classList.add("tick");
  const title = document.createElement("span");
  title.className = "spine-title";
  title.textContent = book.name;
  const foot = document.createElement("span");
  foot.className = "spine-foot";
  foot.textContent = detail || book.author.slice(0, 2);
  spine.append(title, foot);
  if (book.status === "reading") {
    const meter = document.createElement("span");
    meter.className = "spine-progress";
    const fill = document.createElement("span");
    fill.className = "spine-progress-fill";
    fill.style.height = book.progress + "%";
    meter.appendChild(fill);
    spine.appendChild(meter);
  }
  spine.addEventListener("click", () => openModal(book.id));
  spine.addEventListener("dragstart", (ev) => {
    draggedId = book.id;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData(DRAG_TYPE, book.id);
    spine.classList.add("dragging");
  });
  spine.addEventListener("dragend", () => {
    draggedId = null;
    spine.classList.remove("dragging");
    document.querySelectorAll(".col-target").forEach((el) => el.classList.remove("col-target"));
  });
  return spine;
}

function render() {
  const scrollPositions = new Map([...document.querySelectorAll(".books")].map((el) => [el.dataset.status, el.scrollLeft]));
  const kw = $("searchBox").value.trim().toLowerCase();
  const bookcase = document.createElement("div");
  bookcase.className = "bookcase";
  let matches = 0;
  Object.keys(SHELF_TITLES).forEach((status) => {
    const filtered = books.filter((b) => b.status === status && (!kw || [b.name, b.author, ...b.tags].some((text) => text.toLowerCase().includes(kw))));
    matches += filtered.length;
    const row = document.createElement("section");
    row.className = "shelf-row";
    row.setAttribute("aria-label", SHELF_TITLES[status]);
    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `<b>${SHELF_TITLES[status]}</b><span>${filtered.length} 本</span>`;
    const booksEl = document.createElement("div");
    booksEl.className = "books";
    booksEl.dataset.status = status;
    if (!filtered.length) {
      const tip = document.createElement("div");
      tip.className = "empty-tip bookline-empty";
      tip.textContent = kw ? "这一层没有匹配的书" : "这一层还没有书";
      booksEl.appendChild(tip);
    } else filtered.forEach((book) => booksEl.appendChild(createBookSpine(book)));
    row.addEventListener("dragover", (ev) => {
      if (!draggedId || !ev.dataTransfer.types.includes(DRAG_TYPE)) return;
      ev.preventDefault();
      ev.dataTransfer.dropEffect = "move";
      row.classList.add("col-target");
    });
    row.addEventListener("dragleave", (ev) => { if (!row.contains(ev.relatedTarget)) row.classList.remove("col-target"); });
    row.addEventListener("drop", (ev) => {
      ev.preventDefault();
      row.classList.remove("col-target");
      const id = ev.dataTransfer.getData(DRAG_TYPE);
      const book = books.find((b) => b.id === id);
      if (!id || id !== draggedId || !book || book.status === status) return;
      draggedId = null;
      if (commitBooks(books.map((b) => b.id === id ? withStatus(b, status) : b))) notify(`《${book.name}》已移到「${SHELF_TITLES[status]}」。`);
    });
    const board = document.createElement("div");
    board.className = "board";
    row.append(label, booksEl, board);
    bookcase.appendChild(row);
  });
  $("shelves").replaceChildren(bookcase);
  document.querySelectorAll(".books").forEach((el) => { el.scrollLeft = scrollPositions.get(el.dataset.status) || 0; });
  $("clearSearch").classList.toggle("hidden", !$("searchBox").value);
  $("searchSummary").textContent = kw ? `找到 ${matches} 本书（共 ${books.length} 本）。顶部统计为全部藏书。` : "点击书籍编辑进度和状态；电脑上也可拖动书籍换层。";
}

function updateStats() {
  const rated = books.filter((b) => b.status === "finished" && b.rating > 0);
  const avg = rated.length ? (rated.reduce((sum, b) => sum + b.rating, 0) / rated.length).toFixed(1) : "—";
  const values = [[books.length, "藏书总数"], ...Object.entries(SHELF_TITLES).map(([status, title]) => [books.filter((b) => b.status === status).length, title]), [avg, "平均评分"]];
  $("statsBar").innerHTML = values.map(([value, label]) => `<div class="stat"><span class="stat-num">${value}</span><span class="stat-label">${label}</span></div>`).join("");
}

function updateBackupStatus() {
  try {
    const date = localStorage.getItem(EXPORT_KEY);
    $("backupStatus").textContent = date && Number.isFinite(Date.parse(date)) ? `最近导出：${new Date(date).toLocaleString("zh-CN")}` : "尚未导出备份";
    $("restoreBtn").classList.toggle("hidden", localStorage.getItem(RECOVERY_KEY) === null);
  } catch { $("backupStatus").textContent = "浏览器存储不可用，请检查权限。"; }
}

function refresh() { render(); updateStats(); updateBackupStatus(); }

function focusBook(id) {
  const target = [...document.querySelectorAll(".book-spine")].find((el) => el.dataset.bookId === id);
  if (target) target.focus();
}

function showDialog(dialog) {
  dialog.querySelector(".dialog-feedback")?.remove();
  dialog.showModal();
  document.body.classList.add("dialog-open");
}

for (const dialog of document.querySelectorAll("dialog")) {
  dialog.addEventListener("close", () => { if (!document.querySelector("dialog[open]")) document.body.classList.remove("dialog-open"); });
}

function openModal(id = null) {
  const book = books.find((b) => b.id === id);
  if (id !== null && !book) return;
  editingId = id;
  $("bookForm").reset();
  $("modalTitle").textContent = book ? "编辑书籍" : "添加书籍";
  $("fDelete").classList.toggle("hidden", !book);
  $("fName").value = book?.name || "";
  $("fAuthor").value = book?.author || "";
  $("fStatus").value = book?.status || "reading";
  $("fProgress").value = book?.progress || 0;
  $("fRating").value = book?.rating || 0;
  $("fTags").value = book?.tags.join(", ") || "";
  setStatusVisibility($("fStatus").value);
  showDialog($("bookModal"));
  $("fName").focus();
}

function setStatusVisibility(status) {
  $("fProgressWrap").classList.toggle("hidden", status !== "reading");
  $("fRatingWrap").classList.toggle("hidden", status !== "finished");
  $("fProgress").disabled = status !== "reading";
  $("fRating").disabled = status !== "finished";
}

$("addBookBtn").addEventListener("click", () => openModal());
$("modalClose").addEventListener("click", () => $("bookModal").close());
$("bookModal").addEventListener("close", () => focusBook(editingId));
$("fStatus").addEventListener("change", (ev) => setStatusVisibility(ev.target.value));
for (const [id, delta] of [["progressMinus", -5], ["progressPlus", 5]]) $(id).addEventListener("click", () => { $("fProgress").value = Math.max(0, Math.min(100, (Number($("fProgress").value) || 0) + delta)); });

$("bookForm").addEventListener("submit", (ev) => {
  ev.preventDefault();
  if (!$("fName").value.trim()) { $("fName").setCustomValidity("请输入书名，不能只填空格。"); $("fName").reportValidity(); return; }
  const existing = books.find((b) => b.id === editingId);
  const data = withStatus({ ...existing, id: editingId || newId(), name: $("fName").value.trim(), author: $("fAuthor").value.trim(), tags: $("fTags").value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean), progress: Number($("fProgress").value) || 0, rating: Number($("fRating").value) }, $("fStatus").value);
  const next = existing ? books.map((b) => b.id === editingId ? data : b) : [...books, data];
  if (commitBooks(next)) { const name = data.name; $("bookModal").close(); notify(`已保存《${name}》。`); }
});

function updateUndo() { $("undoBar").classList.toggle("hidden", !deletedBooks.length); $("undoMessage").textContent = deletedBooks.length ? `已删除《${deletedBooks.at(-1).book.name}》` : ""; }
$("fDelete").addEventListener("click", () => {
  const index = books.findIndex((b) => b.id === editingId);
  if (index < 0) return;
  const book = books[index];
  if (commitBooks(books.filter((b) => b.id !== editingId))) { deletedBooks.push({ book, index }); updateUndo(); $("bookModal").close(); notify(`已删除《${book.name}》，可以点击“撤销删除”。`); }
});
$("undoBtn").addEventListener("click", () => {
  const deleted = deletedBooks.at(-1);
  if (!deleted) return;
  const next = [...books];
  next.splice(Math.min(deleted.index, next.length), 0, deleted.book);
  if (commitBooks(next)) { deletedBooks.pop(); updateUndo(); notify(`已恢复《${deleted.book.name}》。`); }
});

$("searchBox").addEventListener("input", render);
$("clearSearch").addEventListener("click", () => { $("searchBox").value = ""; render(); $("searchBox").focus(); });

function exportBooks() {
  try {
    const content = loadError ? localStorage.getItem(STORAGE_KEY) : JSON.stringify(books, null, 2);
    if (content === null) throw new Error("没有可导出的数据。");
    const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `bookshelf-${loadError ? "raw-" : "backup-"}${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    try { localStorage.setItem(EXPORT_KEY, new Date().toISOString()); } catch { /* 下载不依赖时间记录。 */ }
    updateBackupStatus(); notify("已发起备份下载，请确认文件已保存。");
  } catch (error) { notify(`导出失败：${error.message}`, true); }
}

function previewImport(imported, recovery = false) {
  pendingImport = { books: imported, recovery };
  $("importTitle").textContent = recovery ? "恢复导入前的书架" : "导入书架";
  $("importSummary").textContent = `已校验 ${imported.length} 本书，当前书架有 ${books.length} 本。`;
  $("importMode").value = recovery || loadError ? "replace" : "merge";
  $("importConfirm").textContent = recovery ? "确认恢复" : "确认导入";
  showDialog($("importModal"));
}
async function importBooks(file) {
  const request = ++importRequest;
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error("文件超过 5 MB。");
    const imported = validateBooks(JSON.parse((await file.text()).replace(/^\uFEFF/, "")));
    if (request === importRequest) previewImport(imported);
  } catch (error) { if (request === importRequest) notify(`导入失败，原书架未改动：${error.message}`, true); }
}
function mergeBooks(current, incoming) {
  const key = (book) => JSON.stringify([book.name.toLowerCase(), book.author.toLowerCase()]);
  const seen = new Set(current.map(key));
  const seenIds = new Set(current.map((book) => book.id));
  const additions = [];
  incoming.forEach((book) => {
    if (seen.has(key(book))) return;
    seen.add(key(book));
    const nextBook = { ...book };
    while (seenIds.has(nextBook.id)) nextBook.id = newId();
    seenIds.add(nextBook.id);
    additions.push(nextBook);
  });
  return [...current, ...additions];
}
$("importConfirm").addEventListener("click", () => {
  if (!pendingImport) return;
  const next = $("importMode").value === "merge" ? mergeBooks(books, pendingImport.books) : pendingImport.books;
  const added = next.length - books.length;
  const skipped = pendingImport.books.length - added;
  if (!commitBooks(next, { snapshot: true })) return;
  deletedBooks.length = 0; updateUndo(); $("searchBox").value = ""; $("importModal").close();
  notify($("importMode").value === "merge" ? `导入成功，新增 ${added} 本，跳过 ${skipped} 本重复书籍。` : `书架已更新，共 ${books.length} 本。可在页脚恢复操作前的书架。`);
});
$("exportBtn").addEventListener("click", exportBooks);
$("importBtn").addEventListener("click", () => $("importFile").click());
$("importFile").addEventListener("change", (ev) => { if (ev.target.files?.[0]) importBooks(ev.target.files[0]); ev.target.value = ""; });
$("importClose").addEventListener("click", () => $("importModal").close());
$("importCancel").addEventListener("click", () => $("importModal").close());
$("importModal").addEventListener("close", () => { pendingImport = null; });
$("restoreBtn").addEventListener("click", () => { try { const raw = localStorage.getItem(RECOVERY_KEY); if (raw === null) throw new Error("没有找到恢复副本。"); previewImport(validateBooks(JSON.parse(raw)), true); } catch (error) { notify(`无法恢复：${error.message} 当前书架未改动。`, true); } });

refresh();
if (loadError) notify(loadError, true);
