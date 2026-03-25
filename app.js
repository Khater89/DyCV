let DATA = window.CV_DATA;
let activeTabId = "data";
let activeBranchId = null;
let jdTokens = new Set();
let searchTerm = "";

// Merge mode
let mergeMode = false;
let mergeSelection = []; // [{tabId, branchId|null}]
let mergeExperienceOrder = []; // array of experience keys
let mergeDateOverrides = {}; // key -> edited dates string

function $(id){ return document.getElementById(id); }
function escapeHtml(s){
  return String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}
function norm(s){
  return String(s||"").toLowerCase().replace(/[^a-z0-9\s]+/g," ").replace(/\s+/g," ").trim();
}
function tokenize(text){
  const t = norm(text);
  const words = t.split(" ").filter(w=>w.length>=3);
  const bigrams=[];
  for(let i=0;i<words.length-1;i++) bigrams.push(words[i]+" "+words[i+1]);
  return new Set([...words, ...bigrams]);
}

function getBranching(tabId){
  return (DATA.branching && DATA.branching[tabId]) ? DATA.branching[tabId] : null;
}
function getProfile(){
  if(mergeMode && activeTabId==='__merged__'){
    // Use snapshotted editable data if available, else build dynamically
    return DATA.curated?.["__merged__"] || buildMergedModel();
  }
  const b = getBranching(activeTabId);
  if(b){
    const br = (b.branches||[]).find(x=>x.id===activeBranchId) || (b.branches||[]).find(x=>x.id===b.default) || (b.branches||[])[0];
    return (DATA.curated_branches?.[activeTabId]?.[br?.id]) || {};
  }
  return DATA.curated?.[activeTabId] || {};
}
function getHighlights(){
  if(mergeMode && activeTabId==='__merged__'){
    // Return empty — merged highlights shown from snapshot only
    return DATA.auto_bullets?.["__merged__"] || [];
  }
  const b = getBranching(activeTabId);
  if(b){
    const bid = activeBranchId || b.default;
    return DATA.auto_bullets_branches?.[activeTabId]?.[bid] || [];
  }
  return DATA.auto_bullets?.[activeTabId] || [];
}


function monthIndex(m){
  const map = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
  return map[String(m||"").toLowerCase()] || null;
}
function parseDatePart(s, isEnd){
  const t = String(s||"").trim();
  if(!t) return null;
  if(/present|current|now/i.test(t)) return 9999*12;
  let m = t.match(/(\d{1,2})\s*[\/\-]\s*(\d{4})/);
  if(m){
    const mm = Math.max(1, Math.min(12, parseInt(m[1],10)));
    const yy = parseInt(m[2],10);
    return yy*12 + mm;
  }
  m = t.match(/([A-Za-z]{3,9})\s+(\d{4})/);
  if(m){
    const mm = monthIndex(m[1]) || 1;
    const yy = parseInt(m[2],10);
    return yy*12 + mm;
  }
  m = t.match(/(\d{4})/);
  if(m){
    const yy = parseInt(m[1],10);
    const mm = isEnd ? 12 : 1;
    return yy*12 + mm;
  }
  return null;
}
function parseDateRange(dates){
  const raw = String(dates||"").replace(/\u2013|\u2014/g,"-");
  const parts = raw.split("-").map(x=>x.trim()).filter(Boolean);
  if(parts.length===1){
    const one = parseDatePart(parts[0], true);
    return { start: one||0, end: one||0 };
  }
  const start = parseDatePart(parts[0], false);
  const end = parseDatePart(parts.slice(1).join(" "), true);
  return { start: start||0, end: end||0 };
}
function uniqBy(arr, keyFn){
  const seen = new Set();
  const out = [];
  (arr||[]).forEach(x=>{
    const k = keyFn(x);
    if(!k || seen.has(k)) return;
    seen.add(k);
    out.push(x);
  });
  return out;
}

function expKey(e){
  // Stable key for ordering & date edits (keeps original dates from source)
  return norm([e.title||"", e.company||"", e.location||"", e.dates||""].join("|"));
}

function selectionLabel(sel){
  const tab = tabMeta(sel.tabId);
  const b = getBranching(sel.tabId);
  if(b && sel.branchId){
    const br = (b.branches||[]).find(x=>x.id===sel.branchId);
    return `${tab.label} • ${br ? br.label : sel.branchId}`;
  }
  return `${tab.label}`;
}
function getProfileBySelection(sel){
  const b = getBranching(sel.tabId);
  if(b){
    const bid = sel.branchId || b.default || (b.branches?.[0]?.id) || null;
    return DATA.curated_branches?.[sel.tabId]?.[bid] || {};
  }
  return DATA.curated?.[sel.tabId] || {};
}
function getHighlightsBySelection(sel){
  const b = getBranching(sel.tabId);
  if(b){
    const bid = sel.branchId || b.default || (b.branches?.[0]?.id) || null;
    return DATA.auto_bullets_branches?.[sel.tabId]?.[bid] || [];
  }
  return DATA.auto_bullets?.[sel.tabId] || [];
}

function firstSentence(txt){
  const s = String(txt||"").replace(/\s+/g," ").trim();
  if(!s) return "";
  // split on sentence end
  const m = s.match(/^(.*?[.!?])\s/);
  if(m && m[1]) return m[1].trim();
  // fallback: cut at ~140 chars
  if(s.length>140) return s.slice(0,140).replace(/\s+\S*$/,"").trim() + "…";
  return s.endsWith(".")? s : (s + ".");
}

function buildMergedSummary(sels, profiles){
  if(!sels || !sels.length) return "";
  // If only one selection, use its own curated summary (best quality)
  if(sels.length===1 && profiles && profiles[0] && profiles[0].summary){
    return String(profiles[0].summary).trim();
  }
  const topics = sels.map(selectionLabel).join(", ");
  const base = `Multidisciplinary engineer with combined experience in ${topics}.`;
  const snips = uniqBy(
    (profiles||[]).map(p=>firstSentence(p.summary||"")).filter(Boolean),
    s=>norm(s)
  );
  let out = base + (snips.length ? " " + snips.slice(0,3).join(" ") : "");
  // hard cap
  if(out.length>520) out = out.slice(0,520).replace(/\s+\S*$/,"").trim() + "…";
  return out;
}

function buildMergedModel(){
  const sels = mergeSelection.length ? mergeSelection : [{tabId: activeTabId, branchId: activeBranchId}];
  const profiles = sels.map(s=>getProfileBySelection(s));

  // Clone experiences so we don't mutate the underlying DATA
  let exp = profiles.flatMap(p=> (p.experience||[]).map(e=>({ ...e })) );

  // De-dupe by stable key (includes original dates)
  exp = uniqBy(exp, e=> expKey(e));

  // Attach internal keys
  exp.forEach(e=>{ e._key = expKey(e); });

  // Apply date edits (if any) BEFORE ordering/sorting
  exp.forEach(e=>{
    const ov = mergeDateOverrides?.[e._key];
    if(ov && String(ov).trim()) e.dates = String(ov).trim();
  });

  // Ordering:
  // 1) If user manually ordered, respect it
  // 2) Otherwise sort by date (most recent first), using the (possibly edited) dates
  if(mergeExperienceOrder && mergeExperienceOrder.length){
    const idx = new Map(mergeExperienceOrder.map((k,i)=>[k,i]));
    exp.sort((a,b)=>{
      const ia = idx.has(a._key) ? idx.get(a._key) : 1e9;
      const ib = idx.has(b._key) ? idx.get(b._key) : 1e9;
      if(ia!==ib) return ia-ib;
      const ra = parseDateRange(a.dates);
      const rb = parseDateRange(b.dates);
      return (rb.end - ra.end) || (rb.start - ra.start);
    });
  } else {
    exp.sort((a,b)=>{
      const ra = parseDateRange(a.dates);
      const rb = parseDateRange(b.dates);
      return (rb.end - ra.end) || (rb.start - ra.start);
    });
  }

  const skills = uniqBy(profiles.flatMap(p=>p.skills||[]), s=>norm(s));
  const links = uniqBy(profiles.flatMap(p=>p.links||[]), l=> (l.url||"").trim());
  const certs = uniqBy(profiles.flatMap(p=>p.certs||[]), c=>norm((c.name||"")+"|"+(c.issuer||"")+"|"+(c.date||"")));
  const certImgs = uniqBy(profiles.flatMap(p=>p.cert_images||[]), i=> (i.src||"").trim());

  const proj = uniqBy(
    (DATA.projects||[]).filter(p=>{
      return sels.some(sel=>{
        if(!(p.tab_ids||[]).includes(sel.tabId)) return false;
        const hasBr = !!getBranching(sel.tabId);
        if(!hasBr) return true;
        if(!p.branch_ids || !p.branch_ids.length) return true;
        const bid = sel.branchId || getBranching(sel.tabId)?.default;
        return p.branch_ids.includes(bid);
      });
    }),
    p=>norm(p.name||"")
  );

  const bullets = uniqBy(
    sels.flatMap(s=>getHighlightsBySelection(s)).map(x=>({text:x.text, score:x.score||0})),
    x=>norm(x.text)
  );

  const summary = buildMergedSummary(sels, profiles);

  return {
    summary,
    experience: exp,
    skills,
    links,
    certs,
    cert_images: certImgs,
    merged_highlights: bullets,
    merged_projects: proj
  };
}

function tabMeta(id){
  if(id==="__merged__") return { id:"__merged__", label:"Merged CV", subtitle:"Combined experience from multiple areas" };
  return (DATA.tabs||[]).find(t=>t.id===id) || (DATA.tabs||[])[0];
}
function scoreText(text){
  if(searchTerm && !norm(text).includes(searchTerm)) return -9999;
  if(jdTokens.size===0) return 0;
  const n = norm(text);
  let score = 0;
  for(const tok of jdTokens){
    if(n.includes(tok)) score++;
  }
  return score;
}

function renderDocStatus(){
  const total = (DATA.docs||[]).length;
  const ok = (DATA.docs||[]).filter(d=>d.text_available).length;
  const limited = total - ok;
  $("docStatus").textContent = `${ok}/${total} PDFs extracted as text • ${limited} limited (likely scanned).`;
}



function openBranchModal(tabId){
  const b = getBranching(tabId);
  const modal = $("branchModal");
  const list = $("branchModalList");
  const title = $("branchModalTitle");
  const hint = $("branchModalHint");
  if(!modal || !list || !b) return;

  // Ensure a default selection exists
  if(!activeBranchId) activeBranchId = b.default || (b.branches?.[0]?.id) || null;

  const tab = tabMeta(tabId);
  title.textContent = `${tab.label} • Choose Focus`;
  hint.textContent = "Pick one option to generate a focused CV for this tab.";

  list.innerHTML = "";
  (b.branches||[]).forEach(br=>{
    const btn = document.createElement("button");
    btn.className = "modalChoice" + (br.id===activeBranchId ? " active":"");
    btn.innerHTML = `<div class="cTitle">${escapeHtml(br.label||br.id)}</div>
      <div class="muted cSub">${escapeHtml(br.subtitle||"")}</div>`;
    btn.onclick = ()=>{
      activeBranchId = br.id;
      closeBranchModal();
      renderTabs();
      renderBranches();
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    list.appendChild(btn);
  });

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
}

function closeBranchModal(){
  const modal = $("branchModal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
}


function openMergeModal(){
  const modal = $("mergeModal");
  const list = $("mergeModalList");
  if(!modal || !list) return;

  if(!mergeSelection || !mergeSelection.length){
    mergeSelection = [{ tabId: activeTabId, branchId: activeBranchId }];
  }

  list.innerHTML = "";

  (DATA.tabs||[]).forEach(t=>{
    const g = document.createElement("div");
    g.className = "mergeGroup";

    const title = document.createElement("div");
    title.className = "mergeGroupTitle";
    title.innerHTML = `<span>${escapeHtml(t.label)}</span><span class="muted">${escapeHtml(t.id)}</span>`;
    g.appendChild(title);

    const items = document.createElement("div");
    items.className = "mergeItems";

    const b = getBranching(t.id);
    const options = [];
    if(b){
      (b.branches||[]).forEach(br=>{
        options.push({ tabId:t.id, branchId: br.id, label: br.label, subtitle: br.subtitle||"" });
      });
    } else {
      options.push({ tabId:t.id, branchId: null, label: "Include", subtitle: t.subtitle||"" });
    }

    options.forEach(opt=>{
      const key = opt.tabId + "::" + (opt.branchId || "");
      const checked = mergeSelection.some(s=> (s.tabId===opt.tabId) && ((s.branchId||"") === (opt.branchId||"")));
      const row = document.createElement("label");
      row.className = "mergeItem";
      row.innerHTML = `
        <input type="checkbox" data-key="${escapeHtml(key)}" ${checked ? "checked":""}/>
        <div>
          <div class="miTitle">${escapeHtml(opt.label||"")}</div>
          <div class="muted miSub">${escapeHtml(opt.subtitle||"")}</div>
        </div>
      `;
      const inp = row.querySelector("input");
      inp.addEventListener("change", ()=>{
        const k = inp.getAttribute("data-key");
        const [tabId, branchId] = k.split("::");
        const bid = branchId || null;
        if(inp.checked){
          mergeSelection.push({ tabId, branchId: bid });
        } else {
          mergeSelection = mergeSelection.filter(s=> !(s.tabId===tabId && ((s.branchId||"") === (bid||""))) );
        }
      });
      items.appendChild(row);
    });

    g.appendChild(items);
    list.appendChild(g);
  });

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden","false");
}

function closeMergeModal(){
  const modal = $("mergeModal");
  if(!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden","true");
}

function applyMerge(){
  if(!mergeSelection || !mergeSelection.length){
    mergeSelection = [{ tabId: activeTabId, branchId: activeBranchId }];
  }
  mergeMode = true;
  activeTabId = "__merged__";
  activeBranchId = null;

  const exitBtn = $("btnExitMerge");
  if(exitBtn) exitBtn.style.display = "inline-flex";

  // Build model and SNAPSHOT it into DATA so it becomes fully editable
  const model = buildMergedModel();
  if(!mergeExperienceOrder || !mergeExperienceOrder.length){
    mergeExperienceOrder = (model.experience||[]).map(e=>e._key);
  }

  // ── Snapshot: copy merged result into DATA.curated.__merged ──
  // This makes it independent — edits no longer affect source tabs
  if(!DATA.curated) DATA.curated = {};
  DATA.curated["__merged__"] = {
    summary:    model.summary    || "",
    experience: JSON.parse(JSON.stringify(model.experience || [])),
    skills:     JSON.parse(JSON.stringify(model.skills     || [])),
    certs:      JSON.parse(JSON.stringify(model.certs      || [])),
    cert_images:JSON.parse(JSON.stringify(model.cert_images|| [])),
    links:      JSON.parse(JSON.stringify(model.links      || [])),
    projects:   JSON.parse(JSON.stringify(model.merged_projects || []))
  };

  closeMergeModal();
  renderTabs();
  renderBranches();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}




function renderTabs(){
  const wrap = $("tabs");
  wrap.innerHTML = "";

  // Merged CV pseudo-tab
  const m = document.createElement("button");
  m.className = "tabBtn" + (activeTabId==="__merged__" ? " active":"");
  m.innerHTML = `<div>
      <div style="font-weight:900">Merged CV</div>
      <div class="muted">Combine multiple experiences</div>
    </div>
    <span class="badge">merge</span>`;
  m.onclick = ()=> openMergeModal();
  wrap.appendChild(m);

  (DATA.tabs||[]).forEach(t=>{
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "position:relative;";

    const b = document.createElement("button");
    b.className = "tabBtn" + (t.id===activeTabId ? " active":"");
    b.innerHTML = `<div>
      <div style="font-weight:900">${escapeHtml(t.label)}</div>
      <div class="muted">${escapeHtml(t.subtitle||"")}</div>
    </div>
    <span class="badge">${escapeHtml(t.id)}</span>`;
    b.onclick = ()=>{ 
      mergeMode = false;
      const exitBtn = $("btnExitMerge");
      if(exitBtn) exitBtn.style.display = "none";
      activeTabId = t.id;
      activeBranchId = null;
      renderTabs();
      renderBranches();
      renderAll();
      if(getBranching(activeTabId)) openBranchModal(activeTabId);
      else window.scrollTo({ top: 0, behavior: "smooth" });
    };
    wrapper.appendChild(b);

    // Tab action buttons (Reset / Extract) — shown on hover
    const actions = document.createElement("div");
    actions.className = "tab-actions";
    actions.innerHTML = `
      <button class="tab-action-btn tab-reset-btn" data-tab="${escapeHtml(t.id)}" title="Reset tab">↺ Reset</button>
      <button class="tab-action-btn tab-extract-btn" data-tab="${escapeHtml(t.id)}" title="Extract from Drive">⬇ Extract</button>
    `;
    wrapper.appendChild(actions);
    wrap.appendChild(wrapper);
  });

  // Add new tab button
  const addBtn = document.createElement("button");
  addBtn.id = "btnAddTab";
  addBtn.className = "tabBtn";
  addBtn.style.cssText = "border:2px dashed rgba(192,57,43,.3);color:rgba(192,57,43,.7);justify-content:center;gap:6px;";
  addBtn.innerHTML = `<span style="font-size:18px;line-height:1;">＋</span><div style="font-weight:700;font-size:13px;">إضافة تاب</div>`;
  addBtn.onclick = ()=> window.__cvManager?.openAddTab?.();
  wrap.appendChild(addBtn);
}


function renderBranches(){
  const card = $("branchesCard");
  const wrap = $("branches");
  if(!card || !wrap) return;

  if(mergeMode && activeTabId==='__merged__'){
    card.style.display='none';
    return;
  }

  const b = getBranching(activeTabId);
  const titleEl = $("branchTitle");
  if(titleEl){ const tab = tabMeta(activeTabId); titleEl.textContent = `${tab.label} Branches`; }
  if(!b){
    card.style.display="none";
    return;
  }

  card.style.display="block";
  if(!activeBranchId) activeBranchId = b.default || (b.branches?.[0]?.id) || null;

  wrap.innerHTML = "";
  (b.branches||[]).forEach(br=>{
    const btn = document.createElement("button");
    btn.className = "branchBtn" + (br.id===activeBranchId ? " active":"");
    btn.innerHTML = `<div>
      <div style="font-weight:900">${escapeHtml(br.label)}</div>
      <div class="muted">${escapeHtml(br.subtitle||"")}</div>
    </div>
    <span class="badge">${escapeHtml(br.id)}</span>`;
    btn.onclick = ()=>{
      activeBranchId = br.id;
      renderBranches();
      renderAll();
      closeBranchModal();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    wrap.appendChild(btn);
  });
}

function renderHeader(){
  const t = tabMeta(activeTabId);
  $("tabTitle").textContent = t.label;
  $("tabSubtitle").textContent = t.subtitle || "";

  $("pill").textContent = t.label;

  // Name & contact
  const person = (DATA && DATA.person) ? DATA.person : {};
  $("name").textContent = person.name || "Abdelrahman Khater";
  const contact = [];
  if(person.location) contact.push(person.location);
  if(person.email) contact.push(person.email);
  if(person.phone) contact.push(person.phone);
  $("contact").textContent = contact.join(" • ");
  // optional headline
  $("headline").textContent = (DATA && DATA.header && DATA.header.headline) ? DATA.header.headline : "";

  // Merged pill
  if(mergeMode && activeTabId==="__merged__"){
    const label = (mergeSelection||[]).map(selectionLabel).join(" + ") || "Select experiences";
    $("pill").textContent = `Merged CV: ${label}`;
    $("tabSubtitle").textContent = "Combined experience from selected areas";
    return;
  }

  const b = getBranching(activeTabId);
  if(b){
    $("branchTitle").textContent = `${t.label} Branches`;
  }
}
function renderSummary(){
  $("summary").textContent = (getProfile().summary) || "—";
}

function renderHighlights(){
  const wrap = $("highlights");
  wrap.innerHTML = "";
  const clean = (s)=> (s||"").replace(/:/g,"").replace(/\s+/g," ").trim();
  const items = (getHighlights() || [])
    .map(x=>({ text: clean(x.text), baseScore:(x.score||0), jd: scoreText(clean(x.text))}))
    .filter(x=>x.text && x.jd>-9999)
    .sort((a,b)=>(b.jd - a.jd) || (b.baseScore - a.baseScore))
    .slice(0, 12);

  if(!items.length){
    wrap.innerHTML = `<div class="muted">No highlights available yet for this tab (some PDFs may be scanned).</div>`;
    return;
  }
  items.forEach(x=>{
    const div = document.createElement("div");
    div.className = "line" + ((x.jd||0)>0 ? " relevant":"");
    div.innerHTML = `<div>${escapeHtml(x.text)}</div>`;
    wrap.appendChild(div);
  });
}


function renderMergeEditor(){
  const card = $("mergeEditCard");
  const list = $("mergeEditList");
  const btnAuto  = $("btnMergeAutoSort");
  const btnReset = $("btnMergeResetDates");
  if(!card || !list) return;

  if(!(mergeMode && activeTabId==="__merged__")){
    card.style.display = "none";
    return;
  }

  card.style.display = "block";

  // ── Use snapshot directly (DATA.curated["__merged__"]) ────────
  const snapshot = DATA.curated?.["__merged__"];
  if(!snapshot) return;
  const exp = snapshot.experience || [];

  list.innerHTML = "";
  exp.forEach((e, i)=>{
    const row = document.createElement("div");
    row.className = "mergeExpRow";

    const left = document.createElement("div");
    left.innerHTML = `
      <div class="mTitle">${escapeHtml(e.title||"")}${e.company ? " — " + escapeHtml(e.company) : ""}</div>
      <div class="muted mSub">${escapeHtml(e.location||"")}</div>
    `;

    // Date input — edits snapshot directly
    const input = document.createElement("input");
    input.className = "mergeDateInput";
    input.value = e.dates || "";
    input.placeholder = "e.g., Feb 2023 – Present";
    input.addEventListener("input", ()=>{
      e.dates = input.value.trim();
      renderExperience();
    });

    // ↑ ↓ buttons — reorder snapshot array directly
    const btns = document.createElement("div");
    btns.className = "mergeBtns";

    const up = document.createElement("button");
    up.className = "mini";
    up.textContent = "↑";
    up.title = "Move up";
    up.disabled = (i === 0);
    up.onclick = ()=>{
      const arr = snapshot.experience;
      [arr[i-1], arr[i]] = [arr[i], arr[i-1]];
      renderMergeEditor();
      renderExperience();
    };

    const down = document.createElement("button");
    down.className = "mini";
    down.textContent = "↓";
    down.title = "Move down";
    down.disabled = (i === exp.length - 1);
    down.onclick = ()=>{
      const arr = snapshot.experience;
      [arr[i], arr[i+1]] = [arr[i+1], arr[i]];
      renderMergeEditor();
      renderExperience();
    };

    btns.appendChild(up);
    btns.appendChild(down);
    row.appendChild(left);
    row.appendChild(input);
    row.appendChild(btns);
    list.appendChild(row);
  });

  // Auto sort by date
  if(btnAuto){
    btnAuto.onclick = ()=>{
      if(!snapshot.experience) return;
      snapshot.experience.sort((a, b)=>{
        const ra = parseDateRange(a.dates);
        const rb = parseDateRange(b.dates);
        return (rb.end - ra.end) || (rb.start - ra.start);
      });
      renderMergeEditor();
      renderExperience();
    };
  }

  // Reset — restore from source tabs
  if(btnReset){
    btnReset.onclick = ()=>{
      if(confirm("إعادة بناء الترتيب من التابات الأصلية؟")){
        const fresh = buildMergedModel();
        snapshot.experience = JSON.parse(JSON.stringify(fresh.experience || []));
        renderMergeEditor();
        renderExperience();
      }
    };
  }
}

function renderExperience(){
  const wrap = $("experience");
  wrap.innerHTML = "";
  const exp = (getProfile().experience) || [];
  if(!exp.length){
    wrap.innerHTML = `<div class="muted">No curated experience blocks for this tab yet.</div>`;
    return;
  }
  const scored = exp.map(e=>{
    const blob = [e.title,e.company,e.location,(e.bullets||[]).join(" "), (e.keywords||[]).join(" ")].join(" ");
    return { e, jd: scoreText(blob) };
  }).sort((a,b)=>b.jd-a.jd);

  scored.forEach(({e})=>{
    if(searchTerm){
      const blob = norm([e.title,e.company,(e.bullets||[]).join(" "), (e.keywords||[]).join(" ")].join(" "));
      if(!blob.includes(searchTerm)) return;
    }
    const box = document.createElement("div");
    box.className = "item";
    box.innerHTML = `
      <div class="itemHead">
        <div>
          <div class="itemTitle">${escapeHtml(e.title||"")}</div>
          <div class="itemMeta">${escapeHtml(e.company||"")} • ${escapeHtml(e.location||"")}</div>
        </div>
        <div class="itemMeta">${escapeHtml(e.dates||"")}</div>
      </div>
      <ul>${(e.bullets||[]).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
    `;
    wrap.appendChild(box);
  });
}


function renderLinks(){
  const card = $("linksCard");
  const wrap = $("links");
  if(!card || !wrap) return;
  wrap.innerHTML = "";
  const links = (getProfile().links) || [];
  if(!links.length){ card.style.display="none"; return; }
  card.style.display="block";
  links.forEach(l=>{
    const div = document.createElement("div");
    div.className = "line";
    const label = l.label || l.url || "Link";
    div.innerHTML = `<a href="${escapeHtml(l.url||"#")}" target="_blank" rel="noopener">${escapeHtml(label)}</a>`;
    wrap.appendChild(div);
  });
}

function renderProjects(){
  const card = $("projectsCard");
  if(mergeMode && activeTabId==='__merged__'){
    const wrap = $("projects");
    if(!card || !wrap) return;
    const snapshot = DATA.curated?.["__merged__"];
    const projs = snapshot?.projects || [];
    // Always show card so user can add projects
    card.style.display = "block";
    wrap.innerHTML = "";
    if(!projs.length){
      wrap.innerHTML = `<div class="muted">لا توجد مشاريع — استخدم ＋ لإضافة مشروع</div>`;
    } else {
      projs.forEach((p)=>{
        if(searchTerm){ const blob = norm([p.name,p.summary,(p.bullets||[]).join(" "),(p.keywords||[]).join(" ")].join(" ")); if(!blob.includes(searchTerm)) return; }
        const box = document.createElement("div");
        box.className = "item";
        box.__cvProject = p;
        const link = p.url ? `<div class="muted"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Open link</a></div>` : "";
        box.innerHTML = `<div class="itemTitle">${escapeHtml(p.name||"")}</div><div class="itemMeta">${escapeHtml(p.summary||"")}</div>${link}<ul>${(p.bullets||[]).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>`;
        wrap.appendChild(box);
      });
    }
    return;
  }

  const wrap = $("projects");
  wrap.innerHTML = "";

  const hasBranches = !!getBranching(activeTabId);
  const projs = (DATA.projects||[]).filter(p => 
    (p.tab_ids||[]).includes(activeTabId) && (
      !hasBranches || !p.branch_ids || !p.branch_ids.length || p.branch_ids.includes(activeBranchId)
    )
  );

  if(!projs.length){ card.style.display="none"; return; }
  card.style.display="block";

  const scored = projs.map(p=>{
    const blob = [p.name,p.summary,(p.bullets||[]).join(" "),(p.keywords||[]).join(" ")].join(" ");
    return { p, jd: scoreText(blob) };
  }).sort((a,b)=>b.jd-a.jd);

  scored.forEach(({p})=>{
    if(searchTerm){
      const blob = norm([p.name,p.summary,(p.bullets||[]).join(" "), (p.keywords||[]).join(" ")].join(" "));
      if(!blob.includes(searchTerm)) return;
    }
    const box = document.createElement("div");
    box.className = "item";
    box.__cvProject = p; // ← store reference for cv_editor.js
    const link = p.url ? `<div class="muted"><a href="${escapeHtml(p.url)}" target="_blank" rel="noopener">Open link</a></div>` : "";
    box.innerHTML = `
      <div class="itemTitle">${escapeHtml(p.name||"")}</div>
      <div class="itemMeta">${escapeHtml(p.summary||"")}</div>
      ${link}
      <ul>${(p.bullets||[]).map(b=>`<li>${escapeHtml(b)}</li>`).join("")}</ul>
    `;
    wrap.appendChild(box);
  });
}

function renderSkills(){
  const wrap = $("skills");
  wrap.innerHTML = "";
  const skills = (getProfile().skills) || [];
  const filtered = skills.filter(s=>!searchTerm || norm(s).includes(searchTerm));
  filtered.forEach(s=>{
    const chip = document.createElement("span");
    chip.textContent = s;
    wrap.appendChild(chip);
  });
}

function renderCerts(){
  const card = $("certsCard");
  const wrap = $("certs");
  wrap.innerHTML = "";
  const certs = (getProfile().certs) || [];
  if(!certs.length){ card.style.display="none"; return; }
  card.style.display="block";

  certs.forEach(c=>{
    const blob = norm((c.name||"")+" "+(c.issuer||""));
    if(searchTerm && !blob.includes(searchTerm)) return;
    const div = document.createElement("div");
    div.className = "line";
    const meta = [c.issuer||"", c.date||"", c.hours||""].filter(Boolean).join(" • ");
    div.innerHTML = `<b>${escapeHtml(c.name||"")}</b>` + (meta ? `<div class="muted">${escapeHtml(meta)}</div>` : "");
    wrap.appendChild(div);
  });
}

function renderEducation(){
  const wrap = $("education");
  wrap.innerHTML = "";
  (DATA.education||[]).forEach(ed=>{
    const div = document.createElement("div");
    div.className = "line";
    div.innerHTML = `<b>${escapeHtml(ed.school||"")}</b>
      <div class="muted">${escapeHtml(ed.degree||"")} — ${escapeHtml(ed.major||"")} (${escapeHtml(ed.year||"")})</div>
      ${ed.note ? `<div class="muted">${escapeHtml(ed.note)}</div>` : ""}`;
    wrap.appendChild(div);
  });
}


function renderCertGallery(){
  const card = $("certGalleryCard");
  const wrap = $("certGallery");
  if(!card || !wrap) return;
  const imgs = (getProfile().cert_images) || [];
  if(!imgs.length){ card.style.display="none"; return; }
  card.style.display="block";
  wrap.innerHTML = "";
  imgs.forEach(it=>{
    const d = document.createElement("div");
    d.className = "gItem";
    d.innerHTML = `<img src="${escapeHtml(it.src)}" alt="cert"/><div class="cap">${escapeHtml(it.title||"")}</div>`;
    wrap.appendChild(d);
  });
}

function renderAll(){
  renderHeader();
  renderSummary();
  renderHighlights();
  renderMergeEditor();
  renderExperience();
  renderProjects();
  renderLinks();
  renderSkills();
  renderCerts();
  renderCertGallery();
  renderEducation();
}

function init(){
  if(!(DATA.tabs||[]).some(t=>t.id===activeTabId)) activeTabId = DATA.tabs?.[0]?.id || "electrical";
  renderDocStatus();
  renderTabs();
  renderBranches();
  renderAll();

  $("btnTailor").onclick = ()=>{ jdTokens = tokenize($("jd").value||""); renderAll(); };
  $("btnClear").onclick = ()=>{ $("jd").value=""; jdTokens=new Set(); renderAll(); };
  $("search").addEventListener("input",(e)=>{ searchTerm = norm(e.target.value); renderAll(); });
  $("btnPrint").onclick = ()=>{ window.print(); };

  const mergeBtn = $("btnMerge");
  const exitMergeBtn = $("btnExitMerge");
  if(mergeBtn) mergeBtn.onclick = ()=> openMergeModal();
  if(exitMergeBtn) exitMergeBtn.onclick = ()=>{
    mergeMode = false;
    activeTabId = (DATA.tabs?.[0]?.id) || activeTabId;
    activeBranchId = null;
    mergeSelection = [];
    mergeExperienceOrder = [];
    mergeDateOverrides = {};
    exitMergeBtn.style.display = "none";
    renderTabs();
    renderBranches();
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const mergeApply = $("btnMergeApply");
  const mergeCancel = $("btnMergeCancel");
  const mergeClose = $("mergeModalClose");
  const mergeBackdrop = $("mergeModalBackdrop");
  if(mergeApply) mergeApply.onclick = applyMerge;
  if(mergeCancel) mergeCancel.onclick = closeMergeModal;
  if(mergeClose) mergeClose.onclick = closeMergeModal;
  if(mergeBackdrop) mergeBackdrop.onclick = closeMergeModal;

  // Modal events
  const closeBtn = $("branchModalClose");
  const backdrop = $("branchModalBackdrop");
  if(closeBtn) closeBtn.onclick = closeBranchModal;
  if(backdrop) backdrop.onclick = closeBranchModal;
  document.addEventListener("keydown",(e)=>{ if(e.key==="Escape"){ closeBranchModal(); closeMergeModal(); } });

  // ── Expose global API for ai_tailor.js ──────────────────────────
  window.__cvApp = {
    getData:      ()       => DATA,
    getActiveTab: ()       => activeTabId,
    setTab:       (tabId)  => { activeTabId = tabId; activeBranchId = null; },
    renderAll,
    renderTabs,
    renderBranches
  };
}
init();
