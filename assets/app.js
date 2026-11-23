/* Fitness Tracker: reads data/log.json and renders the week, rhythm, trends, lifts and body views
   as an app with bottom tabs. ?demo=1 loads sample data. */
(() => {
  "use strict";

  const OWNER = "realjaymes", REPO = "fitness-tracker", PATH = "data/log.json", BRANCH = "main";
  const STRENGTH = new Set(["A", "B", "C", "strength"]);
  const LIGHT = new Set(["walk", "mobility", "cardio", "hiit", "other"]);
  const TYPE_NAMES = { A: "Strength A", B: "Strength B", C: "Strength C", strength: "Strength",
    walk: "Walk", mobility: "Mobility", cardio: "Cardio", hiit: "HIIT", other: "Other" };
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const params = new URLSearchParams(location.search);
  let MUS = { types: {}, type_names: {} };   // data/muscles.json, written by tools/make_muscles.py
  const DEMO = params.get("demo") === "1";

  let log, raw, TODAY, range = "block", showTab;
  const charts = {};

  /* ---------- dates ---------- */
  const pad = n => String(n).padStart(2, "0");
  const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
  const addDays = (s, n) => { const d = parse(s); d.setDate(d.getDate() + n); return iso(d); };
  const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
  const monday = s => { const d = parse(s); return addDays(s, -((d.getDay() + 6) % 7)); };
  const dayIdx = s => (parse(s).getDay() + 6) % 7;
  const fmt = (s, opts = { day: "numeric", month: "short" }) => parse(s).toLocaleDateString("en-GB", opts);
  const fmtY = s => fmt(s, { day: "numeric", month: "short", year: "numeric" });
  const fmtW = s => fmt(s, { weekday: "short", day: "numeric", month: "short" });
  const dates = (from, to) => { const out = []; for (let d = from; d <= to; d = addDays(d, 1)) out.push(d); return out; };

  /* ---------- numbers ---------- */
  const n0 = v => v == null ? "–" : Math.round(v).toLocaleString("en-GB");
  const n1 = v => v == null ? "–" : (Math.round(v * 10) / 10).toLocaleString("en-GB");
  const mean = xs => { const v = xs.filter(x => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const kgs = v => `${n1(v)} kg`;
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- model ---------- */
  const cfg = () => log.config;
  const blockStart = () => cfg().block.start;
  const blockEnd = () => addDays(blockStart(), cfg().block.weeks * 7 - 1);
  const weekOf = s => Math.floor(diffDays(blockStart(), s) / 7) + 1;
  const stepTarget = s => {
    if (s < blockStart() || s > blockEnd()) return null;
    let t = null;
    for (const r of cfg().targets.steps) if (weekOf(s) >= r.from_week) t = r.steps;
    return t;
  };
  const dayMap = () => new Map(log.days.map(d => [d.date, d]));
  const sessionsOn = s => log.sessions.filter(x => x.date === s);
  const isStrength = x => STRENGTH.has(x.type);

  function rangeBounds() {
    const firstData = [log.days[0], log.sessions[0], log.body[0]].filter(Boolean).map(x => x.date).sort()[0] || TODAY;
    if (range === "all") return [firstData, TODAY];
    const end = TODAY < blockEnd() ? TODAY : blockEnd();
    return [firstDay(), end < firstDay() ? firstDay() : end];
  }

  function weekStats(start) {
    const end = addDays(start, 6);
    const inW = s => s >= start && s <= end;
    const dm = dayMap();
    const ds = dates(start, end).map(s => dm.get(s)).filter(Boolean);
    const ss = log.sessions.filter(x => inW(x.date));
    const target = stepTarget(start) ?? stepTarget(blockStart());
    const t = cfg().targets;
    const stepDays = ds.filter(d => (d.steps ?? 0) >= target).length;
    const strength = ss.filter(isStrength).length;
    return {
      start, end, target, strength, light: ss.filter(x => LIGHT.has(x.type)).length, stepDays,
      steps: mean(ds.map(d => d.steps)), sleep: mean(ds.map(d => d.sleep_h)),
      protein: mean(ds.map(d => d.protein_g)), energy: mean(ds.map(d => d.energy)),
      proteinDays: ds.filter(d => d.protein_g != null && d.protein_g >= t.protein_g).length,
      proteinLogged: ds.filter(d => d.protein_g != null).length,
      logged: ds.length, passed: strength >= t.pass_sessions && stepDays >= t.pass_step_days,
      sessionTypes: ss.filter(isStrength).map(x => x.type),
    };
  }

  function liftHistory(name, from = "0000", to = "9999") {
    const out = [];
    for (const s of log.sessions) {
      if (s.date < from || s.date > to) continue;
      for (const e of s.exercises || []) {
        if (e.name !== name || !e.reps?.length) continue;
        const top = Math.max(...e.reps);
        out.push({ date: s.date, kg: e.kg, reps: e.reps, rir: e.rir, top,
          e1rm: e.kg > 0 ? e.kg * (1 + top / 30) : null,
          volume: e.kg * e.reps.reduce((a, b) => a + b, 0) });
      }
    }
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }
  const allLiftNames = () => {
    const prog = Object.values(cfg().program).flat();
    const logged = new Set(log.sessions.flatMap(s => (s.exercises || []).map(e => e.name)));
    return [...prog.filter(n => logged.has(n)), ...[...logged].filter(n => !prog.includes(n)), ...prog.filter(n => !logged.has(n))];
  };

  /* ---------- demo data ---------- */
  function seeded(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function addDemo() {
    const r = seeded(7);
    const start = blockStart();
    TODAY = addDays(start, 54);
    const lifts = { "Barbell Squat": 30, "Bench Press": 30, "Dumbbell Row": 8.5, "Dumbbell Shoulder Press": 8.5,
      Deadlift: 35, "Incline Dumbbell Press": 8.5, Lunges: 8.5, "Barbell Curl": 20,
      "Goblet Squat": 12, "Barbell Row": 25, "Dumbbell Flyes": 6, "Bench Dips": 0, "Russian Twists": 5, Plank: 0, "Leg Raises": 0 };
    let weight = 76.3;
    for (const s of dates(start, TODAY)) {
      const w = weekOf(s), wd = dayIdx(s);
      const sleep = Math.round((5.6 + r() * 2.6) * 4) / 4;
      const trainProb = w === 4 ? 0.3 : 0.82;
      const plan = { 0: "A", 2: "B", 4: "C" }[wd];
      const trained = plan && r() < trainProb;
      const walked = [1, 3, 5].includes(wd) && r() < 0.65;
      const steps = Math.round(3400 + w * 520 + (walked ? 2200 : 0) + (wd === 6 ? -900 : 0) + (r() - 0.5) * 2400);
      const kcal = 1550 + r() * 650, prot = 85 + r() * 55 + w * 2, shared = r() < 0.3;
      const meals = [["08:30", "Eggs, bread and tea", 0.25], ["13:30", "Jollof rice and chicken", 0.4], ["19:30", "Beans and plantain", 0.35]].map(([time, desc, f], i) => ({
        time, desc, ...(i === 1 && shared ? { shared: true } : {}), kcal: Math.round(kcal * f), protein_g: Math.round(prot * f), carbs_g: Math.round(kcal * f * 0.45 / 4), fat_g: Math.round(kcal * f * 0.3 / 9) }));
      const day = { date: s, steps: Math.max(900, steps), sleep_h: sleep, energy: Math.max(1, Math.min(10, Math.round(sleep - 1 + r() * 2.5))), meals: s === TODAY ? meals.slice(0, 2) : meals };
      mealTotals(day); log.days.push(day);
      if (trained) {
        log.sessions.push({ date: s, type: plan, minutes: 35 + Math.round(r() * 20), exercises: cfg().program[plan].map(name => {
          const bw = lifts[name] === 0;
          const reps = [0, 1, 2].map(() => bw ? 10 + Math.round(r() * 5) : 8 + Math.round(r() * 4));
          if (name === "Plank") reps.fill(30 + w * 5);
          const e = { name, kg: lifts[name], reps, rir: Math.round(1 + r() * 2) };
          if (!bw && Math.min(...reps) >= 10) lifts[name] += /^(Barbell|Bench|Deadlift)/.test(name) ? 2.5 : 1;
          return e;
        }) });
      } else if (walked) log.sessions.push({ date: s, type: "walk", minutes: 25, exercises: [] });
      if (wd === 0 || wd === 3) { weight += (r() - 0.62) * 0.4; log.body.push({ date: s, weight_kg: Math.round(weight * 10) / 10 }); }
    }
    for (const [i, waist] of [[0, 36.5], [28, 36.1]]) {
      const s = addDays(start, i), b = log.body.find(x => x.date === s) || (log.body.push({ date: s }), log.body.at(-1));
      Object.assign(b, { waist_in: waist, neck_in: 15.2, hips_in: 38, chest_in: 38.2, arm_in: 14.3, thigh_in: 21.7 });
    }
    log.days.sort((a, b) => a.date.localeCompare(b.date));
    log.body.sort((a, b) => a.date.localeCompare(b.date));
  }

  /* ---------- charts ---------- */
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  function chart(id, config) {
    if (charts[id]) charts[id].destroy();
    const c = document.getElementById(id);
    if (!c || typeof Chart === "undefined") return;
    const grid = css("--ft-grid"), muted = css("--ft-muted"), ink = css("--ft-ink");
    const base = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: css("--ft-surface"), titleColor: ink, bodyColor: ink, borderColor: css("--ft-axis"),
          borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
          filter: i => i.raw != null && !i.dataset.hideTip },
      },
      scales: {
        x: { grid: { display: false }, border: { color: css("--ft-axis") },
          ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6, font: { size: 11 } } },
        y: { grid: { color: grid }, border: { display: false }, beginAtZero: true,
          ticks: { color: muted, maxTicksLimit: 5, font: { size: 11 } } },
      },
    };
    config.options = deepMerge(base, config.options || {});
    charts[id] = new Chart(c, config);
  }
  function deepMerge(a, b) {
    for (const k of Object.keys(b)) {
      if (b[k] && typeof b[k] === "object" && !Array.isArray(b[k]) && a[k] && typeof a[k] === "object") deepMerge(a[k], b[k]);
      else a[k] = b[k];
    }
    return a;
  }
  const bar = (label, data, color, extra = {}) => ({ type: "bar", label, data, backgroundColor: color,
    borderRadius: 4, borderSkipped: "start", maxBarThickness: 22, categoryPercentage: 0.8, barPercentage: 0.9, ...extra });
  const line = (label, data, color, extra = {}) => ({ type: "line", label, data, borderColor: color, backgroundColor: color,
    borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0.25, spanGaps: true, ...extra });
  const target = (label, data) => line(label, data, css("--ft-muted"), { borderDash: [4, 4], stepped: true, tension: 0, borderWidth: 1.5 });

  /* ---------- render: header + week ---------- */
  function renderHeader() {
    const b = cfg().block, w = weekOf(TODAY);
    const el = document.getElementById("block-line");
    if (TODAY < firstDay()) el.textContent = `${b.name} starts ${fmtW(firstDay())}`;
    else if (TODAY < blockStart()) el.textContent = `${b.name} · Lead-in, week 1 starts ${fmtW(blockStart())}`;
    else if (TODAY > blockEnd()) el.textContent = `${b.name} finished ${fmtY(blockEnd())}`;
    else el.textContent = `${b.name} · Week ${w} of ${b.weeks}`;
    const banner = document.getElementById("banner");
    banner.innerHTML = DEMO ? `<p class="banner">Sample data for reviewing the layout (as if today were ${fmtW(TODAY)}). Nothing here is real and the form won't save.</p>` : "";
  }

  function tile(label, value, unit, meta, pct) {
    return `<div class="tile"><div class="label">${label}</div><div class="value">${value}${unit ? ` <small>${unit}</small>` : ""}</div>` +
      (pct != null ? `<div class="bar"><i style="width:${Math.min(100, Math.max(0, pct))}%"></i></div>` : "") +
      `<div class="meta">${meta}</div></div>`;
  }
  function status(kind, text, why) {
    return `<div><div class="status ${kind}"><span class="dot"></span>${text}</div>${why ? `<p class="why">${why}</p>` : ""}</div>`;
  }

  function renderWeek() {
    const before = TODAY < blockStart();
    const ref = before ? blockStart() : (TODAY > blockEnd() ? monday(blockEnd()) : monday(TODAY));
    const w = weekStats(ref), prev = weekStats(addDays(ref, -7)), t = cfg().targets;
    document.getElementById("week-line").textContent = `${fmtW(w.start)} – ${fmtW(w.end)} · step target ${n0(w.target)}`;
    const delta = w.steps != null && prev.steps ? Math.round((w.steps / prev.steps - 1) * 100) : null;
    document.getElementById("tiles").innerHTML = [
      tile("Strength sessions", w.strength, `/ ${t.sessions_per_week}`, `Pass at ${t.pass_sessions}${w.sessionTypes.length ? ` · done ${w.sessionTypes.join(", ")}` : ""}`, w.strength / t.sessions_per_week * 100),
      tile("Days at step target", w.stepDays, "/ 7", `Target ${n0(w.target)} · pass at ${t.pass_step_days}`, w.stepDays / 7 * 100),
      tile("Average steps", n0(w.steps), "", delta == null ? "Per logged day" : `${delta >= 0 ? "+" : ""}${delta}% vs last week`),
      tile("Average sleep", n1(w.sleep), "h", `Target ${t.sleep_h} h`),
      tile("Average protein", n0(w.protein), "g", `Target ${t.protein_g} g · hit ${w.proteinDays}/${w.proteinLogged || 0} days`),
      tile("Average energy", n1(w.energy), "/ 10", `${w.logged}/7 days logged`),
    ].join("");

    const out = [];
    const daysLeft = before ? 7 : diffDays(TODAY, w.end) + 1;
    if (before) out.push(status("warn", `Week 1 starts ${fmtW(blockStart())}`, `${firstDay() < blockStart() ? `The lead-in starts ${fmtW(firstDay())}. ` : ""}Aim for three strength sessions on Monday, Wednesday and Friday, and ${n0(w.target)} steps a day. Two sessions and four step days pass the week.`));
    else if (w.passed) out.push(status("good", "Week passed", `${w.strength} strength sessions and ${w.stepDays} days at ${n0(w.target)} steps.`));
    else {
      const needS = Math.max(0, t.pass_sessions - w.strength), needD = Math.max(0, t.pass_step_days - w.stepDays);
      const doable = needS <= daysLeft && needD <= daysLeft;
      const need = [needS ? `${needS} more strength session${needS > 1 ? "s" : ""}` : "", needD ? `${needD} more step day${needD > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ");
      out.push(doable ? status("warn", "Week still open", `You need ${need}, with ${daysLeft} day${daysLeft > 1 ? "s" : ""} left.`)
        : status("bad", "This week won't pass", "Never miss twice: make next week count."));
    }
    if (!before) {
      const lastS = log.sessions.filter(x => isStrength(x) && x.date <= TODAY).map(x => x.date).sort().at(-1);
      if (lastS) {
        const gap = diffDays(lastS, TODAY);
        out.push(status(gap >= 3 ? "warn" : "good", gap === 0 ? "Trained today" : `Last strength session ${gap} day${gap > 1 ? "s" : ""} ago`,
          gap >= 3 ? "A 20-minute minimum session (warm-up and the first two exercises) still counts." : ""));
      }
      const loggedToday = dayMap().has(TODAY);
      out.push(status(loggedToday ? "good" : "warn", loggedToday ? "Today is logged" : "Today isn't logged yet", loggedToday ? "" : "Tell Claude your steps, sleep and energy, send a photo of each meal, or use the Log form."));
    }
    document.getElementById("week-status").innerHTML = out.join("");
  }

  /* ---------- render: rhythm grid ---------- */
  function renderGrid() {
    const dm = dayMap(), weeks = cfg().block.weeks;
    let html = `<span></span>${WEEKDAYS.map(d => `<span class="hd">${d[0]}</span>`).join("")}<span></span>`;
    // The lead-in days before week 1 get their own row, so day 1 shows on the grid.
    if (firstDay() < blockStart()) {
      const start = addDays(blockStart(), -7);
      html += `<span class="wk">In</span>`;
      for (let i = 0; i < 7; i++) {
        const s = addDays(start, i);
        if (s < firstDay()) { html += `<span></span>`; continue; }
        const ss = sessionsOn(s), d = dm.get(s), future = s > TODAY;
        const cls = future ? "future" : ss.some(isStrength) ? "strength" : ss.some(x => LIGHT.has(x.type)) ? "light" : "";
        const tip = `${fmtW(s)}: ${ss.length ? ss.map(x => TYPE_NAMES[x.type] || x.type).join(", ") : "no session"}${d?.steps != null ? `, ${n0(d.steps)} steps` : ""}`;
        html += `<span class="cell ${cls}${s === TODAY ? " today" : ""}" title="${esc(tip)}" aria-label="${esc(tip)}"></span>`;
      }
      html += `<span></span>`;
    }
    for (let w = 1; w <= weeks; w++) {
      const start = addDays(blockStart(), (w - 1) * 7);
      html += `<span class="wk">W${w}</span>`;
      for (let i = 0; i < 7; i++) {
        const s = addDays(start, i), ss = sessionsOn(s), d = dm.get(s);
        const future = s > TODAY;
        const cls = future ? "future" : ss.some(isStrength) ? "strength" : ss.some(x => LIGHT.has(x.type)) ? "light" : "";
        const hit = d && d.steps != null && d.steps >= stepTarget(s);
        const tip = `${fmtW(s)}: ${ss.length ? ss.map(x => TYPE_NAMES[x.type] || x.type).join(", ") : "no session"}${d?.steps != null ? `, ${n0(d.steps)} steps` : ""}`;
        html += `<span class="cell ${cls}${s === TODAY ? " today" : ""}" title="${esc(tip)}" aria-label="${esc(tip)}">${hit ? '<i class="stp"></i>' : ""}</span>`;
      }
      const end = addDays(start, 6);
      const ws = end <= TODAY || (start <= TODAY && weekStats(start).passed) ? weekStats(start) : null;
      html += `<span class="week-pass" title="${ws ? (ws.passed ? "Week passed" : "Week not passed") : ""}">${ws ? (ws.passed ? '<span class="up" aria-label="passed">✓</span>' : (end <= TODAY ? '<span class="muted" aria-label="not passed">·</span>' : "")) : ""}</span>`;
    }
    document.getElementById("hgrid").innerHTML = html;
  }

  /* ---------- render: insights ---------- */
  function renderInsights() {
    const items = [], dm = dayMap(), t = cfg().targets;
    const add = (ic, text) => items.push(`<li><span class="ic">${ic}</span><span>${text}</span></li>`);
    const started = TODAY >= firstDay();

    const lastS = log.sessions.filter(x => isStrength(x) && x.date <= TODAY).sort((a, b) => a.date.localeCompare(b.date)).at(-1);
    if (started && lastS) {
      const gap = diffDays(lastS.date, TODAY);
      if (gap >= 3) add("!", `It's been ${gap} days since your last strength session (${TYPE_NAMES[lastS.type]}). Never miss twice.`);
    }
    const win = (from, to) => dates(from, to).map(s => dm.get(s)).filter(Boolean);
    const last14 = win(addDays(TODAY, -13), TODAY).filter(d => d.date >= blockStart());
    const base = cfg().baseline;
    const baseSteps = mean(win(base.from, base.to).map(d => d.steps));
    const avg14 = mean(last14.map(d => d.steps));
    if (avg14 != null && last14.length >= 5 && baseSteps) {
      const x = avg14 / baseSteps;
      add(x >= 1 ? "↑" : "↓", `Your last two weeks average ${n0(avg14)} steps a day, ${x >= 1.1 ? `${n1(x)}× ` : x < 0.95 ? "below " : "about "}your 2025 average of ${n0(baseSteps)}.`);
    }
    const w = weekStats(monday(TODAY)), p = weekStats(addDays(monday(TODAY), -7));
    if (started && w.steps != null && p.steps != null && p.logged >= 3 && w.logged >= 3) {
      const d = Math.round((w.steps / p.steps - 1) * 100);
      add(d >= 0 ? "↑" : "↓", `Steps are ${d >= 0 ? "up" : "down"} ${Math.abs(d)}% on last week (${n0(w.steps)} vs ${n0(p.steps)}).`);
    }
    const l28 = win(addDays(TODAY, -27), TODAY).filter(d => d.steps != null);
    if (l28.length >= 14) {
      const byDay = WEEKDAYS.map((_, i) => mean(l28.filter(d => dayIdx(d.date) === i).map(d => d.steps)));
      const lo = byDay.indexOf(Math.min(...byDay.filter(v => v != null)));
      const hi = byDay.indexOf(Math.max(...byDay.filter(v => v != null)));
      add("•", `Over four weeks, ${fmt(addDays(monday(TODAY), lo), { weekday: "long" })} is your quietest day (${n0(byDay[lo])} steps) and ${fmt(addDays(monday(TODAY), hi), { weekday: "long" })} your most active (${n0(byDay[hi])}). A walk on the quiet day lifts the week most.`);
    }
    const l42 = win(addDays(TODAY, -41), TODAY).filter(d => d.sleep_h != null && d.energy != null);
    const good = l42.filter(d => d.sleep_h >= t.sleep_h), short = l42.filter(d => d.sleep_h < t.sleep_h);
    if (good.length >= 3 && short.length >= 3) {
      const eg = mean(good.map(d => d.energy)), es = mean(short.map(d => d.energy));
      if (Math.abs(eg - es) >= 0.4) add("•", `Your energy averages ${n1(eg)} on days after ${t.sleep_h}+ hours of sleep and ${n1(es)} after less.`);
    }
    const trainSteps = [], restSteps = [];
    for (const d of l28) (sessionsOn(d.date).some(isStrength) ? trainSteps : restSteps).push(d.steps);
    if (trainSteps.length >= 4 && restSteps.length >= 4) {
      const a = mean(trainSteps), b = mean(restSteps);
      if (Math.abs(a - b) / b > 0.1) add("•", `You walk ${a > b ? "more" : "less"} on lifting days (${n0(a)} steps) than on other days (${n0(b)}).`);
    }
    if (started) {
      let best = null;
      for (const name of allLiftNames()) {
        const h = liftHistory(name, firstDay(), TODAY).filter(x => x.kg > 0);
        if (h.length < 2) continue;
        const gain = h.at(-1).kg - h[0].kg;
        if (gain > 0 && (!best || gain / h[0].kg > best.rel)) best = { name, from: h[0].kg, to: h.at(-1).kg, rel: gain / h[0].kg };
      }
      if (best) add("↑", `Biggest lift gain this block: ${best.name}, ${kgs(best.from)} to ${kgs(best.to)}.`);
      const done = [];
      for (let s = blockStart(); addDays(s, 6) < TODAY && s <= blockEnd(); s = addDays(s, 7)) done.push(weekStats(s).passed);
      if (done.length) {
        let streak = 0; for (let i = done.length - 1; i >= 0 && done[i]; i--) streak++;
        add(streak ? "✓" : "•", `${done.filter(Boolean).length} of ${done.length} finished weeks passed${streak >= 2 ? `, ${streak} in a row` : ""}.`);
      }
      let ls = 0; for (let s = dm.has(TODAY) ? TODAY : addDays(TODAY, -1); dm.has(s); s = addDays(s, -1)) ls++;
      if (ls >= 3) add("✓", `Logged ${ls} days in a row.`);
    }
    const meas = log.body.filter(b => b.waist_in != null).at(-1);
    if (started && meas && diffDays(meas.date, TODAY) >= 28) add("!", `Measurements are due. The last set was taken ${fmtY(meas.date)}.`);
    if (!started) add("•", `Your 2025 attempt averaged ${n0(baseSteps)} steps a day and about one strength session a week. Lifts still rose: squat and bench went from 20 to 30 kg.`);
    if (!items.length) add("•", "Log a few days and patterns show up here.");
    document.getElementById("insight-list").innerHTML = items.join("");
  }

  /* ---------- render: trends ---------- */
  function renderTrends() {
    const [from, to] = rangeBounds(), dm = dayMap(), t = cfg().targets;
    // "All time" skips days with nothing logged, so a long break doesn't squash the chart.
    const logged = new Set([...dm.keys(), ...log.sessions.map(x => x.date)]);
    const ds = dates(from, to).filter(s => range === "block" || logged.has(s));
    const multiYear = from.slice(0, 4) !== to.slice(0, 4);
    const label = s => multiYear ? fmt(s, { day: "numeric", month: "short", year: "2-digit" }) : fmt(s);
    const val = k => ds.map(s => dm.get(s)?.[k] ?? null);
    const steps = val("steps");
    const roll = ds.map(s => { const w = dates(addDays(s, -6), s).map(x => dm.get(x)?.steps).filter(v => v != null); return w.length >= 4 ? Math.round(mean(w)) : null; });
    const tip = { callbacks: { title: items => items.length ? fmtW(ds[items[0].dataIndex]) + (multiYear ? ` ${ds[items[0].dataIndex].slice(0, 4)}` : "") : "" } };

    chart("c-steps", { data: { labels: ds.map(label), datasets: [
      bar("Steps", steps, css("--ft-s1"), { order: 3 }),
      line("7-day average", roll, css("--ft-s2"), { order: 1 }),
      target("Target", ds.map(stepTarget)),
    ] }, options: { plugins: { tooltip: tip } } });
    const recent = steps.filter(v => v != null);
    document.getElementById("steps-big").textContent = recent.length ? `${n0(mean(recent))} avg` : "";

    const weeks = [];
    for (let s = monday(from); s <= to; s = addDays(s, 7)) {
      const w = weekStats(s);
      if (range === "block" || w.logged || w.strength || w.light) weeks.push(w);
    }
    const wl = weeks.map(w => w.start >= blockStart() && w.start <= blockEnd() ? `W${weekOf(w.start)}` : label(w.start));
    const wtip = { callbacks: { title: items => items.length ? `Week of ${fmtY(weeks[items[0].dataIndex].start)}` : "" } };
    chart("c-sessions", { data: { labels: wl, datasets: [
      bar("Strength", weeks.map(w => w.strength), css("--ft-s1"), { stack: "s" }),
      bar("Walk or mobility", weeks.map(w => w.light), css("--ft-s3"), { stack: "s", borderSkipped: false }),
      target("Pass line", weeks.map(() => t.pass_sessions)),
    ] }, options: { scales: { x: { stacked: true }, y: { stacked: true, suggestedMax: 6, ticks: { stepSize: 1 } } }, plugins: { tooltip: wtip } } });

    chart("c-wsteps", { data: { labels: wl, datasets: [
      bar("Average steps", weeks.map(w => w.steps == null ? null : Math.round(w.steps)), css("--ft-s1")),
      target("Target", weeks.map(w => stepTarget(w.start))),
    ] }, options: { plugins: { tooltip: wtip } } });

    const simple = (id, key, bigId, unit, tgt, color, opts = {}) => {
      const v = val(key), have = v.filter(x => x != null);
      const sets = [line(id, v, color, { pointRadius: 2.5, ...opts.ds })];
      if (tgt != null) sets.push(target("Target", ds.map(s => s >= blockStart() || range === "all" ? tgt : null)));
      chart(id, { data: { labels: ds.map(label), datasets: sets }, options: deepMerge({ plugins: { tooltip: tip } }, opts.options || {}) });
      document.getElementById(bigId).textContent = have.length ? `${n1(mean(have))}${unit} avg${tgt != null ? ` · target ${tgt}${unit}` : ""}` : "No data yet";
    };
    simple("c-sleep", "sleep_h", "sleep-big", " h", t.sleep_h, css("--ft-s1"), { options: { scales: { y: { suggestedMax: 9 } } } });
    simple("c-energy", "energy", "energy-big", "", null, css("--ft-s1"), { options: { scales: { y: { min: 0, max: 10 } } } });
    const prot = val("protein_g");
    chart("c-protein", { data: { labels: ds.map(label), datasets: [
      bar("Protein (g)", prot, css("--ft-s1")), target("Target", ds.map(() => t.protein_g)),
    ] }, options: { plugins: { tooltip: tip } } });
    const ph = prot.filter(v => v != null);
    document.getElementById("protein-big").textContent = ph.length ? `${n0(mean(ph))} g avg · target ${t.protein_g} g` : "No data yet";
  }

  /* ---------- render: lifts ---------- */
  function renderLifts() {
    const [from, to] = rangeBounds();
    const pick = document.getElementById("lift-pick");
    const names = allLiftNames();
    const current = pick.value || (names.includes(ui.lift) ? ui.lift : null) || names.find(n => liftHistory(n).length) || names[0];
    pick.innerHTML = names.map(n => `<option${n === current ? " selected" : ""}>${esc(n)}</option>`).join("");
    const h = liftHistory(current, from, to);
    const line1 = document.getElementById("lift-line");
    if (!h.length) line1.textContent = range === "block" && liftHistory(current).length ? "Not done this block yet. Switch to All time for 2025." : "Not logged yet.";
    else {
      const last = h.at(-1);
      line1.textContent = `Last: ${fmtY(last.date)}, ${last.kg ? kgs(last.kg) : "bodyweight"} × ${last.reps.join("/")}${last.rir != null ? ` with ${last.rir} in reserve` : ""}. ${nextHint(current, last)}`;
    }
    const bw = h.length && h.every(x => !x.kg);
    chart("c-lift", { data: { labels: h.map(x => fmt(x.date, { day: "numeric", month: "short", year: "2-digit" })), datasets: bw
      ? [line("Best set (reps)", h.map(x => x.top), css("--ft-s1"), { pointRadius: 4, tension: 0 })]
      : [line("Top set (kg)", h.map(x => x.kg), css("--ft-s1"), { pointRadius: 4, tension: 0, stepped: false }),
         line("Estimated 1-rep max (kg)", h.map(x => x.e1rm && Math.round(x.e1rm * 10) / 10), css("--ft-s2"), { pointRadius: 4, tension: 0 })] },
      options: { plugins: { tooltip: { callbacks: { afterBody: items => {
        const x = h[items[0]?.dataIndex]; return x ? `Reps: ${x.reps.join("/")}${x.rir != null ? ` · RIR ${x.rir}` : ""}` : ""; } } } } } });

    const rows = names.map(n => ({ n, h: liftHistory(n, from, to) })).filter(r => r.h.length);
    document.getElementById("lift-table").innerHTML = rows.length ? `<thead><tr><th>Exercise</th><th class="num">First</th><th class="num">Latest</th><th class="num">Change</th><th class="num">Sessions</th></tr></thead><tbody>` +
      rows.map(({ n, h }) => {
        const a = h[0], b = h.at(-1), d = b.kg - a.kg;
        const s = x => x.kg ? `${n1(x.kg)}×${x.top}` : `BW×${x.top}`;
        return `<tr><td>${esc(n)}</td><td class="num">${s(a)}</td><td class="num">${s(b)}</td><td class="num${d > 0 ? " up" : ""}">${d ? `${d > 0 ? "+" : ""}${n1(d)} kg` : (b.top > a.top ? `<span class="up">+${b.top - a.top} reps</span>` : "–")}</td><td class="num">${h.length}</td></tr>`;
      }).join("") + "</tbody>" : `<tbody><tr><td class="muted">No lifts in this range yet.</td></tr></tbody>`;
  }
  function nextHint(name, last) {
    if (!last.kg) return "Add reps or seconds before adding load.";
    if (Math.min(...last.reps) >= 12 && (last.rir == null || last.rir >= 1)) {
      if (/^(Barbell|Bench Press|Deadlift)/.test(name)) return `All sets hit 12, so go up to about ${kgs(last.kg + 2.5)} for 8.`;
      return "All sets hit 12. Use heavier dumbbells if you have them; if not, lower each rep over 3 seconds.";
    }
    return `Stay at ${kgs(last.kg)} and add a rep where you can.`;
  }

  /* ---------- render: food ---------- */
  // A day with meals takes its kcal, protein, carbs and fat totals from them (tools/log.py does the same).
  const MEAL_KEYS = ["kcal", "protein_g", "carbs_g", "fat_g"];
  function mealTotals(d) {
    for (const k of MEAL_KEYS) {
      const v = (d.meals || []).map(m => m[k]).filter(x => x != null);
      if (v.length) d[k] = Math.round(v.reduce((a, b) => a + b, 0)); else delete d[k];
    }
  }
  function renderFood() {
    const t = cfg().targets, d = dayMap().get(TODAY) || {}, meals = d.meals || [];
    const sec = document.getElementById("food");
    sec.hidden = !t.kcal;
    if (!t.kcal) return;
    const kc = d.kcal ?? 0, pr = d.protein_g ?? 0, left = t.kcal - kc;
    document.getElementById("food-line").textContent = meals.length
      ? `${meals.length} meal${meals.length > 1 ? "s" : ""} logged · ${left >= 0 ? `${n0(left)} kcal left` : `${n0(-left)} kcal over`} · ${pr >= t.protein_g ? "protein target hit" : `${n0(t.protein_g - pr)} g protein to go`}`
      : "Nothing logged yet. Send Claude a photo of each meal, or add it on the Log tab.";
    const list = meals.length ? `<ul class="meals">${meals.map(m => `<li><span class="mt">${esc(m.time || "")}</span><span class="md">${esc(m.desc || "Meal")}${m.shared ? ' <span class="chip">shared, your half</span>' : ""}</span><span class="mk">${m.kcal != null ? `${n0(m.kcal)} kcal` : ""}${m.protein_g != null ? `<small>${n0(m.protein_g)} g protein</small>` : ""}</span></li>`).join("")}</ul>` : "";
    const macros = `Carbs ${n0(d.carbs_g ?? 0)} / ${t.carbs_g} g · Fat ${n0(d.fat_g ?? 0)} / ${t.fat_g} g`;
    const meter = (label, v, tgt, unit) => `<div class="meter"><div class="mh"><b>${label}</b><span>${n0(v)} / ${n0(tgt)}${unit}</span></div><div class="bar${v > tgt ? " over" : ""}"><i style="width:${Math.min(100, v / tgt * 100)}%"></i></div></div>`;
    document.getElementById("food-body").innerHTML = `<div class="card food">${meter("Calories", kc, t.kcal, " kcal")}${meter("Protein", pr, t.protein_g, " g")}<p class="sub" style="margin:0">${macros}</p>${list}</div>`;
  }

  /* ---------- render: body ---------- */
  function renderCalories(from, to) {
    const t = cfg().targets, dm = dayMap(), card = document.getElementById("kcal-card");
    card.hidden = !t.kcal;
    if (!t.kcal) return;
    const kd = log.days.filter(d => d.kcal != null && d.date >= from && d.date <= to);
    const avg7 = s => { const v = dates(addDays(s, -6), s).map(x => dm.get(x)?.kcal).filter(x => x != null); return v.length ? Math.round(mean(v)) : null; };
    const lab = s => fmt(s, { day: "numeric", month: "short", year: "2-digit" });
    const big = document.getElementById("kcal-big");
    big.textContent = kd.length ? `${n0(mean(kd.map(d => d.kcal)))} kcal avg · target ${n0(t.kcal)}` : "No meals logged yet";
    chart("c-kcal", { data: { labels: kd.map(d => lab(d.date)), datasets: [
      bar("Calories", kd.map(d => d.kcal), css("--ft-s1"), { order: 3 }),
      line("7-day average", kd.map(d => avg7(d.date)), css("--ft-s2"), { order: 1 }),
      target("Target", kd.map(() => t.kcal)),
    ] }, options: { scales: { y: { beginAtZero: true, suggestedMax: t.kcal + 400 } } } });
  }

  // US Navy tape method (men's version), inches. A trend number, not a scan.
  function bodyFat(b, h) {
    if (b.waist_in == null || b.neck_in == null || b.waist_in <= b.neck_in) return null;
    return 86.010 * Math.log10(b.waist_in - b.neck_in) - 70.041 * Math.log10(h * 100 / 2.54) + 36.76;
  }
  function renderBody() {
    const [from, to] = rangeBounds(), h = cfg().height_m;
    const weights = log.body.filter(b => b.weight_kg != null);
    const lastW = weights.at(-1);
    const recentW = lastW ? mean(weights.filter(b => diffDays(b.date, lastW.date) < 7).map(b => b.weight_kg)) : null;
    const meas = log.body.filter(b => b.waist_in != null);
    const lastM = meas.at(-1);
    const tiles = [];
    tiles.push(tile("Weight", n1(recentW), "kg", lastW ? `7-day average · last ${fmtY(lastW.date)}` : "No weigh-ins yet"));
    if (recentW) {
      const bmi = recentW / (h * h);
      const [k, lab] = bmi < 18.5 ? ["warn", "Underweight"] : bmi < 23 ? ["good", "Healthy"] : bmi < 27.5 ? ["warn", "Overweight"] : ["bad", "Obesity"];
      tiles.push(`<div class="tile"><div class="label">Body Mass Index (BMI)</div><div class="value">${n1(bmi)}</div><div class="status ${k}" style="font-size:12px;margin-top:4px"><span class="dot"></span>${lab}</div><div class="meta">NICE bands for Black African heritage: healthy under 23</div></div>`);
    }
    if (lastM?.hips_in) {
      const whr = lastM.waist_in / lastM.hips_in;
      const [k, lab] = whr < 0.9 ? ["good", "Under 0.90"] : ["bad", "Raised risk (0.90+)"];
      tiles.push(`<div class="tile"><div class="label">Waist-to-hip</div><div class="value">${whr.toFixed(2)}</div><div class="status ${k}" style="font-size:12px;margin-top:4px"><span class="dot"></span>${lab}</div><div class="meta">Measured ${fmtY(lastM.date)}</div></div>`);
    }
    if (lastM) {
      const whtr = lastM.waist_in * 2.54 / (h * 100);
      const [k, lab] = whtr < 0.5 ? ["good", "Under 0.5"] : whtr < 0.6 ? ["warn", "Increased (0.5+)"] : ["bad", "High (0.6+)"];
      tiles.push(`<div class="tile"><div class="label">Waist-to-height</div><div class="value">${whtr.toFixed(2)}</div><div class="status ${k}" style="font-size:12px;margin-top:4px"><span class="dot"></span>${lab}</div><div class="meta">Goal: waist under half your height (${n1(h * 100 / 2 / 2.54)} in)</div></div>`);
      const fats = meas.filter(b => b.neck_in != null).map(b => ({ date: b.date, pct: bodyFat(b, h) })).filter(x => x.pct != null), fat = fats.at(-1);
      if (fat) {
        const [k, lab] = fat.pct < 18 ? ["good", "Fit range (under 18%)"] : fat.pct < 25 ? ["warn", "Average (18–24%)"] : ["bad", "High (25%+)"];
        const prev = fats.at(-2), d = prev && fat.pct - prev.pct;
        tiles.push(`<div class="tile"><div class="label">Body fat (estimate)</div><div class="value">${n1(fat.pct)}<small>%</small></div><div class="status ${k}" style="font-size:12px;margin-top:4px"><span class="dot"></span>${lab}</div><div class="meta">${prev ? `${d >= 0 ? "+" : ""}${n1(d)} points since ${fmtY(prev.date)}` : `From waist, neck and height · ${fmtY(fat.date)}`}. Tape estimate, about ±3–4 points</div></div>`);
      }
      const due = addDays(lastM.date, 28);
      tiles.push(tile("Next measurements", due <= TODAY ? "Due" : fmt(due), "", `Every 4 weeks · last ${fmtY(lastM.date)}`));
    }
    document.getElementById("body-tiles").innerHTML = tiles.join("");

    const ws = weights.filter(b => b.date >= from && b.date <= to);
    renderCalories(from, to);
    const avg7 = ws.map(b => Math.round(mean(ws.filter(x => diffDays(x.date, b.date) >= 0 && diffDays(x.date, b.date) < 7).map(x => x.weight_kg)) * 10) / 10);
    chart("c-weight", { data: { labels: ws.map(b => fmt(b.date, { day: "numeric", month: "short", year: "2-digit" })), datasets: [
      line("Weigh-in", ws.map(b => b.weight_kg), css("--ft-s1"), { showLine: false, pointRadius: 4, order: 2 }),
      line("7-day average", avg7, css("--ft-s2"), { order: 1 }),
    ] }, options: { scales: { y: { beginAtZero: false, suggestedMin: Math.floor(Math.min(...ws.map(b => b.weight_kg), 99) - 1), suggestedMax: Math.ceil(Math.max(...ws.map(b => b.weight_kg), 0) + 1) } } } });
    document.getElementById("weight-big").textContent = ws.length >= 2 ? `${ws.at(-1).weight_kg - ws[0].weight_kg >= 0 ? "+" : ""}${n1(ws.at(-1).weight_kg - ws[0].weight_kg)} kg in range` : "";

    const ms = meas.filter(b => b.date >= from && b.date <= to);
    chart("c-waist", { data: { labels: ms.map(b => fmt(b.date, { day: "numeric", month: "short", year: "2-digit" })), datasets: [
      line("Waist (in)", ms.map(b => b.waist_in), css("--ft-s1"), { pointRadius: 4, tension: 0 }),
    ] }, options: { scales: { y: { beginAtZero: false, suggestedMin: 33, suggestedMax: 38 } } } });

    const all = log.body.filter(b => b.waist_in != null || b.hips_in != null).slice().reverse();
    const c = v => v == null ? "–" : n1(v);
    document.getElementById("measure-table").innerHTML = all.length ? `<thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Waist</th><th class="num">Neck</th><th class="num">Body fat</th><th class="num">Hips</th><th class="num">Chest</th><th class="num">Arm</th><th class="num">Thigh</th></tr></thead><tbody>` +
      all.map(b => `<tr><td>${fmtY(b.date)}</td><td class="num">${c(b.weight_kg)}</td><td class="num">${c(b.waist_in)}</td><td class="num">${c(b.neck_in)}</td><td class="num">${bodyFat(b, h) == null ? "–" : `${n1(bodyFat(b, h))}%`}</td><td class="num">${c(b.hips_in)}</td><td class="num">${c(b.chest_in)}</td><td class="num">${c(b.arm_in)}</td><td class="num">${c(b.thigh_in)}</td></tr>`).join("") + "</tbody>"
      : `<tbody><tr><td class="muted">No measurements yet.</td></tr></tbody>`;
  }

  /* ---------- render: history + compare ---------- */
  function renderHistory() {
    const dm = dayMap();
    const keys = [...new Set([...log.days, ...log.sessions, ...log.body].map(x => x.date))].filter(s => s <= TODAY).sort().reverse().slice(0, 21);
    document.getElementById("hist").innerHTML = keys.map(s => {
      const d = dm.get(s) || {}, ss = sessionsOn(s), b = log.body.find(x => x.date === s), tgt = stepTarget(s);
      const chips = [];
      if (d.steps != null) chips.push(`<span class="chip">${n0(d.steps)} steps${tgt && d.steps >= tgt ? " ✓" : ""}</span>`);
      if (d.sleep_h != null) chips.push(`<span class="chip">${n1(d.sleep_h)} h sleep</span>`);
      if (d.kcal != null) chips.push(`<span class="chip">${n0(d.kcal)} kcal</span>`);
      if (d.protein_g != null) chips.push(`<span class="chip">${d.protein_g} g protein</span>`);
      if (d.energy != null) chips.push(`<span class="chip">energy ${d.energy}</span>`);
      if (b?.weight_kg != null) chips.push(`<span class="chip">${n1(b.weight_kg)} kg</span>`);
      for (const x of ss) chips.push(`<span class="chip ${isStrength(x) ? "s" : "l"}">${TYPE_NAMES[x.type] || esc(x.type)}${x.minutes ? ` · ${x.minutes} min` : ""}</span>`);
      const ex = ss.flatMap(x => (x.exercises || []).map(e => `${esc(e.name)} ${e.kg ? `${n1(e.kg)} kg` : "BW"} × ${e.reps.join("/")}`));
      const notes = [d.note, ...ss.map(x => x.note)].filter(Boolean).map(esc);
      const meas = b ? BODY_FIELDS.slice(1).filter(([k]) => b[k] != null).map(([k, n]) => `${n[0].toUpperCase() + n.slice(1)} ${n1(b[k])}`) : [];
      const extra = [(d.meals || []).map(m => `${esc(m.time || "")} ${esc(m.desc || "Meal")}${m.shared ? " (shared)" : ""}${m.kcal != null ? ` ${n0(m.kcal)} kcal` : ""}`.trim()).join(" · "), meas.length ? `${meas.join(" · ")} in` : ""].filter(Boolean);
      return `<div class="row"><div class="d">${fmt(s, { weekday: "short" })}<small>${fmt(s, { day: "numeric", month: "short", year: "2-digit" })}</small></div><div><div class="chips">${chips.join("")}</div>${extra.map(x => `<p class="ex">${x}</p>`).join("")}${ex.length ? `<p class="ex">${ex.join(" · ")}</p>` : ""}${notes.length ? `<p class="ex">${notes.join(" · ")}</p>` : ""}</div></div>`;
    }).join("") || `<p class="muted">Nothing logged yet.</p>`;

    const base = cfg().baseline, dmv = dayMap();
    const period = (from, to) => {
      const days = Math.max(1, diffDays(from, to) + 1), ss = log.sessions.filter(x => x.date >= from && x.date <= to);
      const top = n => liftHistory(n, from, to).filter(x => x.kg).at(-1);
      const bodyIn = log.body.filter(b => b.date >= from && b.date <= to);
      return {
        steps: mean(dates(from, to).map(s => dmv.get(s)?.steps)),
        strength: ss.filter(isStrength).length / days * 7, light: ss.filter(x => LIGHT.has(x.type)).length / days * 7,
        weight: bodyIn.filter(b => b.weight_kg != null).at(-1)?.weight_kg, waist: bodyIn.filter(b => b.waist_in != null).at(-1)?.waist_in,
        squat: top("Barbell Squat"), bench: top("Bench Press"),
      };
    };
    const then = period(base.from, base.to);
    const nowFrom = TODAY < blockStart() ? null : (diffDays(blockStart(), TODAY) >= 27 ? addDays(TODAY, -27) : blockStart());
    const now = nowFrom ? period(nowFrom, TODAY) : null;
    const lift = x => x ? `${n1(x.kg)} kg × ${x.top}` : "–";
    const rows = [
      ["Steps a day", n0(then.steps), now ? n0(now.steps) : "–"],
      ["Strength sessions a week", n1(then.strength), now ? n1(now.strength) : "–"],
      ["Walks or mobility a week", n1(then.light), now ? n1(now.light) : "–"],
      ["Weight (kg)", n1(then.weight), now ? n1(now.weight) : "–"],
      ["Waist (in)", n1(then.waist), now ? n1(now.waist) : "–"],
      ["Barbell Squat", lift(then.squat), now ? lift(now.squat) : "–"],
      ["Bench Press", lift(then.bench), now ? lift(now.bench) : "–"],
    ];
    document.getElementById("compare-table").innerHTML = `<thead><tr><th></th><th class="num">${esc(base.label)}</th><th class="num">${now ? (nowFrom === blockStart() ? "This block" : "Last 4 weeks") : "This block"}</th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td class="num">${r[2]}</td></tr>`).join("") + "</tbody>";
  }

  /* ---------- log form (saves to GitHub) ---------- */
  const tokenKey = "ft_token";
  const getToken = () => { try { return localStorage.getItem(tokenKey) || ""; } catch { return ""; } };
  const b64decode = b => new TextDecoder().decode(Uint8Array.from(atob(b.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const b64encode = s => { const bytes = new TextEncoder().encode(s); let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(bin); };
  const api = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${PATH}`;
  const headers = () => ({ Authorization: `Bearer ${getToken()}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" });

  function mergeEntry(target, e) {
    if (e.day) {
      let d = target.days.find(x => x.date === e.day.date);
      if (!d) { d = { date: e.day.date }; target.days.push(d); }
      Object.assign(d, e.day);
      if (e.meal) { (d.meals ||= []).push(e.meal); d.meals.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99")); mealTotals(d); }
    }
    if (e.session) {
      const i = target.sessions.findIndex(x => x.date === e.session.date && x.type === e.session.type);
      if (i >= 0) target.sessions[i] = { ...target.sessions[i], ...e.session }; else target.sessions.push(e.session);
    }
    if (e.body) {
      let b = target.body.find(x => x.date === e.body.date);
      if (!b) { b = { date: e.body.date }; target.body.push(b); }
      Object.assign(b, e.body);
    }
    target.days.sort((a, b) => a.date.localeCompare(b.date));
    target.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    target.body.sort((a, b) => a.date.localeCompare(b.date));
    return target;
  }

  // Undo: before a save, keep what the saved date's day, session and body entries were,
  // so "Undo last save" can put exactly those back without touching anything else.
  const undoKey = "ft_undo";
  const getUndo = () => { try { return JSON.parse(localStorage.getItem(undoKey) || "null"); } catch { return null; } };
  const setUndo = u => { try { u ? localStorage.setItem(undoKey, JSON.stringify(u)) : localStorage.removeItem(undoKey); } catch {} };
  const clone = o => o == null ? null : JSON.parse(JSON.stringify(o));
  function snapshot(log0, e) {
    const u = { label: e.day?.date || e.session?.date || e.body?.date };
    if (e.day) u.day = { date: e.day.date, prev: clone(log0.days.find(x => x.date === e.day.date)) };
    if (e.session) u.session = { date: e.session.date, type: e.session.type, prev: clone(log0.sessions.find(x => x.date === e.session.date && x.type === e.session.type)) };
    if (e.body) u.body = { date: e.body.date, prev: clone(log0.body.find(x => x.date === e.body.date)) };
    return u;
  }
  function restore(target, u) {
    const put = (list, match, prev) => { const i = list.findIndex(match); if (i >= 0) prev ? list.splice(i, 1, prev) : list.splice(i, 1); else if (prev) list.push(prev); };
    if (u.day) put(target.days, x => x.date === u.day.date, u.day.prev);
    if (u.session) put(target.sessions, x => x.date === u.session.date && x.type === u.session.type, u.session.prev);
    if (u.body) put(target.body, x => x.date === u.body.date, u.body.prev);
    target.days.sort((a, b) => a.date.localeCompare(b.date));
    target.sessions.sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type));
    target.body.sort((a, b) => a.date.localeCompare(b.date));
    return target;
  }

  async function writeRemote(change, message, tries = 2) {
    const r = await fetch(`${api}?ref=${BRANCH}`, { headers: headers(), cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 401 ? "The token was rejected. Check it in Phone setup." : `GitHub said ${r.status} when reading the log.`);
    const file = await r.json();
    const before = JSON.parse(b64decode(file.content));
    const undo = change.undo ? null : snapshot(before, change.entry);
    const remote = change.undo ? restore(before, change.undo) : mergeEntry(before, change.entry);
    const put = await fetch(api, { method: "PUT", headers: headers(), body: JSON.stringify({
      message, content: b64encode(JSON.stringify(remote, null, 1) + "\n"), sha: file.sha, branch: BRANCH }) });
    if (put.status === 409 && tries > 1) return writeRemote(change, message, tries - 1);
    if (!put.ok) throw new Error(`GitHub said ${put.status} when saving.`);
    return { remote, undo };
  }
  async function saveRemote(entry) {
    const { remote, undo } = await writeRemote({ entry }, `log ${entry.day?.date || entry.session?.date || entry.body?.date} (from phone)`);
    setUndo(undo);
    return remote;
  }
  async function undoRemote() {
    const u = getUndo();
    if (!u) throw new Error("There is nothing to undo.");
    const { remote } = await writeRemote({ undo: u }, `undo log ${u.label} (from phone)`);
    setUndo(null);
    return remote;
  }

  function lastFor(name) { return liftHistory(name).at(-1); }
  function renderExRows() {
    const form = document.getElementById("log-form"), type = form.type.value, box = document.getElementById("ex-rows");
    const list = cfg().program[type];
    if (!list) { box.innerHTML = type ? `<label class="f">Minutes<input type="number" name="minutes" inputmode="numeric" min="0" max="300"></label>` : ""; return; }
    box.innerHTML = `<div class="exhead"><span>Exercise</span><span>kg</span><span>Reps</span><span>RIR</span></div>` + list.map((n, i) => {
      const l = lastFor(n);
      return `<div class="exrow"><span class="n">${esc(n)}${gd().videos?.[n] ? ` <a class="vid sm" href="${esc(gd().videos[n][0][1])}" target="_blank" rel="noopener" aria-label="Watch ${esc(n)}">▶</a>` : ""}</span><input name="kg${i}" inputmode="decimal" placeholder="${l ? l.kg : "kg"}" value="${l ? l.kg : ""}" aria-label="${esc(n)} kg"><input name="reps${i}" inputmode="text" placeholder="${n === "Plank" ? "secs" : "8,8,8"}" aria-label="${esc(n)} reps"><input name="rir${i}" inputmode="numeric" placeholder="2" aria-label="${esc(n)} reps in reserve"></div>`;
    }).join("") + `<p class="sub">Leave reps empty to skip an exercise. Reps like 10,10,9. RIR is reps left in the tank.</p>`;
  }

  const BODY_FIELDS = [["weight_kg", "weight"], ["waist_in", "waist"], ["neck_in", "neck"], ["hips_in", "hips"], ["chest_in", "chest"], ["arm_in", "arm"], ["thigh_in", "thigh"]];
  function prefill(date) {
    const f = document.getElementById("log-form"), d = dayMap().get(date) || {}, b = log.body.find(x => x.date === date) || {};
    f.steps.value = d.steps ?? ""; f.sleep.value = d.sleep_h ?? ""; f.protein.value = d.protein_g ?? ""; f.energy.value = d.energy ?? "";
    f.protein.disabled = !!d.meals?.length;
    document.getElementById("protein-hint").hidden = !d.meals?.length;
    for (const [k, n] of BODY_FIELDS) f[n].value = b[k] ?? "";
  }

  function readForm() {
    const f = document.getElementById("log-form"), num = v => v === "" ? null : Number(v), date = f.date.value;
    const entry = {};
    const day = { steps: num(f.steps.value), sleep_h: num(f.sleep.value), protein_g: f.protein.disabled ? null : num(f.protein.value), energy: num(f.energy.value) };
    if (f.note.value.trim()) day.note = f.note.value.trim();
    for (const k of Object.keys(day)) if (day[k] == null) delete day[k];
    if (Object.keys(day).length) entry.day = { date, ...day };
    const meal = { time: f.mtime.value || undefined, desc: f.mdesc.value.trim() || undefined, shared: f.mshared.checked || undefined,
      kcal: num(f.mkcal.value), protein_g: num(f.mprotein.value), carbs_g: num(f.mcarbs.value), fat_g: num(f.mfat.value) };
    for (const k of Object.keys(meal)) if (meal[k] == null) delete meal[k];
    if (MEAL_KEYS.some(k => meal[k] != null)) {
      if (!meal.desc) throw new Error("Say what the meal was, for example \"Jollof rice and chicken\".");
      entry.meal = meal; entry.day ||= { date };
    }
    const type = f.type.value;
    if (type) {
      const list = cfg().program[type] || [], exercises = [];
      list.forEach((name, i) => {
        const reps = (f[`reps${i}`]?.value || "").trim();
        if (!reps) return;
        let r = /^(\d+)\s*x\s*(\d+)$/i.exec(reps);
        const repsArr = r ? Array(Number(r[1])).fill(Number(r[2])) : reps.split(/[,\s/]+/).filter(Boolean).map(Number);
        if (repsArr.some(isNaN)) throw new Error(`Reps for ${name} should look like 10,10,9.`);
        exercises.push({ name, kg: Number(f[`kg${i}`].value || 0), reps: repsArr, rir: f[`rir${i}`].value === "" ? null : Number(f[`rir${i}`].value) });
      });
      entry.session = { date, type, exercises };
      if (f.minutes?.value) entry.session.minutes = Number(f.minutes.value);
    }
    const body = {};
    for (const [k, n] of BODY_FIELDS)
      if (f[n].value !== "") body[k] = Number(f[n].value);
    if (Object.keys(body).length) entry.body = { date, ...body };
    if (!Object.keys(entry).length) throw new Error("Nothing to save yet.");
    return entry;
  }

  function wireForm() {
    const f = document.getElementById("log-form"), msg = document.getElementById("form-msg");
    f.date.value = iso(new Date());
    if (gd().measure) document.getElementById("measure-link").href = gd().measure;
    prefill(f.date.value);
    f.date.addEventListener("change", () => prefill(f.date.value));
    f.type.addEventListener("change", renderExRows);
    f.addEventListener("submit", async ev => {
      ev.preventDefault();
      msg.className = "msg"; msg.textContent = "Saving…";
      try {
        const entry = readForm();
        if (DEMO) throw new Error("Sample data mode doesn't save. Open the page without ?demo=1.");
        if (!getToken()) throw new Error("Add your access token under Phone setup first, or tell Claude instead.");
        log = await saveRemote(entry);
        renderAll();
        msg.className = "msg ok"; msg.textContent = "Saved. Everyone else sees it in about a minute.";
        f.type.value = ""; renderExRows(); showUndo();
        for (const n of ["mtime", "mdesc", "mkcal", "mprotein", "mcarbs", "mfat"]) f[n].value = ""; f.mshared.checked = false; prefill(f.date.value);
      } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
    });
    const undoBtn = document.getElementById("undo-save");
    const showUndo = () => { const u = getUndo(); undoBtn.hidden = !u; if (u) undoBtn.textContent = `Undo last save (${fmt(u.label, { weekday: "short", day: "numeric", month: "short" })})`; };
    undoBtn.addEventListener("click", async () => {
      msg.className = "msg"; msg.textContent = "Undoing…";
      try { log = await undoRemote(); renderAll(); prefill(f.date.value); showUndo(); msg.className = "msg ok"; msg.textContent = "Undone. The log is back to how it was before that save."; }
      catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
    });
    showUndo();
    const tok = document.getElementById("token"), tmsg = document.getElementById("token-msg");
    tok.placeholder = getToken() ? "Token saved in this browser" : "github_pat_…";
    document.getElementById("token-save").addEventListener("click", () => {
      try { localStorage.setItem(tokenKey, tok.value.trim()); tok.value = ""; tok.placeholder = "Token saved in this browser"; tmsg.className = "msg ok"; tmsg.textContent = "Saved on this device."; }
      catch { tmsg.className = "msg err"; tmsg.textContent = "This browser blocked storage. Try without private mode."; }
    });
    document.getElementById("token-clear").addEventListener("click", () => {
      try { localStorage.removeItem(tokenKey); } catch {} tok.placeholder = "github_pat_…"; tmsg.className = "msg"; tmsg.textContent = "Removed.";
    });
  }

  /* ---------- today's plan and guide ---------- */
  let planPick = null;
  const gd = () => cfg().guide || {};
  const slug = t => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const ytId = url => (/(?:v=|shorts\/|youtu\.be\/)([\w-]{11})/.exec(url) || [])[1];
  const vlinks = list => (list || []).map(([label, url]) => { const id = ytId(url);
    return `<a class="vid" href="${esc(url)}" target="_blank" rel="noopener"${id ? ` data-yt="${id}"${/shorts\//.test(url) ? " data-tall" : ""}` : ""}>▶ ${esc(label)}${id ? "" : " (TikTok)"}</a>`; }).join("");
  function thumb(name) {
    const v = gd().videos?.[name]?.[0], id = v && ytId(v[1]);
    return id ? `<button type="button" class="thumb" data-yt="${id}" data-url="${esc(v[1])}"${/shorts\//.test(v[1]) ? " data-tall" : ""} aria-label="Play the ${esc(name)} video"><img src="https://i.ytimg.com/vi/${id}/mqdefault.jpg" alt="" loading="lazy"><span>▶</span></button>` : "";
  }
  function play(el, start = 0) {
    const host = el.closest("li"), id = el.dataset.yt;
    let box = host.querySelector(":scope > .player");
    if (box && box.dataset.id === id) { box.remove(); if (ui.video && ui.video.key === hostKey(host)) { ui.video = null; scheduleSave(); } return; }
    if (!box) { box = document.createElement("div"); box.className = "player"; host.appendChild(box); }
    box.dataset.id = id; box.classList.toggle("tall", el.hasAttribute("data-tall"));
    ui.video = { key: hostKey(host), id, t: start, tall: el.hasAttribute("data-tall"), url: el.dataset.url || el.href || "" }; scheduleSave();
    box.innerHTML = `<div class="frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1&playsinline=1&rel=0&enablejsapi=1&origin=${encodeURIComponent(location.origin)}${start > 0 ? `&start=${start}` : ""}" title="Exercise video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div><div class="player-bar"><a href="${esc(el.dataset.url || el.href)}" target="_blank" rel="noopener">Open in YouTube</a><button type="button" class="linkish" data-close>Close video</button></div>`;
  }
  const STRENGTH_DAYS = [0, 2, 4];
  // lead-in days before Week 1 (config.block.lead_in, date -> "A" or "walk") start the rotation early
  const leadIn = () => cfg().block.lead_in || {};
  const firstDay = () => Object.keys(leadIn()).sort()[0] || blockStart();
  function nextStrength(date) {
    const from = date >= firstDay() ? firstDay() : "";
    const last = log.sessions.filter(s => /^[ABC]$/.test(s.type) && s.date < date && s.date >= from).at(-1);
    return last ? { A: "B", B: "C", C: "A" }[last.type] : "A";
  }
  function planFor(date) {
    const done = sessionsOn(date).find(s => /^[ABC]$/.test(s.type));
    if (done) return { kind: done.type, done: true };
    const li = leadIn()[date];
    if (li) return li === "walk" ? { kind: "walk", done: sessionsOn(date).some(s => LIGHT.has(s.type)) } : { kind: nextStrength(date) };
    const wd = dayIdx(date);
    if (STRENGTH_DAYS.includes(wd)) return { kind: nextStrength(date) };
    if (wd === 6) return { kind: "rest" };
    return { kind: "walk", done: sessionsOn(date).some(s => LIGHT.has(s.type)) };
  }
  function missedYesterday(date) {
    const y = addDays(date, -1);
    if (!STRENGTH_DAYS.includes(dayIdx(y)) || y < blockStart()) return null;
    return sessionsOn(y).some(isStrength) || sessionsOn(date).some(isStrength) ? null : nextStrength(date);
  }
  function weightLine(name) {
    const l = lastFor(name), start = gd().start?.[name];
    if (!l) return start ? `Start with ${start}.` : "";
    const when = `Last time (${diffDays(l.date, TODAY) > 120 ? fmtY(l.date) : fmt(l.date)})`;
    if (!l.kg) return `${when}: ${l.reps.join("/")}${name === "Plank" ? " seconds" : " reps"}. Try to beat it.`;
    return `${when}: ${kgs(l.kg)} × ${l.reps.join("/")}. ${nextHint(name, l)}`;
  }
  function strengthCard(kind) {
    const g = gd(), list = cfg().program[kind] || [];
    const ex = list.map((n, i) => { const vids = g.videos?.[n] || [], th = thumb(n), sl = slug(n), ty = MUS.types[n];
      const map = MUS.types[n] ? `<img class="mini-map" src="${`assets/learn/muscle-${sl}.svg`}" alt="Muscles for ${esc(n)}: main muscles strong yellow, helpers light yellow" loading="lazy">` : "";
      return `<li class="exi${th ? "" : " no-thumb"}" data-key="ex:${sl}"><div class="exi-media">${th}${map}</div><div class="exi-txt"><b>${i + 1}. ${esc(n)}</b>${ty ? ` <span class="chip ty">${esc(MUS.type_names[ty] || ty)}</span>` : ""}
      <div class="sub">${esc(g.reps_note?.[n] || g.sets || "3 sets of 8–12 reps")}</div><div class="sub w">${esc(weightLine(n))}</div>
      <a href="#" class="linkish howto" data-ch="10" data-anchor="${slug(n)}">How to do it, step by step</a>
      ${!th || vids.length > 1 ? `<div class="vids">${vlinks(th ? vids.slice(1) : vids)}</div>` : ""}</div>
      ${ty ? `<details class="form-card" data-key="form:${sl}"><summary>Show the form picture</summary><img src="assets/learn/form-${sl}.svg" alt="${esc(n)}: start and end positions" loading="lazy"></details>` : ""}</li>`; }).join("");
    return `<ol class="steps">
      <li><b>Eat and drink before.</b> Have a normal meal 2–3 hours before, or a light snack with carbs and protein 30–60 minutes before: bread and eggs, oats with milk, or a banana with Greek yoghurt. Drink a glass of water, and keep a bottle nearby to sip between sets. If you take creatine, have 3–5 g with that water.</li>
      <li><b>Warm up, 5 minutes.</b> Move slowly and with control.<div class="vids">${vlinks(g.warmup)}</div></li>
      <li><b>Lift.</b> A rep is one full movement, down and up. A set is a run of reps without stopping. Do all the sets of one exercise before moving to the next.
        <br>Stop each set when you could still do ${esc(g.rir || "1–3")} more good reps, meaning full movements with control and no pain. Rest ${esc(g.rest || "60–120 seconds")} between sets, and about 2 minutes before the next exercise.
        <br><span class="sub">On each body map, strong yellow is a main muscle and light yellow is a helper.</span>
        <ul class="exlist">${ex}</ul></li>
      <li><b>Cool down, 5–10 minutes.</b> Hold each stretch 20–40 seconds. Mild tension, no pain, no bouncing.<div class="vids">${vlinks(g.cooldown)}</div></li>
      <li><b>Eat and drink after.</b> Have a meal with protein within a few hours, such as rice with chicken or fish and beans. There's no 30-minute rush. Drink water to replace what you sweated. If food won't reach 120 g of protein today, a scoop of whey (about 20–25 g) counts.</li>
      <li><b>Log it.</b> The weight, the reps in each set, and how many more good reps you could have done.</li>
    </ol>
    <p class="note">Bad day? The warm-up and the first two exercises still count as a session.</p>
    <button class="btn" type="button" data-log="${kind}">Log Strength ${kind}</button>`;
  }
  function walkCard(date) {
    const g = gd(), t = stepTarget(date) || stepTarget(blockStart());
    return `<ol class="steps">
      <li><b>Drink before you go.</b> A glass of water, and take a bottle if it's hot. A 20–30 minute walk needs no special food. If you take creatine, have 3–5 g with that water.</li>
      <li><b>Walk 20–30 minutes</b> at a brisk pace, meaning you can talk but not sing.</li>
      <li><b>Reach ${n0(t)} steps</b> across the day. Your watch counts them. Check it in the evening and top up with a short walk if needed.</li>
      <li><b>Mobility, 10 minutes.</b> Pick one video.<div class="vids">${vlinks(g.mobility)}</div></li>
      <li><b>Log it.</b> Steps and sleep from your watch, and energy from 1 (drained) to 10 (full of energy). Send Claude a photo of each meal, or the receipt when you eat out, and say if you shared it.</li>
    </ol>
    <button class="btn" type="button" data-log="walk">Log today</button>`;
  }
  function restCard(date) {
    const t = stepTarget(date) || stepTarget(blockStart());
    return `<ol class="steps">
      <li><b>Rest from lifting.</b> Muscles rebuild on rest days. If you take creatine, still have 3–5 g today.</li>
      <li><b>Still reach ${n0(t)} steps.</b> The step target counts every day.</li>
      <li><b>Get ready for tomorrow:</b> sleep 7 hours or more, and plan tomorrow's protein: eggs, chicken, fish, beans or Greek yoghurt at each meal.</li>
    </ol>
    <button class="btn" type="button" data-log="rest">Log today</button>`;
  }
  function renderPlan() {
    const before = TODAY < firstDay(), date = before ? firstDay() : TODAY;
    const auto = planFor(date), kind = planPick || auto.kind;
    const names = { A: "Strength A", B: "Strength B", C: "Strength C", walk: "Walk and mobility", rest: "Rest day" };
    const g = gd();
    document.getElementById("plan-title").textContent = before ? `First session: ${fmtW(date)}` : (planPick ? names[kind] : `Today: ${names[kind]}`);
    let line = "";
    if (/^[ABC]$/.test(kind)) line = `About ${g.minutes || 45} minutes. Tap ▶ to watch how each move is done.`;
    if (!planPick && auto.done) line = `Done and logged today. ${line}`;
    const miss = !before && !planPick && !auto.done && (kind === "walk" || kind === "rest") ? missedYesterday(date) : null;
    document.getElementById("plan-line").innerHTML = esc(line) + (miss ? `${line ? " " : ""}<span class="miss">You missed yesterday's session. One miss is normal, two in a row starts a habit of skipping: <button type="button" class="linkish" data-pick="${miss}">do Strength ${miss} today instead</button>.</span>` : "");
    const opts = [["auto", before ? "Day 1" : "Today"], ["A", "A"], ["B", "B"], ["C", "C"], ["walk", "Walk"]];
    document.getElementById("plan-pick").innerHTML = opts.map(([k, l]) => `<button type="button" data-pick="${k}" aria-pressed="${(planPick || "auto") === k}">${l}</button>`).join("");
    document.getElementById("plan-card").innerHTML = /^[ABC]$/.test(kind) ? strengthCard(kind) : kind === "walk" ? walkCard(date) : restCard(date);
  }

  function renderGuide() {
    const g = gd(), t = cfg().targets, steps = t.steps.map(s => n0(s.steps));
    const sec = (title, body, open) => `<details class="card gsec" data-key="guide:${slug(title)}"${open ? " open" : ""}><summary>${title}</summary><div class="gbody">${body}</div></details>`;
    document.getElementById("guide-body").innerHTML = [
      sec("What to do each day", `<ul>
        <li><b>Monday, Wednesday, Friday:</b> a strength session (A, then B, then C). The Week tab shows exactly what to do.</li>
        <li><b>Tuesday, Thursday, Saturday:</b> a 20–30 minute walk and 10 minutes of mobility.</li>
        <li><b>Sunday:</b> rest from lifting.</li>
        <li><b>Every day:</b> reach your step target, eat about ${n0(t.kcal)} calories with ${t.protein_g} g of protein, sleep ${t.sleep_h} hours or more, and log your numbers.</li></ul>
        <p>Missed a strength day? Do it the next day and push the rest of the week back one day. Never do strength two days in a row.</p><figure class="fig"><img src="assets/learn/week.svg" alt="Your week: strength on Monday, Wednesday and Friday, walks on the other days, rest on Sunday" loading="lazy"></figure>`, true),
      sec("How a week passes", `<p>A week passes with <b>${t.pass_sessions} or more strength sessions</b> and <b>${t.pass_step_days} or more days at the step target</b>. Three sessions is the plan, two is the pass.</p>
<figure class="fig"><img src="assets/learn/steps.svg" alt="Daily step target rising from 5,000 to 8,000 over 12 weeks" loading="lazy"></figure>
        <p>Step target: ${steps[0]} a day in weeks 1–2, ${steps[1]} in weeks 3–4, ${steps[2]} in weeks 5–8 and ${steps[3]} in weeks 9–12.</p>
        <p><b>Never miss twice.</b> One missed session is normal. Two in a row starts a new habit of skipping.</p>
        <p><b>The minimum session:</b> on a bad day, the warm-up and the first two exercises (about 20 minutes) still count.</p>`),
      sec("How to do a strength session", `<p>Warm up for 5 minutes, do the five exercises, then cool down. Each exercise has a ▶ video on the Week tab. Watch it before the first set until the move feels familiar.</p><figure class="fig"><img src="assets/learn/session.svg" alt="A strength session: warm-up, five exercises, cool-down" loading="lazy"></figure><figure class="fig"><img src="assets/learn/sets.svg" alt="Three sets of ten reps" loading="lazy"></figure><figure class="fig"><img src="assets/learn/rir.svg" alt="Reps in reserve: stop each set with 1 to 3 good reps left" loading="lazy"></figure>
        <ul><li><b>Rep:</b> one full movement, down and up.</li>
        <li><b>Set:</b> a group of reps done without stopping. "3 sets of 8–12" means 8–12 reps, rest, twice more.</li>
        <li><b>Reps in reserve:</b> how many more good reps you could have done when you stopped. End each set with ${esc(g.rir || "1–3")} left. If you could have done 5 more, it was too light.</li>
        <li><b>Rest:</b> ${esc(g.rest || "60–120 seconds")} between sets, long enough to hit your reps again.</li>
        <li><b>Speed:</b> about 2–3 seconds lowering and 1 second lifting. Control beats speed.</li></ul>
        <p><b>Form comes first.</b> Start light. Effort and a burning muscle are fine. Stop a set if you feel sharp pain or pain in a joint.</p>`),
      sec("When to add weight", `<p>Stay at a weight until <b>every set reaches 12 reps</b> with good form. Then add 2.5 kg to the barbell and go back to 8 reps. With dumbbells, use a heavier pair if you have one; if not, lower each rep over 3 seconds to make the same weight harder.</p>
        <p>Example: 30 kg for 10, 9, 8 reps. Next time 11, 10, 9. Later 12, 12, 12. Next session, 32.5 kg for 8 each set.</p>
<figure class="fig"><img src="assets/learn/progression.svg" alt="Add reps until every set reaches 12, then add weight" loading="lazy"></figure>
        <p>You don't need to work this out. The Week tab shows "stay" or "go up" for each exercise from your last log.</p>`),
      sec("Eating", `<ul><li><b>Calories, about ${n0(t.kcal)} a day,</b> to lose about 0.5 kg a week: ${t.protein_g} g of protein, about ${t.carbs_g} g of carbs and about ${t.fat_g} g of fat. Judge it by the weekly weight average, not one day.</li>
        <li><b>Protein, about ${t.protein_g} g a day,</b> spread over 3–4 meals. Rough amounts: an egg has about 6 g, 100 g of cooked chicken about 30 g, a cup of cooked beans about 15 g, a scoop of whey (a protein powder) about 20–25 g. 100 g of cooked chicken is about the size of your palm.</li>
        <li><b>Before training:</b> a meal 2–3 hours before, or a light snack with carbs (starchy or sweet foods like bread, oats, plantain or fruit) and protein 30–60 minutes before.</li>
        <li><b>After training:</b> a meal with protein within a few hours. There's no 30-minute rush.</li>
        <li><b>Water:</b> about 2.5–3 litres a day, which is 5 or 6 bottles of 500 ml, more when you sweat. Pale yellow urine means you're drinking enough.</li>
        <li>Vegetables or fruit in 2 or more meals.</li></ul><figure class="fig"><img src="assets/learn/protein.svg" alt="About 120 g of protein a day as four meals of about 30 g" loading="lazy"></figure>`),
      sec("Sleep and recovery", `<ul><li>Sleep ${t.sleep_h}–9 hours, at roughly the same times each night.</li>
        <li>No caffeine after 2 pm, screens off 60–90 minutes before bed, and a light dinner 2–3 hours before bed.</li>
        <li>Soreness is normal in the first weeks. Soreness lasting more than 3 days, constant tiredness or stalled lifts mean you need more sleep, food or rest.</li></ul>`),
      sec("What to log and when", `<ul><li><b>Every day:</b> steps and sleep from your watch, energy from 1 (drained) to 10 (full of energy), and a photo of each meal or receipt sent to Claude, saying if you shared it. Claude estimates calories, protein, carbs and fat. Photo estimates can be 20–30% off, so the weekly weight average is the real check.</li>
        <li><b>After each session:</b> weight, reps for each set and reps in reserve for every exercise.</li>
        <li><b>2–3 mornings a week:</b> body weight, before eating. The trend matters, not one reading.</li>
        <li><b>Every 4 weeks:</b> waist, neck, hips, chest, arm and thigh (<a href="${esc(g.measure || "#")}" target="_blank" rel="noopener">how to measure</a>), plus front, side and back photos that stay off this page.</li></ul>
        <p>Log on the Log tab, or tell Claude "log today" with your numbers. Turn on Daily reminders on the Log tab to get today's plan each morning. Every Sunday evening a Telegram message scores your week.</p>`),
    ].join("");
  }

  function startLog(kind) {
    const f = document.getElementById("log-form");
    f.date.value = TODAY; prefill(TODAY);
    f.type.value = /^[ABC]$/.test(kind) ? kind : kind === "walk" ? "walk" : "";
    f.type.dispatchEvent(new Event("change"));
    showTab("log");
  }
  function wirePlan() {
    document.getElementById("plan").addEventListener("click", e => {
      const y = e.target.closest("[data-yt]"), c = e.target.closest("[data-close]");
      if (y) { e.preventDefault(); play(y); return; }
      if (c) { const box = c.closest(".player"); if (ui.video && ui.video.key === hostKey(box.closest("li"))) { ui.video = null; scheduleSave(); } box.remove(); return; }
      const p = e.target.closest("[data-pick]"), l = e.target.closest("[data-log]");
      if (p) { planPick = p.dataset.pick === "auto" ? null : p.dataset.pick; ui.plan = planPick; scheduleSave(); renderPlan(); }
      if (l) startLog(l.dataset.log);
    });
  }


  /* ---------- learn library (data/learn.json, built from the vault playbook) ---------- */
  let learn = null;
  async function loadLearn() {
    if (learn) return learn;
    try { learn = await (await fetch(`data/learn.json?t=${Date.now()}`, { cache: "no-store" })).json(); }
    catch { learn = []; }
    return learn;
  }
  async function renderLearnList() {
    const box = document.getElementById("learn-list");
    const ch = await loadLearn();
    box.innerHTML = ch.length ? ch.map((c, i) => `<button type="button" class="learn-item" data-ch="${c.id}"><span class="num">${i + 1}</span><span><b>${esc(c.title)}</b><span class="sub">${esc(c.blurb)}</span></span></button>`).join("")
      : `<p class="sub">The library didn't load. Check your connection and reopen the Guide.</p>`;
  }
  async function openChapter(id, anchor, restoring) {
    const ch = await loadLearn(), i = ch.findIndex(c => c.id === id);
    if (i < 0) return false;
    const c = ch[i];
    ui.chapter = id; ui.anchor = anchor || null;
    document.getElementById("chapter-num").textContent = `Chapter ${i + 1} of ${ch.length}`;
    document.getElementById("chapter-title").textContent = c.title;
    document.getElementById("chapter-body").innerHTML = c.html;
    const prev = ch[i - 1], next = ch[i + 1];
    document.getElementById("chapter-nav").innerHTML =
      (prev ? `<button type="button" class="btn ghost" data-ch="${prev.id}">← ${esc(prev.title)}</button>` : "<span></span>") +
      (next ? `<button type="button" class="btn ghost" data-ch="${next.id}">${esc(next.title)} →</button>` : "");
    showTab("chapter");
    uiApply();
    const target = anchor && document.getElementById(anchor), saved = ui.scroll[viewKey()];
    if (restoring && saved > 0) setScroll(saved);
    else if (target) target.scrollIntoView();
    scheduleSave();
    return true;
  }
  async function searchLearn(q) {
    const box = document.getElementById("search-results"), main = document.getElementById("guide-main");
    q = q.trim().toLowerCase();
    if (q.length < 2) { box.innerHTML = ""; main.hidden = false; ui.search = ""; scheduleSave(); return; }
    const ch = await loadLearn(), tmp = document.createElement("div"), hits = [];
    for (const c of [...ch].sort((a, b) => (b.title === "Glossary") - (a.title === "Glossary"))) {
      if (!c.text.toLowerCase().includes(q)) continue;
      tmp.innerHTML = c.html;
      const blocks = [...tmp.querySelectorAll("p, li, tr")].filter(el => !el.querySelector("li") && el.textContent.toLowerCase().includes(q)).slice(0, 3);
      hits.push(`<div class="card hit"><button type="button" class="hit-title" data-ch="${c.id}">${esc(c.title)} →</button>` +
        blocks.map(el => { const tx = (el.tagName === "TR" ? [...el.cells].map(c => c.textContent.trim()).join(" · ") : el.textContent).replace(/\s+/g, " ").trim(); const k = tx.toLowerCase().indexOf(q), st = Math.max(0, k - 80);
          const snip = (st ? "…" : "") + tx.slice(st, st + 220) + (tx.length > st + 220 ? "…" : "");
          return `<p class="snip">${esc(snip).replace(new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), m => `<mark>${m}</mark>`)}</p>`; }).join("") + `</div>`);
    }
    main.hidden = true;
    ui.search = q; scheduleSave();
    box.innerHTML = hits.length ? `<p class="sub">${hits.length} chapter${hits.length > 1 ? "s" : ""} mention "${esc(q)}".</p>` + hits.join("") : `<p class="sub">Nothing in the playbook mentions "${esc(q)}".</p>`;
  }
  function wireLearn() {
    document.addEventListener("click", e => {
      const a = e.target.closest("[data-ch]");
      if (!a || !a.closest("#guide, #chapter, #plan")) return;
      e.preventDefault(); openChapter(a.dataset.ch, a.dataset.anchor);
    });
    document.getElementById("chapter-back").addEventListener("click", () => showTab("guide"));
    document.getElementById("learn-search").addEventListener("input", e => searchLearn(e.target.value));
  }

  /* ---------- daily reminders (Web Push through the fitness-push Worker, push/worker.js) ---------- */
  const PUSH = "https://fitness-push.realjaymes.workers.dev";
  const VAPID = "BO_ZSPIi1t61n9zpwBj8bHY9wO4AIoKDzDrllhpJ6W4hYUboyiOBPgm3wd4m2IKjie8B13W3MJG-7dLmtlSAewc";
  function wireReminders() {
    const on = document.getElementById("remind-on"), off = document.getElementById("remind-off"), msg = document.getElementById("remind-msg");
    const say = (t, cls = "") => { msg.className = "msg " + cls; msg.textContent = t; };
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
    if (DEMO) { on.disabled = true; return say("Reminders are off in the sample view."); }
    if (!ok) { on.disabled = true; return say(iphone && !standalone ? "Open the tracker from its Home Screen icon to turn these on." : "This browser can't show notifications from a web app."); }
    const key = Uint8Array.from(atob(VAPID.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0));
    const reg = navigator.serviceWorker.register("sw.js");
    const show = sub => { on.hidden = !!sub; off.hidden = !sub; if (sub) say("On for this device.", "ok"); };
    reg.then(r => r.pushManager.getSubscription()).then(show).catch(() => {});
    on.addEventListener("click", async () => {
      try {
        if (await Notification.requestPermission() !== "granted") throw new Error("Notifications are blocked. Allow them for Fitness in Settings, then try again.");
        const r = await navigator.serviceWorker.ready;
        const sub = (await r.pushManager.getSubscription()) || await r.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const res = await fetch(`${PUSH}/subscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subscription: sub.toJSON() }) });
        if (!res.ok) throw new Error("The reminder server didn't accept this device. Try again in a minute.");
        show(sub); say("On. A test notification is on its way.", "ok");
      } catch (e) { say(e.message, "err"); }
    });
    off.addEventListener("click", async () => {
      try {
        const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
        if (sub) { await fetch(`${PUSH}/unsubscribe`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
        show(null); say("Off for this device.");
      } catch (e) { say(e.message, "err"); }
    });
  }

  /* ---------- keep my place (localStorage ft_ui) ----------
     The tab, Guide chapter and anchor, scroll position per view, which <details> are open (by stable key),
     the open exercise video and how far in it was, and the plan, range and lift pickers. It is saved as things
     change and when the app goes to the background, and put back after every render and on a cold start. */
  const uiKey = "ft_ui";
  const ui = { tab: null, chapter: null, anchor: null, scroll: {}, open: {}, video: null, plan: null, range: null, lift: null, search: "" };
  try { const s = JSON.parse(localStorage.getItem(uiKey) || "null"); if (s && typeof s === "object") Object.assign(ui, s); } catch {}
  if (!ui.scroll || typeof ui.scroll !== "object") ui.scroll = {};
  if (!ui.open || typeof ui.open !== "object") ui.open = {};
  let uiArmed = false, uiTimer = 0;
  const startTab = () => ui.tab && ui.tab !== "chapter" && document.querySelector(`.tabs [data-go="${ui.tab}"]`) ? ui.tab : (ui.tab === "chapter" ? "guide" : "today");
  const viewKey = () => document.body.dataset.tab === "chapter" ? `chapter:${ui.chapter}` : (document.body.dataset.tab || "today");
  const hostKey = li => li.dataset.key || `li:${((li.querySelector("b") || {}).textContent || "").trim().slice(0, 40)}`;
  const detailKey = d => {
    if (d.dataset.key) return d.dataset.key;
    const host = d.closest("[id]"), id = host ? host.id : "";
    return `${id === "chapter-body" ? `chapter:${ui.chapter}` : id}:${((d.querySelector(":scope > summary") || {}).textContent || "").trim().slice(0, 60)}`;
  };
  function saveUI() {
    clearTimeout(uiTimer); uiTimer = 0;
    if (!uiArmed) return;
    try { localStorage.setItem(uiKey, JSON.stringify(ui)); } catch {}
  }
  function scheduleSave() { if (uiArmed && !uiTimer) uiTimer = setTimeout(saveUI, 800); }
  function uiRead() {
    document.querySelectorAll("details").forEach(d => { ui.open[detailKey(d)] = d.open; });
    ui.scroll[viewKey()] = Math.round(window.scrollY);
  }
  function setScroll(y) {
    if (!(y > 0)) return;
    scrollTo(0, y); requestAnimationFrame(() => scrollTo(0, y)); setTimeout(() => scrollTo(0, y), 250);
  }
  function uiApply() {
    document.querySelectorAll("details").forEach(d => { const k = detailKey(d); if (k in ui.open) d.open = !!ui.open[k]; });
    const v = ui.video;
    if (!v) return;
    const host = [...document.querySelectorAll("#plan li")].find(li => hostKey(li) === v.key);
    const el = host && host.querySelector(`[data-yt="${v.id}"]`);
    if (el && !host.querySelector(":scope > .player")) play(el, Math.floor(v.t || 0));
  }
  // Watch the open video's clock. The embed (enablejsapi=1) answers a "listening" message with infoDelivery
  // events that carry currentTime.
  document.addEventListener("load", e => {
    if (e.target.tagName === "IFRAME" && e.target.closest(".player")) { try { e.target.contentWindow.postMessage(JSON.stringify({ event: "listening", id: 1, channel: "widget" }), "https://www.youtube-nocookie.com"); } catch {} }
  }, true);
  addEventListener("message", e => {
    if (e.origin !== "https://www.youtube-nocookie.com" || !ui.video) return;
    let m; try { m = JSON.parse(e.data); } catch { return; }
    const t = m && m.event === "infoDelivery" && m.info && m.info.currentTime;
    const box = [...document.querySelectorAll(".player")].find(b => { const f = b.querySelector("iframe"); return f && f.contentWindow === e.source; });
    if (typeof t === "number" && box && box.dataset.id === ui.video.id) { ui.video.t = Math.floor(t); scheduleSave(); }
  });
  document.addEventListener("toggle", e => { if (e.target.tagName === "DETAILS" && uiArmed) { ui.open[detailKey(e.target)] = e.target.open; scheduleSave(); } }, true);
  addEventListener("scroll", () => { if (uiArmed) { ui.scroll[viewKey()] = Math.round(window.scrollY); scheduleSave(); } }, { passive: true });
  addEventListener("pagehide", () => { if (uiArmed) { uiRead(); saveUI(); } });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden" && uiArmed) { uiRead(); saveUI(); } });

  /* ---------- layout ---------- */
  function wireLayout() {
    if (typeof Chart !== "undefined") Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    document.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => {
      range = b.dataset.range; ui.range = range; scheduleSave();
      document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderTrends(); renderLifts(); renderBody();
    }));
    document.getElementById("lift-pick").addEventListener("change", e => { ui.lift = e.target.value; scheduleSave(); renderLifts(); });
    const show = showTab = tab => {
      document.body.dataset.tab = tab;
      document.querySelectorAll("section[data-tab]").forEach(s => s.classList.toggle("on", s.dataset.tab === tab));
      document.querySelectorAll(".tabs [data-go]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.go === (tab === "chapter" ? "guide" : tab))));
      if (tab === "guide") renderLearnList();
      Object.values(charts).forEach(c => c.resize());
      window.scrollTo(0, 0);
      if (uiArmed) { ui.tab = tab; ui.scroll[viewKey()] = 0; scheduleSave(); }
    };
    wirePlan(); wireLearn(); wireReminders();
    document.querySelector(".tabs").addEventListener("click", e => { const b = e.target.closest("[data-go]"); if (b) show(b.dataset.go); });
    show(location.hash === "#log" ? "log" : startTab());
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  }

  function renderAll() {
    if (uiArmed) uiRead();   // a re-render rebuilds the page, so note what is open and where we are first
    renderAll0();
    uiApply(); setScroll(ui.scroll[viewKey()]);
  }
  function renderAll0() {
    renderHeader(); renderPlan(); renderFood(); renderGuide(); renderWeek(); renderGrid(); renderInsights();
    renderTrends(); renderLifts(); renderBody(); renderHistory();
  }

  async function load() {
    if (getToken() && !DEMO) {
      try {
        const r = await fetch(`${api}?ref=${BRANCH}`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
        if (r.ok) return r.text();
      } catch {}
    }
    const r = await fetch(`${PATH}?t=${Date.now()}`, { cache: "no-store" });
    return r.text();
  }

  async function init() {
    wireLayout();
    try { raw = await load(); log = JSON.parse(raw); }
    catch { document.getElementById("block-line").textContent = "Couldn't load the log. Refresh to try again."; return; }
    TODAY = iso(new Date());
    // local preview only: ?today=YYYY-MM-DD
    if (location.hostname === "localhost" && /^\d{4}-\d\d-\d\d$/.test(params.get("today") || "")) TODAY = params.get("today");
    if (DEMO) addDemo();
    if (ui.range === "block" || ui.range === "all") { range = ui.range; document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.range === range))); }
    if (["A", "B", "C", "walk"].includes(ui.plan)) planPick = ui.plan;
    if (TODAY < firstDay()) {
      range = "all";
      document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.range === "all")));
    }
    wireForm();
    try { MUS = await (await fetch(`data/muscles.json?t=${Date.now()}`, { cache: "no-store" })).json(); } catch {}
    renderAll();
    // Reopen the Guide chapter and search the app was left on, then start saving.
    const hashed = location.hash === "#log";
    if (!hashed && ui.tab === "chapter" && ui.chapter) await openChapter(ui.chapter, ui.anchor, true);
    if (ui.search && !hashed) { const q = document.getElementById("learn-search"); q.value = ui.search; searchLearn(ui.search); }
    uiArmed = true;
    // A Home Screen app resumes without reloading. Fetch the log again when it comes back into view,
    // and rebuild the page only if the log changed (or the day did), so nothing the reader opened collapses.
    let loadedAt = Date.now();
    document.addEventListener("visibilitychange", async () => {
      if (document.visibilityState !== "visible" || DEMO || Date.now() - loadedAt < 60000) return;
      try {
        const text = await load(), day = iso(new Date());
        loadedAt = Date.now();
        if (text === raw && (params.get("today") || day === TODAY)) return;
        raw = text; log = JSON.parse(text); if (!params.get("today")) TODAY = day; renderAll();
      } catch {}
    });
  }
  init();
})();
