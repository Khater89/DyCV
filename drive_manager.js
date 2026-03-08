/**
 * ══════════════════════════════════════════════════════════
 *  DRIVE MANAGER — Multi-folder support
 *  إدارة مجلدات Google Drive المتعددة
 * ══════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  const STORAGE_KEY = "cv_drive_folders";
  const DEFAULT_FOLDER = {
    id:   "19_uyZfXb19w8djIoJlPHwEjzFmLKinI_",
    name: "CV Files",
    url:  "https://drive.google.com/drive/folders/19_uyZfXb19w8djIoJlPHwEjzFmLKinI_"
  };

  const $ = id => document.getElementById(id);

  // ── State ──────────────────────────────────────────────────
  let folders     = [];
  let activeIdx   = 0;
  let currentView = "list"; // list | grid

  // ── Load / Save folders from localStorage ─────────────────
  function loadFolders() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
      if (Array.isArray(saved) && saved.length) return saved;
    } catch (_) {}
    return [DEFAULT_FOLDER];
  }

  function saveFolders() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(folders)); } catch (_) {}
  }

  // ── Extract folder ID from a Google Drive URL ──────────────
  function parseFolderUrl(input) {
    input = (input || "").trim();
    // Already an ID (no slashes/dots)
    if (/^[A-Za-z0-9_-]{10,}$/.test(input)) return input;
    // URL patterns
    const patterns = [
      /drive\.google\.com\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]+)/,
      /drive\.google\.com\/open\?id=([A-Za-z0-9_-]+)/,
      /id=([A-Za-z0-9_-]{10,})/
    ];
    for (const re of patterns) {
      const m = input.match(re);
      if (m) return m[1];
    }
    return null;
  }

  // ── Build iframe src ───────────────────────────────────────
  function iframeSrc(folderId, view) {
    return `https://drive.google.com/embeddedfolderview?id=${folderId}#${view}`;
  }

  // ── Render folder tabs ─────────────────────────────────────
  function renderFolderTabs() {
    const container = $("driveFolderTabs");
    if (!container) return;
    container.innerHTML = "";

    folders.forEach((f, i) => {
      const isActive = i === activeIdx;
      const wrap = document.createElement("div");
      wrap.style.cssText = "display:inline-flex;align-items:center;gap:0;";

      const btn = document.createElement("button");
      btn.textContent = "📂 " + f.name;
      btn.style.cssText = `
        padding:7px 12px;border-radius:8px 0 0 8px;cursor:pointer;font-size:12px;font-weight:700;
        border:1.5px solid ${isActive ? "#c0392b" : "#ddd"};
        background:${isActive ? "#c0392b" : "#fff"};
        color:${isActive ? "#fff" : "#555"};
        transition:all .15s;
      `;
      btn.onclick = () => { activeIdx = i; updateViewer(); renderFolderTabs(); };

      const delBtn = document.createElement("button");
      delBtn.textContent = "×";
      delBtn.title = "حذف المجلد";
      delBtn.style.cssText = `
        padding:7px 8px;border-radius:0 8px 8px 0;cursor:pointer;font-size:13px;font-weight:700;
        border:1.5px solid ${isActive ? "#c0392b" : "#ddd"};border-left:none;
        background:${isActive ? "rgba(255,255,255,0.2)" : "#f9f9f9"};
        color:${isActive ? "#fff" : "#aaa"};
        transition:all .15s;
      `;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        if (folders.length <= 1) return;
        folders.splice(i, 1);
        activeIdx = Math.min(activeIdx, folders.length - 1);
        saveFolders();
        renderFolderTabs();
        updateViewer();
      };

      // Hide delete btn for single folder
      if (folders.length <= 1) delBtn.style.display = "none";

      wrap.appendChild(btn);
      wrap.appendChild(delBtn);
      container.appendChild(wrap);
    });

    // Count label
    const countEl = $("driveFolderCount");
    if (countEl) countEl.textContent = `${folders.length} مجلد — انقر على أي ملف لفتحه`;
  }

  // ── Update iframe ──────────────────────────────────────────
  function updateViewer() {
    const f = folders[activeIdx];
    if (!f) return;

    const iframe = $("driveFolderIframe");
    if (iframe) iframe.src = iframeSrc(f.id, currentView);

    const linkEl = $("driveActiveFolderLink");
    if (linkEl) {
      linkEl.innerHTML = `<a href="${f.url || "https://drive.google.com/drive/folders/" + f.id}"
        target="_blank" rel="noopener"
        style="color:#c0392b;text-decoration:none;font-weight:700;">↗ فتح "${f.name}" في Drive</a>`;
    }
  }

  // ── Handle add folder ──────────────────────────────────────
  function handleAddFolder() {
    const urlInput  = $("driveNewFolderInput");
    const nameInput = $("driveNewFolderName");
    const errorEl   = $("driveAddError");

    const raw  = (urlInput?.value || "").trim();
    const name = (nameInput?.value || "").trim() || "مجلد جديد";

    if (!raw) {
      showAddError("الصق رابط المجلد أو الـ Folder ID");
      urlInput?.focus();
      return;
    }

    const id = parseFolderUrl(raw);
    if (!id) {
      showAddError("رابط غير صحيح — تأكد من نسخ رابط المجلد بالكامل");
      return;
    }

    // Check duplicate
    if (folders.some(f => f.id === id)) {
      showAddError("هذا المجلد موجود مسبقاً");
      return;
    }

    const folder = {
      id,
      name,
      url: `https://drive.google.com/drive/folders/${id}`
    };
    folders.push(folder);
    activeIdx = folders.length - 1;
    saveFolders();
    renderFolderTabs();
    updateViewer();
    hideAddPanel();

    // Clear inputs
    if (urlInput)  urlInput.value  = "";
    if (nameInput) nameInput.value = "";
  }

  function showAddError(msg) {
    const el = $("driveAddError");
    if (el) { el.textContent = msg; el.style.display = "block"; }
    setTimeout(() => { if (el) el.style.display = "none"; }, 3000);
  }

  function showAddPanel() {
    const p = $("driveAddPanel");
    if (p) { p.style.display = "block"; $("driveNewFolderInput")?.focus(); }
    const btn = $("driveAddFolderBtn");
    if (btn) btn.textContent = "✕ إلغاء";
  }

  function hideAddPanel() {
    const p = $("driveAddPanel");
    if (p) p.style.display = "none";
    const btn = $("driveAddFolderBtn");
    if (btn) btn.textContent = "➕ إضافة مجلد";
  }

  // ── View toggle (list / grid) ──────────────────────────────
  function setView(view) {
    currentView = view;
    updateViewer();

    document.querySelectorAll(".drive-tab-btn").forEach(btn => {
      const isActive = btn.dataset.view === view;
      btn.style.background  = isActive ? "#c0392b" : "#fff";
      btn.style.color       = isActive ? "#fff"    : "#555";
      btn.style.borderColor = isActive ? "#c0392b" : "#ddd";
    });
  }

  // ── Init ───────────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", () => {
    folders = loadFolders();
    renderFolderTabs();
    updateViewer();

    // Add folder button toggle
    $("driveAddFolderBtn")?.addEventListener("click", () => {
      const panel = $("driveAddPanel");
      if (panel?.style.display === "none" || !panel?.style.display) {
        showAddPanel();
      } else {
        hideAddPanel();
      }
    });

    $("driveAddConfirmBtn")?.addEventListener("click", handleAddFolder);
    $("driveAddCancelBtn")?.addEventListener("click",  hideAddPanel);

    // Enter key in URL input
    $("driveNewFolderInput")?.addEventListener("keydown", e => {
      if (e.key === "Enter") handleAddFolder();
      if (e.key === "Escape") hideAddPanel();
    });

    // View tabs
    document.querySelectorAll(".drive-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => setView(btn.dataset.view));
    });
  });

})();
