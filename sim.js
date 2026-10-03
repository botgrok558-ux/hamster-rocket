/* Hamster Rocket: deterministic game simulation.
   Used by the browser game (game.js). Runs fully offline.
   Uses only + - * / sqrt, floor/round and integer hashing, which give the same
   results in every JS engine. No Math.random, Math.exp, Math.sin or wall-clock time. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.HRSim = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const W = 420, PX_PER_M = 10, TPS = 60, DT = 1 / 60;
  const MAX_TIME = 60, START_FUEL = 24, ROCKET_R = 25, SPIN_MAX = 14;
  const SPIN_DECAY = 0.97612300903172011;   // exp(-1.45/60)
  const VX_DECAY = 0.94806393849339554;     // exp(-3.2/60)
  const MIN_TAP_TICKS = 3;                  // max 20 taps per second
  const COMBO_TICKS = 19;                   // taps within ~320 ms keep the combo
  const FALL_TICKS = 66;                    // 1.1 s fall after the run ends
  const MAX_TICKS = MAX_TIME * TPS + FALL_TICKS + 10;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  // deterministic sine: range reduction + odd polynomial (basic ops only)
  const TWO_PI = 6.283185307179586, PI = 3.141592653589793, HALF_PI = 1.5707963267948966;
  function dsin(x) {
    x = x - Math.round(x / TWO_PI) * TWO_PI;          // [-pi, pi]
    if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x;  // [-pi/2, pi/2]
    const x2 = x * x;
    return x * (1 + x2 * (-1 / 6 + x2 * (1 / 120 + x2 * (-1 / 5040 + x2 * (1 / 362880 - x2 / 39916800)))));
  }
  function xmur3(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; } return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; }; }
  function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  const rngFrom = s => mulberry32(xmur3(s)());

  const ZONES = [
    { m: 0, name: "LAUNCH PAD", top: "#6cc8ff", bot: "#d4f3ff" },
    { m: 150, name: "BLUE SKY", top: "#4aa3ff", bot: "#a8e0ff" },
    { m: 700, name: "CLOUD CITY", top: "#3b6fe0", bot: "#86b8f5" },
    { m: 1400, name: "STRATOSPHERE", top: "#2a2f9c", bot: "#5a63d6" },
    { m: 2400, name: "OUTER SPACE", top: "#12134d", bot: "#2b2f8f" },
    { m: 3600, name: "MOON ORBIT", top: "#07082a", bot: "#171a5e" },
    { m: 5000, name: "DEEP SPACE", top: "#03031a", bot: "#0d0f3a" }
  ];
  const zoneIndex = m => { let i = 0; while (i + 1 < ZONES.length && m >= ZONES[i + 1].m) i++; return i; };

  // ---------- course (deterministic per seed) ----------
  function buildCourse(seedStr) {
    const r = rngFrom("hamster-rocket/" + seedStr);
    const objs = [];
    let y = 520;
    const pickX = (pad = 40) => pad + r() * (W - pad * 2);
    while (y < 90000) {
      const m = y / PX_PER_M;
      const hard = clamp(m / 3500, 0, 1);
      y += lerp(210, 135, hard) + r() * 90;
      const roll = r();
      const pObs = lerp(0.42, 0.72, hard);
      if (roll < pObs) {
        objs.push(makeObstacle(m, y, pickX(), r));
        if (m > 1200 && r() < 0.18 + hard * 0.2) {
          const x1 = objs[objs.length - 1].x;
          const x2 = x1 < W / 2 ? x1 + 190 + r() * 60 : x1 - 190 - r() * 60;
          objs.push(makeObstacle(m, y + (r() - 0.5) * 30, clamp(x2, 40, W - 40), r));
        }
        if (r() < 0.45) objs.push(makeSeed(y + 70 + r() * 30, pickX(50), r));
      } else if (roll < pObs + 0.07 && m > 200) {
        objs.push({ type: "ring", x: pickX(70), y, rx: 48, ry: 14, used: false });
      } else {
        objs.push(makeSeed(y, pickX(50), r));
        if (r() < 0.35) objs.push(makeSeed(y + 55, clamp(objs[objs.length - 1].x + (r() - 0.5) * 120, 40, W - 40), r));
      }
    }
    const deco = [];
    for (let cy = 300; cy < 20000; cy += 120 + r() * 220) deco.push({ y: cy, x: r() * W, s: 0.6 + r() * 0.9, k: r() });
    objs.sort((a, b) => a.y - b.y);
    return { objs, deco };
  }
  function makeSeed(y, x, r) { return { type: "seed", x, y, gold: r() < 0.09, rot: r() * 6.28, got: false }; }
  function makeObstacle(m, y, x, r) {
    const ph = r() * 6.28, sp = 0.6 + r() * 1.2;
    if (m < 650) return { type: "bird", x0: x, x, y, a: 22, b: 15, amp: 40 + r() * 70, ph, sp };
    if (m < 1450) return r() < 0.5
      ? { type: "storm", x0: x, x, y, a: 40, b: 22, amp: 0, ph, sp }
      : { type: "drone", x0: x, x, y, a: 24, b: 12, amp: 50 + r() * 80, ph, sp };
    if (m < 2600) return r() < 0.6
      ? { type: "sat", x0: x, x, y, a: 40, b: 14, amp: 20 + r() * 40, ph, sp: sp * 0.5 }
      : { type: "drone", x0: x, x, y, a: 24, b: 12, amp: 60 + r() * 80, ph, sp };
    const big = r() < 0.4;
    return r() < 0.75
      ? { type: "rock", x0: x, x, y, a: big ? 30 : 20, b: big ? 30 : 20, amp: 15 + r() * 60, ph, sp: sp * 0.5, pts: rockShape(r) }
      : { type: "sat", x0: x, x, y, a: 40, b: 14, amp: 30 + r() * 50, ph, sp: sp * 0.6 };
  }
  function rockShape(r) { const p = []; for (let i = 0; i < 9; i++) p.push(0.78 + r() * 0.3); return p; }

  // ---------- simulation ----------
  function create(seedStr) {
    const s = {
      seedStr, course: buildCourse(seedStr), state: "ready", tick: 0,
      alt: 0, maxAlt: 0, vy: 0, x: W / 2, vx: 0, spin: 0, fuel: START_FUEL, time: 0,
      combo: 0, maxCombo: 0, lastTapTick: -1000, taps: 0, invuln: 0, boostT: 0, seeds: 0, hits: 0,
      fallTicks: 0, zoneI: 0, endReason: "", lo: 0
    };
    s.tap = (dir, mag10) => tap(s, dir, mag10);
    s.step = () => step(s);
    s.score = () => Math.floor(s.maxAlt / PX_PER_M);
    return s;
  }
  function tap(s, dir, mag10) {
    if (s.state === "over" || s.state === "falling") return null;
    if (s.state === "ready") s.state = "play";
    if (s.tick - s.lastTapTick < MIN_TAP_TICKS) return null;
    s.combo = s.tick - s.lastTapTick <= COMBO_TICKS ? s.combo + 1 : 1;
    if (s.combo > s.maxCombo) s.maxCombo = s.combo;
    s.lastTapTick = s.tick; s.taps++;
    s.spin = Math.min(SPIN_MAX, s.spin + 1);
    if (dir) s.vx += dir * 85 * (clamp(mag10 | 0, 3, 12) / 10);
    return { combo: s.combo };
  }
  function end(s, reason, ev) {
    if (s.state !== "play") return;
    s.state = "falling"; s.endReason = reason; s.fallTicks = 0; s.fuel = 0;
    ev.push({ type: "end", reason });
  }
  function step(s) {
    const ev = [];
    if (s.state === "ready" || s.state === "over") return ev;
    const prevAlt = s.alt;
    s.tick++; s.time = s.tick * DT;
    s.spin *= SPIN_DECAY;
    if (s.state === "play") {
      s.fuel -= DT * (1 + s.time / 40);
      if (s.fuel <= 0) end(s, "OUT OF SEEDS!", ev);
      else if (s.time >= MAX_TIME) end(s, "MISSION TIME UP!", ev);
    }
    if (s.state === "play") {
      const target = s.spin * 108 + (s.boostT > 0 ? 320 : 0);
      s.vy += (target - s.vy) * (target > s.vy ? 2.4 : 1.1) * DT;
    } else {
      s.vy -= 520 * DT; s.fallTicks++;
      if (s.fallTicks >= FALL_TICKS) { s.state = "over"; ev.push({ type: "finish" }); }
    }
    s.alt = s.alt + s.vy * DT; if (s.alt < 0) s.alt = 0;
    if (s.alt === 0 && s.vy < 0) s.vy = 0;
    if (s.alt > s.maxAlt) s.maxAlt = s.alt;
    s.vx *= VX_DECAY;
    s.x += s.vx * DT;
    if (s.x < 34) { s.x = 34; s.vx = (s.vx < 0 ? -s.vx : s.vx) * 0.5; }
    if (s.x > W - 34) { s.x = W - 34; s.vx = -(s.vx < 0 ? -s.vx : s.vx) * 0.5; }
    s.invuln = Math.max(0, s.invuln - DT);
    s.boostT = Math.max(0, s.boostT - DT);
    const zi = zoneIndex(s.alt / PX_PER_M);
    if (zi > s.zoneI) { s.zoneI = zi; ev.push({ type: "zone", i: zi, name: ZONES[zi].name }); }

    const objs = s.course.objs, t = s.time, playing = s.state === "play";
    while (s.lo < objs.length && objs[s.lo].y < s.alt - 900) s.lo++;
    for (let k = s.lo; k < objs.length; k++) {
      const o = objs[k];
      const dy = o.y - s.alt;
      if (dy > 900) break;
      if (o.amp) o.x = clamp(o.x0 + dsin(t * o.sp + o.ph) * o.amp, o.a, W - o.a);
      if (o.type === "seed") {
        if (o.got || !playing) continue;
        const dx = s.x - o.x, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 70) { const f = Math.min(1, DT * 6); o.x += dx * f; o.y -= dy * f; }
        if (d < ROCKET_R + 14) {
          o.got = true; s.seeds++;
          const add = o.gold ? 6 : 3; s.fuel = Math.min(START_FUEL + 6, s.fuel + add);
          ev.push({ type: "seed", x: o.x, y: o.y, gold: o.gold, add });
        }
      } else if (o.type === "ring") {
        const ax = s.x - o.x;
        if (playing && !o.used && prevAlt < o.y && s.alt >= o.y && (ax < 0 ? -ax : ax) < o.rx - 8) {
          o.used = true; s.boostT = 1.2; s.spin = Math.min(SPIN_MAX, s.spin + 3);
          ev.push({ type: "ring", x: o.x, y: o.y });
        }
      } else if (playing && s.invuln <= 0) {
        const nx = (s.x - o.x) / (o.a + ROCKET_R * 0.85), ny = dy / (o.b + ROCKET_R * 0.85);
        if (nx * nx + ny * ny < 1) {
          s.hits++; s.invuln = 1.1; s.vy *= 0.45; s.spin *= 0.5; s.fuel -= 3;
          s.vx += (s.x < o.x ? -1 : 1) * 260;
          ev.push({ type: "hit", x: o.x, y: o.y });
          if (s.fuel <= 0) end(s, "OUT OF SEEDS!", ev);
        }
      }
    }
    return ev;
  }

  /* Replays an input log: events = [[tick, dir, mag10], ...] with non-decreasing ticks.
     Returns the authoritative result. The run must start with an event at tick 0. */
  function replay(seedStr, events) {
    if (!Array.isArray(events) || events.length === 0 || events.length > 5000) return { ok: false, error: "bad_events" };
    const s = create(seedStr);
    let i = 0, lastTick = 0;
    for (const e of events) {
      if (!Array.isArray(e) || e.length !== 3) return { ok: false, error: "bad_event" };
      const [tk, dir, mag] = e;
      if (!Number.isInteger(tk) || tk < lastTick || tk > MAX_TICKS) return { ok: false, error: "bad_tick" };
      if (![-1, 0, 1].includes(dir) || !Number.isInteger(mag) || mag < 0 || mag > 12) return { ok: false, error: "bad_input" };
      lastTick = tk;
    }
    if (events[0][0] !== 0) return { ok: false, error: "must_start_at_0" };
    while (s.state !== "over" && s.tick <= MAX_TICKS) {
      while (i < events.length && events[i][0] === s.tick) { s.tap(events[i][1], events[i][2]); i++; }
      s.step();
    }
    if (s.state !== "over") return { ok: false, error: "did_not_finish" };
    return { ok: true, score: s.score(), ticks: s.tick, seconds: s.tick / TPS, seeds: s.seeds, hits: s.hits, taps: s.taps, maxCombo: s.maxCombo, reason: s.endReason };
  }

  // ---------- rounds: each round ends at 21:00 America/New_York ----------
  const ROUND_TZ = "America/New_York", ROUND_END_HOUR = 21;
  let _fmt = null;
  function nyParts(ms) {
    _fmt = _fmt || new Intl.DateTimeFormat("en-US", { timeZone: ROUND_TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    const p = {}; for (const x of _fmt.formatToParts(new Date(ms))) p[x.type] = x.value;
    return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute };
  }
  const pad = n => String(n).padStart(2, "0");
  const ymd = (y, m, d) => { const t = new Date(Date.UTC(y, m - 1, d)); return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`; };
  /** Round id = the New York date on which the round ends at 21:00. */
  function roundFor(ms) { const p = nyParts(ms); return p.h >= ROUND_END_HOUR ? ymd(p.y, p.m, p.d + 1) : ymd(p.y, p.m, p.d); }
  function roundEnd(roundId) {
    const [y, m, d] = roundId.split("-").map(Number);
    for (const off of [4, 5]) { const ms = Date.UTC(y, m - 1, d, ROUND_END_HOUR + off); const p = nyParts(ms); if (p.h === ROUND_END_HOUR && p.min === 0) return ms; }
    throw new Error("cannot resolve round end");
  }
  function prevRound(roundId) { const [y, m, d] = roundId.split("-").map(Number); return ymd(y, m, d - 1); }
  function nextRound(roundId) { const [y, m, d] = roundId.split("-").map(Number); return ymd(y, m, d + 1); }
  function roundStart(roundId) { return roundEnd(prevRound(roundId)); }
  const seedForRound = roundId => "round-" + roundId;

  return { W, PX_PER_M, TPS, DT, MAX_TIME, START_FUEL, ROCKET_R, ZONES, zoneIndex, buildCourse, create, replay, dsin, rngFrom,
    roundFor, roundEnd, roundStart, prevRound, nextRound, seedForRound, ROUND_TZ, ROUND_END_HOUR };
});
