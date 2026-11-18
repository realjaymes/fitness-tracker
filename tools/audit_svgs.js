// Browser audit for the generated SVGs. Open the tracker on localhost (python3 -m http.server 8011), paste this
// into the console, and read the result. It loads every SVG named in data/muscles.json inline and flags text that
// leaves the viewBox or its pill, text that overlaps other text or a figure, and figure parts clipped by a panel.
(async () => {
  const meta = await (await fetch("data/muscles.json")).json();
  const slugs = Object.values(meta.exercises).map(e => e.slug);
  const files = ["muscle-map", "muscle-warmup", "muscle-cooldown", ...Object.keys(meta.type_names).map(t => "type-" + t),
    ...slugs.flatMap(s => ["muscle-" + s, "exercise-" + s, "form-" + s])];
  const host = document.createElement("div");
  host.style.cssText = "position:absolute;left:0;top:0;width:360px;visibility:hidden";
  document.body.appendChild(host);
  const out = [], hit = (a, b, m = 0.5) => a.left < b.right - m && a.right > b.left + m && a.top < b.bottom - m && a.bottom > b.top + m;
  for (const f of files) {
    host.innerHTML = await (await fetch(`assets/learn/${f}.svg`)).text();
    const svg = host.querySelector("svg"), vb = svg.viewBox.baseVal, sr = svg.getBoundingClientRect(), k = sr.width / vb.width;
    const texts = [...svg.querySelectorAll("text")];
    for (const t of texts) {
      const b = t.getBBox();
      if (b.x < -0.5 || b.y < -0.5 || b.x + b.width > vb.width + 0.5 || b.y + b.height > vb.height + 0.5) out.push(`${f}: text outside viewBox: ${t.textContent}`);
      const pill = t.previousElementSibling;
      if (pill && pill.classList.contains("pill")) {
        const p = pill.getBBox();
        if (b.x < p.x + 2 || b.x + b.width > p.x + p.width - 2 || b.y < p.y || b.y + b.height > p.y + p.height) out.push(`${f}: text spills past its pill: ${t.textContent}`);
      }
    }
    const tr = texts.map(t => t.getBoundingClientRect());
    for (let i = 0; i < tr.length; i++) for (let j = i + 1; j < tr.length; j++) if (hit(tr[i], tr[j])) out.push(`${f}: texts overlap: ${texts[i].textContent} / ${texts[j].textContent}`);
    const figs = [...svg.querySelectorAll("path.fg, path.hl, circle.fh, circle.fhh, path.ar, rect.eq, circle.eq, path.bo, g.bo *")].filter(e => !e.closest(".far"));
    for (const t of texts) {
      if (t.classList.contains("pt")) continue;
      const r = t.getBoundingClientRect();
      for (const e of figs) if (hit(r, e.getBoundingClientRect(), 1.5) && !e.matches("path.hl")) { out.push(`${f}: text over figure: ${t.textContent}`); break; }
    }
    for (const panel of svg.querySelectorAll("rect.panel")) {
      const pr = panel.getBoundingClientRect();
      for (const e of panel.parentNode.querySelectorAll("path, circle, rect:not(.panel)")) {
        if (e.classList.contains("pill") || e.closest(".far") && false) continue;
        const r = e.getBoundingClientRect();
        if (r.left < pr.left - 0.5 || r.right > pr.right + 0.5 || r.top < pr.top - 0.5 || r.bottom > pr.bottom + 0.5) { out.push(`${f}: part clipped by panel (${e.getAttribute("class") || e.tagName})`); break; }
      }
    }
  }
  host.remove();
  return out.length ? out : "all clean";
})();
