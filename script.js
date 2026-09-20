// ===== 数据层：localStorage 持久化 =====
const STORAGE_KEY = "bookshelf.books.v1";

// 首次运行用默认示例数据，之后从 localStorage 读取
function loadBooks() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try { return JSON.parse(saved); } catch (e) { /* 数据损坏则回退默认 */ }
  }
  return defaultBooks();
}

// 每次改动都调用，把数组存回浏览器本地
function saveBooks() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(books));
}

function defaultBooks() {
  return [
    { name: "知行合一·投资进阶", author: "交易者手册", status: "reading", progress: 62, rating: 0, tags: ["交易", "精进"] },
    { name: "聪明的投资者",      author: "本杰明·格雷厄姆", status: "finished", progress: 100, rating: 5, tags: ["价值投资"] },
    { name: "乌合之众",          author: "古斯塔夫·勒庞", status: "finished", progress: 100, rating: 4, tags: ["心理学"] },
    { name: "周易",              author: "佚名", status: "want", progress: 0, rating: 0, tags: ["命理", "国学"] },
    { name: "原则",              author: "瑞·达利欧", status: "want", progress: 0, rating: 0, tags: ["管理"] },
  ];
}

let books = loadBooks();

const SHELF_TITLES = { reading: "在读", finished: "已读", want: "想读" };

// ===== 渲染：拟物木书架（书脊）=====
function createBookSpine(book, index) {
  const spine = document.createElement("div");
  spine.className = "book-spine tone-" + ((book.tone || ((index % 5) + 1)));
  spine.draggable = true;
  spine.title = `${book.name} — ${book.author || ""}`;

  // 在读：插书签；已读：银点
  if (book.status === "reading") spine.classList.add("bookmark");
  if (book.status === "finished" && book.rating >= 4) spine.classList.add("tick");

  const title = document.createElement("div");
  title.className = "spine-title";
  title.textContent = book.name;

  const foot = document.createElement("div");
  foot.className = "spine-foot";
  foot.textContent = book.status === "finished"
    ? "★".repeat(book.rating)
    : (book.status === "reading" ? (book.progress || 0) + "%" : (book.author || "").slice(0, 2));

  spine.appendChild(title);
  spine.appendChild(foot);

  // 在读书：右侧细进度条 + 底部进度步进器（−/+）
  if (book.status === "reading") {
    const meter = document.createElement("div");
    meter.className = "spine-progress";
    const fill = document.createElement("div");
    fill.className = "spine-progress-fill";
    fill.style.height = (book.progress || 0) + "%";
    meter.appendChild(fill);

    const stepper = document.createElement("div");
    stepper.className = "spine-stepper";
    stepper.appendChild(makeStepBtn("−", () => adjustProgress(index, -5)));
    stepper.appendChild(makeStepBtn("＋", () => adjustProgress(index, 5)));

    spine.appendChild(meter);
    spine.appendChild(stepper);
  }

  // 点击书脊 → 打开编辑弹窗
  spine.addEventListener("click", () => openModal(index));

  // 拖拽：记录正在拖的是哪本书
  spine.addEventListener("dragstart", (ev) => {
    ev.dataTransfer.setData("text/plain", String(index));
    spine.style.opacity = "0.4";
  });
  spine.addEventListener("dragend", () => { spine.style.opacity = ""; });

  return spine;
}

// 步进按钮：点击只调进度，不触发抛中的卡片点击/弹窗
function makeStepBtn(char, onClick) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "step-btn";
  btn.textContent = char;
  btn.addEventListener("click", (ev) => {
    ev.stopPropagation();
    onClick();
  });
  return btn;
}

// 调整阅读进度：在读 ±delta，封顶 0–100
function adjustProgress(index, delta) {
  const b = books[index];
  if (!b || b.status !== "reading") return;
  b.progress = Math.max(0, Math.min(100, (b.progress || 0) + delta));
  saveBooks();
  render();
  updateStats();
}

function render() {
  const shelvesEl = document.getElementById("shelves");
  shelvesEl.innerHTML = "";

  const kw = (document.getElementById("searchBox").value || "").trim().toLowerCase();
  const bookcase = document.createElement("div");
  bookcase.className = "bookcase";

  ["reading", "finished", "want"].forEach((status) => {
    const indices = books
      .map((b, i) => {
        const hit = !kw ||
          (b.name && b.name.toLowerCase().includes(kw)) ||
          (b.author && b.author.toLowerCase().includes(kw)) ||
          (b.tags || []).some((t) => t.toLowerCase().includes(kw));
        return b.status === status && hit ? i : -1;
      })
      .filter((i) => i >= 0);

    const row = document.createElement("section");
    row.className = "shelf-row";
    row.dataset.status = status;

    const label = document.createElement("div");
    label.className = "row-label";
    label.innerHTML = `<b>${SHELF_TITLES[status]}</b><span>${indices.length} 本</span>`;

    const booksEl = document.createElement("div");
    booksEl.className = "books";
    if (indices.length === 0) {
      const tip = document.createElement("div");
      tip.className = "empty-tip bookline-empty";
      tip.textContent = "这一层还是空的";
      booksEl.appendChild(tip);
    } else {
      indices.forEach((i) => booksEl.appendChild(createBookSpine(books[i], i)));
    }

    const board = document.createElement("div");
    board.className = "board";

    // 拖到哪一层 = 状态变成哪一层
    booksEl.addEventListener("dragover", (ev) => ev.preventDefault());
    booksEl.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const fromIndex = Number(ev.dataTransfer.getData("text/plain"));
      if (!Number.isInteger(fromIndex)) return;
      books[fromIndex].status = status;
      saveBooks();
      render();
    });

    row.appendChild(label);
    row.appendChild(booksEl);
    row.appendChild(board);
    bookcase.appendChild(row);
  });

  shelvesEl.appendChild(bookcase);
}

// ===== 弹窗：添加 / 编辑 =====
const modal = document.getElementById("bookModal");
const form = document.getElementById("bookForm");
let editingIndex = null;   // null = 新增；数字 = 编辑第几本

function openModal(index) {
  editingIndex = index;
  document.getElementById("modalTitle").textContent = index === null ? "添加书籍" : "编辑书籍";
  document.getElementById("fDelete").classList.toggle("hidden", index === null);

  if (index === null) {
    form.reset();
    setStatusVisibility("reading");
  } else {
    const b = books[index];
    document.getElementById("fName").value = b.name;
    document.getElementById("fAuthor").value = b.author || "";
    document.getElementById("fStatus").value = b.status;
    document.getElementById("fProgress").value = b.progress || 0;
    document.getElementById("fRating").value = String(b.rating || 5);
    document.getElementById("fTags").value = (b.tags || []).join(", ");
    setStatusVisibility(b.status);
  }
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  editingIndex = null;
}

// 根据状态，显示/隐藏进度条输入和评分输入
function setStatusVisibility(status) {
  document.getElementById("fProgressWrap").classList.toggle("hidden", status !== "reading");
  document.getElementById("fRatingWrap").classList.toggle("hidden", status !== "finished");
}

document.getElementById("addBookBtn").addEventListener("click", () => openModal(null));
document.getElementById("modalClose").addEventListener("click", closeModal);
modal.addEventListener("click", (ev) => { if (ev.target === modal) closeModal(); });
document.getElementById("fStatus").addEventListener("change", (ev) => setStatusVisibility(ev.target.value));

form.addEventListener("submit", (ev) => {
  ev.preventDefault();
  const data = {
    name: document.getElementById("fName").value.trim(),
    author: document.getElementById("fAuthor").value.trim(),
    status: document.getElementById("fStatus").value,
    tags: document.getElementById("fTags").value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
  };
  if (data.status === "reading") {
    data.progress = Math.max(0, Math.min(100, Number(document.getElementById("fProgress").value) || 0));
  } else {
    data.progress = data.status === "finished" ? 100 : 0;
  }
  data.rating = data.status === "finished" ? Number(document.getElementById("fRating").value) : 0;

  if (editingIndex === null) {
    books.push(data);
  } else {
    books[editingIndex] = { ...books[editingIndex], ...data };
  }
  saveBooks();
  render();
  closeModal();
});

document.getElementById("fDelete").addEventListener("click", () => {
  if (editingIndex !== null) {
    books.splice(editingIndex, 1);
    saveBooks();
    render();
    closeModal();
  }
});

// ===== 顶部统计条 =====
function updateStats() {
  const el = document.getElementById("statsBar");
  const total = books.length;
  const reading = books.filter((b) => b.status === "reading").length;
  const finished = books.filter((b) => b.status === "finished").length;
  const want = books.filter((b) => b.status === "want").length;
  const rated = books.filter((b) => b.rating > 0);
  const avg = rated.length
    ? (rated.reduce((s, b) => s + b.rating, 0) / rated.length).toFixed(1)
    : "—";
  el.innerHTML = `
    <div class="stat"><span class="stat-num">${total}</span><span class="stat-label">藏书总数</span></div>
    <div class="stat"><span class="stat-num">${reading}</span><span class="stat-label">在读</span></div>
    <div class="stat"><span class="stat-num">${finished}</span><span class="stat-label">已读</span></div>
    <div class="stat"><span class="stat-num">${want}</span><span class="stat-label">想读</span></div>
    <div class="stat"><span class="stat-num">${avg}</span><span class="stat-label">平均评分</span></div>
  `;
}

// 搜索框：输入即实时过滤（input 事件 = 每敲一个字符触发一次）
document.getElementById("searchBox").addEventListener("input", () => {
  render();
  updateStats();
});

// ===== 导出 / 导入备份 =====
function exportBooks() {
  const blob = new Blob([JSON.stringify(books, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bookshelf-backup.json";
  a.click();
  URL.revokeObjectURL(url);
}

function importBooks(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const arr = JSON.parse(reader.result);
      if (!Array.isArray(arr)) throw new Error("bad");
      books = arr;
      saveBooks();
      render();
      updateStats();
      alert("导入成功，共 " + books.length + " 本书");
    } catch (e) {
      alert("导入失败：所选文件不是有效的书架备份（.json）");
    }
  };
  reader.readAsText(file);
}

document.getElementById("exportBtn").addEventListener("click", exportBooks);
document.getElementById("importBtn").addEventListener("click", () =>
  document.getElementById("importFile").click()
);
document.getElementById("importFile").addEventListener("change", (ev) => {
  if (ev.target.files && ev.target.files[0]) importBooks(ev.target.files[0]);
  ev.target.value = "";
});

render();
updateStats();