/* Hamster Stack: self-contained one-tap stacking game (Canvas 2D + WebAudio, no dependencies).

   const game = HamsterStack.create({
     canvas,                    // <canvas> filling its container (its CSS size is the view size)
     assetBase: "assets/",      // folder with hamster_rocket.svg + hamster_face.svg (falls back to vector art)
     t: (key, english) => str,  // optional translator for in-canvas text
     storagePrefix: "hrs_",     // localStorage prefix (best, bestCombo, muted)
     onEvent: (type, data) => {}// "state" {state, reason}, "score" {score, combo, perfect}, "gameover" {score, perfects, maxCombo, newBest}, "mute" {muted}
   });
   game.start()  game.drop()  game.pause()  game.resume()  game.toggleMute()  game.state ("menu" | "play" | "dying" | "paused" | "over")  game.best()

   Simulation, rendering, input and sound live in this one file so it can later become a mode of the main Hamster Rocket site. */
(function (global) {
  "use strict";
  const TAU = Math.PI * 2, INK = "#170d33", FONT = '"Luckiest Guy", system-ui, sans-serif';
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v), rand = (a, b) => a + Math.random() * (b - a), lerp = (a, b, t) => a + (b - a) * t;

  const CFG = {
    viewW: 420, viewH: 560, minScale: 0.4, maxScale: 2.2,   // world units that must fit on screen
    bh: 30, baseW: 210,                                      // block height + starting width (world units)
    tol: 7,                                                  // |offset| <= tol counts as a perfect drop (snaps)
    growAfter: 3, grow: 12,                                  // from the 3rd perfect in a row, every perfect widens the block again
    speed0: 160, speedK: 6.5, speedMax: 420,                 // slide speed (units/s) = speed0 + blocks * speedK
    margin: 34, overDelay: 1.4
  };
  const PAL = [[255, 210, 63], [255, 166, 46], [255, 122, 61], [255, 107, 129], [240, 115, 210], [170, 130, 255], [110, 140, 255], [56, 217, 255], [70, 224, 170], [140, 226, 90]];
  function blockColor(i) {
    const f = (i * 0.3) % PAL.length, i0 = Math.floor(f), a = PAL[i0], b = PAL[(i0 + 1) % PAL.length], t = f - i0;
    return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  }
  const rgb = (c, m = 1, a = 1) => `rgba(${clamp(c[0] * m, 0, 255) | 0},${clamp(c[1] * m, 0, 255) | 0},${clamp(c[2] * m, 0, 255) | 0},${a})`;
  const tint = (c, w) => [lerp(c[0], 255, w), lerp(c[1], 255, w), lerp(c[2], 255, w)];
  const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

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
    const STEPS = [0, 2, 4, 7, 9];
    const note = n => 523.25 * Math.pow(2, (12 * Math.floor(n / 5) + STEPS[n % 5]) / 12);
    return {
      ensure,
      close() { try { if (ac && ac.close) ac.close(); } catch (e) { } ac = null; master = null; },   // hub: release the audio device when leaving the game
      get muted() { return muted; },
      setMuted(m) { muted = !!m; if (master) master.gain.value = muted ? 0 : VOL; },
      place() { tone("triangle", 210, 95, 0.13, 0.24); noise(0.08, 0.16, 1400); },
      cut() { noise(0.14, 0.2, 5200, 0, "bandpass"); tone("square", 620, 180, 0.09, 0.05); tone("triangle", 190, 90, 0.12, 0.18); },
      perfect(c) {
        const f = note(Math.min(c - 1, 14));
        tone("triangle", f, 0, 0.24, 0.2); tone("sine", f * 2, 0, 0.32, 0.08, 0.035); tone("sine", f * 3, 0, 0.2, 0.05, 0.07);
      },
      grow() { arp([1046, 1318, 1568], "sine", 0.045, 0.1, 0.07); },
      milestone() { arp([784, 988, 1175, 1568], "triangle", 0.07, 0.16, 0.13); },
      miss() { tone("sawtooth", 320, 70, 0.55, 0.14); noise(0.3, 0.12, 900); },
      over() { arp([523, 415, 330, 262], "triangle", 0.15, 0.22, 0.15); },
      click() { if (gap("click", 40)) tone("triangle", 640, 0, 0.05, 0.08); }
    };
  }

  /* ------------------------------------------------------------------ drawing helpers */
  function rr(c, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
  function text(c, s, x, y, size, fill, align = "center", base = "middle", stroke = INK) {
    c.font = `${Math.round(size)}px ${FONT}`; c.textAlign = align; c.textBaseline = base;
    c.lineJoin = "round"; c.lineWidth = Math.max(3, size * 0.2); c.strokeStyle = stroke; c.strokeText(s, x, y);
    c.fillStyle = fill; c.fillText(s, x, y);
  }
  function star(c, x, y, r, rot) {
    c.beginPath();
    for (let i = 0; i < 8; i++) { const a = rot + i * Math.PI / 4, q = i % 2 ? r * 0.38 : r; c.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); }
    c.closePath();
  }
  // sunflower seed (black with white stripes), centred, pointing +x
  function seed(c, x, y, s, a) {
    c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    c.fillStyle = "#2a2140"; c.strokeStyle = INK; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(-7, 0); c.quadraticCurveTo(-5, -4.2, 2, -3.6); c.quadraticCurveTo(7.5, -2, 7.5, 0); c.quadraticCurveTo(7.5, 2, 2, 3.6); c.quadraticCurveTo(-5, 4.2, -7, 0); c.closePath(); c.fill(); c.stroke();
    c.strokeStyle = "#f4ecd8"; c.lineWidth = 1.1; c.beginPath(); c.moveTo(-4.5, -1.2); c.lineTo(4.5, -1.4); c.moveTo(-4.5, 1.2); c.lineTo(4.5, 1.4); c.stroke();
    c.restore();
  }
  function sunflower(c, x, y, h, s, t) {
    c.save(); c.translate(x, y);
    c.strokeStyle = "#2f8a3b"; c.lineWidth = 5 * s; c.lineCap = "round";
    const sway = Math.sin(t * 1.3 + x) * 4 * s;
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(sway * 0.5, -h * 0.5, sway, -h); c.stroke();
    c.fillStyle = "#4cbf55"; c.strokeStyle = INK; c.lineWidth = 2 * s;
    c.beginPath(); c.ellipse(-9 * s, -h * 0.45, 10 * s, 5 * s, -0.5, 0, TAU); c.fill(); c.stroke();
    c.translate(sway, -h);
    c.fillStyle = "#ffd23f";
    for (let i = 0; i < 12; i++) { c.save(); c.rotate(i * TAU / 12); c.beginPath(); c.ellipse(0, -14 * s, 5 * s, 9 * s, 0, 0, TAU); c.fill(); c.stroke(); c.restore(); }
    c.fillStyle = "#6b3f1d"; c.beginPath(); c.arc(0, 0, 10 * s, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = "rgba(0,0,0,.25)"; for (let i = 0; i < 6; i++) { const a = i * TAU / 6; c.beginPath(); c.arc(Math.cos(a) * 5 * s, Math.sin(a) * 5 * s, 1.5 * s, 0, TAU); c.fill(); }
    c.restore();
  }
  function cloud(c, x, y, s) {
    c.beginPath(); c.arc(x, y, 22 * s, 0, TAU); c.arc(x + 26 * s, y - 10 * s, 26 * s, 0, TAU); c.arc(x + 54 * s, y, 20 * s, 0, TAU); c.rect(x, y, 54 * s, 20 * s); c.fill();
  }

  /* ------------------------------------------------------------------ main factory */
  function create(opts) {
    const canvas = opts.canvas, ctx = canvas.getContext("2d");
    const T = opts.t || ((k, en) => en);
    const base = opts.assetBase == null ? "assets/" : opts.assetBase;
    const prefix = opts.storagePrefix || "hrs_";
    const emit = (type, data) => { if (opts.onEvent) opts.onEvent(type, data || {}); };
    const store = {
      get(k, d) { try { const v = localStorage.getItem(prefix + k); return v == null ? d : v; } catch (e) { return d; } },
      set(k, v) { try { localStorage.setItem(prefix + k, String(v)); } catch (e) { } }
    };
    const sfx = makeSfx(); sfx.setMuted(store.get("muted", "0") === "1");
    let bestScore = +store.get("best", 0) || 0, bestCombo = +store.get("bestCombo", 0) || 0;
    let state = "menu", raf = 0, last = 0, g = null, clock = 0, timeScale = 1;

    /* ---------- sprites (same art as the main site) ---------- */
    const spr = {};
    function loadSprite(name, file, size) {
      const img = new Image();
      img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = size; c.getContext("2d").drawImage(img, 0, 0, size, size); spr[name] = c; };
      img.onerror = () => { };
      img.src = base + file;
    }
    loadSprite("rocket", "hamster_rocket.svg", 400); loadSprite("face", "hamster_face.svg", 256);

    /* ---------- view ---------- */
    let cssW = 1, cssH = 1, dpr = 1, k = 1, VW = 1, VH = 1, groundY = 1;
    const stars = []; for (let i = 0; i < 90; i++) stars.push({ x: Math.random(), y: Math.random(), r: rand(0.8, 2.2), p: Math.random() * TAU });
    function resize() {
      const r = canvas.getBoundingClientRect();
      cssW = Math.max(1, r.width); cssH = Math.max(1, r.height);
      dpr = Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(cssW * dpr); canvas.height = Math.round(cssH * dpr);
      k = clamp(Math.min(cssW / CFG.viewW, cssH / CFG.viewH), CFG.minScale, CFG.maxScale);
      VW = cssW / k; VH = cssH / k; groundY = cssH * 0.86;
      render();
    }

    /* ---------- game state ---------- */
    const speedFor = n => Math.min(CFG.speedMax, CFG.speed0 + (n - 1) * CFG.speedK);
    function newRun() {
      g = {
        tower: [{ x: 0, w: CFG.baseW, c: [255, 241, 220], t: -9, base: true }], cur: null,
        debris: [], parts: [], pops: [], flashes: [], score: 0, combo: 0, maxCombo: 0, perfects: 0,
        camY: 0, zoom: 1, t: 0, overT: 0, shake: 0, rocket: { y: CFG.bh * 2.5, spin: 0, cheer: 0 }, missed: false, clouds: [], cloudTop: 60
      };
      spawnBlock();
    }
    function spawnBlock() {
      const top = g.tower[g.tower.length - 1], n = g.tower.length, w = top.w;
      const A = top.w / 2 + w / 2 + CFG.margin;   // slides far enough to miss completely; its inner edge always stays near the tower
      const dir = n % 2 ? 1 : -1;
      g.cur = { x: top.x - dir * A, w, dir, A, cx: top.x, c: blockColor(n), speed: speedFor(n), born: g.t };
    }
    function pop(txt, x, y, col, size = 26, life = 0.9, kind = "") {
      if (kind) g.pops = g.pops.filter(p => p.kind !== kind);   // a new combo text replaces the previous one
      g.pops.push({ txt, x, y, col, size, t: 0, life, kind });
    }
    function sparkle(x, y, n, spread, colors) {
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI, 0), s = rand(60, 260);
        g.parts.push({ x: x + rand(-spread, spread), y, vx: Math.cos(a) * s, vy: -Math.sin(a) * s, life: rand(0.45, 0.9), t: 0, r: rand(3, 7), rot: rand(0, TAU), col: colors[i % colors.length], star: true });
      }
    }
    function dust(x, y, n) {
      for (let i = 0; i < n; i++) g.parts.push({ x: x + rand(-6, 6), y: y + rand(0, 6), vx: rand(-90, 90), vy: rand(10, 70), life: rand(0.3, 0.55), t: 0, r: rand(3, 6), col: "rgba(255,255,255,.75)" });
    }

    function drop() {
      if (state !== "play" || !g || !g.cur || g.t - g.cur.born < 0.08) return false;
      sfx.ensure();
      const top = g.tower[g.tower.length - 1], cur = g.cur, n = g.tower.length, y = n * CFG.bh;
      const dx = cur.x - top.x;
      let perfect = false, nx, nw;
      if (Math.abs(dx) <= CFG.tol) {
        perfect = true; g.combo++; g.perfects++; g.maxCombo = Math.max(g.maxCombo, g.combo);
        nx = top.x; nw = cur.w;
        if (g.combo >= CFG.growAfter && nw < CFG.baseW) { nw = Math.min(CFG.baseW, nw + CFG.grow); sfx.grow(); }
      } else {
        const l = Math.max(cur.x - cur.w / 2, top.x - top.w / 2), r = Math.min(cur.x + cur.w / 2, top.x + top.w / 2);
        if (r - l <= 0) { miss(); return true; }
        nx = (l + r) / 2; nw = r - l;
        const s = dx > 0 ? 1 : -1, pl = s > 0 ? r : cur.x - cur.w / 2, pr = s > 0 ? cur.x + cur.w / 2 : l;
        g.debris.push({ x: (pl + pr) / 2, y, w: pr - pl, h: CFG.bh, vx: s * rand(40, 90), vy: 40, rot: 0, vr: s * rand(1.5, 3.5), c: cur.c, i: n });
        g.combo = 0;
      }
      g.tower.push({ x: nx, w: nw, c: cur.c, t: g.t, perfect });
      g.score = g.tower.length - 1;
      if (perfect) {
        g.flashes.push({ x: nx, y, w: nw, t: 0 });
        sparkle(nx - nw / 2, y + CFG.bh, 7, 4, ["#fff6b0", "#ffd23f", "#ffffff"]); sparkle(nx + nw / 2, y + CFG.bh, 7, 4, ["#fff6b0", "#ffd23f", "#ffffff"]);
        sparkle(nx, y + CFG.bh, 6, nw / 2, ["#38d9ff", "#ffffff"]);
        sfx.perfect(g.combo);
        pop(g.combo > 1 ? `${T("hud.perfect", "PERFECT!")} ×${g.combo}` : T("hud.perfect", "PERFECT!"), nx, y + CFG.bh + 26, "#ffd23f", 24 + Math.min(g.combo, 8) * 1.5, 0.9, "perfect");
        g.rocket.spin = 1; g.rocket.cheer = 1;
      } else { sfx.place(); sfx.cut(); dust(nx - nw / 2, y, 3); dust(nx + nw / 2, y, 3); }
      if (g.score % 10 === 0) { sfx.milestone(); pop(`${g.score}!`, nx, y + CFG.bh + 62, "#ffffff", 40, 1.2); g.rocket.spin = 1; }
      emit("score", { score: g.score, combo: g.combo, perfect });
      spawnBlock();
      return true;
    }
    function miss() {
      const cur = g.cur, n = g.tower.length;
      g.debris.push({ x: cur.x, y: n * CFG.bh, w: cur.w, h: CFG.bh, vx: cur.dir * 70, vy: 60, rot: 0, vr: (cur.x > g.tower[n - 1].x ? 1 : -1) * 2.2, c: cur.c, i: n });
      g.cur = null; g.combo = 0; g.missed = true; g.shake = 0.35;
      sfx.miss();
      state = "dying"; g.overT = 0;
      emit("state", { state });
    }
    function finish() {
      state = "over";
      const newBest = g.score > bestScore;
      if (newBest) { bestScore = g.score; store.set("best", bestScore); }
      if (g.maxCombo > bestCombo) { bestCombo = g.maxCombo; store.set("bestCombo", bestCombo); }
      sfx.over();
      emit("state", { state });
      emit("gameover", { score: g.score, perfects: g.perfects, maxCombo: g.maxCombo, newBest, best: bestScore });
    }

    /* ---------- update ---------- */
    function update(dt) {
      g.t += dt;
      const bh = CFG.bh, n = g.tower.length, topY = n * bh;
      if (state === "play" && g.cur) {
        const c = g.cur; c.x += c.dir * c.speed * dt;
        if (c.x > c.cx + c.A) { c.x = 2 * (c.cx + c.A) - c.x; c.dir = -1; }
        if (c.x < c.cx - c.A) { c.x = 2 * (c.cx - c.A) - c.x; c.dir = 1; }
      }
      // camera: keep the sliding block in the upper part of the screen; zoom out to show the whole tower after a miss
      let camT, zoomT = 1;
      const hy = groundY / k;                       // world units between ground line and screen top (at zoom 1)
      if (state === "dying" || state === "over") {
        const H = topY + bh * 2;
        zoomT = clamp((hy * 0.78) / H, 0.12, 1); camT = 0;
      } else camT = Math.max(0, topY + bh * 1.5 - hy * 0.62);
      const e = 1 - Math.exp(-dt * 5);
      g.camY += (camT - g.camY) * e; g.zoom += (zoomT - g.zoom) * (1 - Math.exp(-dt * 4.5));
      // falling pieces
      for (const d of g.debris) { d.vy -= 1500 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.rot += d.vr * dt; }
      g.debris = g.debris.filter(d => d.y > -600 && d.y > g.camY - VH * 2);
      for (const p of g.parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= (p.star ? 380 : 60) * dt; p.vx *= 1 - dt * 2; }
      g.parts = g.parts.filter(p => p.t < p.life);
      for (const p of g.pops) p.t += dt; g.pops = g.pops.filter(p => p.t < p.life);
      for (const f of g.flashes) f.t += dt; g.flashes = g.flashes.filter(f => f.t < 0.45);
      const R = g.rocket; R.y += (topY + bh * 2.2 - R.y) * (1 - Math.exp(-dt * 4));
      if (R.spin > 0) R.spin = Math.max(0, R.spin - dt * 1.9); if (R.cheer > 0) R.cheer = Math.max(0, R.cheer - dt * 1.5);
      if (g.shake > 0) g.shake = Math.max(0, g.shake - dt);
      if (state === "dying") { g.overT += dt; if (g.overT >= CFG.overDelay) finish(); }
      // clouds for the sky (parallax)
      while (g.cloudTop < g.camY * 0.5 + VH * 2) { g.clouds.push({ x: rand(-0.6, 0.6), y: g.cloudTop, s: rand(0.7, 1.4), v: rand(4, 12) }); g.cloudTop += rand(120, 210); }
    }

    /* ---------- render ---------- */
    const DAY_T = [94, 194, 255], DAY_B = [196, 241, 255], DUSK_T = [92, 86, 214], DUSK_B = [255, 178, 140], NIGHT_T = [10, 11, 46], NIGHT_B = [43, 47, 154];
    function drawBlock(c, b, idx, yb, glow) {
      const h = CFG.bh, L = b.x - b.w / 2, top = -(yb + h), col = b.c;
      if (b.base) {    // wooden pedestal that the tower stands on
        c.fillStyle = "#c98b4a"; rr(c, L, top, b.w, h + 40, 6); c.fill();
        c.fillStyle = "#a96b33"; for (let x = L + 18; x < L + b.w - 8; x += 26) c.fillRect(x, top + 4, 3, h + 30);
        c.fillStyle = "#e3a866"; c.fillRect(L + 3, top + 3, b.w - 6, 6);
        c.lineWidth = 3; c.strokeStyle = INK; rr(c, L, top, b.w, h + 40, 6); c.stroke();
        return;
      }
      const golden = idx % 10 === 0;
      const body = golden ? [255, 200, 70] : col;
      c.save(); rr(c, L, top, b.w, h, 6); c.fillStyle = rgb(body); c.fill(); c.clip();
      c.fillStyle = rgb(tint(body, 0.45)); c.fillRect(L, top, b.w, h * 0.26);
      c.fillStyle = "rgba(23,13,51,.16)"; c.fillRect(L, top + h * 0.74, b.w, h * 0.26);
      if (golden && spr.face) {
        for (let x = -168; x <= 168; x += 56) if (x > L - 30 && x < L + b.w + 30) c.drawImage(spr.face, x - 30, top - 17, 60, 60);
      } else {
        const off = (idx * 17) % 34;
        for (let x = Math.floor((L - off) / 34) * 34 + off; x < L + b.w + 10; x += 34) seed(c, x, top + h * 0.52, 1.05, ((x / 34) | 0) % 2 ? 0.35 : -0.35);
      }
      c.restore();
      c.lineWidth = 3; c.strokeStyle = INK; rr(c, L, top, b.w, h, 6); c.stroke();
      if (glow) { c.lineWidth = 2; c.strokeStyle = "rgba(255,255,255,.75)"; rr(c, L + 4, top + 4, b.w - 8, h - 8, 4); c.stroke(); }
    }
    function drawRocket(c, x, y, t) {
      const R = g ? g.rocket : { spin: 0, cheer: 0 }, S = 92;
      c.save(); c.translate(x, -y + Math.sin(t * 2.4) * 6);
      const spin = R.spin > 0 ? (1 - R.spin) * TAU : 0;
      c.rotate(Math.sin(t * 1.7) * 0.06 + spin + (state === "dying" || state === "over" ? 0.25 : 0));
      const fl = 0.8 + Math.random() * 0.3 + R.cheer * 0.6;
      const gr = c.createLinearGradient(0, 30, 0, 30 + 46 * fl); gr.addColorStop(0, "#fff6b0"); gr.addColorStop(0.4, "#ffb02e"); gr.addColorStop(1, "rgba(255,61,90,0)");
      c.fillStyle = gr; c.beginPath(); c.moveTo(-9, 32); c.quadraticCurveTo(-8, 30 + 30 * fl, 0, 32 + 46 * fl); c.quadraticCurveTo(8, 30 + 30 * fl, 9, 32); c.closePath(); c.fill();
      if (spr.rocket) c.drawImage(spr.rocket, -S / 2, -S / 2, S, S);
      else { c.fillStyle = "#ff6b81"; c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 26, 0, TAU); c.fill(); c.stroke(); }
      c.restore();
    }
    function render() {
      const c = ctx, t = clock;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const camY = g ? g.camY : 0, zoom = g ? g.zoom : 1, z = k * zoom;
      // sky: day -> dusk -> space as the tower grows
      const hgt = g ? Math.max(camY, state === "over" || state === "dying" ? (g.tower.length * CFG.bh - VH * 0.4) : 0) : 0;
      const s = clamp(hgt / 2400, 0, 1);
      const top = s < 0.5 ? mix3(DAY_T, DUSK_T, s * 2) : mix3(DUSK_T, NIGHT_T, s * 2 - 1);
      const bot = s < 0.5 ? mix3(DAY_B, DUSK_B, s * 2) : mix3(DUSK_B, NIGHT_B, s * 2 - 1);
      const sky = c.createLinearGradient(0, 0, 0, cssH); sky.addColorStop(0, rgb(top)); sky.addColorStop(1, rgb(bot));
      c.fillStyle = sky; c.fillRect(0, 0, cssW, cssH);
      const starA = clamp((s - 0.35) / 0.4, 0, 1);
      if (starA > 0) {
        c.fillStyle = "#fff";
        for (const st of stars) { c.globalAlpha = starA * (0.45 + 0.4 * Math.sin(t * 2 + st.p)); c.fillRect(st.x * cssW, ((st.y * cssH + camY * k * 0.08) % cssH), st.r, st.r); }
        c.globalAlpha = 1;
      }
      // clouds (parallax 0.5)
      const cloudA = 1 - clamp((s - 0.45) / 0.3, 0, 1);
      if (g && cloudA > 0) {
        c.fillStyle = `rgba(255,255,255,${0.85 * cloudA})`;
        for (const cl of g.clouds) {
          const sx = cssW / 2 + (((cl.x * VW + t * cl.v + VW) % (VW * 1.4)) - VW * 0.7) * k, sy = groundY - (cl.y - camY * 0.5) * k;
          if (sy < -60 || sy > cssH + 60) continue;
          cloud(c, sx, sy, cl.s * k * 0.9);
        }
      }
      // world transform: x right, y up from the ground line (we draw at -y)
      const shx = g && g.shake ? Math.sin(t * 90) * g.shake * 14 : 0;
      c.setTransform(dpr * z, 0, 0, dpr * z, dpr * (cssW / 2 + shx), dpr * (groundY + camY * z));
      const halfW = cssW / (2 * z) + 40;
      // ground + flowers
      c.fillStyle = "#5fd16b"; c.fillRect(-halfW, 0, halfW * 2, 4000);
      c.fillStyle = "#47b955"; c.fillRect(-halfW, 14, halfW * 2, 4000);
      c.lineWidth = 3; c.strokeStyle = INK; c.beginPath(); c.moveTo(-halfW, 0); c.lineTo(halfW, 0); c.stroke();
      sunflower(c, -CFG.baseW / 2 - 46, 0, 70, 1, t); sunflower(c, CFG.baseW / 2 + 40, 0, 52, 0.85, t + 1); sunflower(c, -CFG.baseW / 2 - 110, 0, 44, 0.7, t + 2);
      sunflower(c, CFG.baseW / 2 + 120, 0, 66, 0.95, t + 3);
      if (!g) { drawBlock(c, { x: 0, w: CFG.baseW, base: true }, 0, 0); drawRocket(c, Math.min(CFG.baseW / 2 + 70, VW / 2 - 50), CFG.bh * 3, t); return; }
      // rocket hamster cheering beside the tower (behind the blocks)
      const rx = Math.min(CFG.baseW / 2 + 85, VW / 2 - 48);
      drawRocket(c, rx, g.rocket.y, t);
      // tower (only the visible part)
      const yMin = camY - 60 / z, yMax = camY + cssH / z + 60;
      for (let i = 0; i < g.tower.length; i++) {
        const y = i * CFG.bh; if (y + CFG.bh < yMin - 60 || y > yMax) continue;
        const b = g.tower[i], age = g.t - b.t;
        if (age < 0.18 && !b.base) {   // tiny squash when it lands
          const q = 1 - age / 0.18; c.save(); c.translate(b.x, -y); c.scale(1 + q * 0.04, 1 - q * 0.12); c.translate(-b.x, y); drawBlock(c, b, i, y); c.restore();
        } else drawBlock(c, b, i, y);
      }
      for (const f of g.flashes) {
        const q = f.t / 0.45, grow = q * 22;
        c.lineWidth = 4 * (1 - q) + 1; c.strokeStyle = `rgba(255,255,255,${1 - q})`;
        rr(c, f.x - f.w / 2 - grow, -(f.y + CFG.bh) - grow, f.w + grow * 2, CFG.bh + grow * 2, 8 + grow / 2); c.stroke();
      }
      if (g.cur) {
        const cu = g.cur, y = g.tower.length * CFG.bh;
        c.fillStyle = "rgba(23,13,51,.14)"; rr(c, cu.x - cu.w / 2 + 4, -y - 2, cu.w, 8, 4); c.fill();
        drawBlock(c, cu, g.tower.length, y, true);
      }
      for (const d of g.debris) {
        c.save(); c.translate(d.x, -(d.y + CFG.bh / 2)); c.rotate(-d.rot); c.translate(-d.x, d.y + CFG.bh / 2);
        drawBlock(c, d, d.i, d.y); c.restore();
      }
      for (const p of g.parts) {
        const a = 1 - p.t / p.life; c.globalAlpha = a; c.fillStyle = p.col;
        if (p.star) { star(c, p.x, -p.y, p.r * (0.6 + a * 0.6), p.rot + p.t * 6); c.fill(); }
        else { c.beginPath(); c.arc(p.x, -p.y, p.r, 0, TAU); c.fill(); }
      }
      c.globalAlpha = 1;
      for (const p of g.pops) {
        const q = p.t / p.life, sc = q < 0.15 ? 0.6 + q / 0.15 * 0.5 : 1.1 - Math.min(0.1, (q - 0.15));
        c.globalAlpha = q > 0.7 ? 1 - (q - 0.7) / 0.3 : 1;
        text(c, p.txt, p.x, -(p.y + q * 40), p.size * sc / zoom, p.col);
      }
      c.globalAlpha = 1;
      // HUD
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (state !== "menu") {
        const big = clamp(cssH * 0.085, 40, 76);
        text(c, String(g.score), cssW / 2, 16 + big * 0.55, big, "#ffffff", "center", "middle");
        if (g.combo >= 2 && state === "play") text(c, `${T("hud.combo", "COMBO")} ×${g.combo}`, cssW / 2, 22 + big * 1.2, big * 0.34, "#ffd23f");
        if (g.score === 0 && state === "play") {
          const a = 0.6 + 0.4 * Math.sin(t * 6);
          c.globalAlpha = a; text(c, T("hud.tap", "TAP TO DROP!"), cssW / 2, cssH * 0.56, clamp(cssW * 0.06, 20, 34), "#ffffff"); c.globalAlpha = 1;
        }
      }
    }

    /* ---------- input ---------- */
    function onDown(e) {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      e.preventDefault(); sfx.ensure();
      if (state === "play") drop();
    }
    function onKey(e) {
      if (e.type !== "keydown") return;
      if (e.code === "Space" || e.code === "ArrowDown") {
        if (state === "play" || state === "dying") e.preventDefault();
        if (e.repeat) return;
        sfx.ensure(); if (state === "play") drop();
        return;
      }
      if (e.repeat) return;
      if (e.code === "KeyP" || e.code === "Escape") { if (state === "play") pause("key"); else if (state === "paused") resume(); }
      else if (e.code === "KeyM") toggleMute();
    }
    canvas.addEventListener("pointerdown", onDown, { passive: false });
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
      if (g && (state === "play" || state === "dying" || state === "over")) update(dt * timeScale);
      render();
    }

    /* ---------- public API ---------- */
    function start() {
      sfx.ensure(); newRun(); state = "play"; last = 0;
      emit("state", { state });
    }
    function pause(reason = "user") { if (state !== "play" && state !== "dying") return; pausedFrom = state; state = "paused"; emit("state", { state, reason }); }
    function resume() { if (state !== "paused") return; state = pausedFrom; last = 0; sfx.ensure(); emit("state", { state }); }
    function setMuted(m) { sfx.setMuted(m); store.set("muted", m ? "1" : "0"); emit("mute", { muted: !!m }); }
    function toggleMute() { setMuted(!sfx.muted); if (!sfx.muted) { sfx.ensure(); sfx.click(); } }
    function destroy() {
      if (state === "play" || state === "dying") pause("leave");
      cancelAnimationFrame(raf); raf = 0; sfx.close(); if (ro) ro.disconnect(); else global.removeEventListener("resize", resize);
      global.removeEventListener("keydown", onKey); document.removeEventListener("visibilitychange", onVis);
      canvas.removeEventListener("pointerdown", onDown);
    }

    resize();
    raf = requestAnimationFrame(frame);

    return {
      start, drop, pause, resume, setMuted, toggleMute, destroy,
      get state() { return state; }, get muted() { return sfx.muted; },
      best: () => ({ score: bestScore, combo: bestCombo }),
      // test/debug helpers (only do something when called)
      debug: {
        info: () => g && {
          state, score: g.score, combo: g.combo, maxCombo: g.maxCombo, perfects: g.perfects, blocks: g.tower.length,
          top: { x: g.tower[g.tower.length - 1].x, w: g.tower[g.tower.length - 1].w },
          cur: g.cur && { x: g.cur.x, w: g.cur.w, dir: g.cur.dir, speed: g.cur.speed, A: g.cur.A },
          camY: g.camY, zoom: g.zoom, tol: CFG.tol, view: { VW, VH, k, cssW, cssH }, debris: g.debris.length
        },
        timeScale: v => { timeScale = clamp(+v || 1, 0.02, 4); },
        cfg: CFG
      }
    };
  }

  global.HamsterStack = { create, version: "0.1.0-test" };
})(window);
