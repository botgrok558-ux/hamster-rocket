/* Hamster Dash: self-contained endless 3-lane runner (pseudo-3D Canvas 2D + WebAudio, no dependencies).

   const game = HamsterDash.create({
     canvas,                    // <canvas> filling its container (its CSS size is the view size)
     assetBase: "assets/",      // folder with hamster_face.svg (falls back to vector art)
     t: (key, english) => str,  // optional translator for in-canvas text
     storagePrefix: "hrd_",     // localStorage prefix (best, bestSeeds, bestDist, muted)
     onEvent: (type, data) => {}// "state" {state, reason}, "pickup" {type}, "gameover" {score, seeds, dist, reason, newBest}, "mute" {muted}
   });
   game.start()  game.steer(-1 | 1)  game.pause()  game.resume()  game.toggleMute()  game.state ("menu" | "play" | "dying" | "paused" | "over")  game.best()

   Simulation, rendering, input and sound live in this one file so it can later become a mode of the main Hamster Rocket site. */
(function (global) {
  "use strict";
  const TAU = Math.PI * 2, INK = "#170d33", FONT = '"Luckiest Guy", system-ui, sans-serif';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), rand = (a, b) => a + Math.random() * (b - a), lerp = (a, b, t) => a + (b - a) * t;
  const pick = a => a[(Math.random() * a.length) | 0];

  const CFG = {
    D: 7, zFar: 62,                          // perspective: scale = D / (z + D); objects appear at zFar
    v0: 13, vAcc: 0.33, vMax: 34,            // speed (track units/s) = v0 + vAcc * seconds, capped
    gapT0: 1.0, gapT1: 0.62,                 // seconds between obstacle rows (start -> after 60 s)
    laneSpeed: 10,                           // lanes per second when switching
    hitLane: 0.62, playerZ: 0.35,
    hazard: { cat: 0.45, trap: 0.4, puddle: 0.85 },
    magnetT: 8, shieldT: 10, powerGap: [13, 20],
    seedPts: 10, distPts: 0.5, overDelay: 1.25
  };
  const CATS = [["#ff9f43", "#d9772b", "#fff1dc"], ["#a3abc0", "#7a8396", "#eef0f6"], ["#3b3550", "#262036", "#ffffff"]];

  /* ------------------------------------------------------------------ sound (WebAudio synth, no files) */
  function makeSfx() {
    let ac = null, master = null, muted = false, noiseBuf = null;
    const VOL = 0.55, last = {};
    function ensure() {
      try {
        if (!ac) {
          const AC = global.AudioContext || global.webkitAudioContext; if (!AC) return null;
          ac = new AC(); master = ac.createGain(); master.gain.value = muted ? 0 : VOL; master.connect(ac.destination);
          noiseBuf = ac.createBuffer(1, (ac.sampleRate * 0.6) | 0, ac.sampleRate);
          const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        }
        if (ac.state === "suspended") ac.resume();
      } catch (e) { ac = null; }
      return ac;
    }
    const ok = () => ac && !muted && ac.state === "running";
    const gap = (k, ms) => { const n = performance.now(); if (last[k] && n - last[k] < ms) return false; last[k] = n; return true; };
    function tone(type, f0, f1, dur, vol, delay = 0) {
      if (!ok()) return;
      const t = ac.currentTime + delay, o = ac.createOscillator(), g = ac.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.03);
    }
    function noise(dur, vol, freq, delay = 0, type = "lowpass") {
      if (!ok()) return;
      const t = ac.currentTime + delay, s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noiseBuf; f.type = type; f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(Math.max(60, freq * 0.2), t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + dur + 0.03);
    }
    const arp = (notes, type, step, dur, vol) => notes.forEach((f, i) => tone(type, f, 0, dur, vol, i * step));
    let streak = 0, streakT = 0;
    return {
      ensure,
      close() { try { if (ac && ac.close) ac.close(); } catch (e) { } ac = null; master = null; },   // hub: release the audio device when leaving the game
      get muted() { return muted; },
      setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : VOL; },
      swoosh() { if (gap("sw", 50)) noise(0.09, 0.09, 2600, 0, "bandpass"); },
      bump() { if (gap("bump", 90)) tone("triangle", 160, 90, 0.08, 0.14); },
      seed() {
        const n = performance.now(); streak = n - streakT < 600 ? Math.min(streak + 1, 12) : 0; streakT = n;
        if (gap("seed", 35)) { const f = 880 * Math.pow(2, streak / 12); tone("sine", f, 0, 0.07, 0.09); tone("triangle", f * 1.5, 0, 0.05, 0.04, 0.03); }
      },
      power() { arp([523, 659, 784, 1046, 1318], "triangle", 0.05, 0.13, 0.13); },
      shieldPop() { noise(0.25, 0.2, 3000); arp([880, 660], "square", 0.06, 0.08, 0.06); },
      faster() { arp([392, 523, 659], "square", 0.06, 0.09, 0.05); },
      crash(type) {
        if (type === "cat") { tone("sawtooth", 520, 880, 0.12, 0.12); tone("sawtooth", 880, 420, 0.32, 0.12, 0.12); noise(0.15, 0.12, 1200); }
        else if (type === "trap") { noise(0.07, 0.4, 7000, 0, "highpass"); tone("square", 1300, 180, 0.07, 0.12); tone("triangle", 180, 70, 0.25, 0.2, 0.04); }
        else { noise(0.5, 0.32, 2600); tone("sine", 400, 120, 0.3, 0.1); tone("sine", 700, 300, 0.2, 0.06, 0.08); }
      },
      over() { arp([523, 415, 330, 262], "triangle", 0.15, 0.22, 0.15); },
      click() { if (gap("click", 40)) tone("triangle", 640, 0, 0.05, 0.08); }
    };
  }

  /* ------------------------------------------------------------------ drawing helpers (origin = ground contact point, u = px per lane) */
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function text(c, s, x, y, size, fill, align = "center", base = "middle") {
    c.font = `${Math.round(size)}px ${FONT}`; c.textAlign = align; c.textBaseline = base;
    c.lineJoin = "round"; c.lineWidth = Math.max(3, size * 0.2); c.strokeStyle = INK; c.strokeText(s, x, y);
    c.fillStyle = fill; c.fillText(s, x, y);
  }
  function shadow(c, u, w) { c.fillStyle = "rgba(23,13,51,.25)"; c.beginPath(); c.ellipse(0, 0, u * w, u * w * 0.28, 0, 0, TAU); c.fill(); }
  // all sprites are drawn in a 100-unit box (1 lane = 100) and scaled
  function drawCat(c, u, o, t) {
    const [body, stripe, muzzle] = CATS[o.v];
    shadow(c, u, 0.27);
    c.save(); c.scale(u / 118, u / 118); c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = 4;
    // tail
    const sw = Math.sin(t * 4 + o.p) * 12;
    c.strokeStyle = INK; c.lineWidth = 13; c.beginPath(); c.moveTo(18, -14); c.quadraticCurveTo(48, -20, 40 + sw, -58); c.stroke();
    c.strokeStyle = body; c.lineWidth = 7; c.stroke();
    c.strokeStyle = INK; c.lineWidth = 4;
    // body
    c.fillStyle = body; c.beginPath(); c.ellipse(0, -30, 29, 30, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = muzzle; c.beginPath(); c.ellipse(0, -24, 15, 19, 0, 0, TAU); c.fill();
    // paws
    c.fillStyle = muzzle; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 12, -3, 9, 6, 0, 0, TAU); c.fill(); c.stroke(); }
    // head
    const hy = -72;
    c.fillStyle = body;
    for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 25, hy - 6); c.lineTo(s * 23, hy - 36 + (s > 0 ? Math.sin(t * 3 + o.p) * 2 : 0)); c.lineTo(s * 6, hy - 22); c.closePath(); c.fill(); c.stroke(); }
    c.fillStyle = "#ff9fb2"; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 20, hy - 12); c.lineTo(s * 20, hy - 28); c.lineTo(s * 10, hy - 20); c.closePath(); c.fill(); }
    c.fillStyle = body; c.beginPath(); c.ellipse(0, hy, 30, 26, 0, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = stripe; c.lineWidth = 3.5;
    for (const x of [-9, 0, 9]) { c.beginPath(); c.moveTo(x, hy - 25); c.lineTo(x * 0.8, hy - 15); c.stroke(); }
    c.strokeStyle = INK;
    c.fillStyle = muzzle; c.beginPath(); c.ellipse(0, hy + 9, 13, 9, 0, 0, TAU); c.fill();
    // eyes (blink)
    const blink = ((t + o.p) % 3.2) < 0.12;
    if (blink) { c.lineWidth = 3; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 15, hy - 3); c.lineTo(s * 6, hy - 3); c.stroke(); } }
    else {
      c.fillStyle = "#c8f56a"; c.lineWidth = 2.5; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 11, hy - 3, 7, 8, 0, 0, TAU); c.fill(); c.stroke(); }
      c.fillStyle = INK; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 11, hy - 2, 2.6, 6, 0, 0, TAU); c.fill(); }
      c.fillStyle = "#fff"; for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 11 + 2, hy - 5, 1.8, 0, TAU); c.fill(); }
    }
    c.fillStyle = "#ff6b81"; c.beginPath(); c.moveTo(-4, hy + 5); c.lineTo(4, hy + 5); c.lineTo(0, hy + 10); c.closePath(); c.fill();
    c.lineWidth = 2.2; c.beginPath(); c.moveTo(-7, hy + 14); c.quadraticCurveTo(-3, hy + 17, 0, hy + 11); c.quadraticCurveTo(3, hy + 17, 7, hy + 14); c.stroke();
    c.lineWidth = 1.8; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 12, hy + 8); c.lineTo(s * 36, hy + 3); c.moveTo(s * 12, hy + 12); c.lineTo(s * 34, hy + 15); c.stroke(); }
    c.restore();
  }
  function drawTrap(c, u, o, t) {
    shadow(c, u, 0.38);
    c.save(); c.scale(u / 100, u / 100); c.lineJoin = "round"; c.lineCap = "round"; c.strokeStyle = INK; c.lineWidth = 4;
    c.fillStyle = "#b9773a"; rr(c, -38, -14, 76, 14, 4); c.fill(); c.stroke();
    c.fillStyle = "#e0a15c"; c.beginPath(); c.moveTo(-34, -14); c.lineTo(34, -14); c.lineTo(26, -30); c.lineTo(-26, -30); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#8b5a2b"; c.lineWidth = 2; for (const x of [-14, 4, 20]) { c.beginPath(); c.moveTo(x, -16); c.lineTo(x * 0.8, -28); c.stroke(); }
    // metal snap bar + spring
    c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.moveTo(-24, -24); c.lineTo(-24, -44); c.lineTo(24, -44); c.lineTo(24, -24); c.stroke();
    c.strokeStyle = "#dfe6f2"; c.lineWidth = 3.5; c.stroke();
    c.fillStyle = "#c7cfdd"; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.ellipse(0, -24, 9, 4, 0, 0, TAU); c.fill(); c.stroke();
    // cheese
    c.fillStyle = "#ffd23f"; c.lineWidth = 3; c.beginPath(); c.moveTo(4, -26); c.lineTo(20, -26); c.lineTo(20, -38); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#e6b200"; c.beginPath(); c.arc(15, -29, 1.8, 0, TAU); c.fill();
    c.restore();
  }
  function drawPuddle(c, u, o, t) {
    c.save(); c.scale(u / 100, u / 100); c.lineJoin = "round"; c.strokeStyle = INK; c.lineWidth = 4;
    c.fillStyle = "#3d9cff"; c.beginPath();
    for (let i = 0; i <= 16; i++) { const a = i / 16 * TAU, r = 1 + Math.sin(a * 3 + o.p) * 0.08; c.lineTo(Math.cos(a) * 46 * r, -12 + Math.sin(a) * 15 * r); }
    c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#7cc6ff"; c.beginPath(); c.ellipse(-4, -14, 30, 8, 0, 0, TAU); c.fill();
    const q = (t * 0.9 + o.p) % 1;
    c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - q)})`; c.lineWidth = 2.5; c.beginPath(); c.ellipse(6, -12, 8 + q * 22, 2.5 + q * 6, 0, 0, TAU); c.stroke();
    c.strokeStyle = "#fff"; c.lineWidth = 3; c.lineCap = "round"; c.beginPath(); c.moveTo(-30, -16); c.quadraticCurveTo(-24, -21, -14, -21); c.stroke();
    c.restore();
  }
  function drawSeed(c, u, o, t) {
    const hgt = 30 + Math.sin(t * 5 + o.p) * 5;
    c.fillStyle = "rgba(23,13,51,.18)"; c.beginPath(); c.ellipse(0, 0, u * 0.1, u * 0.03, 0, 0, TAU); c.fill();
    c.save(); c.scale(u / 100, u / 100); c.translate(0, -hgt);
    const g = c.createRadialGradient(0, 0, 2, 0, 0, 24); g.addColorStop(0, "rgba(255,240,140,.85)"); g.addColorStop(1, "rgba(255,210,63,0)");
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 24, 0, TAU); c.fill();
    c.scale(Math.max(0.25, Math.abs(Math.cos(t * 3 + o.p))), 1);
    c.fillStyle = "#2a2140"; c.strokeStyle = INK; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -15); c.quadraticCurveTo(10, -8, 9, 3); c.quadraticCurveTo(7, 13, 0, 15); c.quadraticCurveTo(-7, 13, -9, 3); c.quadraticCurveTo(-10, -8, 0, -15); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#f4ecd8"; c.lineWidth = 2; c.beginPath(); c.moveTo(-3, -9); c.lineTo(-3.5, 10); c.moveTo(3, -9); c.lineTo(3.5, 10); c.stroke();
    c.restore();
  }
  function magnetIcon(c, s) {
    c.save(); c.scale(s, s); c.lineCap = "butt";
    c.strokeStyle = INK; c.lineWidth = 11; c.beginPath(); c.arc(0, -2, 9, Math.PI, 0, true); c.lineTo(9, 8); c.moveTo(-9, -2); c.lineTo(-9, 8); c.stroke();
    c.strokeStyle = "#ff3d5a"; c.lineWidth = 6.5; c.stroke();
    c.fillStyle = "#e7ecf6"; c.strokeStyle = INK; c.lineWidth = 2; for (const x of [-9, 9]) { c.fillRect(x - 4.2, 5, 8.4, 6); c.strokeRect(x - 4.2, 5, 8.4, 6); }
    c.restore();
  }
  function shieldIcon(c, s) {
    c.save(); c.scale(s, s); c.lineJoin = "round";
    c.fillStyle = "#38d9ff"; c.strokeStyle = INK; c.lineWidth = 2.5;
    c.beginPath(); c.moveTo(0, -12); c.lineTo(10, -8); c.quadraticCurveTo(10, 6, 0, 12); c.quadraticCurveTo(-10, 6, -10, -8); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = "#fff"; c.beginPath(); c.moveTo(0, -8); c.lineTo(6, -5.5); c.quadraticCurveTo(6, 3, 0, 7.5); c.closePath(); c.globalAlpha = 0.6; c.fill(); c.globalAlpha = 1;
    c.restore();
  }
  function drawPower(c, u, o, t) {
    const hgt = 42 + Math.sin(t * 4 + o.p) * 6;
    c.fillStyle = "rgba(23,13,51,.2)"; c.beginPath(); c.ellipse(0, 0, u * 0.16, u * 0.045, 0, 0, TAU); c.fill();
    c.save(); c.scale(u / 100, u / 100); c.translate(0, -hgt);
    const col = o.type === "magnet" ? "255,107,129" : "56,217,255";
    const g = c.createRadialGradient(0, 0, 4, 0, 0, 34); g.addColorStop(0, `rgba(${col},.6)`); g.addColorStop(1, `rgba(${col},0)`);
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 34, 0, TAU); c.fill();
    c.fillStyle = "rgba(255,255,255,.92)"; c.strokeStyle = INK; c.lineWidth = 3.5; c.beginPath(); c.arc(0, 0, 21, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = `rgb(${col})`; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 16.5, 0, TAU); c.stroke();
    if (o.type === "magnet") magnetIcon(c, 1.0); else shieldIcon(c, 1.05);
    c.restore();
  }
  function drawFlower(c, u, o, t) {
    c.save(); c.scale(u / 100, u / 100); c.lineCap = "round"; c.lineJoin = "round";
    if (o.kind === 0) {   // sunflower
      const h = o.h, sw = Math.sin(t * 1.4 + o.p) * 4;
      c.strokeStyle = "#2f8a3b"; c.lineWidth = 7; c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sw * 0.5, -h * 0.5, sw, -h); c.stroke();
      c.fillStyle = "#4cbf55"; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.ellipse(-12, -h * 0.45, 13, 6, -0.5, 0, TAU); c.fill(); c.stroke();
      c.translate(sw, -h); c.fillStyle = "#ffd23f";
      for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * TAU / 12); c.beginPath(); c.ellipse(0, -19, 7, 12, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); }
      c.fillStyle = "#6b3f1d"; c.beginPath(); c.arc(0, 0, 13, 0, TAU); c.fill(); c.stroke();
    } else {              // bush
      c.fillStyle = o.kind === 1 ? "#3fae4f" : "#58c463"; c.strokeStyle = INK; c.lineWidth = 3.5;
      c.beginPath(); c.arc(-24, -18, 22, Math.PI * 0.9, Math.PI * 1.9); c.arc(0, -34, 26, Math.PI * 1.1, Math.PI * 1.95); c.arc(24, -18, 22, Math.PI * 1.2, Math.PI * 0.1); c.lineTo(-40, 0); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = "#ff6b81"; for (const [x, y] of [[-16, -24], [10, -40], [20, -14]]) { c.beginPath(); c.arc(x, y, 4, 0, TAU); c.fill(); }
    }
    c.restore();
  }
  const DRAW = { cat: drawCat, trap: drawTrap, puddle: drawPuddle, seed: drawSeed, magnet: drawPower, shield: drawPower, deco: drawFlower };

  /* ------------------------------------------------------------------ main factory */
  function create(opts) {
    const canvas = opts.canvas, ctx = canvas.getContext("2d");
    const T = opts.t || ((k, en) => en);
    const base = opts.assetBase == null ? "assets/" : opts.assetBase;
    const prefix = opts.storagePrefix || "hrd_";
    const emit = (type, data) => { if (opts.onEvent) opts.onEvent(type, data || {}); };
    const store = {
      get(k, d) { try { const v = localStorage.getItem(prefix + k); return v == null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(prefix + k, String(v)); } catch (e) { } }
    };
    const sfx = makeSfx(); sfx.setMuted(store.get("muted", "0") === "1");
    let bestScore = +store.get("best", 0) || 0, bestSeeds = +store.get("bestSeeds", 0) || 0, bestDist = +store.get("bestDist", 0) || 0;
    let state = "menu", raf = 0, last = 0, g = null, clock = 0, god = false;

    const spr = {};
    (function () { const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 256; c.getContext("2d").drawImage(img, 0, 0, 256, 256); spr.face = c; }; img.onerror = () => { }; img.src = base + "hamster_face.svg"; })();

    /* ---------- view / projection ---------- */
    let cssW = 1, cssH = 1, dpr = 1, hy = 1, py = 1, lw = 1, cx = 1, zMin = -2;
    const f = z => CFG.D / (z + CFG.D);
    const yOf = z => hy + (py - hy) * f(z);
    const xOf = (lx, z) => cx + lx * lw * f(z);
    let skyGrad = null, clouds = [], hills = [];
    function resize() {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      hy = cssH * (cssW > cssH ? 0.36 : 0.32); py = cssH * 0.84; cx = cssW / 2;
      lw = Math.min(cssW * 0.28, (py - hy) * 0.62, 260);
      const fb = (cssH + 10 - hy) / (py - hy); zMin = CFG.D / fb - CFG.D - 0.5;
      skyGrad = ctx.createLinearGradient(0, 0, 0, hy); skyGrad.addColorStop(0, "#5ec2ff"); skyGrad.addColorStop(1, "#c8f3ff");
      clouds = []; for (let i = 0; i < 6; i++) clouds.push({ x: Math.random() * cssW, y: rand(0.12, 0.7) * hy, s: rand(0.6, 1.2) * clamp(cssW / 700, 0.6, 1.3), v: rand(4, 10) });
      hills = []; for (let i = 0; i < 7; i++) hills.push({ x: (i / 6) * cssW + rand(-30, 30), r: rand(0.12, 0.22) * Math.max(cssW, 500), c: i % 2 ? "#7fd98a" : "#6ccb7a" });
      render();
    }

    /* ---------- game state ---------- */
    function newRun() {
      g = {
        t: 0, dist: 0, v: CFG.v0, lane: 0, px: 0, lean: 0, roll: 0, seeds: 0, score: 0,
        objs: [], deco: [], parts: [], pops: [], nextRow: 34, nextPower: rand(8, 12), nextDeco: [2, 4], rows: 0,
        shield: 0, magnet: 0, inv: 0, banner: null, nextFaster: 15, reason: null, overT: 0, shake: 0, wobble: 0, hitObj: null
      };
      for (let i = 0; i < 4; i++) g.objs.push({ type: "seed", lane: 0, lx: 0, z: 12 + i * 2.6, p: i });
      while (g.nextDeco[0] < CFG.zFar || g.nextDeco[1] < CFG.zFar) spawnDeco();
    }
    function spawnDeco() {
      const side = g.nextDeco[0] <= g.nextDeco[1] ? 0 : 1, s = g.nextDeco[side];
      g.deco.push({ type: "deco", lx: (side ? 1 : -1) * rand(2.15, 2.9), z: s - g.dist, kind: Math.random() < 0.55 ? 0 : 1 + (Math.random() * 2 | 0), h: rand(90, 140), p: rand(0, TAU) });
      g.nextDeco[side] = s + rand(3.5, 7);
    }
    function addObj(type, lane, z) { const o = { type, lane, lx: lane, z, p: rand(0, TAU), v: (Math.random() * 3) | 0 }; g.objs.push(o); return o; }
    function spawnRow(s) {
      const z = s - g.dist, tt = g.t, gapT = lerp(CFG.gapT0, CFG.gapT1, clamp(tt / 60, 0, 1)), gap = Math.max(9, g.v * gapT);
      g.rows++;
      const lanes = [-1, 0, 1].sort(() => Math.random() - 0.5);
      if (g.rows > 3 && Math.random() < 0.1) {   // breather: a seed snake across the lanes
        let l = pick([-1, 0, 1]);
        for (let i = 0; i < 6; i++) { addObj("seed", l, z + i * 2.2); if (i % 2) l = clamp(l + pick([-1, 1]), -1, 1); }
        g.nextRow = s + gap * 1.2; return;
      }
      const pDouble = clamp((tt - 6) / 40, 0, 0.5), nHaz = Math.random() < pDouble ? 2 : 1;
      for (let i = 0; i < nHaz; i++) { const r = Math.random(); addObj(r < 0.4 ? "cat" : r < 0.72 ? "trap" : "puddle", lanes[i], z); }
      const free = lanes.slice(nHaz);
      if (tt >= g.nextPower) {
        addObj(Math.random() < 0.5 ? "magnet" : "shield", free[0], z);
        g.nextPower = tt + rand(CFG.powerGap[0], CFG.powerGap[1]);
      } else if (Math.random() < 0.8) {
        const l = pick(free), n = clamp(Math.floor((gap - 3) / 2.3), 2, 6);
        for (let i = 0; i < n; i++) addObj("seed", l, z + 2 + i * 2.3);
      }
      g.nextRow = s + gap;
    }
    function pop(txt, x, y, col, size, life = 0.8) { g.pops.push({ txt, x, y, col, size, t: 0, life }); }
    function burst(x, y, n, cols, spd = 260, grav = 500) {
      for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(spd * 0.3, spd); g.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - spd * 0.3, g: grav, life: rand(0.35, 0.8), t: 0, r: rand(2.5, 6), col: pick(cols) }); }
    }
    function ballPos() { const r = lw * 0.34; return { x: xOf(g.px, 0), y: py - r, r }; }

    function steer(d) {
      if (state !== "play" || !g) return false;
      sfx.ensure();
      const nl = clamp(g.lane + d, -1, 1);
      if (nl === g.lane) { sfx.bump(); g.wobble = 0.25 * d; return false; }
      g.lane = nl; sfx.swoosh(); return true;
    }
    function hit(o) {
      if (g.shield > 0) {
        g.shield = 0; g.inv = 0.6; o.dead = true; sfx.shieldPop();
        const p = { x: xOf(o.lx, Math.max(0, o.z)), y: yOf(Math.max(0, o.z)) - lw * 0.3 };
        burst(p.x, p.y, 18, ["#38d9ff", "#ffffff", "#bff4ff"]); pop(T("hud.saved", "SAVED!"), p.x, p.y - lw * 0.4, "#38d9ff", clamp(lw * 0.3, 22, 40));
        return;
      }
      if (god) return;   // test helper only
      g.reason = o.type; g.hitObj = o; state = "dying"; g.overT = 0; g.shake = 0.4;
      sfx.crash(o.type);
      const b = ballPos();
      burst(b.x, b.y, 22, o.type === "puddle" ? ["#3d9cff", "#7cc6ff", "#ffffff"] : ["#ffd23f", "#ffffff", "#ff6b81"], 320);
      emit("state", { state });
    }
    function collect(o) {
      o.dead = true;
      const b = ballPos();
      if (o.type === "seed") {
        g.seeds++; sfx.seed();
        burst(b.x, b.y - b.r * 0.8, 5, ["#ffd23f", "#fff6b0"], 160, 300);
        pop("+" + CFG.seedPts, b.x + rand(-10, 10), b.y - b.r * 1.5, "#ffd23f", clamp(lw * 0.2, 16, 30), 0.6);
      } else {
        if (o.type === "magnet") g.magnet = CFG.magnetT; else g.shield = CFG.shieldT;
        sfx.power();
        burst(b.x, b.y, 16, o.type === "magnet" ? ["#ff6b81", "#ffffff"] : ["#38d9ff", "#ffffff"], 260, 200);
        g.banner = { txt: o.type === "magnet" ? T("hud.magnet", "MAGNET!") : T("hud.shield", "SHIELD!"), t: 0, col: o.type === "magnet" ? "#ff6b81" : "#38d9ff" };
        emit("pickup", { type: o.type });
      }
    }
    function finish() {
      state = "over";
      const score = g.score, newBest = score > bestScore, dist = Math.floor(g.dist);
      if (newBest) { bestScore = score; store.set("best", score); }
      if (g.seeds > bestSeeds) { bestSeeds = g.seeds; store.set("bestSeeds", bestSeeds); }
      if (dist > bestDist) { bestDist = dist; store.set("bestDist", bestDist); }
      sfx.over();
      emit("state", { state });
      emit("gameover", { score, seeds: g.seeds, dist, reason: g.reason, newBest, best: bestScore });
    }

    /* ---------- update ---------- */
    function update(dt) {
      const playing = state === "play";
      if (playing) {
        g.t += dt;
        g.v = Math.min(CFG.vMax, CFG.v0 + CFG.vAcc * g.t);
        if (g.t >= g.nextFaster && g.v < CFG.vMax) { g.banner = { txt: T("hud.faster", "FASTER!"), t: 0, col: "#ffd23f" }; sfx.faster(); g.nextFaster += 15; }
      } else g.v *= Math.exp(-dt * 9);
      const dz = g.v * dt;
      g.dist += dz; g.roll += dz * 0.9;
      if (playing) g.score = Math.floor(g.dist * CFG.distPts) + g.seeds * CFG.seedPts;
      // lane switching
      const d = g.lane - g.px, step = CFG.laneSpeed * dt;
      g.px = Math.abs(d) <= step ? g.lane : g.px + Math.sign(d) * step;
      g.lean += (clamp(d * 1.4, -1, 1) - g.lean) * Math.min(1, dt * 14);
      if (g.wobble) { g.wobble *= Math.exp(-dt * 8); if (Math.abs(g.wobble) < 0.01) g.wobble = 0; }
      if (g.inv > 0) g.inv -= dt;
      if (playing) { if (g.magnet > 0) g.magnet = Math.max(0, g.magnet - dt); if (g.shield > 0) g.shield = Math.max(0, g.shield - dt); }
      // spawning
      if (playing) while (g.nextRow - g.dist < CFG.zFar) spawnRow(g.nextRow);
      while (Math.min(g.nextDeco[0], g.nextDeco[1]) - g.dist < CFG.zFar) spawnDeco();
      // move objects + collisions
      const pz = CFG.playerZ;
      for (const o of g.objs) {
        if (o.dead) continue;
        const prev = o.z; o.z -= dz;
        if (!playing) continue;
        if (o.type === "seed") {
          if (g.magnet > 0 && o.z < 20 && o.z > -0.5) o.mag = true;
          if (o.mag) { const k = Math.min(1, dt * 12); o.lx += (g.px - o.lx) * k; o.z -= o.z * Math.min(1, dt * 7); }
          if (o.z - 0.3 - pz <= 0 && prev + 0.3 + pz >= 0 && Math.abs(o.lx - g.px) < (o.mag ? 0.45 : 0.6)) collect(o);
        } else if (o.type === "magnet" || o.type === "shield") {
          if (o.z - 0.4 - pz <= 0 && prev + 0.4 + pz >= 0 && Math.abs(o.lx - g.px) < 0.62) collect(o);
        } else if (g.inv <= 0) {
          const hd = CFG.hazard[o.type] + pz;
          if (o.z - hd <= 0 && prev + hd >= 0 && Math.abs(o.lx - g.px) < CFG.hitLane) hit(o);
        }
        if (state !== "play") break;
      }
      g.objs = g.objs.filter(o => !o.dead && o.z > zMin - 1);
      for (const o of g.deco) o.z -= dz;
      g.deco = g.deco.filter(o => o.z > zMin - 1);
      for (const p of g.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; }
      g.parts = g.parts.filter(p => p.t < p.life);
      for (const p of g.pops) p.t += dt; g.pops = g.pops.filter(p => p.t < p.life);
      if (g.banner) { g.banner.t += dt; if (g.banner.t > 1.3) g.banner = null; }
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
      if (state === "dying") { g.overT += dt; if (g.overT >= CFG.overDelay) finish(); }
    }

    /* ---------- render ---------- */
    function drawBall(c, t) {
      const b = ballPos(), R = b.r, dying = state === "dying" || state === "over";
      const bounce = dying ? 0 : Math.abs(Math.sin(g.roll * 1.6)) * R * 0.06;
      c.save();
      c.fillStyle = "rgba(23,13,51,.28)"; c.beginPath(); c.ellipse(b.x, py, R * 0.9, R * 0.22, 0, 0, TAU); c.fill();
      c.translate(b.x, b.y - bounce);
      c.rotate(g.lean * 0.18 + g.wobble);
      if (g.inv > 0 && Math.floor(g.inv * 16) % 2 === 0) c.globalAlpha = 0.55;
      // ball back + hamster inside
      c.fillStyle = "rgba(170,230,255,.35)"; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
      c.save(); c.beginPath(); c.arc(0, 0, R * 0.97, 0, TAU); c.clip();
      const S = R * 2.7, run = dying ? 0 : Math.sin(g.roll * 3.2) * R * 0.05;
      if (spr.face) { c.save(); c.rotate(dying ? Math.sin(t * 9) * 0.25 : -g.lean * 0.1); c.drawImage(spr.face, -S / 2, -S * 0.53 + R * 0.08 + run, S, S); c.restore(); }
      else { c.fillStyle = "#ffbb55"; c.beginPath(); c.arc(0, run, R * 0.62, 0, TAU); c.fill(); }
      // rolling seams
      c.strokeStyle = "rgba(255,255,255,.55)"; c.lineWidth = Math.max(1.5, R * 0.06);
      for (let j = 0; j < 3; j++) {
        const ph = g.roll * 1.6 + j * TAU / 3, v = Math.cos(ph);
        if (Math.sin(ph) < 0) continue;
        const k = Math.sqrt(1 - v * v); c.beginPath(); c.ellipse(0, v * R * 0.96, R * k, R * 0.16 * k + 0.5, 0, 0, TAU); c.stroke();
      }
      c.restore();
      c.lineWidth = Math.max(2.5, R * 0.09); c.strokeStyle = INK; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
      c.lineWidth = Math.max(1.5, R * 0.05); c.strokeStyle = "#38d9ff"; c.beginPath(); c.arc(0, 0, R * 0.92, 0, TAU); c.stroke();
      c.strokeStyle = "rgba(255,255,255,.85)"; c.lineWidth = Math.max(2, R * 0.08); c.lineCap = "round"; c.beginPath(); c.arc(0, 0, R * 0.78, Math.PI * 1.1, Math.PI * 1.4); c.stroke();
      c.globalAlpha = 1;
      if (g.shield > 0) {
        const blink = g.shield < 2 && Math.floor(g.shield * 8) % 2 === 0;
        if (!blink) {
          c.strokeStyle = `rgba(56,217,255,${0.65 + 0.25 * Math.sin(t * 8)})`; c.lineWidth = Math.max(3, R * 0.12);
          c.beginPath(); c.arc(0, 0, R * 1.18, 0, TAU); c.stroke();
          c.fillStyle = "rgba(56,217,255,.12)"; c.fill();
        }
      }
      if (g.magnet > 0 && !(g.magnet < 2 && Math.floor(g.magnet * 8) % 2 === 0)) { c.save(); c.translate(0, -R * 1.45 + Math.sin(t * 6) * 3); magnetIcon(c, R / 28); c.restore(); }
      if (dying) {   // dizzy stars
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3, sx = Math.cos(a) * R * 0.8, sy = -R * 1.15 + Math.sin(a) * R * 0.2;
          c.fillStyle = "#ffd23f"; c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath();
          for (let q = 0; q < 10; q++) { const aa = q * Math.PI / 5 - Math.PI / 2, rq = q % 2 ? R * 0.07 : R * 0.16; c.lineTo(sx + Math.cos(aa) * rq, sy + Math.sin(aa) * rq); }
          c.closePath(); c.fill(); c.stroke();
        }
      }
      c.restore();
    }
    function drawWorld(c, t) {
      // sky
      c.fillStyle = skyGrad; c.fillRect(0, 0, cssW, hy + 2);
      c.fillStyle = "#fff4b0"; c.beginPath(); c.arc(cssW * 0.82, hy * 0.32, Math.min(cssW, cssH) * 0.06, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,244,176,.35)"; c.beginPath(); c.arc(cssW * 0.82, hy * 0.32, Math.min(cssW, cssH) * 0.09, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,.92)";
      for (const cl of clouds) {
        const x = ((cl.x + t * cl.v) % (cssW + 160)) - 80, s = cl.s;
        c.beginPath(); c.arc(x, cl.y, 18 * s, 0, TAU); c.arc(x + 22 * s, cl.y - 9 * s, 22 * s, 0, TAU); c.arc(x + 46 * s, cl.y, 17 * s, 0, TAU); c.rect(x, cl.y, 46 * s, 17 * s); c.fill();
      }
      for (const h of hills) { c.fillStyle = h.c; c.beginPath(); c.ellipse(h.x, hy + 4, h.r, h.r * 0.42, 0, Math.PI, TAU); c.fill(); }
      c.strokeStyle = "rgba(23,13,51,.25)"; c.lineWidth = 2; c.beginPath(); c.moveTo(0, hy); c.lineTo(cssW, hy); c.stroke();
      // ground bands (grass + toy track), far -> near
      const L = 3, dist = g ? g.dist : clock * 4, zA = zMin, zB = CFG.zFar + 4;
      const k0 = Math.floor((dist + zA) / L), k1 = Math.ceil((dist + zB) / L);
      for (let kk = k1; kk >= k0; kk--) {
        let z0 = kk * L - dist, z1 = z0 + L; if (z1 < zA || z0 > zB) continue; z0 = Math.max(z0, zA); z1 = Math.min(z1, zB);
        const y0 = yOf(z0), y1 = yOf(z1), f0 = f(z0), f1 = f(z1), odd = kk & 1;
        c.fillStyle = odd ? "#69d16f" : "#5cc463"; c.fillRect(0, y1, cssW, y0 - y1 + 1);
        const hw0 = 1.5 * lw * f0, hw1 = 1.5 * lw * f1, cb0 = 0.13 * lw * f0, cb1 = 0.13 * lw * f1;
        c.fillStyle = odd ? "#ff6b81" : "#ffffff";
        c.beginPath(); c.moveTo(cx - hw0 - cb0, y0); c.lineTo(cx + hw0 + cb0, y0); c.lineTo(cx + hw1 + cb1, y1); c.lineTo(cx - hw1 - cb1, y1); c.closePath(); c.fill();
        c.fillStyle = odd ? "#5560d8" : "#4b55c9";
        c.beginPath(); c.moveTo(cx - hw0, y0); c.lineTo(cx + hw0, y0); c.lineTo(cx + hw1, y1); c.lineTo(cx - hw1, y1); c.closePath(); c.fill();
        if (odd) {
          c.fillStyle = "rgba(255,255,255,.85)";
          for (const lx of [-0.5, 0.5]) {
            const a0 = 0.035 * lw * f0, a1 = 0.035 * lw * f1, x0 = cx + lx * lw * f0, x1 = cx + lx * lw * f1;
            c.beginPath(); c.moveTo(x0 - a0, y0); c.lineTo(x0 + a0, y0); c.lineTo(x1 + a1, y1); c.lineTo(x1 - a1, y1); c.closePath(); c.fill();
          }
        }
      }
      // haze at the horizon hides far stripe aliasing
      const hh = (py - hy) * 0.09, hz = c.createLinearGradient(0, hy, 0, hy + hh);
      hz.addColorStop(0, "rgba(186,236,214,.9)"); hz.addColorStop(1, "rgba(186,236,214,0)");
      c.fillStyle = hz; c.fillRect(0, hy, cssW, hh);
    }
    function render() {
      const c = ctx, t = clock;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const sh = g && g.shake ? Math.sin(t * 80) * g.shake * 16 : 0;
      if (sh) c.translate(sh, 0);
      drawWorld(c, t);
      if (!g) return;
      // sprites, far -> near (player at z = 0)
      const list = g.objs.concat(g.deco).filter(o => o.z < CFG.zFar + 2 && o.z > zMin - 1).sort((a, b) => b.z - a.z);
      let drewBall = false;
      for (const o of list) {
        if (!drewBall && o.z < -0.2) { drawBall(c, t); drewBall = true; }
        const s = f(o.z), u = lw * s, x = xOf(o.lx, o.z), y = yOf(o.z);
        const fade = clamp((CFG.zFar - (o.type === "deco" ? 14 : 2) - o.z) / 12, 0, 1);   // fade in from the horizon
        if (fade <= 0) continue;
        c.save(); c.globalAlpha = fade; c.translate(x, y);
        if (o === g.hitObj && o.type === "trap") c.scale(1, 0.9);
        DRAW[o.type](c, u, o, t);
        c.restore();
      }
      if (!drewBall) drawBall(c, t);
      // magnet pull lines
      if (g.magnet > 0) {
        const b = ballPos(); c.strokeStyle = "rgba(255,107,129,.5)"; c.lineWidth = 2; c.setLineDash([5, 6]);
        for (const o of g.objs) if (o.mag) { c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(xOf(o.lx, Math.max(0, o.z)), yOf(Math.max(0, o.z)) - lw * f(Math.max(0, o.z)) * 0.3); c.stroke(); }
        c.setLineDash([]);
      }
      for (const p of g.parts) { c.globalAlpha = 1 - p.t / p.life; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.r, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      for (const p of g.pops) { const q = p.t / p.life; c.globalAlpha = q > 0.6 ? 1 - (q - 0.6) / 0.4 : 1; text(c, p.txt, p.x, p.y - q * 40, p.size * (q < 0.15 ? 0.7 + q * 2 : 1), p.col); }
      c.globalAlpha = 1;
      if (sh) c.setTransform(dpr, 0, 0, dpr, 0, 0);
      // HUD
      if (state !== "menu") {
        const big = clamp(Math.min(cssH * 0.07, cssW * 0.11), 30, 60);
        text(c, String(g.score), cssW / 2, 14 + big * 0.55, big, "#ffffff");
        const ss = clamp(big * 0.5, 18, 28), sx = 14 + ss * 0.5, sy = 14 + ss * 0.7;
        c.save(); c.translate(sx, sy + ss * 0.45); drawSeed(c, ss * 3.2, { p: 0 }, 0); c.restore();
        text(c, "× " + g.seeds, sx + ss * 0.75, sy, ss, "#ffd23f", "left");
        let iy = sy + ss * 1.4;
        for (const [k, max, col] of [["magnet", CFG.magnetT, "#ff6b81"], ["shield", CFG.shieldT, "#38d9ff"]]) {
          if (!(g[k] > 0)) continue;
          c.save(); c.translate(sx, iy + ss * 0.1); if (k === "magnet") magnetIcon(c, ss / 30); else shieldIcon(c, ss / 26); c.restore();
          const bw = ss * 3;
          c.fillStyle = "rgba(23,13,51,.55)"; rr(c, sx + ss * 0.75, iy - 5, bw, 10, 5); c.fill();
          c.fillStyle = col; rr(c, sx + ss * 0.75, iy - 5, bw * (g[k] / max), 10, 5); c.fill();
          c.strokeStyle = INK; c.lineWidth = 2; rr(c, sx + ss * 0.75, iy - 5, bw, 10, 5); c.stroke();
          iy += ss * 1.15;
        }
        if (g.banner) {
          const q = g.banner.t / 1.3, s = clamp(cssW * 0.08, 26, 48) * (q < 0.12 ? 0.6 + q / 0.12 * 0.4 : 1);
          c.globalAlpha = q > 0.75 ? 1 - (q - 0.75) / 0.25 : 1; text(c, g.banner.txt, cssW / 2, hy + (py - hy) * 0.22, s, g.banner.col); c.globalAlpha = 1;
        }
        if (state === "play" && g.t < 3.2) {
          c.globalAlpha = clamp((3.2 - g.t) / 0.6, 0, 1) * (0.7 + 0.3 * Math.sin(t * 6));
          text(c, T(touchMode ? "hud.swipe" : "hud.keys", touchMode ? "SWIPE ← →" : "← → / A D"), cssW / 2, hy + (py - hy) * 0.38, clamp(cssW * 0.06, 20, 34), "#ffffff");
          c.globalAlpha = 1;
        }
      }
    }

    /* ---------- input ---------- */
    let touch = null, touchMode = !(global.matchMedia && global.matchMedia("(hover:hover) and (pointer:fine)").matches);
    function onDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault(); sfx.ensure();
      touchMode = e.pointerType !== "mouse";
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { }
      touch = { id: e.pointerId, x0: e.clientX, y0: e.clientY, sx: e.clientX, sy: e.clientY, t0: performance.now(), swiped: false, dir: 0, peak: e.clientX };
    }
    function onMove(e) {
      if (!touch || touch.id !== e.pointerId) return;
      // one lane per swipe. The same finger only switches again after a long extra drag, or when it reverses direction.
      const x = e.clientX, dx = x - touch.x0, dy = e.clientY - touch.y0, th = clamp(cssW * 0.06, 22, 44);
      if (!touch.dir) {
        if (Math.abs(dx) > th && Math.abs(dx) > Math.abs(dy) * 0.8) { touch.dir = dx > 0 ? 1 : -1; steer(touch.dir); touch.x0 = touch.peak = x; touch.y0 = e.clientY; touch.swiped = true; }
        return;
      }
      if ((x - touch.peak) * touch.dir > 0) touch.peak = x;
      if ((x - touch.x0) * touch.dir > th * 3.5) { steer(touch.dir); touch.x0 = touch.peak = x; }
      else if ((touch.peak - x) * touch.dir > th) { touch.dir = -touch.dir; steer(touch.dir); touch.x0 = touch.peak = x; }
    }
    function onUp(e) {
      if (!touch || touch.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - touch.sx, e.clientY - touch.sy);
      if (!touch.swiped && e.type === "pointerup" && moved < 16 && performance.now() - touch.t0 < 400) {   // simple tap: left / right half
        const r = canvas.getBoundingClientRect(); steer(e.clientX - r.left < cssW / 2 ? -1 : 1);
      }
      touch = null;
    }
    const KEYS = { ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
    function onKey(e) {
      if (e.type !== "keydown") return;
      const d = KEYS[e.code];
      if (d) { if (state === "play" || state === "dying") e.preventDefault(); touchMode = false; if (!e.repeat) steer(d); return; }
      if (e.repeat) return;
      if (e.code === "KeyP" || e.code === "Escape") { if (state === "play") pause("key"); else if (state === "paused") resume(); }
      else if (e.code === "KeyM") toggleMute();
    }
    canvas.addEventListener("pointerdown", onDown, { passive: false });
    canvas.addEventListener("pointermove", onMove, { passive: false });
    canvas.addEventListener("pointerup", onUp); canvas.addEventListener("pointercancel", onUp);
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    global.addEventListener("keydown", onKey);
    const onVis = () => { if (document.hidden && (state === "play" || state === "dying")) pause("hidden"); };
    document.addEventListener("visibilitychange", onVis);
    let ro = null;
    if (global.ResizeObserver) { ro = new ResizeObserver(() => resize()); ro.observe(canvas); } else global.addEventListener("resize", resize);

    /* ---------- loop ---------- */
    let pausedFrom = "play";
    function frame(ts) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, Math.max(0, (ts - (last || ts)) / 1000)); last = ts;
      if (state !== "paused") clock += dt;
      if (g && (state === "play" || state === "dying" || state === "over")) update(dt);
      render();
    }

    /* ---------- public API ---------- */
    function start() { sfx.ensure(); newRun(); touch = null; state = "play"; last = 0; emit("state", { state }); }
    function pause(reason = "user") { if (state !== "play" && state !== "dying") return; pausedFrom = state; state = "paused"; touch = null; emit("state", { state, reason }); }
    function resume() { if (state !== "paused") return; state = pausedFrom; last = 0; sfx.ensure(); emit("state", { state }); }
    function setMuted(m) { sfx.setMuted(m); store.set("muted", m ? "1" : "0"); emit("mute", { muted: !!m }); }
    function toggleMute() { setMuted(!sfx.muted); if (!sfx.muted) { sfx.ensure(); sfx.click(); } }
    function destroy() {
      if (state === "play" || state === "dying") pause("leave");
      cancelAnimationFrame(raf); raf = 0; sfx.close(); if (ro) ro.disconnect(); else global.removeEventListener("resize", resize);
      global.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown); canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp); canvas.removeEventListener("pointercancel", onUp);
    }

    resize();
    raf = requestAnimationFrame(frame);

    return {
      start, steer, pause, resume, setMuted, toggleMute, destroy,
      get state() { return state; }, get muted() { return sfx.muted; },
      best: () => ({ score: bestScore, seeds: bestSeeds, dist: bestDist }),
      // test/debug helpers (only do something when called)
      debug: {
        info: () => g && {
          state, t: g.t, score: g.score, seeds: g.seeds, dist: g.dist, speed: g.v, lane: g.lane, px: g.px, shield: g.shield, magnet: g.magnet, reason: g.reason,
          objs: g.objs.filter(o => o.z < 40).map(o => ({ type: o.type, lane: o.lane, lx: +o.lx.toFixed(2), z: +o.z.toFixed(2) })),
          view: { cssW, cssH, hy, py, lw }
        },
        spawn: (type, lane, z) => { if (g) addObj(type, lane, z); },
        clear: () => { if (g) g.objs = []; },
        setTime: s => { if (g) { g.t = s; g.nextFaster = Math.ceil((s + 0.01) / 15) * 15; } },
        god: on => { god = !!on; },
        cfg: CFG
      }
    };
  }

  global.HamsterDash = { create, version: "0.1.0-test" };
})(window);
