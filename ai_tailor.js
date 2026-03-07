/**
 * ══════════════════════════════════════════════════════════════
 *  AI CV BUILDER — Powered by Claude
 *  يعمل مباشرة من المتصفح (file:// + https://)
 * ══════════════════════════════════════════════════════════════
 */
(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const STORAGE_KEY = "cv_anthropic_key";

  // ── Load/save API key ─────────────────────────────────────────
  function loadKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch(_) { return ""; }
  }
  function saveKey(k) {
    try { localStorage.setItem(STORAGE_KEY, k); } catch(_) {}
  }

  // ── Build CV context from data.js ─────────────────────────────
  function buildCVContext() {
    if (typeof CV_DATA === "undefined") return "No CV data available.";
    const d = CV_DATA;
    const p = d.person || {};
    let ctx = `CANDIDATE: ${p.name || "Abdelrahman Khater"} | ${p.location || "Amman, Jordan"}\n\n`;

    const curated = d.curated || {};
    for (const tabId of Object.keys(curated)) {
      const tab = curated[tabId];
      ctx += `\n=== ${tabId.toUpperCase()} ===\n`;
      if (tab.summary) ctx += `Summary: ${tab.summary}\n\n`;
      (tab.experience || []).forEach(exp => {
        ctx += `• ${exp.title} @ ${exp.company} (${exp.dates})\n`;
        (exp.bullets || []).slice(0, 4).forEach(b => ctx += `  - ${b}\n`);
      });
      if ((tab.skills || []).length)
        ctx += `\nSkills: ${tab.skills.map(s => s.name || s).join(", ")}\n`;
      (tab.certs || []).slice(0, 6).forEach(c =>
        ctx += `\nCert: ${c.title || c.name}${c.issuer ? " — " + c.issuer : ""}\n`
      );
    }

    (d.education || []).forEach(e =>
      ctx += `\nEducation: ${e.degree || e.title} — ${e.institution || e.school}\n`
    );
    (d.projects || []).slice(0, 5).forEach(p =>
      ctx += `\nProject: ${p.title}: ${(p.description || "").slice(0, 100)}\n`
    );
    return ctx;
  }

  // ── Build prompt ───────────────────────────────────────────────
  function buildPrompt(jd, cvCtx) {
    return `You are an expert CV writer. Analyze this job description and create a perfectly tailored CV.

JOB DESCRIPTION:
${jd}

CANDIDATE CV DATA:
${cvCtx}

INSTRUCTIONS:
1. Analyze the JD: extract required skills, responsibilities, qualifications.
2. Match candidate's experience/skills to JD requirements.
3. Return EXACTLY this format with the two markers:

---ANALYSIS---
(Write in Arabic)
🎯 المتطلبات الرئيسية:
• [list key JD requirements]

✅ ما يتوفر عند المرشح:
• [matching skills/experience found in CV]

⭐ نسبة التطابق: [X]%

💡 نصائح:
• [2-3 tips]

---CV---
[Write complete professional CV in clean HTML with inline styles only. No <html>/<body> tags.
Use: white background, #1a1a2e dark headings, 3px solid #c0392b left border on section titles,
Arial font, clean ATS-friendly layout, A4-ready.
Rewrite every bullet point to mirror the JD language.
Make it complete and professional - no placeholder text.]`;
  }

  // ── Call Claude API ────────────────────────────────────────────
  async function callClaude(apiKey, prompt) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }]
      })
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err?.error?.message || `HTTP ${res.status}`);
    }
    const data = await res.json();
    return data.content?.[0]?.text || "";
  }

  // ── Parse response ─────────────────────────────────────────────
  function parseResponse(text) {
    const aIdx = text.indexOf("---ANALYSIS---");
    const cIdx = text.indexOf("---CV---");
    let analysis = "", cvHtml = "";
    if (aIdx !== -1 && cIdx !== -1) {
      analysis = text.slice(aIdx + 14, cIdx).trim();
      cvHtml   = text.slice(cIdx + 8).trim();
    } else if (cIdx !== -1) {
      cvHtml = text.slice(cIdx + 8).trim();
    } else {
      cvHtml = text.trim();
    }
    cvHtml = cvHtml.replace(/^```html\n?/i, "").replace(/```$/, "").trim();
    return { analysis, cvHtml };
  }

  // ── Render analysis ────────────────────────────────────────────
  function renderAnalysis(text) {
    const panel = $("aiAnalysisPanel");
    if (!panel || !text) return;
    const html = text.split("\n").map(line => {
      line = line.trim();
      if (!line) return "<br>";
      if (line.startsWith("•") || line.startsWith("-"))
        return `<div style="display:flex;gap:6px;margin:3px 0;"><span style="color:#a855f7;">▸</span><span>${line.slice(1).trim()}</span></div>`;
      if (/^[🎯✅⭐💡]/.test(line))
        return `<div style="font-weight:800;color:#c084fc;margin:12px 0 4px;">${line}</div>`;
      return `<div style="margin:2px 0;">${line}</div>`;
    }).join("");
    panel.innerHTML = `<div style="color:rgba(255,255,255,0.8);font-size:12px;line-height:1.7;">${html}</div>`;
  }

  // ── Render CV ──────────────────────────────────────────────────
  function renderCV(cvHtml) {
    const out = $("aiCVOutput");
    if (!out) return;
    out.innerHTML = `<div style="max-width:800px;margin:0 auto;padding:40px 48px;font-family:Arial,sans-serif;">${cvHtml}</div>`;
    const printBtn = $("aiCVPrint");
    if (printBtn) printBtn.style.display = "inline-flex";
  }

  // ── Status ─────────────────────────────────────────────────────
  function setStatus(text, pulsing, color) {
    const dot = $("aiStatusDot"), span = $("aiStatusText");
    if (span) span.textContent = text;
    if (dot) {
      dot.style.background = color || (pulsing ? "#a855f7" : "#3f3f50");
      dot.style.boxShadow  = pulsing ? "0 0 8px #a855f7" : "none";
    }
  }

  function setBtnLoading(loading) {
    const btn = $("aiGenerateBtn");
    if (!btn) return;
    btn.disabled = loading;
    btn.style.opacity = loading ? "0.7" : "1";
    btn.innerHTML = loading
      ? `<span style="display:inline-block;animation:spin 1s linear infinite;">⟳</span> جاري التوليد…`
      : "✨ توليد السيرة الذاتية";
  }

  // ── Main generate ──────────────────────────────────────────────
  async function handleGenerate() {
    const jd     = ($("aiJdInput")?.value || "").trim();
    const apiKey = ($("aiKeyInput")?.value || "").trim();

    if (!jd) {
      const ta = $("aiJdInput");
      if (ta) { ta.style.borderColor = "#f87171"; ta.focus(); setTimeout(() => ta.style.borderColor = "", 2000); }
      return;
    }
    if (!apiKey) {
      const ki = $("aiKeyInput");
      if (ki) {
        ki.style.borderColor = "#f87171"; ki.focus();
        ki.placeholder = "⚠️ مطلوب — أدخل Anthropic API Key";
        setTimeout(() => { ki.style.borderColor = ""; ki.placeholder = "sk-ant-…"; }, 3000);
      }
      return;
    }

    saveKey(apiKey);
    setBtnLoading(true);
    setStatus("⏳ يتم التحليل والتوليد…", true);

    // Loading state
    const out = $("aiCVOutput");
    if (out) out.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;gap:16px;color:#aaa;">
        <div style="font-size:56px;animation:spin 2s linear infinite;">✨</div>
        <div style="font-size:15px;font-weight:700;">Claude يحلل ويكتب…</div>
        <div style="font-size:12px;">15-30 ثانية</div>
      </div>
      <style>@keyframes spin{to{transform:rotate(360deg)}}</style>`;

    const panel = $("aiAnalysisPanel");
    if (panel) panel.innerHTML = `<div style="color:rgba(255,255,255,0.3);text-align:center;padding:20px;">⏳ جاري التحليل…</div>`;

    try {
      const cvCtx = buildCVContext();
      const prompt = buildPrompt(jd, cvCtx);
      const text = await callClaude(apiKey, prompt);
      const { analysis, cvHtml } = parseResponse(text);

      if (analysis) renderAnalysis(analysis);
      if (cvHtml)   renderCV(cvHtml);
      else {
        if (out) out.innerHTML = `<div style="padding:40px;color:#f87171;text-align:center;">
          <div style="font-size:40px;margin-bottom:12px;">⚠️</div>
          <div>لم يتم توليد المحتوى — حاول مرة أخرى</div>
          <pre style="margin-top:16px;font-size:11px;color:#888;white-space:pre-wrap;">${text.slice(0, 300)}</pre>
        </div>`;
      }
      setStatus("✅ تم التوليد بنجاح", false, "#4ade80");
    } catch (err) {
      const msg = err.message || "خطأ غير معروف";
      if (out) out.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:400px;gap:12px;color:#f87171;text-align:center;padding:24px;">
          <div style="font-size:48px;">⚠️</div>
          <div style="font-size:15px;font-weight:700;">حدث خطأ</div>
          <div style="font-size:13px;color:#999;max-width:380px;">${msg}</div>
          ${msg.includes("401") ? '<div style="margin-top:8px;font-size:12px;color:#fbbf24;">🔑 API Key غير صحيح — تأكد من الـ key</div>' : ""}
          ${msg.includes("fetch") ? '<div style="margin-top:8px;font-size:12px;color:#fbbf24;">🌐 تأكد من الاتصال بالإنترنت</div>' : ""}
        </div>`;
      setStatus("⚠️ " + msg, false, "#f87171");
    } finally {
      setBtnLoading(false);
    }
  }

  // ── Print ──────────────────────────────────────────────────────
  function handlePrint() {
    const content = $("aiCVOutput")?.innerHTML || "";
    if (!content) return;
    const win = window.open("", "_blank");
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Tailored CV</title>
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif}
      @page{size:A4;margin:15mm}@media print{body{-webkit-print-color-adjust:exact}}</style>
      </head><body>${content}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }

  // ── Open/close modal ───────────────────────────────────────────
  function openModal() {
    const modal = $("aiCVModal");
    if (!modal) return;
    const jdMain = $("jd");
    const aiJd   = $("aiJdInput");
    if (jdMain?.value.trim() && aiJd) aiJd.value = jdMain.value.trim();
    const ki = $("aiKeyInput");
    if (ki && !ki.value) ki.value = loadKey();
    modal.style.display = "block";
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    const modal = $("aiCVModal");
    if (modal) modal.style.display = "none";
    document.body.style.overflow = "";
  }

  // ── Init ───────────────────────────────────────────────────────
  window.addEventListener("DOMContentLoaded", function () {
    const style = document.createElement("style");
    style.textContent = `
      @keyframes spin { to { transform: rotate(360deg); } }
      #aiGenerateBtn:hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.1)}
      #btnAITailor:hover{transform:translateY(-1px);filter:brightness(1.15)}
    `;
    document.head.appendChild(style);

    $("btnAITailor")  ?.addEventListener("click", openModal);
    $("aiCVClose")    ?.addEventListener("click", closeModal);
    $("aiCVPrint")    ?.addEventListener("click", handlePrint);
    $("aiGenerateBtn")?.addEventListener("click", handleGenerate);
    $("aiCVModal")    ?.addEventListener("click", e => { if (e.target === $("aiCVModal")) closeModal(); });
    document.addEventListener("keydown", e => { if (e.key === "Escape") closeModal(); });
    $("aiJdInput")?.addEventListener("keydown", e => { if ((e.ctrlKey||e.metaKey) && e.key === "Enter") handleGenerate(); });

    // Show/hide key
    $("aiKeyToggle")?.addEventListener("click", () => {
      const ki = $("aiKeyInput");
      if (!ki) return;
      ki.type = ki.type === "password" ? "text" : "password";
      $("aiKeyToggle").textContent = ki.type === "password" ? "👁" : "🙈";
    });
  });
})();
