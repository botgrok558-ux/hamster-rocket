/* Hamster Rocket: daily Lucky Wheel (Glücksrad).
   In-game bonuses only, no real prizes. One spin per day per device (localStorage),
   resets at 00:00 UTC. Visual slice sizes match the real odds exactly: the landing
   slice is picked by the RNG first, then the wheel stops at a random point inside it. */
(() => {
  "use strict";
  const KEY = "hr_wheel", PKEY = "hr_bonus", TAU = Math.PI * 2;
  const BLANK_TOTAL = 75;                       // % chance of "nothing"
  const BONUSES = {
    fuel:   { kind: "perf", w: 4, emoji: "🌻", color: "#ffd23f", opts: { fuel: 6 },
      en: ["+6 s seed fuel", "Your next run starts with 6 extra seconds of seed fuel."],
      de: ["+6 s Kerne-Treibstoff", "Dein nächster Flug startet mit 6 Sekunden mehr Treibstoff."] },
    turbo:  { kind: "perf", w: 4, emoji: "🚀", color: "#38d9ff", opts: { boost: 2.5 },
      en: ["Turbo start", "A 2.5 s speed boost right at launch on your next run."],
      de: ["Turbo-Start", "2,5 s Speed-Boost direkt beim Start deines nächsten Flugs."] },
    combo:  { kind: "perf", w: 3, emoji: "🔥", color: "#ff8a1f", opts: { combo: 1.5 },
      en: ["Combo x1.5", "On your next run, combo taps (5+ in a row) spin the wheel 1.5x harder."],
      de: ["Combo x1,5", "Im nächsten Flug drehen Combo-Tipps (ab 5 in Folge) das Rad 1,5x stärker."] },
    shield: { kind: "perf", w: 2, emoji: "🛡️", color: "#fff1a8", opts: { shield: 4 },
      en: ["Gold shield", "A golden shield protects you for the first 4 s of your next run."],
      de: ["Gold-Schild", "Ein goldener Schild schützt dich in den ersten 4 s deines nächsten Flugs."] },
    gold:   { kind: "cos", w: 4, emoji: "✨", color: "#ffb703", skin: "gold",
      en: ["Golden hamster", "Your hamster turns golden until the next reset (looks only)."],
      de: ["Goldener Hamster", "Dein Hamster ist bis zum nächsten Reset golden (nur Optik)."] },
    mint:   { kind: "cos", w: 4, emoji: "💚", color: "#6ee7a0", rocket: "mint",
      en: ["Mint rocket", "A mint-green rocket until the next reset (looks only)."],
      de: ["Mint-Rakete", "Eine mintgrüne Rakete bis zum nächsten Reset (nur Optik)."] },
    purple: { kind: "cos", w: 4, emoji: "💜", color: "#b69cff", rocket: "purple",
      en: ["Purple rocket", "A purple rocket until the next reset (looks only)."],
      de: ["Lila Rakete", "Eine lila Rakete bis zum nächsten Reset (nur Optik)."] }
  };
  const ORDER = ["fuel", "turbo", "gold", "combo", "mint", "shield", "purple"];
  // one blank slice after every bonus slice, so the 75% "nothing" area is spread around the wheel
  const SLICES = [];
  ORDER.forEach(id => { SLICES.push({ id, w: BONUSES[id].w }); SLICES.push({ id: "none", w: BLANK_TOTAL / ORDER.length }); });
  const TOTAL = SLICES.reduce((a, s) => a + s.w, 0);   // = 100
  let acc = 0;
  SLICES.forEach(s => { s.a0 = acc / TOTAL * 360; acc += s.w; s.a1 = acc / TOTAL * 360; s.pct = s.w / TOTAL * 100; });

  const L = () => (window.HRI18N && HRI18N.lang === "de") ? "de" : "en";
  const TX = {
    en: { spin: "🎡 Spin the wheel!", spinning: "Spinning…", next: "Next spin in", ready: "1 free spin today", hub: "SPIN",
      got: "You got", none: "No luck today, try again tomorrow!", pending: "Ready: applies to your next run.", used: "Used on your last run.",
      cos: "Active until the next reset (looks only).", play: "▶ Play with bonus", playNow: "▶ Play now", nothing: "Nothing",
      slices: "slices", fair: "🌻🚀🔥🛡️ bonus runs are marked and don't count for your normal best. Colors and skins are looks only.",
      looks: "looks only", usedToday: "Today's spin is used. Come back tomorrow!", resetAt: "New spin every day at 00:00 UTC", yourTime: "your time" },
    de: { spin: "🎡 Glücksrad drehen!", spinning: "Dreht…", next: "Nächster Dreh in", ready: "1 Gratis-Dreh heute", hub: "DREH",
      got: "Du hast", none: "Heute kein Glück, morgen wieder!", pending: "Bereit: gilt für deinen nächsten Flug.", used: "Beim letzten Flug genutzt.",
      cos: "Aktiv bis zum nächsten Reset (nur Optik).", play: "▶ Mit Bonus spielen", playNow: "▶ Jetzt spielen", nothing: "Nichts",
      slices: "Felder", fair: "🌻🚀🔥🛡️ Bonus-Flüge sind markiert und zählen nicht für deinen normalen Bestwert. Farben und Skins sind nur Optik.",
      looks: "nur Optik", usedToday: "Der heutige Dreh ist verbraucht. Komm morgen wieder!", resetAt: "Neuer Dreh jeden Tag um 00:00 UTC", yourTime: "deine Zeit" }
  };
  const tx = k => TX[L()][k];
  const name = id => BONUSES[id] ? BONUSES[id][L()][0] : tx("nothing");
  const fmtPct = p => (Math.round(p * 10) / 10).toLocaleString(L() === "de" ? "de-CH" : "en-US") + "%";

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } }
  };
  const dayKey = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
  const nextReset = (ms = Date.now()) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1); };
  const todaySpin = () => { const s = store.get(KEY); return s && s.day === dayKey() ? s : null; };
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
  function draw(hl = -1) {
    const cv = el.canvas; if (!cv) return;
    const css = cv.clientWidth || 360, dpr = Math.min(window.devicePixelRatio || 1, 2.5), px = Math.max(200, Math.round(css * dpr));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
    const c = cv.getContext("2d");
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
  }
  const setRot = d => { rot = d; el.canvas.style.transform = `rotate(${d}deg)`; };

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
    el.result.innerHTML = `<div class="wr-emoji" aria-hidden="true">${b.emoji}</div><div><p class="wr-title">${tx("got")}: ${b[L()][0]}!</p><p class="small">${b[L()][1]}</p><p class="muted small">${status}</p>${btn}</div>`;
  }
  function legend() {
    if (!el.legend) return;
    const rows = ORDER.map(id => { const b = BONUSES[id];
      return `<li><span class="sw" style="background:${b.color}"></span><span class="lg-e" aria-hidden="true">${b.emoji}</span><span class="lg-n">${b[L()][0]}${b.kind === "cos" ? ` <em>(${tx("looks")})</em>` : ""}</span><b>${fmtPct(b.w)}</b></li>`; });
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
    if (sp && SLICES[sp.slice]) { setRot(360 - sp.angle); draw(sp.slice); el.box.classList.add(sp.result === "none" ? "lost" : "won", "static"); }
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
    pending() { const p = store.get(PKEY); const b = p && BONUSES[p.id]; return b ? { id: p.id, emoji: b.emoji, name: name(p.id), opts: b.opts } : null; },
    consume() { store.del(PKEY); render(); },
    cosmetics() { const s = todaySpin(), b = s && BONUSES[s.result]; return b && b.kind === "cos" ? { id: s.result, emoji: b.emoji, name: name(s.result), skin: b.skin || null, rocket: b.rocket || null } : {}; },
    name, get spinning() { return spinning; }, get rotation() { return rot; }, get last() { return last; }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
