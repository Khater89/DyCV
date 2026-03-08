/**
 * ══════════════════════════════════════════════════════════════
 *  CV EDITOR — Inline editing for all CV fields
 *  يتيح تعديل جميع حقول الـ CV مباشرة بالضغط عليها
 *
 *  المميزات:
 *  • تعديل النص بالضغط المزدوج (double-click)
 *  • حذف أي عنصر بزر ✕
 *  • إضافة خبرة جديدة / مهارة / شهادة / bullet
 *  • حذف أو تعديل أي bullet داخل الخبرة
 *  • حفظ تلقائي في DATA
 *  • re-render بعد كل تعديل
 * ══════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  // ── CSS injection ────────────────────────────────────────────
  const STYLE = `
    /* Edit mode indicator */
    .cv-edit-mode .item,
    .cv-edit-mode .chips span,
    .cv-edit-mode .line,
    .cv-edit-mode .para,
    .cv-edit-mode #name,
    .cv-edit-mode #contact,
    .cv-edit-mode #headline {
      cursor: text;
      outline: 1.5px dashed transparent;
      border-radius: 4px;
      transition: outline-color .15s;
    }
    .cv-edit-mode .item:hover          { outline-color: rgba(192,57,43,.3); }
    .cv-edit-mode .chips span:hover    { outline-color: rgba(192,57,43,.5); }
    .cv-edit-mode .line:hover          { outline-color: rgba(192,57,43,.3); }
    .cv-edit-mode .para:hover          { outline-color: rgba(192,57,43,.3); }
    .cv-edit-mode #name:hover,
    .cv-edit-mode #contact:hover,
    .cv-edit-mode #headline:hover      { outline-color: rgba(192,57,43,.4); }

    /* Delete button on items */
    .cv-del-btn {
      display: none;
      position: absolute;
      top: 6px; right: 6px;
      width: 22px; height: 22px;
      border-radius: 50%;
      border: none;
      background: #fee2e2;
      color: #c0392b;
      font-size: 14px;
      font-weight: 900;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      line-height: 1;
      z-index: 10;
      transition: background .15s;
    }
    .cv-del-btn:hover { background: #c0392b; color: #fff; }
    .cv-edit-mode .item:hover .cv-del-btn,
    .cv-edit-mode .chips span:hover .cv-del-btn { display: flex; }

    /* Add buttons */
    .cv-add-btn {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 5px 12px;
      border: 1.5px dashed rgba(192,57,43,.4);
      border-radius: 8px;
      background: none;
      color: rgba(192,57,43,.7);
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      margin-top: 8px;
      transition: all .15s;
    }
    .cv-add-btn:hover { border-color: #c0392b; color: #c0392b; background: rgba(192,57,43,.04); }

    /* Edit toolbar toggle */
    #cvEditToggle {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 7px 14px;
      border-radius: 10px;
      border: 1.5px solid #ddd;
      background: #fff;
      color: #555;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all .18s;
    }
    #cvEditToggle.active {
      border-color: #c0392b;
      background: #c0392b;
      color: #fff;
    }

    /* Inline textarea editor */
    .cv-inline-editor {
      width: 100%;
      background: rgba(192,57,43,.04);
      border: 1.5px solid rgba(192,57,43,.4);
      border-radius: 6px;
      padding: 6px 8px;
      font-size: inherit;
      font-family: inherit;
      color: inherit;
      line-height: inherit;
      resize: vertical;
      outline: none;
      min-height: 2em;
      box-sizing: border-box;
    }
    .cv-inline-editor:focus { border-color: #c0392b; box-shadow: 0 0 0 3px rgba(192,57,43,.1); }

    /* Bullet edit row */
    .cv-bullet-row {
      display: flex;
      align-items: flex-start;
      gap: 4px;
      margin: 3px 0;
    }
    .cv-bullet-del {
      flex-shrink: 0;
      width: 18px; height: 18px;
      border-radius: 50%;
      border: none;
      background: #fee2e2;
      color: #c0392b;
      font-size: 11px;
      font-weight: 900;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-top: 2px;
      transition: background .12s;
    }
    .cv-bullet-del:hover { background: #c0392b; color: #fff; }

    /* Experience form */
    .cv-exp-form {
      background: #fff9f9;
      border: 1.5px solid rgba(192,57,43,.25);
      border-radius: 14px;
      padding: 16px;
      margin-top: 12px;
    }
    .cv-exp-form input, .cv-exp-form textarea {
      width: 100%;
      border: 1.5px solid #eee;
      border-radius: 8px;
      padding: 7px 10px;
      font-size: 13px;
      font-family: inherit;
      margin-bottom: 8px;
      outline: none;
      box-sizing: border-box;
    }
    .cv-exp-form input:focus, .cv-exp-form textarea:focus {
      border-color: #c0392b;
    }
    .cv-exp-form label { font-size: 11px; font-weight: 700; color: #888; display: block; margin-bottom: 3px; }
    .cv-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }

    /* Chip relative for delete button */
    .chips span { position: relative !important; }

    /* Edit mode banner */
    #cvEditBanner {
      display: none;
      background: linear-gradient(135deg, #fff5f5, #fff);
      border-bottom: 2px solid rgba(192,57,43,.2);
      padding: 8px 20px;
      font-size: 12px;
      color: #c0392b;
      font-weight: 700;
      align-items: center;
      gap: 8px;
    }
    #cvEditBanner.visible { display: flex; }
  `;

  // ── Helpers ──────────────────────────────────────────────────
  const $ = id => document.getElementById(id);
  let editMode = false;

  function getApp() { return window.__cvApp || null; }
  function getData() { return getApp()?.getData() || window.CV_DATA || null; }
  function getProfile() {
    const app = getApp(); if (!app) return null;
    const DATA = getData();
    const tabId = app.getActiveTab();
    if (!DATA?.curated?.[tabId]) return null;
    return DATA.curated[tabId];
  }
  function rerender() {
    const app = getApp();
    if (!app) return;
    try { app.renderAll(); } catch(e) { console.error(e); }
  }

  // ── Make element inline-editable ────────────────────────────
  function makeEditable(el, onSave) {
    if (!editMode) return;
    el.addEventListener("dblclick", function startEdit(e) {
      if (!editMode) return;
      e.stopPropagation();
      if (el.querySelector(".cv-inline-editor")) return; // already editing

      const current = el.innerText || el.textContent || "";
      const ta = document.createElement("textarea");
      ta.className = "cv-inline-editor";
      ta.value = current;
      ta.rows = Math.max(1, Math.ceil(current.length / 60));

      // Save original content
      const orig = el.innerHTML;
      el.innerHTML = "";
      el.appendChild(ta);
      ta.focus();
      ta.select();

      function save() {
        const val = ta.value.trim();
        el.innerHTML = orig; // restore
        if (val && val !== current) {
          onSave(val);
        }
      }

      ta.addEventListener("blur",  save);
      ta.addEventListener("keydown", ev => {
        if (ev.key === "Enter" && !ev.shiftKey) { ev.preventDefault(); save(); }
        if (ev.key === "Escape") { el.innerHTML = orig; }
      });
    });
  }

  // ── Add delete button to element ────────────────────────────
  function addDelBtn(parent, onDelete) {
    const btn = document.createElement("button");
    btn.className = "cv-del-btn";
    btn.innerHTML = "✕";
    btn.title = "حذف";
    btn.addEventListener("click", e => {
      e.stopPropagation();
      if (confirm("حذف هذا العنصر؟")) {
        onDelete();
        rerender();
        refreshEditor();
      }
    });
    parent.style.position = "relative";
    parent.appendChild(btn);
  }

  // ── Re-apply editor after renderAll ─────────────────────────
  function refreshEditor() {
    if (!editMode) return;
    setTimeout(attachEditHandlers, 50);
  }

  // ═══════════════════════════════════════════════════════════
  //  ATTACH ALL EDIT HANDLERS
  // ═══════════════════════════════════════════════════════════
  function attachEditHandlers() {
    const DATA    = getData();
    const app     = getApp();
    if (!DATA || !app) return;

    const tabId   = app.getActiveTab();
    const profile = DATA.curated?.[tabId];
    if (!profile) return;

    // ── 1. NAME ────────────────────────────────────────────────
    const nameEl = $("name");
    if (nameEl && !nameEl.dataset.cvEditable) {
      nameEl.dataset.cvEditable = "1";
      nameEl.title = "دبل-كليك للتعديل";
      makeEditable(nameEl, val => { if (DATA.person) DATA.person.name = val; rerender(); refreshEditor(); });
    }

    // ── 2. CONTACT ─────────────────────────────────────────────
    const contactEl = $("contact");
    if (contactEl && !contactEl.dataset.cvEditable) {
      contactEl.dataset.cvEditable = "1";
      contactEl.title = "دبل-كليك لتعديل الموقع";
      contactEl.addEventListener("dblclick", e => {
        if (!editMode) return;
        const loc = prompt("الموقع:", DATA.person?.location || "");
        if (loc !== null) { if (!DATA.person) DATA.person = {}; DATA.person.location = loc; rerender(); refreshEditor(); }
      });
    }

    // ── 3. HEADLINE ────────────────────────────────────────────
    const headlineEl = $("headline");
    if (headlineEl && !headlineEl.dataset.cvEditable) {
      headlineEl.dataset.cvEditable = "1";
      headlineEl.title = "دبل-كليك لتعديل العنوان";
      makeEditable(headlineEl, val => { if (!DATA.header) DATA.header = {}; DATA.header.headline = val; rerender(); refreshEditor(); });
    }

    // ── 4. SUMMARY ─────────────────────────────────────────────
    const summaryEl = $("summary");
    if (summaryEl && !summaryEl.dataset.cvEditable) {
      summaryEl.dataset.cvEditable = "1";
      summaryEl.title = "دبل-كليك لتعديل الملخص";
      makeEditable(summaryEl, val => { profile.summary = val; rerender(); refreshEditor(); });
    }

    // ── 5. SKILLS ──────────────────────────────────────────────
    const skillsWrap = $("skills");
    if (skillsWrap) {
      // Add delete + edit to each chip
      skillsWrap.querySelectorAll("span").forEach((chip, i) => {
        if (chip.dataset.cvEditable) return;
        chip.dataset.cvEditable = "1";
        chip.title = "دبل-كليك لتعديل · X للحذف";

        // Delete btn
        const del = document.createElement("button");
        del.style.cssText = "display:none;position:absolute;top:-5px;right:-5px;width:16px;height:16px;border-radius:50%;border:none;background:#c0392b;color:#fff;font-size:10px;font-weight:900;cursor:pointer;z-index:10;align-items:center;justify-content:center;line-height:1;padding:0;";
        del.innerHTML = "✕";
        del.className = "cv-del-btn";
        del.addEventListener("click", e => {
          e.stopPropagation();
          const skills = profile.skills || [];
          profile.skills = skills.filter((_, idx) => idx !== i);
          rerender(); refreshEditor();
        });
        chip.style.position = "relative";
        chip.appendChild(del);

        // Edit on double click
        chip.addEventListener("dblclick", ev => {
          if (!editMode) return;
          ev.stopPropagation();
          const skills = profile.skills || [];
          const newVal = prompt("تعديل المهارة:", skills[i] || "");
          if (newVal !== null && newVal.trim()) {
            profile.skills[i] = newVal.trim();
            rerender(); refreshEditor();
          }
        });
      });

      // Add skill button
      if (!$("cvAddSkillBtn")) {
        const addBtn = document.createElement("button");
        addBtn.id = "cvAddSkillBtn";
        addBtn.className = "cv-add-btn";
        addBtn.innerHTML = "＋ مهارة";
        addBtn.addEventListener("click", () => {
          if (!editMode) return;
          const val = prompt("اسم المهارة الجديدة:");
          if (val?.trim()) {
            if (!profile.skills) profile.skills = [];
            profile.skills.unshift(val.trim());
            rerender(); refreshEditor();
          }
        });
        skillsWrap.parentElement?.appendChild(addBtn);
      }
    }

    // ── 6. EXPERIENCE ──────────────────────────────────────────
    const expWrap = $("experience");
    if (expWrap) {
      const expItems = expWrap.querySelectorAll(".item");
      const expData  = profile.experience || [];

      expItems.forEach((box, i) => {
        if (box.dataset.cvEditable) return;
        box.dataset.cvEditable = "1";

        const expEntry = expData[i];
        if (!expEntry) return;

        // Delete whole experience entry
        const delBtn = document.createElement("button");
        delBtn.className = "cv-del-btn";
        delBtn.innerHTML = "✕";
        delBtn.title = "حذف هذه الخبرة";
        delBtn.addEventListener("click", e => {
          e.stopPropagation();
          if (confirm(`حذف "${expEntry.title}" ؟`)) {
            profile.experience = expData.filter((_, idx) => idx !== i);
            rerender(); refreshEditor();
          }
        });
        box.style.position = "relative";
        box.appendChild(delBtn);

        // Edit title
        const titleEl = box.querySelector(".itemTitle");
        if (titleEl) {
          titleEl.title = "دبل-كليك لتعديل المسمى";
          makeEditable(titleEl, val => { expEntry.title = val; rerender(); refreshEditor(); });
        }

        // Edit company/location meta
        const metaEl = box.querySelector(".itemMeta");
        if (metaEl) {
          metaEl.title = "دبل-كليك لتعديل الشركة والموقع";
          metaEl.addEventListener("dblclick", ev => {
            if (!editMode) return;
            ev.stopPropagation();
            const company  = prompt("الشركة:", expEntry.company || "");
            if (company === null) return;
            const location = prompt("الموقع:", expEntry.location || "");
            if (location === null) return;
            const dates    = prompt("التواريخ:", expEntry.dates || "");
            if (dates === null) return;
            expEntry.company  = company;
            expEntry.location = location;
            expEntry.dates    = dates;
            rerender(); refreshEditor();
          });
        }

        // Edit bullets
        const bullets = expEntry.bullets || [];
        const ulEl    = box.querySelector("ul");
        if (ulEl) {
          ulEl.querySelectorAll("li").forEach((li, bi) => {
            if (li.dataset.cvEditable) return;
            li.dataset.cvEditable = "1";
            li.style.position = "relative";
            li.style.paddingRight = "22px";
            li.title = "دبل-كليك لتعديل";

            // Delete bullet
            const bdel = document.createElement("button");
            bdel.style.cssText = "display:none;position:absolute;right:0;top:2px;width:16px;height:16px;border-radius:50%;border:none;background:#fee2e2;color:#c0392b;font-size:10px;font-weight:900;cursor:pointer;z-index:10;";
            bdel.innerHTML = "✕";
            bdel.className = "cv-del-btn";
            bdel.addEventListener("click", e => {
              e.stopPropagation();
              expEntry.bullets = bullets.filter((_, idx) => idx !== bi);
              rerender(); refreshEditor();
            });
            li.appendChild(bdel);

            // Edit bullet text
            makeEditable(li, val => {
              expEntry.bullets[bi] = val;
              rerender(); refreshEditor();
            });
          });

          // Add bullet button
          if (!ulEl.nextElementSibling?.classList?.contains("cv-add-btn")) {
            const addBulletBtn = document.createElement("button");
            addBulletBtn.className = "cv-add-btn";
            addBulletBtn.innerHTML = "＋ إضافة نقطة";
            addBulletBtn.style.marginTop = "6px";
            addBulletBtn.addEventListener("click", () => {
              if (!editMode) return;
              const val = prompt("النقطة الجديدة:");
              if (val?.trim()) {
                if (!expEntry.bullets) expEntry.bullets = [];
                expEntry.bullets.push(val.trim());
                rerender(); refreshEditor();
              }
            });
            ulEl.parentElement?.insertBefore(addBulletBtn, ulEl.nextSibling);
          }
        }
      });

      // Add new experience button
      if (!$("cvAddExpBtn")) {
        const addExpBtn = document.createElement("button");
        addExpBtn.id = "cvAddExpBtn";
        addExpBtn.className = "cv-add-btn";
        addExpBtn.innerHTML = "＋ إضافة خبرة جديدة";
        addExpBtn.style.cssText += "width:100%;justify-content:center;margin-top:12px;padding:10px;font-size:13px;";
        addExpBtn.addEventListener("click", () => showAddExpForm(profile));
        expWrap.parentElement?.appendChild(addExpBtn);
      }
    }

    // ── 7. CERTIFICATIONS ──────────────────────────────────────
    const certsWrap = $("certs");
    if (certsWrap) {
      const certsData = profile.certs || [];
      certsWrap.querySelectorAll(".line").forEach((line, i) => {
        if (line.dataset.cvEditable) return;
        line.dataset.cvEditable = "1";
        line.style.position = "relative";
        line.style.paddingRight = "28px";

        const cert = certsData[i];
        if (!cert) return;

        // Delete
        const del = document.createElement("button");
        del.className = "cv-del-btn";
        del.innerHTML = "✕";
        del.title = "حذف الشهادة";
        del.addEventListener("click", e => {
          e.stopPropagation();
          if (confirm(`حذف "${cert.title || cert.name}" ؟`)) {
            profile.certs = certsData.filter((_, idx) => idx !== i);
            rerender(); refreshEditor();
          }
        });
        line.appendChild(del);

        // Edit on dblclick
        line.addEventListener("dblclick", ev => {
          if (!editMode) return;
          ev.stopPropagation();
          const name   = prompt("اسم الشهادة:", cert.title || cert.name || "");
          if (name === null) return;
          const issuer = prompt("الجهة المانحة:", cert.issuer || "");
          if (issuer === null) return;
          const date   = prompt("التاريخ:", cert.date || "");
          if (date === null) return;
          cert.title  = name;
          cert.name   = name;
          cert.issuer = issuer;
          cert.date   = date;
          rerender(); refreshEditor();
        });
      });

      // Add cert button
      if (!$("cvAddCertBtn")) {
        const addCertBtn = document.createElement("button");
        addCertBtn.id = "cvAddCertBtn";
        addCertBtn.className = "cv-add-btn";
        addCertBtn.innerHTML = "＋ إضافة شهادة";
        addCertBtn.addEventListener("click", () => {
          if (!editMode) return;
          const name   = prompt("اسم الشهادة:");
          if (!name?.trim()) return;
          const issuer = prompt("الجهة المانحة (اختياري):");
          const date   = prompt("التاريخ (اختياري):");
          const entry  = { title: name.trim(), name: name.trim(), issuer: issuer?.trim() || "", date: date?.trim() || "" };
          if (!profile.certs) profile.certs = [];
          profile.certs.push(entry);
          rerender(); refreshEditor();
        });
        certsWrap.parentElement?.appendChild(addCertBtn);
      }
    }

    // ── 7b. PROJECTS ─────────────────────────────────────────────
    const projWrap = $("projects");
    if (projWrap) {
      const app    = getApp();
      const tabId  = app?.getActiveTab();
      const allProjs = DATA.projects || [];

      projWrap.querySelectorAll(".item").forEach((box) => {
        if (box.dataset.cvEditable) return;
        box.dataset.cvEditable = "1";

        // Use the reference stored by renderProjects — no index mismatch
        const proj = box.__cvProject;
        if (!proj) return;

        box.style.position = "relative";

        // ── Delete whole project ──
        const delBtn = document.createElement("button");
        delBtn.className = "cv-del-btn";
        delBtn.innerHTML = "✕";
        delBtn.title = "حذف المشروع";
        delBtn.addEventListener("click", e => {
          e.stopPropagation();
          if (confirm(`حذف "${proj.name}" ؟`)) {
            // Remove this tab from tab_ids (don't fully delete if used elsewhere)
            proj.tab_ids = (proj.tab_ids || []).filter(t => t !== tabId);
            // If no more tabs reference it, remove from array entirely
            if (!proj.tab_ids.length) {
              DATA.projects = allProjs.filter(p => p !== proj);
            }
            rerender(); refreshEditor();
          }
        });
        box.appendChild(delBtn);

        // ── Edit project name ──
        const nameEl = box.querySelector(".itemTitle");
        if (nameEl) {
          nameEl.title = "دبل-كليك لتعديل اسم المشروع";
          makeEditable(nameEl, val => { proj.name = val; rerender(); refreshEditor(); });
        }

        // ── Edit project summary ──
        const metaEl = box.querySelector(".itemMeta");
        if (metaEl) {
          metaEl.title = "دبل-كليك لتعديل وصف المشروع";
          makeEditable(metaEl, val => { proj.summary = val; rerender(); refreshEditor(); });
        }

        // ── Edit bullets ──
        const ulEl = box.querySelector("ul");
        if (ulEl) {
          ulEl.querySelectorAll("li").forEach((li, bi) => {
            if (li.dataset.cvEditable) return;
            li.dataset.cvEditable = "1";
            li.style.position = "relative";
            li.style.paddingRight = "22px";
            li.title = "دبل-كليك لتعديل";

            // Delete bullet
            const bdel = document.createElement("button");
            bdel.style.cssText = "display:none;position:absolute;right:0;top:2px;width:16px;height:16px;border-radius:50%;border:none;background:#fee2e2;color:#c0392b;font-size:10px;font-weight:900;cursor:pointer;z-index:10;";
            bdel.innerHTML = "✕";
            bdel.className = "cv-del-btn";
            bdel.addEventListener("click", e => {
              e.stopPropagation();
              proj.bullets = (proj.bullets || []).filter((_, idx) => idx !== bi);
              rerender(); refreshEditor();
            });
            li.appendChild(bdel);

            makeEditable(li, val => {
              if (!proj.bullets) proj.bullets = [];
              proj.bullets[bi] = val;
              rerender(); refreshEditor();
            });
          });

          // Add bullet
          if (!ulEl.nextElementSibling?.classList?.contains("cv-add-btn")) {
            const addBullet = document.createElement("button");
            addBullet.className = "cv-add-btn";
            addBullet.innerHTML = "＋ إضافة نقطة";
            addBullet.style.marginTop = "6px";
            addBullet.addEventListener("click", () => {
              if (!editMode) return;
              const val = prompt("النقطة الجديدة:");
              if (val?.trim()) {
                if (!proj.bullets) proj.bullets = [];
                proj.bullets.push(val.trim());
                rerender(); refreshEditor();
              }
            });
            ulEl.parentElement?.insertBefore(addBullet, ulEl.nextSibling);
          }
        }
      });

      // ── Add new project button ──
      if (!$("cvAddProjBtn")) {
        const addProjBtn = document.createElement("button");
        addProjBtn.id = "cvAddProjBtn";
        addProjBtn.className = "cv-add-btn";
        addProjBtn.innerHTML = "＋ إضافة مشروع جديد";
        addProjBtn.style.cssText += "width:100%;justify-content:center;margin-top:12px;padding:10px;font-size:13px;";
        addProjBtn.addEventListener("click", () => showAddProjForm(DATA, tabId));
        projWrap.parentElement?.appendChild(addProjBtn);
      }
    }

    // ── 8. EDUCATION ───────────────────────────────────────────
    const eduWrap = $("education");
    if (eduWrap) {
      const eduData = DATA.education || [];
      eduWrap.querySelectorAll(".line").forEach((line, i) => {
        if (line.dataset.cvEditable) return;
        line.dataset.cvEditable = "1";
        const edu = eduData[i];
        if (!edu) return;

        line.style.position = "relative";
        line.style.paddingRight = "28px";
        line.title = "دبل-كليك للتعديل";

        line.addEventListener("dblclick", ev => {
          if (!editMode) return;
          ev.stopPropagation();
          const school = prompt("المدرسة/الجامعة:", edu.school || edu.institution || "");
          if (school === null) return;
          const degree = prompt("الدرجة العلمية:", edu.degree || edu.title || "");
          if (degree === null) return;
          const year   = prompt("السنة:", edu.year || edu.dates || "");
          if (year === null) return;
          edu.school      = school;
          edu.institution = school;
          edu.degree      = degree;
          edu.title       = degree;
          edu.year        = year;
          edu.dates       = year;
          rerender(); refreshEditor();
        });

        // Delete
        const del = document.createElement("button");
        del.className = "cv-del-btn";
        del.innerHTML = "✕";
        del.addEventListener("click", e => {
          e.stopPropagation();
          if (confirm("حذف هذا التعليم؟")) {
            DATA.education = eduData.filter((_, idx) => idx !== i);
            rerender(); refreshEditor();
          }
        });
        line.appendChild(del);
      });
    }
  }

  // ── Add Project Form ────────────────────────────────────────────
  function showAddProjForm(DATA, tabId) {
    const existing = $("cvAddProjForm");
    if (existing) { existing.remove(); return; }

    const projWrap = $("projects");
    if (!projWrap) return;

    const form = document.createElement("div");
    form.id = "cvAddProjForm";
    form.className = "cv-exp-form";
    form.innerHTML = `
      <div style="font-weight:800;font-size:13px;color:#1a1a2e;margin-bottom:12px;">➕ إضافة مشروع جديد</div>
      <label>اسم المشروع *</label>
      <input id="pf_name" placeholder="مثال: Network Monitoring Dashboard" />
      <label>وصف مختصر *</label>
      <input id="pf_summary" placeholder="وصف قصير للمشروع وأهميته" />
      <label>رابط (اختياري)</label>
      <input id="pf_url" placeholder="https://..." />
      <label>النقاط التفصيلية (كل سطر = نقطة)</label>
      <textarea id="pf_bullets" rows="4" placeholder="طوّرت لوحة مراقبة بـ Python وـ Grafana&#10;خفّضت وقت الاستجابة للأحداث بنسبة 40%&#10;..."></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button id="pf_save"   style="padding:8px 18px;border-radius:9px;border:none;background:#c0392b;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">حفظ</button>
        <button id="pf_cancel" style="padding:8px 14px;border-radius:9px;border:1.5px solid #ddd;background:#fff;color:#555;font-size:13px;cursor:pointer;">إلغاء</button>
      </div>
    `;

    projWrap.parentElement?.appendChild(form);

    $("pf_cancel").addEventListener("click", () => form.remove());
    $("pf_save").addEventListener("click", () => {
      const name    = $("pf_name")?.value.trim();
      const summary = $("pf_summary")?.value.trim();
      if (!name || !summary) { alert("الاسم والوصف مطلوبان"); return; }

      const bullets = ($("pf_bullets")?.value || "")
        .split("\n").map(s => s.trim()).filter(Boolean);
      const url = $("pf_url")?.value.trim() || "";

      const entry = {
        name, summary, bullets, url,
        tab_ids: [tabId],
        keywords: []
      };

      if (!DATA.projects) DATA.projects = [];
      DATA.projects.unshift(entry);
      form.remove();
      rerender();
      refreshEditor();
    });
  }

  // ── Add Experience Form ──────────────────────────────────────
  function showAddExpForm(profile) {
    const existing = $("cvAddExpForm");
    if (existing) { existing.remove(); return; }

    const expWrap = $("experience");
    if (!expWrap) return;

    const form = document.createElement("div");
    form.id = "cvAddExpForm";
    form.className = "cv-exp-form";
    form.innerHTML = `
      <div style="font-weight:800;font-size:13px;color:#1a1a2e;margin-bottom:12px;">➕ إضافة خبرة جديدة</div>
      <div class="cv-form-row">
        <div><label>المسمى الوظيفي *</label><input id="ef_title"    placeholder="مثال: Network Engineer" /></div>
        <div><label>الشركة *</label>          <input id="ef_company"  placeholder="مثال: Acuative" /></div>
      </div>
      <div class="cv-form-row">
        <div><label>الموقع</label>            <input id="ef_location" placeholder="مثال: Amman, Jordan" /></div>
        <div><label>التواريخ</label>          <input id="ef_dates"    placeholder="مثال: 2022 – Present" /></div>
      </div>
      <label>المهام / الإنجازات (كل سطر = نقطة)</label>
      <textarea id="ef_bullets" rows="4" placeholder="أدر شبكات LAN/WAN لأكثر من 50 موقع&#10;خفضت أوقات التوقف بنسبة 30%&#10;..."></textarea>
      <div style="display:flex;gap:8px;margin-top:8px;">
        <button id="ef_save"   style="padding:8px 18px;border-radius:9px;border:none;background:#c0392b;color:#fff;font-weight:700;font-size:13px;cursor:pointer;">حفظ</button>
        <button id="ef_cancel" style="padding:8px 14px;border-radius:9px;border:1.5px solid #ddd;background:#fff;color:#555;font-size:13px;cursor:pointer;">إلغاء</button>
      </div>
    `;

    expWrap.parentElement?.appendChild(form);

    $("ef_cancel").addEventListener("click", () => form.remove());
    $("ef_save").addEventListener("click", () => {
      const title    = $("ef_title")?.value.trim();
      const company  = $("ef_company")?.value.trim();
      if (!title || !company) {
        alert("المسمى الوظيفي والشركة مطلوبان");
        return;
      }
      const bullets = ($("ef_bullets")?.value || "")
        .split("\n")
        .map(s => s.trim())
        .filter(Boolean);

      const entry = {
        title,
        company,
        location: $("ef_location")?.value.trim() || "",
        dates:    $("ef_dates")?.value.trim()    || "",
        bullets,
        keywords: []
      };

      if (!profile.experience) profile.experience = [];
      profile.experience.unshift(entry);
      form.remove();
      rerender();
      refreshEditor();
    });
  }

  // ── Toggle edit mode ─────────────────────────────────────────
  function toggleEditMode() {
    editMode = !editMode;
    const main = document.querySelector("main") || document.body;
    const toggleBtn = $("cvEditToggle");
    const banner    = $("cvEditBanner");

    if (editMode) {
      main.classList.add("cv-edit-mode");
      if (toggleBtn) { toggleBtn.classList.add("active"); toggleBtn.innerHTML = "✏️ وضع التعديل: مفعّل"; }
      if (banner)    { banner.classList.add("visible"); }
      attachEditHandlers();
    } else {
      main.classList.remove("cv-edit-mode");
      if (toggleBtn) { toggleBtn.classList.remove("active"); toggleBtn.innerHTML = "✏️ تعديل الـ CV"; }
      if (banner)    { banner.classList.remove("visible"); }
      // Remove all add buttons
      document.querySelectorAll(".cv-add-btn, #cvAddExpForm").forEach(el => el.remove());
      // Clear editable flags so they can be re-attached next time
      document.querySelectorAll("[data-cv-editable]").forEach(el => delete el.dataset.cvEditable);
    }
  }

  // injectToggleBtn removed — wiring is done in DOMContentLoaded directly

  // ── Init ─────────────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", () => {
    // Inject CSS immediately
    const style = document.createElement("style");
    style.textContent = STYLE;
    document.head.appendChild(style);

    // Wire the button IMMEDIATELY — it is already in the HTML
    const btn = $("cvEditToggle");
    if (btn) {
      btn.addEventListener("click", toggleEditMode);
    } else {
      // Fallback: poll until button exists (shouldn't normally happen)
      const btnPoll = setInterval(() => {
        const b = $("cvEditToggle");
        if (b) { b.addEventListener("click", toggleEditMode); clearInterval(btnPoll); }
      }, 50);
    }

    // Inject edit-mode banner (hidden until activated)
    const banner = document.createElement("div");
    banner.id = "cvEditBanner";
    banner.innerHTML = "✏️ وضع التعديل مفعّل — دبل-كليك لتعديل · ✕ للحذف · ＋ للإضافة";
    const cvRoot = $("cvRoot") || document.querySelector(".content");
    if (cvRoot) cvRoot.prepend(banner);

    // Wait for __cvApp then patch renderAll for auto-refresh
    const tryPatch = setInterval(() => {
      if (window.__cvApp) {
        clearInterval(tryPatch);
        const orig = window.__cvApp.renderAll;
        window.__cvApp.renderAll = function() {
          orig.call(this);
          refreshEditor();
        };
      }
    }, 100);
  });

})();
