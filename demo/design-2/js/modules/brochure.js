/* The unit's PDF and slide, built like the client's files: a fixed brand frame (red cover, dark photo pages, paper spec page,
   contacts, thank you) filled from the unit's data, with the photos from its Pic & Info folder (the first photo is the building).
   «pdf»   = the full brochure (cover · building · specs · one interior per page · contacts · thank you)
   «slide» = the short deck (specs + interiors two per page), like slide.pptx. Both open as pages to print / save as PDF,
   and both download as PowerPoint. */
(function () {
  const A = window.APP, esc = A.esc;
  const IMG = { red: "img/brochure/bg-red.jpg", paper: "img/brochure/bg-paper.jpg", dark: "img/brochure/bg-dark.jpg", contacts: "img/brochure/contacts.jpg" };
  const COND = { "متشطب": "Finished", "نص تشطيب": "Semi finished", "Core & Shell": "Core & Shell", Furnished: "Furnished" };
  const dash = (v) => (v == null || v === "" || v === 0 ? "—" : String(v));
  const egp = (n) => (n ? "EGP " + Math.round(n).toLocaleString("en-US") : "—");
  const areaText = (u) => (u.divisible && u.minSplit ? `${A.num(u.minSplit)} SQM Up TO ${A.num(u.space)} SQM` : u.space ? `${A.num(u.space)} SQM` : "—");
  const delivery = (u) => (u.delivery && /^\d{4}-/.test(u.delivery) ? new Date(u.delivery).toLocaleDateString("en-GB", { month: "short", year: "numeric" }) : dash(u.delivery));

  // the spec table: [label, value, highlight] — «area» = grey row with red text, «rate» = red row (as in the client's slide)
  function rows(u) {
    const ic = A.incomeCalc(u), b = ["Building", dash(u.project)], area = ["Gross area", areaText(u), "area"], cond = ["Hand over Condition", dash(COND[u.condition] || u.condition)];
    const park = ["Parking slots", u.parking ? String(u.parking) : "—"], comm = ["Commission", dash(u.commission)];
    if (u.type === "Resale") return [b, ["Delivery date", delivery(u)], area, cond, ["Price per meter", egp(u.pricePerSqm), "rate"], ["Total price", egp(A.unitTotal(u))], ["Maintenance", dash(u.maintenance)], park, ["Payment", dash(u.payment)], comm];
    if (u.type === "Income") return [b, area, ["Sale price per meter", egp(u.salePerSqm), "rate"], ["Total price", egp(ic.sale)], ["Monthly rent", egp(ic.monthly)], ["Annual rent", egp(ic.annual)], ["Yield", ic.sale ? ic.yieldPct.toFixed(1) + "%" : "—"], ["Tenant", dash(u.tenant)], ["Contract", u.contractYears ? u.contractYears + " years" : "—"], ["Annual increase", u.escalation ? u.escalation + "%" : "—"], ["Payment", dash(u.payment)], comm];
    return [b, ["Delivery date", delivery(u)], area, cond, ["Rent rate per meter", egp(u.pricePerSqm), "rate"], ["Maintenance", dash(u.maintenance)], park, ["Upfront rent", dash(u.upfront)], ["Security deposit", dash(u.security)], ["Payment", dash(u.payment)], ["Term", dash(u.term)], ["Grace period", dash(u.grace)], ["Annual increase", u.escalation ? u.escalation + "%" : "—"], comm];
  }
  const headline = (u) => (u.type === "Rent" ? "NEW OFFICE AVAILABLE FOR LEASING" : u.type === "Resale" ? "NEW OFFICE AVAILABLE FOR SALE" : "INCOME PROPERTY FOR SALE");

  // the deck as a list of pages; each page = what both the HTML and the PowerPoint draw
  async function pages(u, mode) {
    const pics = (await A.unitFiles(u.code)).filter((f) => /^image\//.test(f.type)).map((f) => f.url), [front, ...inside] = pics, P = [];
    const spec = { bg: "paper", photo: [front, 3.3, 19, 44.2, 45.4], table: rows(u) };
    if (mode === "pdf") {
      P.push({ bg: "red", cover: { title: headline(u), area: areaText(u).toUpperCase(), building: "BUILDING NAME : " + String(u.project || "—").toUpperCase(), code: "CODE:" + u.code } });
      P.push({ bg: "dark", photo: [front, 2.5, 4, 95, 84] });
      P.push(spec);
      (inside.length ? inside : [null]).forEach((src) => P.push({ bg: "dark", photo: [src, 2.5, 4, 95, 84] }));
      P.push({ bg: "contacts" }, { bg: "red", thanks: true });
    } else {
      P.push(spec);
      const two = inside.length ? inside : [null, null];
      for (let i = 0; i < two.length; i += 2) P.push({ bg: "paper", title: "Interior picture", photos: [[two[i], 3.1, 20.4, 44.4, 44.4], [two[i + 1], 51.2, 20.4, 44.4, 44.4]].filter((x, k) => k === 0 || x[0] !== undefined) });
    }
    return P;
  }

  /* ---------- HTML (print / save as PDF) ---------- */
  const box = ([src, x, y, w, h]) => `<div class="b-ph" style="left:${x}%;top:${y}%;width:${w}%;height:${h}%">${src ? `<img src="${src}" alt="">` : `<span>Photos coming soon</span>`}</div>`;
  const pageHtml = (p) => `<section class="b-pg" style="background-image:url('${IMG[p.bg]}')">
    ${p.cover ? `<div class="b-cover"><h1>${esc(p.cover.title)}</h1><h2>${esc(p.cover.area)}</h2><div class="b-meta"><span>${esc(p.cover.building)}</span><span>${esc(p.cover.code)}</span></div></div>` : ""}
    ${p.photo ? box(p.photo) : ""}${(p.photos || []).map(box).join("")}
    ${p.title ? `<h3 class="b-title">${esc(p.title)}</h3>` : ""}
    ${p.table ? `<table class="b-tbl">${p.table.map(([l, v, hl]) => `<tr class="${hl || ""}"><td>${esc(l)}</td><td>${esc(v)}</td></tr>`).join("")}</table>` : ""}
    ${p.thanks ? `<div class="b-thanks">Thank you</div><div class="b-site">Places-egy.com</div><p class="b-disc">This presentation is for information only and does not form an offer or a contract. Areas, prices and terms are as provided by the owner on the date of issue and may change without notice.</p>` : ""}
  </section>`;
  const CSS = `.b-pg{position:relative;width:1280px;height:720px;background-size:cover;background-position:center;overflow:hidden;font-family:Arimo,Arial,sans-serif;color:#fff;break-after:page;page-break-after:always;direction:ltr;text-align:left}
    .b-cover{position:absolute;left:1.9%;top:5.3%;right:4%}.b-cover h1{font:700 54px/1.02 Arimo,Arial,sans-serif;margin:0;max-width:640px}.b-cover h2{font:700 44px/1.1 Arimo,Arial,sans-serif;margin:6px 0 0}
    .b-meta{position:absolute;top:255px;left:0;right:8%;display:flex;justify-content:space-between;font:700 18px Arimo,Arial,sans-serif}
    .b-ph{position:absolute;overflow:hidden;background:rgba(0,0,0,.12);display:flex;align-items:center;justify-content:center}.b-ph img{width:100%;height:100%;object-fit:cover;display:block}.b-ph span{font:italic 20px Tinos,'Times New Roman',serif;color:#8a8579}
    .b-tbl{position:absolute;left:50%;top:5.5%;width:47.5%;border-collapse:collapse;font:22px/1.2 Tinos,'Times New Roman',serif;color:#1d1d1b}
    .b-tbl td{border:1.5px solid #9b9b9b;padding:0 14px;height:35px;background:rgba(232,229,224,.55)}.b-tbl td:first-child{width:50%}
    .b-tbl tr:nth-child(even) td{background:rgba(160,160,160,.5)}
    .b-tbl tr.area td{background:#a7a7a7!important;color:#e5372b;font-weight:700}.b-tbl tr.rate td{background:#ee3a4f!important;color:#fff;font-weight:700}
    .b-title{position:absolute;left:37.5%;top:4.6%;width:25%;margin:0;text-align:center;font:400 34px Tinos,'Times New Roman',serif;color:#1d1d1b}
    .b-thanks{position:absolute;left:1.8%;top:3.5%;font:60px 'Book Antiqua',Palatino,'Palatino Linotype',Tinos,serif}
    .b-site{position:absolute;left:49.4%;top:80.4%;font:20px 'Book Antiqua',Palatino,Tinos,serif}.b-disc{position:absolute;left:49.4%;top:86.2%;width:46%;margin:0;font:8px/1.3 'Book Antiqua',Palatino,Tinos,serif;opacity:.9}`;

  A.ACT.unitDeck = async (d) => {
    const u = A.S.units.find((x) => x.code === d.code), P = await pages(u, d.mode), w = window.open("", "_blank");
    if (!w) return A.toast("المتصفح منع فتح الصفحة · اسمح بالـ popups");
    const title = d.mode === "pdf" ? `(${u.code}) ${u.project} ${areaText(u)}` : `${u.code} slide`;
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><base href="${location.href.replace(/[#?].*$/, "").replace(/[^/]*$/, "")}"><title>${esc(title)}</title>
      <link href="https://fonts.googleapis.com/css2?family=Arimo:wght@400;700&family=Tinos:ital@0;1&display=swap" rel="stylesheet">
      <style>@page{size:1280px 720px;margin:0}body{margin:0;background:#555}.bar{position:sticky;top:0;z-index:2;display:flex;gap:10px;align-items:center;padding:10px 16px;background:#111;color:#fff;font:14px Arial}
      .bar button{font:600 14px Arial;padding:8px 14px;border:0;border-radius:6px;background:#ee3a4f;color:#fff;cursor:pointer}.wrap{display:grid;gap:16px;justify-content:center;padding:16px}
      @media print{.bar{display:none}.wrap{padding:0;gap:0}body{background:none}}${CSS}</style></head>
      <body><div class="bar"><b>${esc(title)}</b><span style="flex:1"></span><button onclick="print()">Save as PDF</button></div><div class="wrap">${P.map(pageHtml).join("")}</div></body></html>`);
    w.document.close();
    A.audit("inventory", `${u.code}: اتفتح الـ ${d.mode === "pdf" ? "PDF" : "slide"}`);
  };
  // small live preview of the cover / spec page inside the unit page
  A.deckPreview = (u) => `<div class="b-mini" data-deck="${u.code}"></div>`;
  A.deckPreviewFill = async (code) => {
    const el = document.querySelector(`.b-mini[data-deck="${code}"]`); if (!el) return;
    const u = A.S.units.find((x) => x.code === code), P = await pages(u, "pdf");
    el.innerHTML = `<style>${CSS}</style>${[P[0], P[2]].map((p) => `<div class="b-mini-pg">${pageHtml(p)}</div>`).join("")}`;
    el.querySelectorAll(".b-mini-pg").forEach((x) => (x.firstElementChild.style.transform = `scale(${x.clientWidth / 1280})`));
  };

  /* ---------- PowerPoint ---------- */
  let lib;
  const loadLib = () => lib || (lib = new Promise((ok, no) => { const s = document.createElement("script"); s.src = "https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js"; s.onload = () => ok(window.PptxGenJS); s.onerror = () => { lib = null; no(new Error("load")); }; document.head.appendChild(s); }));
  const dataUrl = async (src) => { const b = await (await fetch(src)).blob(); return new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); }); };
  A.ACT.unitDeckPptx = async (d) => {
    const u = A.S.units.find((x) => x.code === d.code);
    let Pptx; try { Pptx = await loadLib(); } catch (e) { return A.toast("مكتبة الـ PowerPoint ماتحمّلتش · اتأكد من النت"); }
    A.toast("بيتعمل الـ PowerPoint…");
    const P = await pages(u, d.mode), X = (v) => (v * 13.333) / 100, Y = (v) => (v * 7.5) / 100, cache = {};
    const img = async (src) => cache[src] || (cache[src] = await dataUrl(src));
    const ppt = new Pptx(); ppt.layout = "LAYOUT_WIDE";
    for (const p of P) {
      const s = ppt.addSlide(); s.background = { data: await img(IMG[p.bg]) };
      const ph = async ([src, x, y, w, h]) => src ? s.addImage({ data: await img(src), x: X(x), y: Y(y), w: X(w), h: Y(h), sizing: { type: "cover", w: X(w), h: Y(h) } }) : s.addText("Photos coming soon", { x: X(x), y: Y(y), w: X(w), h: Y(h), align: "center", fontFace: "Times New Roman", italic: true, color: "8A8579", fill: { color: "E8E5E0" } });
      if (p.cover) {
        s.addText([{ text: p.cover.title, options: { fontSize: 54, breakLine: true } }, { text: p.cover.area, options: { fontSize: 44 } }], { x: X(1.9), y: Y(5.3), w: X(55), h: Y(44), fontFace: "Arial", bold: true, color: "FFFFFF", valign: "top", lineSpacingMultiple: 0.9 });
        s.addText(p.cover.building, { x: X(1.9), y: Y(52), w: X(50), h: Y(6), fontFace: "Arial", bold: true, fontSize: 18, color: "FFFFFF" });
        s.addText(p.cover.code, { x: X(55), y: Y(52), w: X(35), h: Y(6), fontFace: "Arial", bold: true, fontSize: 18, color: "FFFFFF" });
      }
      if (p.photo) await ph(p.photo);
      for (const x of p.photos || []) await ph(x);
      if (p.title) s.addText(p.title, { x: X(37.5), y: Y(4.6), w: X(25), h: Y(7.6), align: "center", fontFace: "Times New Roman", fontSize: 28, color: "1D1D1B" });
      if (p.table) s.addTable(p.table.map(([l, v, hl], i) => [l, v].map((t) => ({ text: t, options: { bold: !!hl, color: hl === "rate" ? "FFFFFF" : hl === "area" ? "E5372B" : "1D1D1B", fill: { color: hl === "rate" ? "EE3A4F" : hl === "area" || i % 2 === 0 && i ? "A7A7A7" : "E8E5E0" } } }))), { x: X(50), y: Y(5.5), w: X(47.5), colW: [X(23.75), X(23.75)], fontFace: "Times New Roman", fontSize: 14, border: { type: "solid", pt: 1, color: "9B9B9B" }, rowH: 0.36 });
      if (p.thanks) {
        s.addText("Thank you", { x: X(1.8), y: Y(3.5), w: X(40), h: Y(13.5), fontFace: "Book Antiqua", fontSize: 60, color: "FFFFFF" });
        s.addText("Places-egy.com", { x: X(49.4), y: Y(80.4), w: X(30), h: Y(5.8), fontFace: "Book Antiqua", fontSize: 20, color: "FFFFFF" });
      }
    }
    await ppt.writeFile({ fileName: d.mode === "pdf" ? `(${u.code}) ${u.project} ${areaText(u).replace(/ SQM/g, "M")}.pptx` : `${u.code} slide.pptx` });
    A.audit("inventory", `${u.code}: اتنزّل الـ ${d.mode === "pdf" ? "PDF" : "slide"} PowerPoint`);
  };
})();
