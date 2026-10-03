/* Hamster Rocket: daily Lucky Wheel (Glücksrad).
   In-game bonuses only, no real prizes. One spin per day per device (localStorage),
   resets with the daily course (21:00 America/New_York). Visual slice sizes match the real odds exactly: the landing
   slice is picked by the RNG first, then the wheel stops at a random point inside it. */
(() => {
  "use strict";
  const KEY = "hr_wheel", PKEY = "hr_bonus", TAU = Math.PI * 2;
  const BLANK_TOTAL = 65;                       // % chance of "nothing" (wins: 35%)
  // kind "perf" = gameplay bonus for the NEXT run (bonus run, not counted for the normal best); "cos" = looks only.
  // Weights are % and add up to 35 (stronger effects slightly lower).
  const BONUSES = {
    fuel:   { kind: "perf", w: 3.5, emoji: "🌻", color: "#fff1a8", opts: { fuel: 6 },
      en: ["+6 s seed fuel", "Start with 6 extra seconds of seed fuel."], de: ["+6 s Kerne-Treibstoff", "Start mit 6 Sekunden mehr Treibstoff."], fr: ["+6 s de carburant", "Départ avec 6 secondes de carburant en plus."] },
    turbo:  { kind: "perf", w: 3.5, emoji: "🚀", color: "#38d9ff", opts: { boost: 2.5 },
      en: ["Turbo start", "A 2.5 s speed boost right at launch."], de: ["Turbo-Start", "2,5 s Speed-Boost direkt beim Start."], fr: ["Départ turbo", "2,5 s d’accélération dès le décollage."] },
    red:    { kind: "perf", w: 3.5, emoji: "🔴", color: "#ff4d5e", rocket: "red", opts: { tap: 1.15 },
      en: ["Red rocket", "+15% thrust per tap."], de: ["Rote Rakete", "+15 % Schub pro Tipp."], fr: ["Fusée rouge", "+15\u00a0% de poussée par tap."] },
    blue:   { kind: "perf", w: 4.2, emoji: "🔵", color: "#4d8dff", rocket: "blue", opts: { drain: 0.85 },
      en: ["Blue rocket", "Seed fuel burns 15% slower."], de: ["Blaue Rakete", "Treibstoff verbrennt 15 % langsamer."], fr: ["Fusée bleue", "Le carburant brûle 15\u00a0% moins vite."] },
    green:  { kind: "perf", w: 4.2, emoji: "🟢", color: "#4fe08f", rocket: "green", opts: { seedMul: 1.2 },
      en: ["Green rocket", "Seeds give 20% more fuel."], de: ["Grüne Rakete", "Kerne geben 20 % mehr Treibstoff."], fr: ["Fusée verte", "Les graines donnent 20\u00a0% de carburant en plus."] },
    gold:   { kind: "perf", w: 2.8, emoji: "🟡", color: "#ffc21a", rocket: "gold", opts: { absorb: 1 },
      en: ["Gold rocket", "A gold shield absorbs one hit."], de: ["Gold-Rakete", "Ein Gold-Schild fängt einen Treffer ab."], fr: ["Fusée dorée", "Un bouclier doré absorbe un choc."] },
    purple: { kind: "perf", w: 3.5, emoji: "🟣", color: "#b69cff", rocket: "purple", opts: { comboWin: 1.2, combo: 1.15, comboFrom: 3 },
      en: ["Purple rocket", "Combos build faster: +20% combo time, +15% spin from 3 taps in a row."], de: ["Lila Rakete", "Combos bauen sich schneller auf: +20 % Combo-Zeit, +15 % Drehung ab 3 Tipps in Folge."], fr: ["Fusée violette", "Combos plus rapides\u00a0: +20\u00a0% de temps de combo, +15\u00a0% de rotation dès 3 taps d’affilée."] },
    silver: { kind: "perf", w: 4.9, emoji: "⚪", color: "#dfe6f0", rocket: "silver", opts: { steer: 1.2 },
      en: ["Silver rocket", "+20% steering control."], de: ["Silber-Rakete", "+20 % Lenk-Kontrolle."], fr: ["Fusée argentée", "+20\u00a0% de contrôle de direction."] },
    hamster: { kind: "cos", w: 4.9, emoji: "✨", color: "#ffa94d", skin: "gold",
      en: ["Golden hamster", "Your hamster turns golden until the next reset (looks only)."], de: ["Goldener Hamster", "Dein Hamster ist bis zum nächsten Reset golden (nur Optik)."], fr: ["Hamster doré", "Ton hamster devient doré jusqu’au prochain reset (look uniquement)."] }
  };
  const ORDER = ["fuel", "red", "blue", "turbo", "gold", "green", "hamster", "purple", "silver"];
  // one blank slice after every bonus slice, so the 65% "nothing" area is spread around the wheel
  const SLICES = [];
  ORDER.forEach(id => { SLICES.push({ id, w: BONUSES[id].w }); SLICES.push({ id: "none", w: BLANK_TOTAL / ORDER.length }); });
  const TOTAL = SLICES.reduce((a, s) => a + s.w, 0);   // = 100
  let acc = 0;
  SLICES.forEach(s => { s.a0 = acc / TOTAL * 360; acc += s.w; s.a1 = acc / TOTAL * 360; s.pct = s.w / TOTAL * 100; });

  const L = () => { const l = window.HRI18N && HRI18N.lang; return l === "de" || l === "fr" ? l : "en"; };
  const TX = {
    en: { spin: "🎡 Spin the wheel!", spinning: "Spinning…", next: "Next spin in", ready: "1 free spin today", hub: "SPIN",
      got: "You got", none: "No luck today, try again tomorrow!", pending: "Ready: applies to your next run.", used: "Used on your last run.",
      cos: "Active until the next reset (looks only).", nextRun: "Next run", play: "▶ Play with bonus", playNow: "▶ Play now", nothing: "Nothing",
      slices: "slices", fair: "Rocket colors, 🌻 and 🚀 change the gameplay of your next run: those bonus runs are marked and don't count for your normal best. The golden hamster is looks only.",
      looks: "looks only", usedToday: "Today's spin is used. Come back tomorrow!", resetAt: "New spin every day at 21:00 New York time, together with the new course", yourTime: "your time" },
    de: { spin: "🎡 Glücksrad drehen!", spinning: "Dreht…", next: "Nächster Dreh in", ready: "1 Gratis-Dreh heute", hub: "DREH",
      got: "Du hast", none: "Heute kein Glück, morgen wieder!", pending: "Bereit: gilt für deinen nächsten Flug.", used: "Beim letzten Flug genutzt.",
      cos: "Aktiv bis zum nächsten Reset (nur Optik).", nextRun: "Nächster Flug", play: "▶ Mit Bonus spielen", playNow: "▶ Jetzt spielen", nothing: "Nichts",
      slices: "Felder", fair: "Raketenfarben, 🌻 und 🚀 verändern das Gameplay deines nächsten Flugs: Diese Bonus-Flüge sind markiert und zählen nicht für deinen normalen Bestwert. Der goldene Hamster ist nur Optik.",
      looks: "nur Optik", usedToday: "Der heutige Dreh ist verbraucht. Komm morgen wieder!", resetAt: "Neuer Dreh jeden Tag um 21:00 New Yorker Zeit, zusammen mit der neuen Strecke", yourTime: "deine Zeit" },
    fr: { spin: "🎡 Tourner la roue\u00a0!", spinning: "Ça tourne…", next: "Prochain tour dans", ready: "1 tour gratuit aujourd’hui", hub: "TOURNE",
      got: "Tu obtiens", none: "Pas de chance aujourd’hui, reviens demain\u00a0!", pending: "Prêt\u00a0: s’applique à ta prochaine partie.", used: "Utilisé lors de ta dernière partie.",
      cos: "Actif jusqu’au prochain reset (look uniquement).", nextRun: "Prochaine partie", play: "▶ Jouer avec le bonus", playNow: "▶ Jouer", nothing: "Rien",
      slices: "cases", fair: "Les couleurs de fusée, 🌻 et 🚀 changent le gameplay de ta prochaine partie\u00a0: ces parties bonus sont signalées et ne comptent pas pour ton record normal. Le hamster doré est purement esthétique.",
      looks: "look uniquement", usedToday: "Le tour du jour est utilisé. Reviens demain\u00a0!", resetAt: "Nouveau tour chaque jour à 21:00, heure de New York, avec le nouveau parcours", yourTime: "ton heure" }
  };
  const tx = k => TX[L()][k];
  const name = id => BONUSES[id] ? BONUSES[id][L()][0] : tx("nothing");
  const fmtPct = p => { const l = L(), n = (Math.round(p * 10) / 10).toLocaleString(l === "de" ? "de-DE" : l === "fr" ? "fr-FR" : "en-US"); return l === "en" ? n + "%" : n + "\u00a0%"; };

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  // daily reset = the daily course reset (21:00 America/New_York, see sim.js)
  const SIM = window.HRSim;
  const dayKey = (ms = Date.now()) => SIM.roundFor(ms);
  const nextReset = (ms = Date.now()) => SIM.roundEnd(SIM.roundFor(ms));
  const todaySpin = () => { const s = store.get(KEY); return s && s.day === dayKey() && (s.result === "none" || BONUSES[s.result]) ? s : null; };
  const canSpin = () => !todaySpin();

  function rand() {
    try { const u = new Uint32Array(1); crypto.getRandomValues(u); return u[0] / 4294967296; } catch (e) { return Math.random(); }
  }
  function pickSlice(r = rand()) {
    let x = r * TOTAL;
    for (let i = 0; i < SLICES.length; i++) { x -= SLICES[i].w; if (x < 0) return i; }
    return SLICES.length - 1;
  }
  // slice under the pointer (top) for a given wheel rotation in degrees (clockwise)
  function sliceAt(rotDeg) {
    const phi = ((-rotDeg % 360) + 360) % 360;
    for (let i = 0; i < SLICES.length; i++) if (phi >= SLICES[i].a0 && phi < SLICES[i].a1) return i;
    return SLICES.length - 1;
  }
  const reduced = () => !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);

  let el = {}, rot = 0, spinning = false, last = null, ptrSlice = -1, lastDay = dayKey();

  // ---------- drawing ----------
  let off = null;
  function paint() {
    const cv = el.canvas; if (!cv || !off) return;
    if (cv.width !== off.width) { cv.width = off.width; cv.height = off.height; }
    const c = cv.getContext("2d"), h = cv.width / 2;
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
    c.translate(h, h); c.rotate(rot * Math.PI / 180); c.drawImage(off, -h, -h);
  }
  function draw(hl = -1) {
    if (!el.canvas) return;
    const css = el.canvas.clientWidth || 360, dpr = Math.min(window.devicePixelRatio || 1, 2.5), px = Math.max(200, Math.round(css * dpr));
    off = off || document.createElement("canvas");
    if (off.width !== px) { off.width = px; off.height = px; }
    const c = off.getContext("2d");
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, px, px); c.scale(px / 400, px / 400);
    const cx = 200, cy = 200, R = 192;
    c.beginPath(); c.arc(cx, cy, R + 6, 0, TAU); c.fillStyle = "#170d33"; c.fill();
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fillStyle = "#ff6b81"; c.fill();
    const r = R - 12;
    let blank = 0;
    SLICES.forEach((s, i) => {
      const a0 = (s.a0 - 90) * Math.PI / 180, a1 = (s.a1 - 90) * Math.PI / 180;
      c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, r, a0, a1); c.closePath();
      c.fillStyle = s.id === "none" ? (blank++ % 2 ? "#2a2c8a" : "#34379c") : BONUSES[s.id].color;
      c.fill(); c.lineWidth = 3; c.strokeStyle = "#170d33"; c.stroke();
      if (i === hl) { c.fillStyle = "rgba(255,255,255,.38)"; c.fill(); c.lineWidth = 6; c.strokeStyle = "#ffffff"; c.stroke(); }
      const mid = (s.a0 + s.a1) / 2 - 90, m = mid * Math.PI / 180, span = (s.a1 - s.a0) * Math.PI / 180;
      const lr = s.id === "none" ? r * 0.64 : r * 0.8;
      const fs = s.id === "none" ? 24 : Math.max(11, Math.min(26, lr * span * 0.78));
      c.save(); c.translate(cx + Math.cos(m) * lr, cy + Math.sin(m) * lr); c.rotate(m + Math.PI / 2);
      c.font = `${fs}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",system-ui,sans-serif`;
      c.textAlign = "center"; c.textBaseline = "middle";
      if (s.id === "none") c.globalAlpha = 0.6;
      c.fillText(s.id === "none" ? "😢" : BONUSES[s.id].emoji, 0, 0);
      c.restore();
    });
    for (let k = 0; k < 28; k++) {
      const a = k / 28 * TAU;
      c.beginPath(); c.arc(cx + Math.cos(a) * (R - 6), cy + Math.sin(a) * (R - 6), 3.4, 0, TAU);
      c.fillStyle = k % 2 ? "#fff6b0" : "#ffd23f"; c.fill();
    }
    paint();
  }
  const setRot = d => { rot = d; paint(); };

  // ---------- effects ----------
  function confetti() {
    if (reduced()) return;
    const cv = el.fx, box = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(box.width * dpr); cv.height = Math.round(box.height * dpr);
    const c = cv.getContext("2d"), W = cv.width, H = cv.height, cols = ["#ffd23f", "#38d9ff", "#ff6b81", "#6ee7a0", "#b69cff", "#ffffff"];
    const P = Array.from({ length: 120 }, () => {
      const a = rand() * TAU, v = (260 + rand() * 520) * dpr;
      return { x: W / 2, y: H * 0.42, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 260 * dpr, s: (4 + rand() * 6) * dpr, r: rand() * TAU, vr: (rand() - 0.5) * 14, c: cols[(rand() * cols.length) | 0] };
    });
    const t0 = performance.now(); let lt = t0;
    (function f(t) {
      const dt = Math.min(0.05, (t - lt) / 1000); lt = t;
      c.clearRect(0, 0, W, H);
      const age = (t - t0) / 1000;
      P.forEach(p => { p.vy += 900 * dpr * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
        c.save(); c.globalAlpha = Math.max(0, 1 - age / 1.9); c.translate(p.x, p.y); c.rotate(p.r); c.fillStyle = p.c; c.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); c.restore(); });
      if (age < 1.9) requestAnimationFrame(f); else c.clearRect(0, 0, W, H);
    })(t0);
  }

  // ---------- spin ----------
  function spin() {
    if (spinning || !canSpin()) return false;
    const i = pickSlice(), s = SLICES[i];
    const phi = s.a0 + (0.08 + 0.84 * rand()) * (s.a1 - s.a0);    // random point strictly inside the slice
    const start = rot, want = ((360 - phi) % 360 + 360) % 360;
    let end = start - (((start % 360) + 360) % 360) + want + 360 * 5;
    if (end - start < 360 * 4.5) end += 360;
    const res = { day: dayKey(), result: s.id, slice: i, angle: Math.round(phi * 1000) / 1000, at: Date.now() };
    store.set(KEY, res);                                    // spin is used up right away (also for "nothing")
    if (BONUSES[s.id] && BONUSES[s.id].kind === "perf") store.set(PKEY, { id: s.id, day: res.day });
    last = { slice: i, id: s.id, phi, end };
    spinning = true; el.box.classList.remove("won", "lost"); draw(); render();
    const dur = reduced() ? 0 : 3700, t0 = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 4);
    const land = () => {
      setRot(end); spinning = false;
      last.landed = sliceAt(end); last.ok = last.landed === i;
      draw(i); el.box.classList.add(s.id === "none" ? "lost" : "won");
      if (s.id !== "none") confetti();
      render(true);
      window.dispatchEvent(new CustomEvent("hr:wheel", { detail: { id: s.id } }));
    };
    if (!dur) { land(); return true; }
    (function f(t) {
      const k = Math.min(1, (t - t0) / dur), d = start + (end - start) * ease(k);
      setRot(d);
      const si = sliceAt(d);
      if (si !== ptrSlice) { ptrSlice = si; el.ptr.classList.remove("tick"); void el.ptr.offsetWidth; el.ptr.classList.add("tick"); }
      if (k < 1) requestAnimationFrame(f); else land();
    })(t0);
    return true;
  }

  // ---------- UI ----------
  const pad = n => String(n).padStart(2, "0");
  function countdown() {
    const ms = Math.max(0, nextReset() - Date.now()), s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`;
  }
  function render(fresh) {
    if (!el.go) return;
    const sp = todaySpin(), can = !sp;
    el.go.disabled = el.hub.disabled = spinning || can === false;
    el.go.textContent = spinning ? tx("spinning") : can ? tx("spin") : `⏳ ${tx("next")} ${countdown()}`;
    el.hub.textContent = tx("hub");
    el.count.textContent = spinning ? "" : can ? `✅ ${tx("ready")}` : `✔️ ${tx("usedToday")}`;
    const at = new Date(nextReset()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.resetInfo.textContent = `${tx("resetAt")} (${at} ${tx("yourTime")}).`;
    if (spinning || !sp) { el.result.hidden = true; el.result.innerHTML = ""; return; }
    const b = BONUSES[sp.result];
    el.result.hidden = false;
    el.result.className = "wheel-result " + (b ? "win" : "sad") + (fresh ? " fresh" : "");
    if (!b) {
      el.result.innerHTML = `<div class="wr-emoji sad-face" aria-hidden="true">🐹<span>😢</span></div><div><p class="wr-title">${tx("none")}</p><p class="muted small">${tx("next")} ${countdown()}</p></div>`;
      return;
    }
    const pend = store.get(PKEY), isPending = b.kind === "perf" && pend && pend.id === sp.result;
    const status = b.kind === "cos" ? tx("cos") : isPending ? tx("pending") : tx("used");
    const btn = `<a class="btn btn-primary btn-small" href="#play">${isPending || b.kind === "cos" ? tx("play") : tx("playNow")}</a>`;
    el.result.innerHTML = `<div class="wr-emoji" aria-hidden="true">${b.emoji}</div><div><p class="wr-title">${tx("got")}${L() === "fr" ? "\u00a0" : ""}: ${b[L()][0]}${L() === "fr" ? "\u00a0" : ""}!</p><p class="small">${b.kind === "perf" ? `<b>${tx("nextRun")}${L() === "fr" ? "\u00a0" : ""}:</b> ` : ""}${b[L()][1]}</p><p class="muted small">${status}</p>${btn}</div>`;
  }
  function legend() {
    if (!el.legend) return;
    const rows = ORDER.map(id => { const b = BONUSES[id];
      return `<li><span class="sw" style="background:${b.color}"></span><span class="lg-e" aria-hidden="true">${b.emoji}</span><span class="lg-n">${b[L()][0]}${b.kind === "cos" ? ` <em>(${tx("looks")})</em>` : ""}${b.kind === "perf" ? `<small>${b[L()][1]}</small>` : ""}</span><b>${fmtPct(b.w)}</b></li>`; });
    rows.push(`<li class="lg-none"><span class="sw" style="background:#2f3299"></span><span class="lg-e" aria-hidden="true">😢</span><span class="lg-n">${tx("nothing")} <em>(${ORDER.length} ${tx("slices")})</em></span><b>${fmtPct(BLANK_TOTAL)}</b></li>`);
    el.legend.innerHTML = rows.join("");
    el.fair.textContent = tx("fair");
  }
  function refresh() {
    const d = dayKey();
    if (d !== lastDay) { lastDay = d; if (!spinning) { el.box.classList.remove("won", "lost"); draw(); } window.dispatchEvent(new CustomEvent("hr:wheel", { detail: { id: null, reset: true } })); }
    render();
  }

  function init() {
    const $ = id => document.getElementById(id);
    el = { box: $("wheel-box"), canvas: $("wheel-canvas"), fx: $("wheel-fx"), ptr: $("wheel-pointer"), hub: $("wheel-hub"), go: $("wheel-go"),
      count: $("wheel-count"), result: $("wheel-result"), legend: $("wheel-legend"), fair: $("wheel-fair"), resetInfo: $("wheel-reset"),
      oddsBtn: $("odds-btn"), oddsTip: $("odds-tip") };
    if (!el.canvas) return;
    const sp = todaySpin();
    if (sp && SLICES[sp.slice] && SLICES[sp.slice].id === sp.result) { setRot(360 - sp.angle); draw(sp.slice); el.box.classList.add(sp.result === "none" ? "lost" : "won", "static"); }
    else { setRot(0); draw(); }
    el.go.addEventListener("click", spin); el.hub.addEventListener("click", spin);
    const tip = o => { el.oddsTip.hidden = !o; el.oddsBtn.setAttribute("aria-expanded", String(o)); };
    el.oddsBtn.addEventListener("click", e => { e.stopPropagation(); tip(el.oddsTip.hidden); });
    el.oddsBtn.addEventListener("mouseenter", () => tip(true)); el.oddsBtn.addEventListener("mouseleave", () => tip(false));
    el.oddsBtn.addEventListener("blur", () => tip(false));
    document.addEventListener("click", () => tip(false));
    if (window.ResizeObserver) new ResizeObserver(() => { const t = todaySpin(); draw(!spinning && t ? t.slice : -1); }).observe(el.canvas);
    window.addEventListener("hr:lang", () => { legend(); render(); });
    legend(); render();
    setInterval(refresh, 1000);
  }

  window.HRWheel = {
    SLICES, BONUSES, BLANK_TOTAL, sliceAt, pickSlice, spin, canSpin, dayKey, nextReset, refresh,
    pending() { const p = store.get(PKEY); const b = p && BONUSES[p.id]; return b && b.kind === "perf" ? { id: p.id, emoji: b.emoji, name: name(p.id), effect: b[L()][1], rocket: b.rocket || null, opts: b.opts } : null; },
    effect: id => BONUSES[id] ? BONUSES[id][L()][1] : "",
    consume() { store.del(PKEY); render(); },
    cosmetics() { const s = todaySpin(), b = s && BONUSES[s.result]; return b && b.kind === "cos" ? { id: s.result, emoji: b.emoji, name: name(s.result), skin: b.skin || null } : {}; },
    name, get spinning() { return spinning; }, get rotation() { return rot; }, get last() { return last; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
