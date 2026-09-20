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

// ===== 渲染 =====
function createCard(book, index) {
  const card = document.createElement("div");
  card.className = "book-card";
  card.draggable = true;

  const cover = document.createElement("div");
  cover.className = "book-cover";
  cover.textContent = book.name.charAt(0);

  const info = document.createElement("div");
  info.className = "book-info";
  info.innerHTML = `<div class="book-name"></div><div class="book-author"></div><div class="book-meta"></div><div class="pilbox"></div>`;
  info.querySelector(".book-name").textContent = book.name;
  info.querySelector(".book-author").textContent = book.author;

  const meta = info.querySelector(".book-meta");
  if (book.status === "finished") {
    meta.textContent = "★".repeat(book.rating) + "☆".repeat(5 - book.rating);
  } else if (book.status === "reading") {
    meta.textContent = "已读 " + book.progress + "%";
    const wrap = document.createElement("div");
    wrap.className = "progress-wrap";
    const bar = document.createElement("div");
    bar.className = "progress-bar";
    bar.style.width = (book.progress || 0) + "%";
    wrap.appendChild(bar);
    info.appendChild(wrap);
  } else {
    meta.textContent = "待开卷";
  }

  const pilbox = info.querySelector(".pilbox");
  (book.tags || []).forEach((t, i) => {
    const pill = document.createElement("span");
    pill.className = "pill " + (i === 0 ? "start" : "type");
    pill.textContent = t;
    pilbox.appendChild(pill);
  });

  card.appendChild(cover);
  card.appendChild(info);

  // 点击卡片 → 打开编辑弹窗
  card.addEventListener("click", () => openModal(index));

  // 拖拽：记录正在拖的是哪本书
  card.addEventListener("dragstart", (ev) => {
    ev.dataTransfer.setData("text/plain", String(index));
    card.style.opacity = "0.4";
  });
  card.addEventListener("dragend", () => { card.style.opacity = ""; });

  return card;
}

function render() {
  const shelvesEl = document.getElementById("shelves");
  shelvesEl.innerHTML = "";

  ["reading", "finished", "want"].forEach((status) => {
    const indices = books.map((b, i) => (b.status === status ? i : -1)).filter((i) => i >= 0);

    const col = document.createElement("section");
    col.className = "shelf";
    col.dataset.status = status;

    const head = document.createElement("div");
    head.className = "shelf-head";
    head.dataset.status = status;
    head.innerHTML = `<span class="shelf-title">${SHELF_TITLES[status]}</span>
                      <span class="shelf-count">${indices.length}</span>`;

    const body = document.createElement("div");
    body.className = "shelf-body";
    if (indices.length === 0) {
      body.innerHTML = `<div class="empty-tip">这栏还空着，点右上角添加</div>`;
    } else {
      indices.forEach((i) => body.appendChild(createCard(books[i], i)));
    }

    // 整列作为拖拽目标区
    body.addEventListener("dragover", (ev) => ev.preventDefault());
    body.addEventListener("drop", (ev) => {
      ev.preventDefault();
      const fromIndex = Number(ev.dataTransfer.getData("text/plain"));
      if (!Number.isInteger(fromIndex)) return;
      books[fromIndex].status = status;   // 拖到哪列就变成哪个状态
      saveBooks();
      render();
    });

    col.appendChild(head);
    col.appendChild(body);
    shelvesEl.appendChild(col);
  });
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

render();
updateStats();