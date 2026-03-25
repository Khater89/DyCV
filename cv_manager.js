/**
 * ══════════════════════════════════════════════════════════════
 *  CV MANAGER v5 — Inline Sidebar
 *  • مهارات: تصنيف تلقائي بـ Claude
 *  • شهادات: إضافة + رفع ملف + Drive
 *  • Extract: يقرأ data.js + يجيب ملفات Drive
 *  • Reset tab / Add new tab
 * ══════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);

  function getApp()  { return window.__cvApp || null; }
  function getData() { return getApp()?.getData() || window.CV_DATA || null; }
  function getActiveTab() { return getApp()?.getActiveTab() || "electrical"; }
  function getApiKey() { try { return localStorage.getItem("cv_ak") || ""; } catch(_) { return ""; } }

  function rerender() {
    const app = getApp();
    if (!app) return;
    try { app.renderTabs(); app.renderBranches(); app.renderAll(); } catch(e) {}
  }

  // ── Toast ─────────────────────────────────────────────────────
  let toastTimer;
  function toast(msg, ms = 3500) {
    let t = $("cvMgrToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "cvMgrToast";
      t.style.cssText = "position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1a1a2e;color:#fff;padding:10px 22px;border-radius:12px;font-size:13px;font-weight:700;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.3);transition:opacity .3s;pointer-events:none;";
      document.body.appendChild(t);
    }
    t.innerHTML = msg;
    t.style.opacity = "1";
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.style.opacity = "0"; }, ms);
  }

  // ── Claude API (Anthropic) ───────────────────────────────────
  async function callClaude(prompt, system) {
    const key = getApiKey();
    if (!key) throw new Error("🔑 أدخل Anthropic API Key أولاً");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: system || "Return only valid JSON. No markdown fences.",
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const e   = await res.json().catch(() => ({}));
      const msg = e?.error?.message || `HTTP ${res.status}`;
      if (res.status === 401) throw new Error("🔑 API Key غير صحيح");
      if (msg.toLowerCase().includes("credit") || msg.toLowerCase().includes("balance"))
        throw new Error("💳 رصيد منتهي — console.anthropic.com/settings/billing");
      throw new Error(msg);
    }

    return (await res.json()).content?.[0]?.text || "";
  }

  function parseJson(raw) {
    return JSON.parse(raw.replace(/^```json?\n?/i,"").replace(/\n?```$/m,"").trim());
  }

  // ══════════════════════════════════════════════════════════════
  //  SKILL — LLM classification
  // ══════════════════════════════════════════════════════════════
  async function addSkillAI(skillText) {
    const DATA = getData();
    if (!DATA) return null;
    const tabs = (DATA.tabs || []).map(t => t.id).join(", ");
    const raw = await callClaude(
      `Classify this skill into the best tab.\nSkill: "${skillText}"\nTabs: ${tabs}\n\nRules:\n- electrical: power,solar,PV,QC,cables,HVAC,IEC\n- network: NOC,Cisco,LAN,WAN,VPN,firewall,CCNA\n- data: Python,SQL,ETL,ML,AI,cloud,Spark\n- pm: coordination,logistics,dispatch,MS Office\n\nReturn JSON: {"tab":"tab_id","label":"Clean Skill Name","reason":"one sentence"}`
    );
    const p = parseJson(raw);
    const tabId = p.tab || getActiveTab();
    if (!DATA.curated)        DATA.curated = {};
    if (!DATA.curated[tabId]) DATA.curated[tabId] = {};
    if (!DATA.curated[tabId].skills) DATA.curated[tabId].skills = [];
    const label = p.label || skillText;
    const existing = DATA.curated[tabId].skills.map(s => s.toLowerCase());
    if (!existing.includes(label.toLowerCase())) {
      DATA.curated[tabId].skills.unshift(label);
    }
    return { tabId, label, reason: p.reason };
  }

  // ══════════════════════════════════════════════════════════════
  //  CERT — Add + file upload
  // ══════════════════════════════════════════════════════════════
  async function addCert(name, issuer, date, file) {
    const DATA  = getData();
    const tabId = getActiveTab();
    if (!DATA || !name) return null;

    if (!DATA.curated)        DATA.curated = {};
    if (!DATA.curated[tabId]) DATA.curated[tabId] = {};
    if (!DATA.curated[tabId].certs) DATA.curated[tabId].certs = [];

    const entry = { title: name, name, issuer: issuer || "", date: date || "" };

    // Handle file upload via OAuth (drive_db.js)
    if (file) {
      const db = window.__driveDB;
      if (db && db.isSignedIn()) {
        try {
          const result = await db.uploadFile(file, `cert_${Date.now()}_${file.name}`);
          entry.drive_url   = result.viewUrl;
          entry.image_url   = result.imageUrl;
          entry.drive_file_id = result.id;
          toast("✅ رُفع الملف لـ Drive", 3000);
        } catch(uploadErr) {
          // Fallback to local
          console.warn("[Cert] Drive upload failed:", uploadErr.message);
          const reader = new FileReader();
          reader.onload = e2 => { entry.local_url = e2.target.result; };
          reader.readAsDataURL(file);
          toast("⚠️ تعذّر الرفع لـ Drive — سيُحفظ محلياً", 3000);
        }
      } else {
        // Not signed in — save locally
        const reader = new FileReader();
        reader.onload = e2 => { entry.local_url = e2.target.result; };
        reader.readAsDataURL(file);
        toast("💡 سجّل الدخول بـ Google لرفع الشهادة تلقائياً", 4000);
      }
    }

    DATA.curated[tabId].certs.push(entry);
    return { tabId, name, hasFile: !!file };
  }

  // ══════════════════════════════════════════════════════════════
  //  EXTRACT — يقرأ Drive PDFs/صور + data.js ويحدّث كل شيء
  // ══════════════════════════════════════════════════════════════
  async function extractForTab(tabId) {
    const DATA = getData();
    if (!DATA) return;

    const tabMeta  = (DATA.tabs || []).find(t => t.id === tabId);
    const tabLabel = tabMeta?.label || tabId;

    toast(`⏳ جاري قراءة ملفات Drive لتاب "${tabLabel}"…`, 30000);

    // Show progress in Extract button
    const extractBtn = document.querySelector(`.tab-extract-btn[data-tab="${tabId}"]`);
    const setBtnState = (html) => { if (extractBtn) extractBtn.innerHTML = html; };
    setBtnState(`<span style="display:inline-block;width:9px;height:9px;border:2px solid rgba(37,99,235,.3);border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite;"></span>`);

    try {
      // Step 1: Try to read Drive files (PDFs + images)
      let driveResult = null;
      try {
        setBtnState(`<span style="font-size:9px;">📥</span>`);
        driveResult = await readAndExtractFromDrive(tabId);
      } catch(driveErr) {
        console.warn("[Extract] Drive read failed:", driveErr.message);
        toast(`⚠️ Drive: ${driveErr.message} — سيتم الاستخراج من data.js فقط`, 5000);
      }

      // Step 2: Also collect data.js highlights as fallback/supplement
      const highlights = [];
      (DATA.docs || []).forEach(doc => {
        const hl = doc.highlights?.[tabId] || [];
        hl.forEach(h => { if (h.text) highlights.push(h.text); });
      });

      // Step 3: If Drive gave us extracted data, apply it directly
      if (driveResult?.extracted) {
        const extracted = driveResult.extracted;

        if (!DATA.curated)        DATA.curated = {};
        if (!DATA.curated[tabId]) DATA.curated[tabId] = {};
        const p = DATA.curated[tabId];

        // Summary
        if (extracted.summary) p.summary = extracted.summary;

        // Experience
        if (extracted.experience?.length) {
          if (!p.experience?.length) {
            p.experience = extracted.experience;
          } else {
            extracted.experience.forEach(ne => {
              const m = p.experience.find(e =>
                (e.company||"").toLowerCase().slice(0,6) === (ne.company||"").toLowerCase().slice(0,6) ||
                (e.title||"").toLowerCase().slice(0,6)   === (ne.title||"").toLowerCase().slice(0,6)
              );
              if (m && ne.bullets?.length) m.bullets = ne.bullets;
              else if (!m) p.experience.unshift(ne);
            });
          }
        }

        // Skills — prepend new ones
        if (extracted.skills?.length) {
          const old = (p.skills || []).map(s => s.toLowerCase());
          const fresh = extracted.skills.filter(s => !old.includes(s.toLowerCase()));
          p.skills = [...fresh, ...(p.skills || [])];
        }

        // Certifications from document text
        if (extracted.certificates?.length) {
          if (!p.certs) p.certs = [];
          extracted.certificates.forEach(c => {
            const exists = p.certs.some(x => (x.title||x.name||"").toLowerCase() === (c.name||"").toLowerCase());
            if (!exists) p.certs.push({ title: c.name, name: c.name, issuer: c.issuer||"", date: c.date||"" });
          });
        }

        // Certificate images — add to cert_images for gallery display
        if (extracted.cert_images?.length) {
          if (!p.cert_images) p.cert_images = [];
          const driveFiles = driveResult.fileNames || [];
          extracted.cert_images.forEach(ci => {
            // Find the matching Drive file ID
            const matchFile = (window.__lastDriveFiles || []).find(f =>
              f.name.toLowerCase().includes(ci.filename?.toLowerCase()?.slice(0,10) || "___") ||
              ci.filename === f.name
            );
            const src = matchFile
              ? `https://drive.google.com/uc?export=view&id=${matchFile.id}`
              : "";

            const already = p.cert_images.some(x => x.title?.toLowerCase() === ci.title?.toLowerCase());
            if (!already) {
              p.cert_images.push({ src, title: ci.title || ci.filename, issuer: ci.issuer || "" });
              // Also add to certs list
              if (!p.certs) p.certs = [];
              if (!p.certs.some(x => (x.title||"").toLowerCase() === (ci.title||"").toLowerCase())) {
                p.certs.push({ title: ci.title, name: ci.title, issuer: ci.issuer||"", drive_url: src });
              }
            }
          });
        }

        if (getApp()) getApp().setTab(tabId);
        rerender();

        const certCount = (extracted.certificates?.length || 0) + (extracted.cert_images?.length || 0);
        toast(`✅ تم! من ${driveResult.processedCount || "?"} ملف Drive → ${extracted.experience?.length||0} خبرة · ${extracted.skills?.length||0} مهارة · ${certCount} شهادة`, 6000);

      } else if (highlights.length) {
        // Fallback: use data.js highlights only
        setBtnState(`<span style="font-size:9px;">📄</span>`);
        toast(`⏳ Drive غير متاح — استخراج من data.js…`, 10000);
        await extractFromHighlights(tabId, tabLabel, highlights);

      } else {
        toast("⚠️ لا توجد ملفات قابلة للقراءة في Drive وlا نصوص في data.js", 5000);
      }

    } catch(e) {
      console.error("[Extract]", e);
      toast(`⚠️ ${e.message}`, 6000);
    } finally {
      setBtnState("⬇ Extract");
    }
  }

  // Fallback: extract from data.js highlights
  async function extractFromHighlights(tabId, tabLabel, highlights) {
    const DATA = getData();
    const prompt = `Extract and structure CV data for "${tabLabel}" (${tabId}).

SOURCE TEXTS:
${highlights.slice(0, 50).join("\n")}

Return ONLY valid JSON:
{"summary":"","experience":[{"title":"","company":"","location":"","dates":"","bullets":[""]}],"skills":[""]}`;

    try {
      const raw    = await callClaude(prompt);
      const parsed = parseJson(raw);
      if (!DATA.curated)        DATA.curated = {};
      if (!DATA.curated[tabId]) DATA.curated[tabId] = {};
      const p = DATA.curated[tabId];
      if (parsed.summary)            p.summary = parsed.summary;
      if (parsed.skills?.length)     p.skills  = [...(parsed.skills||[]), ...(p.skills||[])];
      if (parsed.experience?.length) p.experience = p.experience?.length
        ? [...parsed.experience, ...p.experience] : parsed.experience;
      if (getApp()) getApp().setTab(tabId);
      rerender();
      toast(`✅ تم الاستخراج من data.js لتاب "${tabLabel}"`, 4000);
    } catch(e) {
      toast(`⚠️ ${e.message}`, 5000);
    }
  }

  // ══════════════════════════════════════════════════════════════
  //  DRIVE FILE READER
  //  يجيب قائمة الملفات + يحمّل كل ملف ويرسله لـ Claude
  // ══════════════════════════════════════════════════════════════

  // List all files in the Drive folder
  async function listDriveFiles() {
    const cfg = window.DRIVE_CONFIG || {};
    if (!cfg.folder_id || !cfg.api_key) return [];
    try {
      const q   = encodeURIComponent(`'${cfg.folder_id}' in parents and trashed=false`);
      const url = `https://www.googleapis.com/drive/v3/files?q=${q}&key=${cfg.api_key}` +
                  `&fields=files(id,name,mimeType,size)&pageSize=100&orderBy=name`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return data.files || [];
    } catch(_) { return []; }
  }

  // Download a file as ArrayBuffer
  async function downloadDriveFile(fileId, apiKey) {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
    return await res.arrayBuffer();
  }

  // ArrayBuffer → base64
  function bufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary  = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  // Determine Claude media type from MIME
  function getMediaType(mimeType) {
    if (mimeType === "application/pdf")  return "application/pdf";
    if (mimeType.startsWith("image/jpeg") || mimeType === "image/jpg") return "image/jpeg";
    if (mimeType === "image/png")  return "image/png";
    if (mimeType === "image/webp") return "image/webp";
    if (mimeType === "image/gif")  return "image/gif";
    return null;
  }

  // Read ALL readable files from Drive and extract CV data
  async function readAndExtractFromDrive(tabId) {
    const cfg    = window.DRIVE_CONFIG || {};
    const apiKey = cfg.api_key || "";
    if (!apiKey) return null;

    const files = await listDriveFiles();
    window.__lastDriveFiles = files; // cache for cert image URLs
    if (!files.length) return null;

    const tabMeta  = (getData()?.tabs || []).find(t => t.id === tabId);
    const tabLabel = tabMeta?.label || tabId;

    // Filter to readable types: PDF + images
    const readable = files.filter(f => getMediaType(f.mimeType));

    if (!readable.length) {
      return { fileNames: files.map(f => f.name), extracted: null };
    }

    toast(`📥 جاري قراءة ${readable.length} ملف من Drive…`, 20000);

    // Build Claude message content — include each file
    const contentBlocks = [];

    // Add text instruction first
    contentBlocks.push({
      type: "text",
      text: `You are a CV expert. Read ALL the attached files (PDFs and images) and extract structured CV data for the "${tabLabel}" (${tabId}) specialization.

For EACH file:
1. If it's a CV/resume: extract experience, skills, certifications relevant to ${tabLabel}
2. If it's a certificate image/PDF: extract the certificate name, issuing organization, date
3. If it's something else: note what it is

After reading all files, return ONLY valid JSON (no markdown fences):
{
  "summary": "2-3 sentence professional summary for ${tabLabel} based on the CVs",
  "experience": [
    {"title":"Job Title","company":"Company","location":"","dates":"","bullets":["achievement 1","achievement 2"]}
  ],
  "skills": ["skill1","skill2","skill3","skill4","skill5","skill6","skill7","skill8"],
  "certificates": [
    {"name":"Certificate Name","issuer":"Organization","date":"YYYY-MM or YYYY"}
  ],
  "cert_images": [
    {"filename":"file.jpg","title":"Certificate Title","issuer":"Org"}
  ]
}

Rules:
- Only include data RELEVANT to ${tabLabel}
- Bullets start with action verbs  
- Max 4 experience entries
- cert_images: list any certificate images found (photos of certificates)`
    });

    // Download and attach files (limit to 10 to avoid token overflow)
    const toProcess = readable.slice(0, 10);
    let failCount = 0;

    for (const file of toProcess) {
      try {
        const buf      = await downloadDriveFile(file.id, apiKey);
        const b64      = bufferToBase64(buf);
        const mimeType = getMediaType(file.mimeType);

        if (mimeType === "application/pdf") {
          contentBlocks.push({
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: b64 },
            title: file.name
          });
        } else {
          // Image
          contentBlocks.push({
            type: "image",
            source: { type: "base64", media_type: mimeType, data: b64 }
          });
          contentBlocks.push({
            type: "text",
            text: `(The above image is from file: "${file.name}")`
          });
        }
      } catch(e) {
        console.warn(`[Manager] Could not read ${file.name}:`, e.message);
        failCount++;
      }
    }

    if (contentBlocks.length <= 1) {
      return { fileNames: files.map(f => f.name), extracted: null, error: "Could not download files" };
    }

    // Call Gemini with all files
    const apiKeyUser = getApiKey();
    if (!apiKeyUser) throw new Error("أدخل Gemini API Key أولاً");

    // Call Claude with all files (multimodal)
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKeyUser,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3000,
        messages: [{ role: "user", content: contentBlocks }]
      })
    });
    if (!claudeRes.ok) {
      const e = await claudeRes.json().catch(() => ({}));
      throw new Error(e?.error?.message || `HTTP ${claudeRes.status}`);
    }
    const text = (await claudeRes.json()).content?.[0]?.text || "";
    const clean = text.replace(/^```json?\n?/i,"").replace(/\n?```$/m,"").trim();

    try {
      const extracted = JSON.parse(clean);
      return { fileNames: files.map(f => f.name), extracted, processedCount: toProcess.length - failCount };
    } catch(_) {
      console.warn("[Manager] JSON parse failed:", text.slice(0,200));
      return { fileNames: files.map(f => f.name), extracted: null, rawText: text };
    }
  }

  // فالدالة القديمة باقية كـ fallback
  async function fetchDriveFileNames() {
    const files = await listDriveFiles();
    return files.map(f => f.name).join("\n");
  }

  // ══════════════════════════════════════════════════════════════
  //  RESET TAB
  // ══════════════════════════════════════════════════════════════
  function resetTab(tabId) {
    const DATA = getData();
    if (!DATA) return;
    if (!confirm(`مسح كل محتوى تاب "${tabId}"؟ لا يمكن التراجع.`)) return;
    if (DATA.curated) DATA.curated[tabId] = { summary: "", experience: [], skills: [], certs: [] };
    rerender();
    toast(`✅ تم مسح تاب ${tabId}`);
  }

  // ══════════════════════════════════════════════════════════════
  //  ADD NEW TAB
  // ══════════════════════════════════════════════════════════════
  function addNewTab(label, subtitle, id) {
    const DATA  = getData();
    if (!DATA || !label) return false;
    const tabId = (id || label.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")).slice(0,20);
    if ((DATA.tabs||[]).some(t => t.id === tabId)) { toast("⚠️ يوجد تاب بهذا الـ ID"); return false; }
    if (!DATA.tabs)    DATA.tabs    = [];
    if (!DATA.curated) DATA.curated = {};
    DATA.tabs.push({ id: tabId, label, subtitle: subtitle || "" });
    DATA.curated[tabId] = { summary: "", experience: [], skills: [], certs: [] };
    rerender();
    toast(`✅ تم إضافة تاب "${label}"`);
    return true;
  }

  // ══════════════════════════════════════════════════════════════
  //  SIDEBAR PANEL SWITCHING
  // ══════════════════════════════════════════════════════════════
  function switchPanel(panel) {
    ["skills","certs","addtab"].forEach(id => {
      const el = $(`smgr${id.charAt(0).toUpperCase()+id.slice(1).replace("tab","Tab")}`);
      // normalize
    });
    $("smgrSkills") ?.style && ($("smgrSkills").style.display  = panel === "skills"  ? "" : "none");
    $("smgrCerts")  ?.style && ($("smgrCerts").style.display   = panel === "certs"   ? "" : "none");
    $("smgrAddTab") ?.style && ($("smgrAddTab").style.display  = panel === "addtab"  ? "" : "none");

    document.querySelectorAll(".side-mgr-tab").forEach(t => {
      const active = t.dataset.smgr === panel;
      t.style.background  = active ? "#fff5f5"         : "#f9f9f9";
      t.style.color       = active ? "#c0392b"         : "#888";
      t.style.borderBottom = active ? "2px solid #c0392b" : "none";
    });
  }

  // ══════════════════════════════════════════════════════════════
  //  INIT
  // ══════════════════════════════════════════════════════════════
  window.addEventListener("DOMContentLoaded", () => {

    // ── Panel tabs ──────────────────────────────────────────────
    document.querySelectorAll(".side-mgr-tab").forEach(btn => {
      btn.addEventListener("click", () => switchPanel(btn.dataset.smgr));
    });
    switchPanel("skills"); // default

    // ── SKILL save ──────────────────────────────────────────────
    async function saveSkill() {
      const input  = $("smgrSkillInput");
      const status = $("smgrSkillStatus");
      const text   = input?.value.trim();
      if (!text) return;

      const btn = $("smgrSkillSave");
      btn.disabled = true; btn.innerHTML = "⟳";
      if (status) status.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(192,57,43,.3);border-top-color:#c0392b;border-radius:50%;animation:spin .8s linear infinite;margin-right:4px;"></span> Claude يصنّف…`;

      try {
        const r = await addSkillAI(text);
        if (r) {
          if (status) status.innerHTML = `✅ Added to <b>${r.tabId}</b> — ${r.reason || ""}`;
          input.value = "";
          rerender();
        }
      } catch(e) {
        if (status) status.textContent = "⚠️ " + e.message;
      } finally {
        btn.disabled = false; btn.innerHTML = "＋";
      }
    }
    $("smgrSkillSave")?.addEventListener("click", saveSkill);
    $("smgrSkillInput")?.addEventListener("keydown", e => { if (e.key === "Enter") saveSkill(); });

    // ── CERT file drop ──────────────────────────────────────────
    const dropZone = $("smgrCertDropZone");
    const fileInput = $("smgrCertFile");
    dropZone?.addEventListener("click", () => fileInput?.click());
    dropZone?.addEventListener("dragover", e => { e.preventDefault(); dropZone.style.borderColor = "#c0392b"; });
    dropZone?.addEventListener("dragleave", () => { dropZone.style.borderColor = "#ddd"; });
    dropZone?.addEventListener("drop", e => {
      e.preventDefault();
      dropZone.style.borderColor = "#ddd";
      const f = e.dataTransfer?.files?.[0];
      if (f && fileInput) {
        const dt = new DataTransfer(); dt.items.add(f);
        fileInput.files = dt.files;
        const el = $("smgrCertFileName");
        if (el) el.textContent = `📎 ${f.name}`;
      }
    });
    fileInput?.addEventListener("change", e => {
      const f = e.target.files?.[0];
      const el = $("smgrCertFileName");
      if (f && el) el.textContent = `📎 ${f.name}`;
    });

    // ── CERT save ───────────────────────────────────────────────
    async function saveCert() {
      const name   = $("smgrCertName")?.value.trim();
      const issuer = $("smgrCertIssuer")?.value.trim();
      const date   = $("smgrCertDate")?.value.trim();
      const file   = $("smgrCertFile")?.files?.[0];
      const status = $("smgrCertStatus");

      if (!name) { if (status) status.textContent = "⚠️ اسم الشهادة مطلوب"; return; }

      const btn = $("smgrCertSave");
      btn.disabled = true;
      btn.innerHTML = `<span style="display:inline-block;width:10px;height:10px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .8s linear infinite;margin-right:4px;"></span> جاري…`;

      try {
        const r = await addCert(name, issuer, date, file);
        if (r) {
          if (status) status.textContent = `✅ تمت الإضافة في تاب ${r.tabId}`;
          $("smgrCertName").value   = "";
          $("smgrCertIssuer").value = "";
          $("smgrCertDate").value   = "";
          $("smgrCertFileName").textContent = "";
          rerender();
        }
      } catch(e) {
        if (status) status.textContent = "⚠️ " + e.message;
      } finally {
        btn.disabled = false;
        btn.innerHTML = "＋ إضافة الشهادة";
      }
    }
    $("smgrCertSave")?.addEventListener("click", saveCert);

    // ── ADD TAB save ─────────────────────────────────────────────
    $("smgrTabSave")?.addEventListener("click", () => {
      const label  = $("smgrTabLabel")?.value.trim();
      const sub    = $("smgrTabSub")?.value.trim();
      const status = $("smgrTabStatus");
      if (!label) { if (status) status.textContent = "⚠️ اسم التاب مطلوب"; return; }
      const ok = addNewTab(label, sub);
      if (ok && status) {
        status.textContent = `✅ تم إضافة "${label}"`;
        $("smgrTabLabel").value = "";
        $("smgrTabSub").value   = "";
      }
    });

    // ── Reset / Extract (event delegation on tab buttons) ────────
    document.addEventListener("click", async e => {
      const resetBtn   = e.target.closest(".tab-reset-btn");
      const extractBtn = e.target.closest(".tab-extract-btn");

      if (resetBtn) {
        e.stopPropagation();
        resetTab(resetBtn.dataset.tab);
      }

      if (extractBtn) {
        e.stopPropagation();
        const tabId = extractBtn.dataset.tab;
        extractBtn.disabled  = true;
        extractBtn.innerHTML = `<span style="display:inline-block;width:9px;height:9px;border:2px solid rgba(37,99,235,.3);border-top-color:#2563eb;border-radius:50%;animation:spin .8s linear infinite;"></span>`;
        await extractForTab(tabId);
        extractBtn.disabled  = false;
        extractBtn.innerHTML = "⬇ Extract";
      }
    });

    // ── Inject spin keyframe ─────────────────────────────────────
    if (!document.getElementById("smgrSpinStyle")) {
      const s = document.createElement("style");
      s.id = "smgrSpinStyle";
      s.textContent = `@keyframes spin { to { transform:rotate(360deg); } }
        .side-mgr-tab { transition: all .15s; }
        #smgrCertDropZone:hover { border-color:#c0392b!important; background:#fff5f5; }
        .tab-actions { display:none; gap:4px; padding:3px 10px 8px; }
        .tabBtn:hover ~ .tab-actions, .tab-actions:hover { display:flex!important; }`;
      document.head.appendChild(s);
    }
  });

  // Expose for app.js usage
  window.__cvManager = { resetTab, extractForTab, addNewTab };

})();
