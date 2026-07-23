/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║  chatbot.js — Floating CV Assistant (n8n webhook backend)    ║
 * ║  Mode 1: CV Editor  — edit CV via natural language           ║
 * ║  Mode 2: Interview  — practice Q&A based on CV + JD         ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
(function () {
"use strict";

/* ── Config ──────────────────────────────────────────────────── */
const N8N_WEBHOOK = "https://khaterover.app.n8n.cloud/webhook/chatbot";
// test URL (n8n test mode):  https://khaterover.app.n8n.cloud/webhook-test/chatbot
// production URL (n8n prod): https://khaterover.app.n8n.cloud/webhook/chatbot

/* ── Helpers ─────────────────────────────────────────────────── */
const $   = id => document.getElementById(id);
const esc = s  => (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");

function getData() { return window.__cvApp?.getData() || window.CV_DATA || null; }
function getTab()  { return window.__cvApp?.getActiveTab() || "electrical"; }
function save()    { window.__cvApp?.save?.(); window.__cvApp?.renderAll?.(); }

/* ── State ───────────────────────────────────────────────────── */
let open       = false;
let mode       = "cv";
let history    = [];
let interviewQ = [];
let qIndex     = 0;
let typing     = false;

/* ── Build CV context for n8n ────────────────────────────────── */
function buildContext() {
  const data = getData(); if (!data) return {};
  const tab    = getTab();
  const person = data.person || {};
  const jd     = $("jdInput")?.value?.trim() || "";

  // ── Full profile for one tab ────────────────────────────────
  const profileOf = (p) => ({
    summary:    p.summary || "",
    experience: (p.experience||[]).map(e => ({
      title:    e.title    || "",
      company:  e.company  || "",
      location: e.location || "",
      dates:    e.dates    || "",
      bullets:  e.bullets  || [],
      keywords: e.keywords || [],
    })),
    skills: p.skills || [],
    certs:  (p.certs||[]).map(c => ({
      title:  c.title || c.name || "",
      issuer: c.issuer || "",
      date:   c.date   || "",
    })),
    links:       p.links       || [],
    cert_images: (p.cert_images||[]).map(i => i.title || ""),
  });

  // ── All tabs ────────────────────────────────────────────────
  const allTabs = {};
  (data.tabs || []).forEach(t => {
    const p = data.curated?.[t.id];
    if (p) allTabs[t.id] = { label: t.label, subtitle: t.subtitle || "", ...profileOf(p) };
  });

  // ── Branches (sub-specializations) ──────────────────────────
  const branches = {};
  Object.entries(data.curated_branches || {}).forEach(([tabId, brs]) => {
    branches[tabId] = {};
    Object.entries(brs).forEach(([brId, br]) => {
      branches[tabId][brId] = { label: br.label || brId, ...profileOf(br) };
    });
  });

  // ── Merged snapshot if active ───────────────────────────────
  const merged = data.curated?.["__merged__"] ? profileOf(data.curated["__merged__"]) : null;

  // ── Document highlights (raw CV text extracted from PDFs) ───
  const docHighlights = {};
  (data.docs || []).forEach(doc => {
    Object.entries(doc.highlights || {}).forEach(([tabId, hls]) => {
      if (!docHighlights[tabId]) docHighlights[tabId] = [];
      hls.forEach(h => { if (h.text) docHighlights[tabId].push(h.text); });
    });
  });
  // Trim to top 15 per tab
  Object.keys(docHighlights).forEach(k => { docHighlights[k] = docHighlights[k].slice(0, 15); });

  return {
    // Identity
    person: {
      name:      person.name      || "",
      preferred: person.preferred || "",
      location:  person.location  || "",
      email:     person.email     || "",
      phone:     person.phone     || "",
    },

    // Current view state
    active_tab:    tab,
    active_branch: window.__cvApp?.getBranch?.() || null,
    is_merged:     tab === "__merged__",

    // Full CV across every tab
    all_tabs:  allTabs,
    branches,
    merged,

    // Global data
    projects: (data.projects || []).map(p => ({
      name:    p.name || p.title || "",
      summary: p.summary || "",
      bullets: p.bullets || [],
      url:     p.url || "",
      tabs:    p.tab_ids || [],
    })),
    education: (data.education || []).map(e => ({
      school: e.school || e.institution || "",
      degree: e.degree || e.title || "",
      major:  e.major  || "",
      year:   e.year   || e.dates || "",
      note:   e.note   || "",
    })),

    // Raw source material from CV PDFs
    document_highlights: docHighlights,

    // Job description if user pasted one
    job_description: jd.slice(0, 2000),

    // Stats for quick reference
    stats: {
      total_tabs:        Object.keys(allTabs).length,
      total_experience:  Object.values(allTabs).reduce((n,t)=>n+(t.experience?.length||0), 0),
      total_skills:      [...new Set(Object.values(allTabs).flatMap(t=>t.skills||[]))].length,
      total_certs:       [...new Set(Object.values(allTabs).flatMap(t=>(t.certs||[]).map(c=>c.title)))].length,
      total_projects:    (data.projects||[]).length,
    },
  };
}

/* ── Call n8n webhook ────────────────────────────────────────── */
async function callN8N(payload) {
  const res = await fetch(N8N_WEBHOOK, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(payload),
  });

  if (!res.ok) throw new Error(`n8n error HTTP ${res.status} — تأكد من تفعيل الـ webhook`);

  const data = await res.json();

  // n8n can return various shapes — normalize
  // Expected: { reply: "...", action: "...", ops: [...] }
  // or just: "string"
  // or: [{ reply: "..." }]
  if (Array.isArray(data))        return data[0];
  if (typeof data === "string")   return { reply: data };
  return data;
}

/* ── Apply CV edit operations from n8n ───────────────────────── */
function applyOps(ops) {
  const data = getData(); if (!data) return;
  const tab  = getTab();
  if (!data.curated)       data.curated = {};
  if (!data.curated[tab])  data.curated[tab] = {};
  const p = data.curated[tab];

  (ops||[]).forEach(op => {
    const d = op.data || {};
    switch (op.type) {

      case "add_skill":
        if (!p.skills) p.skills = [];
        if (!p.skills.some(s => s.toLowerCase() === (d.skill||"").toLowerCase()))
          p.skills.unshift(d.skill);
        break;

      case "del_skill":
        if (p.skills) {
          const q = (d.skill||"").toLowerCase();
          p.skills = p.skills.filter(s => !s.toLowerCase().includes(q));
        }
        break;

      case "edit_summary":
        if (d.summary) p.summary = d.summary;
        break;

      case "add_exp":
        if (!p.experience) p.experience = [];
        p.experience.unshift({
          title:    d.title    || "",
          company:  d.company  || "",
          location: d.location || "",
          dates:    d.dates    || "",
          bullets:  d.bullets  || []
        });
        break;

      case "del_exp":
        if (p.experience) {
          const q = (d.title||"").toLowerCase();
          p.experience = p.experience.filter(e => !e.title.toLowerCase().includes(q));
        }
        break;

      case "add_cert":
        if (!p.certs) p.certs = [];
        p.certs.push({ title: d.title||"", name: d.title||"", issuer: d.issuer||"", date: d.date||"" });
        break;

      case "del_cert":
        if (p.certs) {
          const q = (d.title||"").toLowerCase();
          p.certs = p.certs.filter(c => !(c.title||c.name||"").toLowerCase().includes(q));
        }
        break;

      case "add_bullet":
        if (p.experience) {
          const q   = (d.exp_title||"").toLowerCase();
          const exp = p.experience.find(e => e.title.toLowerCase().includes(q));
          if (exp) { if (!exp.bullets) exp.bullets=[]; exp.bullets.push(d.bullet||""); }
        }
        break;

      case "edit_bullet":
        if (p.experience) {
          const q   = (d.exp_title||"").toLowerCase();
          const exp = p.experience.find(e => e.title.toLowerCase().includes(q));
          if (exp?.bullets) {
            const idx = exp.bullets.findIndex(b => b.toLowerCase().includes((d.old||"").toLowerCase()));
            if (idx !== -1) exp.bullets[idx] = d.new || exp.bullets[idx];
          }
        }
        break;
    }
  });

  save();
}

/* ══════════════════════════════════════════════════════════════
   MESSAGE HANDLING
══════════════════════════════════════════════════════════════ */
async function sendMessage(text) {
  if (typing || !text.trim()) return;
  text = text.trim();

  addUserMsg(text);
  history.push({ role: "user", text });
  setInput("");
  typing = true;
  showTyping();

  try {
    // Build payload for n8n
    const payload = {
      mode,
      message:  text,
      cv:       buildContext(),
      history:  history.slice(-8),
      interview_q:     interviewQ,
      interview_index: qIndex,
      // API keys — n8n can use these to call AI models
      openai_key: localStorage.getItem("openai_key") || "",
      cv_ak:      localStorage.getItem("cv_ak") || "",
    };

    const result = await callN8N(payload);

    removeTyping();

    // Get reply text
    const reply = result.reply || result.message || result.text || JSON.stringify(result);

    // Apply CV edits if n8n sends ops
    if (result.ops?.length) applyOps(result.ops);

    // Update interview state if n8n sends questions
    if (result.questions?.length) {
      interviewQ = result.questions;
      qIndex     = result.question_index ?? 0;
    } else if (typeof result.question_index === "number") {
      qIndex = result.question_index;
    }

    // Display
    const prefix = result.ops?.length ? "✅ " : "";
    addBotMsg(prefix + reply);
    history.push({ role: "assistant", text: reply });

  } catch(e) {
    removeTyping();
    addBotMsg(`⚠️ ${e.message}\n\nتأكد أن الـ webhook نشط في n8n.`);
  } finally {
    typing = false;
  }
}

/* ══════════════════════════════════════════════════════════════
   UI HELPERS
══════════════════════════════════════════════════════════════ */
function addUserMsg(text) {
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div  = document.createElement("div");
  div.className   = "chat-msg chat-msg-user";
  div.textContent = text;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function addBotMsg(text) {
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div  = document.createElement("div");
  div.className = "chat-msg chat-msg-bot";
  div.innerHTML  = esc(text)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function showTyping(msg) {
  removeTyping();
  const wrap = $("chatMsgs"); if (!wrap) return;
  const div  = document.createElement("div");
  div.id        = "chatTyping";
  div.className = "chat-msg chat-msg-bot chat-typing";
  div.innerHTML = `<span></span><span></span><span></span>${msg ? ` <small>${esc(msg)}</small>` : ""}`;
  wrap.appendChild(div);
  wrap.scrollTop = wrap.scrollHeight;
}

function removeTyping() { $("chatTyping")?.remove(); }
function setInput(val)  { const el=$("chatInputEl"); if(el) el.value=val; }

function switchMode(m) {
  mode = m;
  interviewQ = []; qIndex = 0;
  document.querySelectorAll(".chat-mode-btn")
    .forEach(b => b.classList.toggle("active", b.dataset.mode === m));

  const msgs = $("chatMsgs"); if (!msgs) return;
  msgs.innerHTML = "";
  history = [];

  updateSuggestions();

  if (m === "cv") {
    addBotMsg("مرحباً! أنا مساعد الـ CV.\n\nقل لي ما تريد:\n• أضف مهارة Python\n• احذف خبرة الشركة X\n• حسّن الملخص\n• أضف شهادة CCNA من Cisco\n• ما نقاط ضعف CV هذا؟");
  } else {
    addBotMsg("مرحباً! سأحضّرك للمقابلة.\n\nسأسألك أسئلة مبنية على CV والوصف الوظيفي وأقيّم إجاباتك.\n\nاكتب **ابدأ** لنبدأ! 🎯");
  }
}

function updateSuggestions() {
  const sug = $("chatSuggestions"); if (!sug) return;
  if (mode === "interview") {
    sug.innerHTML = `
      <button class="chat-sug" onclick="window.__chatbot.suggest('ابدأ')">▶ ابدأ المقابلة</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest('أعد السؤال')">↺ أعد السؤال</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest('تخطى')">⏭ تخطى</button>
    `;
  } else {
    sug.innerHTML = `
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">أضف مهارة Python</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">حسّن الملخص</button>
      <button class="chat-sug" onclick="window.__chatbot.suggest(this.textContent)">نقاط ضعف الـ CV؟</button>
    `;
  }
}

function toggleChat() {
  open = !open;
  const panel  = $("chatPanel");
  const bubble = $("chatBubble");
  if (panel)  panel.style.display = open ? "flex" : "none";
  if (bubble) bubble.innerHTML    = open
    ? "✕"
    : `💬<div class="badge">AI</div>`;
}

/* ══════════════════════════════════════════════════════════════
   INJECT UI
══════════════════════════════════════════════════════════════ */
function injectUI() {

  const style = document.createElement("style");
  style.textContent = `
    #chatBubble {
      position:fixed;bottom:24px;right:24px;z-index:9000;
      width:54px;height:54px;border-radius:50%;
      background:linear-gradient(135deg,#c0392b,#8e1a10);
      color:#fff;font-size:22px;border:none;cursor:pointer;
      box-shadow:0 6px 24px rgba(192,57,43,.5);
      display:flex;align-items:center;justify-content:center;
      transition:transform .2s,box-shadow .2s;
    }
    #chatBubble:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(192,57,43,.65);}
    #chatBubble .badge{
      position:absolute;top:-4px;right:-4px;
      width:18px;height:18px;border-radius:50%;
      background:#10b981;border:2px solid #fff;
      font-size:9px;font-weight:900;
      display:flex;align-items:center;justify-content:center;color:#fff;
    }
    #chatPanel{
      position:fixed;bottom:90px;right:24px;z-index:8999;
      width:380px;height:580px;max-height:80vh;
      background:#fff;border-radius:20px;
      box-shadow:0 24px 80px rgba(0,0,0,.22);
      border:1px solid rgba(0,0,0,.08);
      display:flex;flex-direction:column;overflow:hidden;
    }
    .chat-header{
      background:linear-gradient(135deg,#1a1a2e,#2d1a3e);
      padding:14px 16px;flex-shrink:0;
      display:flex;align-items:center;gap:10px;
    }
    .chat-header-icon{font-size:22px;}
    .chat-header-title{font-weight:800;font-size:14px;color:#fff;}
    .chat-header-sub{font-size:11px;color:rgba(255,255,255,.45);}
    .chat-n8n-badge{
      margin-right:auto;padding:3px 8px;border-radius:99px;
      background:rgba(16,185,129,.2);border:1px solid rgba(16,185,129,.4);
      font-size:10px;font-weight:700;color:#6ee7b7;
    }
    .chat-mode-bar{display:flex;border-bottom:1px solid #eee;flex-shrink:0;}
    .chat-mode-btn{
      flex:1;padding:9px;border:none;background:#fafafa;
      font-size:12px;font-weight:700;cursor:pointer;color:#888;transition:all .15s;
    }
    .chat-mode-btn+.chat-mode-btn{border-left:1px solid #eee;}
    .chat-mode-btn.active{background:#fff;color:#c0392b;border-bottom:2px solid #c0392b;}
    #chatMsgs{
      flex:1;overflow-y:auto;padding:14px;
      display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;
    }
    .chat-msg{
      max-width:85%;padding:10px 13px;border-radius:14px;
      font-size:13px;line-height:1.6;word-break:break-word;
    }
    .chat-msg-user{align-self:flex-end;background:#c0392b;color:#fff;border-bottom-right-radius:4px;}
    .chat-msg-bot{align-self:flex-start;background:#f4f4f4;color:#1a1a2e;border-bottom-left-radius:4px;}
    .chat-typing{display:flex;align-items:center;gap:5px;padding:10px 14px;}
    .chat-typing span{
      width:7px;height:7px;border-radius:50%;
      background:#c0392b;animation:chatDot 1.2s infinite;display:inline-block;
    }
    .chat-typing span:nth-child(2){animation-delay:.2s;}
    .chat-typing span:nth-child(3){animation-delay:.4s;}
    .chat-typing small{font-size:11px;color:#888;margin-right:4px;}
    @keyframes chatDot{
      0%,80%,100%{transform:scale(.8);opacity:.5;}
      40%{transform:scale(1.2);opacity:1;}
    }
    .chat-suggestions{
      display:flex;gap:6px;flex-wrap:wrap;
      padding:0 12px 10px;flex-shrink:0;
    }
    .chat-sug{
      padding:5px 10px;border-radius:99px;
      border:1.5px solid rgba(192,57,43,.3);
      background:#fff;color:#c0392b;
      font-size:11px;font-weight:600;cursor:pointer;
      white-space:nowrap;transition:all .15s;
    }
    .chat-sug:hover{background:#c0392b;color:#fff;}
    .chat-input-bar{
      padding:10px 12px;border-top:1px solid #eee;
      display:flex;gap:8px;flex-shrink:0;background:#fff;
    }
    #chatInputEl{
      flex:1;padding:9px 12px;
      border:1.5px solid #eee;border-radius:12px;
      font-size:13px;font-family:inherit;outline:none;
      resize:none;max-height:80px;overflow-y:auto;
      transition:border-color .15s;
    }
    #chatInputEl:focus{border-color:#c0392b;}
    #chatSendBtn{
      width:38px;height:38px;border-radius:12px;border:none;
      background:#c0392b;color:#fff;font-size:17px;cursor:pointer;
      display:flex;align-items:center;justify-content:center;
      flex-shrink:0;transition:background .15s;
    }
    #chatSendBtn:hover{background:#a93226;}
    #chatSendBtn:disabled{background:#ddd;cursor:default;}
    @media(max-width:600px){
      #chatPanel{width:calc(100vw - 32px);right:16px;left:16px;}
    }
    @media print{#chatBubble,#chatPanel{display:none!important;}}
  `;
  document.head.appendChild(style);

  /* Bubble */
  const bubble = document.createElement("button");
  bubble.id    = "chatBubble";
  bubble.title = "المساعد الذكي";
  bubble.innerHTML = `💬<div class="badge">AI</div>`;
  bubble.onclick   = toggleChat;

  /* Panel */
  const panel = document.createElement("div");
  panel.id    = "chatPanel";
  panel.style.display = "none";
  panel.innerHTML = `
    <div class="chat-header">
      <div class="chat-header-icon">🤖</div>
      <div>
        <div class="chat-header-title">المساعد الذكي</div>
        <div class="chat-header-sub">يعدّل CV · يحضّرك للمقابلة</div>
      </div>
      <div class="chat-n8n-badge">⚡ n8n</div>
    </div>
    <div class="chat-mode-bar">
      <button class="chat-mode-btn active" data-mode="cv"
        onclick="window.__chatbot.switchMode('cv')">✏️ تعديل CV</button>
      <button class="chat-mode-btn" data-mode="interview"
        onclick="window.__chatbot.switchMode('interview')">🎯 مقابلة</button>
    </div>
    <div id="chatMsgs"></div>
    <div class="chat-suggestions" id="chatSuggestions"></div>
    <div class="chat-input-bar">
      <textarea id="chatInputEl" placeholder="اكتب طلبك…" rows="1"></textarea>
      <button id="chatSendBtn" onclick="window.__chatbot.send()">↑</button>
    </div>
  `;

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  /* Enter to send */
  $("chatInputEl")?.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); window.__chatbot.send(); }
  });

  /* Welcome */
  switchMode("cv");
}

/* ── Public API ───────────────────────────────────────────────── */
window.__chatbot = {
  send:       ()  => sendMessage($("chatInputEl")?.value || ""),
  suggest:    txt => { setInput(txt); sendMessage(txt); },
  switchMode,
  toggle:     toggleChat,
};

/* ── Init ─────────────────────────────────────────────────────── */
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", injectUI);
} else {
  injectUI();
}

})();
