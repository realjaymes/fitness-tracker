/* Fitness Tracker: reads data/log.json and renders the week, rhythm, trends, lifts and body views.
   ?v=a  single scrolling dashboard   ?v=b  app layout with bottom tabs   ?demo=1  sample data */
(() => {
  "use strict";

  const OWNER = "realjaymes", REPO = "fitness-tracker", PATH = "data/log.json", BRANCH = "main";
  const STRENGTH = new Set(["A", "B", "C", "strength"]);
  const LIGHT = new Set(["walk", "mobility", "cardio", "hiit", "other"]);
  const TYPE_NAMES = { A: "Strength A", B: "Strength B", C: "Strength C", strength: "Strength",
    walk: "Walk", mobility: "Mobility", cardio: "Cardio", hiit: "HIIT", other: "Other" };
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const params = new URLSearchParams(location.search);
  const DEMO = params.get("demo") === "1";
  const VARIANT = params.get("v") === "b" ? "b" : "a";

  let log, TODAY, range = "block";
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
    return [blockStart(), end < blockStart() ? blockStart() : end];
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
      log.days.push({ date: s, steps: Math.max(900, steps), sleep_h: sleep,
        protein_g: Math.round(85 + r() * 55 + w * 2), energy: Math.max(1, Math.min(10, Math.round(sleep - 1 + r() * 2.5))) });
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
      Object.assign(b, { waist_in: waist, hips_in: 38, chest_in: 38.2, arm_in: 14.3, thigh_in: 21.7 });
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
    const grid = css("--grid"), muted = css("--muted"), ink = css("--ink");
    const base = {
      responsive: true, maintainAspectRatio: false, animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: css("--surface"), titleColor: ink, bodyColor: ink, borderColor: css("--axis"),
          borderWidth: 1, padding: 10, boxPadding: 4, usePointStyle: true,
          filter: i => i.raw != null && !i.dataset.hideTip },
      },
      scales: {
        x: { grid: { display: false }, border: { color: css("--axis") },
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
  const target = (label, data) => line(label, data, css("--muted"), { borderDash: [4, 4], stepped: true, tension: 0, borderWidth: 1.5 });

  /* ---------- render: header + week ---------- */
  function renderHeader() {
    const b = cfg().block, w = weekOf(TODAY);
    const el = document.getElementById("block-line");
    if (TODAY < blockStart()) el.textContent = `${b.name} starts ${fmtW(blockStart())}`;
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
    if (before) out.push(status("warn", `Week 1 starts ${fmtW(blockStart())}`, `Aim for Strength A, B and C on Monday, Wednesday and Friday, and ${n0(w.target)} steps a day. Two sessions and four step days pass the week.`));
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
      out.push(status(loggedToday ? "good" : "warn", loggedToday ? "Today is logged" : "Today isn't logged yet", loggedToday ? "" : "Tell Claude your steps, sleep, protein and energy, or use the Log form."));
    }
    document.getElementById("week-status").innerHTML = out.join("");
  }

  /* ---------- render: rhythm grid ---------- */
  function renderGrid() {
    const dm = dayMap(), weeks = cfg().block.weeks;
    let html = `<span></span>${WEEKDAYS.map(d => `<span class="hd">${d[0]}</span>`).join("")}<span></span>`;
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
    const started = TODAY >= blockStart();

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
        const h = liftHistory(name, blockStart(), TODAY).filter(x => x.kg > 0);
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
      bar("Steps", steps, css("--s1"), { order: 3 }),
      line("7-day average", roll, css("--s2"), { order: 1 }),
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
      bar("Strength", weeks.map(w => w.strength), css("--s1"), { stack: "s" }),
      bar("Walk or mobility", weeks.map(w => w.light), css("--s3"), { stack: "s", borderSkipped: false }),
      target("Pass line", weeks.map(() => t.pass_sessions)),
    ] }, options: { scales: { x: { stacked: true }, y: { stacked: true, suggestedMax: 6, ticks: { stepSize: 1 } } }, plugins: { tooltip: wtip } } });

    chart("c-wsteps", { data: { labels: wl, datasets: [
      bar("Average steps", weeks.map(w => w.steps == null ? null : Math.round(w.steps)), css("--s1")),
      target("Target", weeks.map(w => stepTarget(w.start))),
    ] }, options: { plugins: { tooltip: wtip } } });

    const simple = (id, key, bigId, unit, tgt, color, opts = {}) => {
      const v = val(key), have = v.filter(x => x != null);
      const sets = [line(id, v, color, { pointRadius: 2.5, ...opts.ds })];
      if (tgt != null) sets.push(target("Target", ds.map(s => s >= blockStart() || range === "all" ? tgt : null)));
      chart(id, { data: { labels: ds.map(label), datasets: sets }, options: deepMerge({ plugins: { tooltip: tip } }, opts.options || {}) });
      document.getElementById(bigId).textContent = have.length ? `${n1(mean(have))}${unit} avg${tgt != null ? ` · target ${tgt}${unit}` : ""}` : "No data yet";
    };
    simple("c-sleep", "sleep_h", "sleep-big", " h", t.sleep_h, css("--s1"), { options: { scales: { y: { suggestedMax: 9 } } } });
    simple("c-energy", "energy", "energy-big", "", null, css("--s1"), { options: { scales: { y: { min: 0, max: 10 } } } });
    const prot = val("protein_g");
    chart("c-protein", { data: { labels: ds.map(label), datasets: [
      bar("Protein (g)", prot, css("--s1")), target("Target", ds.map(() => t.protein_g)),
    ] }, options: { plugins: { tooltip: tip } } });
    const ph = prot.filter(v => v != null);
    document.getElementById("protein-big").textContent = ph.length ? `${n0(mean(ph))} g avg · target ${t.protein_g} g` : "No data yet";
  }

  /* ---------- render: lifts ---------- */
  function renderLifts() {
    const [from, to] = rangeBounds();
    const pick = document.getElementById("lift-pick");
    const names = allLiftNames();
    const current = pick.value || names.find(n => liftHistory(n).length) || names[0];
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
      ? [line("Best set (reps)", h.map(x => x.top), css("--s1"), { pointRadius: 4, tension: 0 })]
      : [line("Top set (kg)", h.map(x => x.kg), css("--s1"), { pointRadius: 4, tension: 0, stepped: false }),
         line("Estimated 1-rep max (kg)", h.map(x => x.e1rm && Math.round(x.e1rm * 10) / 10), css("--s2"), { pointRadius: 4, tension: 0 })] },
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
      const step = /^(Barbell|Bench|Deadlift)/.test(name) ? 2.5 : 1;
      return `All sets hit 12, so go up to about ${kgs(last.kg + step)} for 8.`;
    }
    return `Stay at ${kgs(last.kg)} and add a rep where you can.`;
  }

  /* ---------- render: body ---------- */
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
      const due = addDays(lastM.date, 28);
      tiles.push(tile("Next measurements", due <= TODAY ? "Due" : fmt(due), "", `Every 4 weeks · last ${fmtY(lastM.date)}`));
    }
    document.getElementById("body-tiles").innerHTML = tiles.join("");

    const ws = weights.filter(b => b.date >= from && b.date <= to);
    const avg7 = ws.map(b => Math.round(mean(ws.filter(x => diffDays(x.date, b.date) >= 0 && diffDays(x.date, b.date) < 7).map(x => x.weight_kg)) * 10) / 10);
    chart("c-weight", { data: { labels: ws.map(b => fmt(b.date, { day: "numeric", month: "short", year: "2-digit" })), datasets: [
      line("Weigh-in", ws.map(b => b.weight_kg), css("--s1"), { showLine: false, pointRadius: 4, order: 2 }),
      line("7-day average", avg7, css("--s2"), { order: 1 }),
    ] }, options: { scales: { y: { beginAtZero: false, suggestedMin: Math.floor(Math.min(...ws.map(b => b.weight_kg), 99) - 1), suggestedMax: Math.ceil(Math.max(...ws.map(b => b.weight_kg), 0) + 1) } } } });
    document.getElementById("weight-big").textContent = ws.length >= 2 ? `${ws.at(-1).weight_kg - ws[0].weight_kg >= 0 ? "+" : ""}${n1(ws.at(-1).weight_kg - ws[0].weight_kg)} kg in range` : "";

    const ms = meas.filter(b => b.date >= from && b.date <= to);
    chart("c-waist", { data: { labels: ms.map(b => fmt(b.date, { day: "numeric", month: "short", year: "2-digit" })), datasets: [
      line("Waist (in)", ms.map(b => b.waist_in), css("--s1"), { pointRadius: 4, tension: 0 }),
    ] }, options: { scales: { y: { beginAtZero: false, suggestedMin: 33, suggestedMax: 38 } } } });

    const all = log.body.filter(b => b.waist_in != null || b.hips_in != null).slice().reverse();
    const c = v => v == null ? "–" : n1(v);
    document.getElementById("measure-table").innerHTML = all.length ? `<thead><tr><th>Date</th><th class="num">Weight</th><th class="num">Waist</th><th class="num">Hips</th><th class="num">Chest</th><th class="num">Arm</th><th class="num">Thigh</th></tr></thead><tbody>` +
      all.map(b => `<tr><td>${fmtY(b.date)}</td><td class="num">${c(b.weight_kg)}</td><td class="num">${c(b.waist_in)}</td><td class="num">${c(b.hips_in)}</td><td class="num">${c(b.chest_in)}</td><td class="num">${c(b.arm_in)}</td><td class="num">${c(b.thigh_in)}</td></tr>`).join("") + "</tbody>"
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
      if (d.protein_g != null) chips.push(`<span class="chip">${d.protein_g} g protein</span>`);
      if (d.energy != null) chips.push(`<span class="chip">energy ${d.energy}</span>`);
      if (b?.weight_kg != null) chips.push(`<span class="chip">${n1(b.weight_kg)} kg</span>`);
      for (const x of ss) chips.push(`<span class="chip ${isStrength(x) ? "s" : "l"}">${TYPE_NAMES[x.type] || esc(x.type)}${x.minutes ? ` · ${x.minutes} min` : ""}</span>`);
      const ex = ss.flatMap(x => (x.exercises || []).map(e => `${esc(e.name)} ${e.kg ? `${n1(e.kg)} kg` : "BW"} × ${e.reps.join("/")}`));
      const notes = [d.note, ...ss.map(x => x.note)].filter(Boolean).map(esc);
      return `<div class="row"><div class="d">${fmt(s, { weekday: "short" })}<small>${fmt(s, { day: "numeric", month: "short", year: "2-digit" })}</small></div><div><div class="chips">${chips.join("")}</div>${ex.length ? `<p class="ex">${ex.join(" · ")}</p>` : ""}${notes.length ? `<p class="ex">${notes.join(" · ")}</p>` : ""}</div></div>`;
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

  async function saveRemote(entry, tries = 2) {
    const r = await fetch(`${api}?ref=${BRANCH}`, { headers: headers(), cache: "no-store" });
    if (!r.ok) throw new Error(r.status === 401 ? "The token was rejected. Check it in Phone setup." : `GitHub said ${r.status} when reading the log.`);
    const file = await r.json();
    const remote = mergeEntry(JSON.parse(b64decode(file.content)), entry);
    const put = await fetch(api, { method: "PUT", headers: headers(), body: JSON.stringify({
      message: `log ${entry.day?.date || entry.session?.date || entry.body?.date} (from phone)`,
      content: b64encode(JSON.stringify(remote, null, 1) + "\n"), sha: file.sha, branch: BRANCH }) });
    if (put.status === 409 && tries > 1) return saveRemote(entry, tries - 1);
    if (!put.ok) throw new Error(`GitHub said ${put.status} when saving.`);
    return remote;
  }

  function lastFor(name) { return liftHistory(name).at(-1); }
  function renderExRows() {
    const form = document.getElementById("log-form"), type = form.type.value, box = document.getElementById("ex-rows");
    const list = cfg().program[type];
    if (!list) { box.innerHTML = type ? `<label class="f">Minutes<input type="number" name="minutes" inputmode="numeric" min="0" max="300"></label>` : ""; return; }
    box.innerHTML = `<div class="exhead"><span>Exercise</span><span>kg</span><span>Reps</span><span>RIR</span></div>` + list.map((n, i) => {
      const l = lastFor(n);
      return `<div class="exrow"><span class="n">${esc(n)}</span><input name="kg${i}" inputmode="decimal" placeholder="${l ? l.kg : "kg"}" value="${l ? l.kg : ""}" aria-label="${esc(n)} kg"><input name="reps${i}" inputmode="text" placeholder="${n === "Plank" ? "secs" : "8,8,8"}" aria-label="${esc(n)} reps"><input name="rir${i}" inputmode="numeric" placeholder="2" aria-label="${esc(n)} reps in reserve"></div>`;
    }).join("") + `<p class="sub">Leave reps empty to skip an exercise. Reps like 10,10,9. RIR is reps left in the tank.</p>`;
  }

  function prefill(date) {
    const f = document.getElementById("log-form"), d = dayMap().get(date) || {};
    f.steps.value = d.steps ?? ""; f.sleep.value = d.sleep_h ?? ""; f.protein.value = d.protein_g ?? ""; f.energy.value = d.energy ?? "";
  }

  function readForm() {
    const f = document.getElementById("log-form"), num = v => v === "" ? null : Number(v), date = f.date.value;
    const entry = {};
    const day = { steps: num(f.steps.value), sleep_h: num(f.sleep.value), protein_g: num(f.protein.value), energy: num(f.energy.value) };
    if (f.note.value.trim()) day.note = f.note.value.trim();
    for (const k of Object.keys(day)) if (day[k] == null) delete day[k];
    if (Object.keys(day).length) entry.day = { date, ...day };
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
    for (const [k, n] of [["weight_kg", "weight"], ["waist_in", "waist"], ["hips_in", "hips"], ["chest_in", "chest"], ["arm_in", "arm"], ["thigh_in", "thigh"]])
      if (f[n].value !== "") body[k] = Number(f[n].value);
    if (Object.keys(body).length) entry.body = { date, ...body };
    if (!Object.keys(entry).length) throw new Error("Nothing to save yet.");
    return entry;
  }

  function wireForm() {
    const f = document.getElementById("log-form"), msg = document.getElementById("form-msg");
    f.date.value = iso(new Date());
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
        f.type.value = ""; renderExRows();
      } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
    });
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

  /* ---------- layout ---------- */
  function wireLayout() {
    document.body.classList.add(`v-${VARIANT}`);
    document.querySelectorAll("[data-range]").forEach(b => b.addEventListener("click", () => {
      range = b.dataset.range;
      document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x === b)));
      renderTrends(); renderLifts(); renderBody();
    }));
    document.getElementById("lift-pick").addEventListener("change", renderLifts);
    const show = tab => {
      document.querySelectorAll("section[data-tab]").forEach(s => s.classList.toggle("on", s.dataset.tab === tab));
      document.querySelectorAll(".tabs [data-go]").forEach(b => b.setAttribute("aria-selected", String(b.dataset.go === tab)));
      Object.values(charts).forEach(c => c.resize());
      window.scrollTo(0, 0);
    };
    document.querySelectorAll(".tabs [data-go]").forEach(b => b.addEventListener("click", () => show(b.dataset.go)));
    show("today");
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", renderAll);
  }

  function renderAll() {
    renderHeader(); renderWeek(); renderGrid(); renderInsights();
    renderTrends(); renderLifts(); renderBody(); renderHistory();
  }

  async function load() {
    if (getToken() && !DEMO) {
      try {
        const r = await fetch(`${api}?ref=${BRANCH}`, { headers: { ...headers(), Accept: "application/vnd.github.raw+json" }, cache: "no-store" });
        if (r.ok) return r.json();
      } catch {}
    }
    const r = await fetch(`${PATH}?t=${Date.now()}`, { cache: "no-store" });
    return r.json();
  }

  async function init() {
    wireLayout();
    try { log = await load(); }
    catch { document.getElementById("block-line").textContent = "Couldn't load the log. Refresh to try again."; return; }
    TODAY = iso(new Date());
    if (DEMO) addDemo();
    if (TODAY < blockStart()) {
      range = "all";
      document.querySelectorAll("[data-range]").forEach(x => x.setAttribute("aria-pressed", String(x.dataset.range === "all")));
    }
    wireForm();
    renderAll();
  }
  init();
})();
