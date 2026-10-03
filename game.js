/* Hamster Rocket: canvas mini-game. No dependencies. */
(() => {
  "use strict";
  const CFG = window.HR_CONFIG || {};
  // ---------- helpers ----------
  const SIM = window.HRSim;
  const { W, PX_PER_M, MAX_TIME, START_FUEL, ZONES, zoneIndex, DT } = SIM;
  const WHEEL_R = 34;                // visual wheel radius
  const S = WHEEL_R / 262;           // sprite scale (svg units -> logical px)
  let H = 720;                       // logical height adapts to the screen (640..900); physics never depends on it
  let ROCKET_Y = H * 0.64;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = n => Math.floor(n).toLocaleString("en-US");
  const rngFrom = SIM.rngFrom;
  const C = () => (window.HRI18N && HRI18N.lang === "fr" ? "\u00a0: " : ": ");   // French puts a space before ":"
  const TT = (k, en) => (window.HRI18N ? HRI18N.t(k, en) : en);           // translated text (EN fallback)
  const REASON = r => r === "OUT OF SEEDS!" ? TT("game.outOfSeeds", r) : r === "MISSION TIME UP!" ? TT("game.timeUp", r) : r;
  const currentRound = () => SIM.roundFor(Date.now());
  const dayNumber = d => Math.floor((Date.parse(d + "T00:00:00Z") - Date.parse((CFG.DAY_ONE || "2026-10-03") + "T00:00:00Z")) / 864e5) + 1;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return `rgb(${A.map((v, i) => Math.round(lerp(v, B[i], t))).join(",")})`; };
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
  };
  function skyColors(m) {
    const i = zoneIndex(m), z = ZONES[i], n = ZONES[i + 1];
    if (!n) return [z.top, z.bot];
    const t = clamp((m - z.m) / (n.m - z.m), 0, 1);
    return [mix(z.top, n.top, t), mix(z.bot, n.bot, t)];
  }

  // ---------- sound (WebAudio, tiny synth) ----------
  const Sound = {
    ctx: null, muted: store.get("hr_muted", false),
    init() { if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (this.ctx && this.ctx.state === "suspended") this.ctx.resume(); },
    tone(f, d, type = "square", g = 0.04, slide = 0, delay = 0) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), v = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, f + slide), t + d);
      v.gain.setValueAtTime(g, t); v.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(v).connect(c.destination); o.start(t); o.stop(t + d + 0.02);
    },
    noise(d, g = 0.12) {
      if (this.muted || !this.ctx) return;
      const c = this.ctx, b = c.createBuffer(1, c.sampleRate * d, c.sampleRate), ch = b.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / ch.length);
      const s = c.createBufferSource(), v = c.createGain(); s.buffer = b; v.gain.value = g; s.connect(v).connect(c.destination); s.start();
    },
    tap(spin) { this.tone(240 + spin * 34, 0.05, "square", 0.025); },
    seed(gold) { this.tone(gold ? 880 : 660, 0.08, "sine", 0.08); this.tone(gold ? 1320 : 990, 0.12, "sine", 0.07, 0, 0.06); },
    hit() { this.noise(0.25, 0.15); this.tone(180, 0.3, "sawtooth", 0.06, -120); },
    ring() { this.tone(520, 0.25, "triangle", 0.07, 700); },
    zone() { [523, 659, 784].forEach((f, i) => this.tone(f, 0.18, "triangle", 0.06, 0, i * 0.08)); },
    over() { [392, 330, 262].forEach((f, i) => this.tone(f, 0.22, "triangle", 0.07, 0, i * 0.12)); }
  };

  // ---------- sprites ----------
  const sprites = { back: null, face: null, logo: null, v: {} };
  // Lucky Wheel looks: recolored copies of the SVG sprites (cosmetic only)
  const VARIANTS = {
    "back:red": ["assets/rocket_back.svg", [["#ff6b81", "#ff5a4f"], ["#e2294b", "#b5121b"]]],
    "back:blue": ["assets/rocket_back.svg", [["#ff6b81", "#7cc0ff"], ["#e2294b", "#1f5fd6"]]],
    "back:green": ["assets/rocket_back.svg", [["#ff6b81", "#8ff5b0"], ["#e2294b", "#17a84f"]]],
    "back:gold": ["assets/rocket_back.svg", [["#ff6b81", "#ffe066"], ["#e2294b", "#d99a00"]]],
    "back:purple": ["assets/rocket_back.svg", [["#ff6b81", "#d2b8ff"], ["#e2294b", "#7a4bd6"]]],
    "back:silver": ["assets/rocket_back.svg", [["#ff6b81", "#f4f7fb"], ["#e2294b", "#8c98ab"]]],
    "face:gold": ["assets/hamster_face.svg", [["#ffbb55", "#ffe680"], ["#ec8a22", "#f2b705"], ["#d9771a", "#c98f00"]]]
  };
  async function loadVariants() {
    const txt = {};
    for (const [k, [src, map]] of Object.entries(VARIANTS)) {
      try {
        if (!txt[src]) txt[src] = await (await fetch(src)).text();
        let t = txt[src]; for (const [a, b] of map) t = t.split(a).join(b);
        const img = await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(t));
        if (img) sprites.v[k] = img;
      } catch (e) { }
    }
    spriteCache.map = {};
  }
  function loadImg(src) { return new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }
  const spriteCache = { scale: 0, map: {} };
  function bakeSprites(pxScale) {
    if (Math.abs(spriteCache.scale - pxScale) < 0.01) return;
    spriteCache.scale = pxScale; spriteCache.map = {};
  }
  function sprite(name) {
    const m = spriteCache.map; if (m[name]) return m[name];
    const img = sprites.v[name] || sprites[name.split(":")[0]]; if (!img || !spriteCache.scale) return null;
    const sz = Math.ceil(1024 * S * spriteCache.scale), c = document.createElement("canvas"); c.width = c.height = sz;
    c.getContext("2d").drawImage(img, 0, 0, sz, sz); return (m[name] = c);
  }

  // ---------- game ----------
  const G = {
    canvas: null, ctx: null, scale: 1, dpr: 1, el: {},
    state: "ready", mode: "daily", seedStr: "", sim: null, acc: 0,
    reset() {
      this.round = currentRound();
      this.seedStr = this.mode === "daily" ? SIM.seedForRound(this.round) : "free-" + Math.random().toString(36).slice(2);
      const W8 = window.HRWheel;
      this.cos = W8 ? W8.cosmetics() : {};
      this.bonus = W8 ? W8.pending() : null;      // Lucky Wheel bonus waiting for this run (applied on launch)
      this.bonusRun = null;
      this.sim = SIM.create(this.seedStr, this.bonus ? this.bonus.opts : null);
      this.course = this.sim.course;
      this.inputs = []; this.acc = 0;
      Object.assign(this, {
        wheelA: 0, run: 0, shakeT: 0, shakeM: 0, flash: 0, flashColor: "255,80,80", banner: null,
        particles: [], texts: [], tilt: 0, lastTapMs: 0
      });
      this.state = "ready";
    },
    // proxies to the simulation (renderer + HUD read these)
    get alt() { return this.sim.alt; }, get maxAlt() { return this.sim.maxAlt; }, get vy() { return this.sim.vy; },
    get x() { return this.sim.x; }, get vx() { return this.sim.vx; }, get spin() { return this.sim.spin; },
    get fuel() { return this.sim.fuel; }, get time() { return this.sim.time; }, get seeds() { return this.sim.seeds; },
    get hits() { return this.sim.hits; }, get combo() { return this.sim.combo; }, get maxCombo() { return this.sim.maxCombo; },
    get invuln() { return this.sim.invuln; }, get boostT() { return this.sim.boostT; }, get endReason() { return this.sim.endReason; },
    start() {
      if (this.bonus) { this.bonusRun = this.bonus; if (window.HRWheel) HRWheel.consume(); }
      this.state = "play"; this.el.overlay.classList.add("hidden"); this.el.over.classList.add("hidden");
      document.body.classList.add("hr-playing");
    },
    tap(dir, mag = 1) {
      Sound.init();
      if (this.state === "over" || this.state === "falling") return;
      if (this.state === "ready") this.start();
      const mag10 = Math.round(clamp(mag, 0.3, 1.2) * 10);
      const tick = this.sim.tick;
      const res = this.sim.tap(dir, mag10);
      if (this.inputs.length < 5000) this.inputs.push([tick, dir, mag10]);
      if (!res) return;                                    // too fast (max 20 taps/s)
      this.lastTapMs = performance.now();
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * 6.28;
        this.particles.push({ x: this.x + Math.cos(a) * WHEEL_R, y: this.alt + Math.sin(a) * WHEEL_R, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120 + this.vy, life: 0.35, max: 0.35, c: i % 2 ? "#c9f6ff" : "#ffd23f", s: 3 });
      }
      if ([25, 50, 100, 150, 200, 300, 400, 500].includes(res.combo)) this.addText(`${res.combo} ${TT("fx.combo", "COMBO!")}`, this.x, this.alt + 70, "#ffd23f", 26);
      Sound.tap(this.spin);
    },
    addText(t, x, y, c, size = 22) { this.texts.push({ t, x, y, c, size, life: 1.1, max: 1.1 }); },
    shake(m, t) { this.shakeM = Math.max(this.shakeM, m); this.shakeT = Math.max(this.shakeT, t); },

    update(dt) {
      if (this.state === "ready") { this.wheelA += dt * 1.5; this.run += dt * 3; this.updateFx(dt); return; }
      if (this.state !== "over") {
        this.acc += dt;
        let n = 0;
        while (this.acc >= DT && n < 6 && this.sim.state !== "over") {
          this.acc -= DT; n++;
          for (const e of this.sim.step()) this.onSimEvent(e);
        }
        if (n === 6) this.acc = 0;                           // tab was hidden / slow device: don't spiral
        if (this.sim.state === "falling") this.state = "falling";
      }
      this.tilt = lerp(this.tilt, clamp(this.vx / 380, -0.42, 0.42), 1 - Math.exp(-10 * dt));
      this.wheelA += this.spin * dt * 2.4;
      this.run += (2 + this.spin) * dt * 2.2;
      const pow = clamp(this.vy / 700, 0, 1.4);
      if (this.state === "play" && Math.random() < 0.5 + pow) {
        const a = Math.PI / 2 + this.tilt + (Math.random() - 0.5) * 0.5, nx = this.x - Math.sin(this.tilt) * 44, ny = this.alt - Math.cos(this.tilt) * 44;
        this.particles.push({ x: nx, y: ny, vx: Math.cos(a) * 60 * (Math.random() - 0.5) * 2 - Math.sin(this.tilt) * 120, vy: this.vy - 160 - 200 * pow, life: 0.5, max: 0.5, c: Math.random() < 0.5 ? "#ffb02e" : "#ff6a3d", s: 4 + Math.random() * 4, smoke: true });
      }
      this.updateFx(dt);
    },
    onSimEvent(e) {
      if (e.type === "seed") {
        this.addText(`+${e.add}s`, e.x, e.y + 20, e.gold ? "#ffd23f" : "#ffffff", e.gold ? 28 : 22);
        this.burst(e.x, e.y, e.gold ? "#ffd23f" : "#fff1dc", 14, 180); Sound.seed(e.gold);
      } else if (e.type === "ring") {
        this.addText(TT("fx.boost", "BOOST!"), e.x, e.y + 40, "#7fe7ff", 30); this.burst(e.x, e.y, "#7fe7ff", 20, 260);
        this.flash = 0.35; this.flashColor = "127,231,255"; Sound.ring();
      } else if (e.type === "hit") {
        this.shake(10, 0.35); this.flash = 0.5; this.flashColor = "255,80,80";
        this.burst(this.x, this.alt, "#ff6b81", 18, 260); this.burst(e.x, e.y, "#ffffff", 10, 200);
        this.addText(`-3s  ${TT("fx.ouch", "OUCH!")}`, this.x, this.alt + 60, "#ff6b81", 24);
        if (navigator.vibrate) try { navigator.vibrate(60); } catch (err) { }
        Sound.hit();
      } else if (e.type === "block") {
        this.shake(4, 0.2); this.flash = 0.35; this.flashColor = "255,214,64";
        this.burst(this.x, this.alt, "#ffd23f", 22, 280);
        this.addText(TT("fx.shield", "SHIELD!"), this.x, this.alt + 60, "#ffd23f", 26); Sound.ring();
      } else if (e.type === "zone") {
        this.banner = { t: TT("zone." + e.name, e.name), life: 2.2 }; Sound.zone();
      } else if (e.type === "end") {
        this.banner = { t: REASON(e.reason), life: 1.4 }; this.shake(6, 0.3);
      } else if (e.type === "finish") this.finish();
    },
    burst(x, y, c, n, sp) { for (let i = 0; i < n; i++) { const a = Math.random() * 6.28, v = sp * (0.4 + Math.random() * 0.8); this.particles.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + this.vy * 0.6, life: 0.6, max: 0.6, c, s: 3 + Math.random() * 3 }); } },
    updateFx(dt) {
      for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.smoke) p.s += dt * 10; }
      this.particles = this.particles.filter(p => p.life > 0);
      if (this.particles.length > 400) this.particles.splice(0, this.particles.length - 400);
      for (const t of this.texts) { t.life -= dt; t.y += 60 * dt + this.vy * dt * 0.85; }
      this.texts = this.texts.filter(t => t.life > 0);
      this.shakeT = Math.max(0, this.shakeT - dt); if (!this.shakeT) this.shakeM = 0;
      this.flash = Math.max(0, this.flash - dt * 2);
      if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }
    },
    finish() {
      this.state = "over";
      document.body.classList.remove("hr-playing");
      Sound.over();
      const score = this.sim.score();
      this.score = score;
      const kDay = "hr_best_" + this.round;
      const prevDay = store.get(kDay, 0), prevAll = store.get("hr_best_all", 0);
      const bonus = !!this.bonusRun;              // bonus runs don't count for the normal bests
      this.newDay = !bonus && this.mode === "daily" && score > prevDay;
      this.newAll = !bonus && score > prevAll;
      this.newBonus = bonus && score > store.get("hr_best_bonus", 0);
      if (this.newDay) store.set(kDay, score);
      if (this.newAll) store.set("hr_best_all", score);
      if (this.newBonus) store.set("hr_best_bonus", score);
      store.set("hr_runs", store.get("hr_runs", 0) + 1);
      showGameOver();
    },

    // ---------- render ----------
    render() {
      const c = this.ctx, m = this.alt / PX_PER_M;
      c.setTransform(this.scale * this.dpr, 0, 0, this.scale * this.dpr, 0, 0);
      const [top, bot] = skyColors(m);
      const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, top); g.addColorStop(1, bot);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.save();
      if (this.shakeT > 0) c.translate((Math.random() - 0.5) * this.shakeM * 2, (Math.random() - 0.5) * this.shakeM * 2);
      const sy = wy => ROCKET_Y - (wy - this.alt);   // world y -> screen y
      this.drawStars(c, m);
      this.drawDeco(c, sy, m);
      if (this.alt < H) this.drawGround(c, sy);
      // speed lines
      const sp = this.vy;
      if (sp > 450) {
        c.strokeStyle = `rgba(255,255,255,${clamp((sp - 450) / 900, 0, 0.35)})`; c.lineWidth = 2;
        for (let i = 0; i < 14; i++) { const x = (i * 97 + 13) % W, yy = ((this.alt * 1.3 + i * 173) % (H + 200)) - 100; c.beginPath(); c.moveTo(x, yy); c.lineTo(x, yy + 40 + sp * 0.05); c.stroke(); }
      }
      // objects
      for (const o of this.course.objs) {
        const y = sy(o.y);
        if (y < -80 || y > H + 80) continue;
        if (o.type === "seed") { if (!o.got) this.drawSeed(c, o.x, y, o); }
        else if (o.type === "ring") this.drawRing(c, o, y, false);
        else this.drawObstacle(c, o, y);
      }
      // particles (behind rocket)
      for (const p of this.particles) { c.globalAlpha = clamp(p.life / p.max, 0, 1); c.fillStyle = p.c; c.beginPath(); c.arc(p.x, sy(p.y), p.s, 0, 6.28); c.fill(); }
      c.globalAlpha = 1;
      this.drawRocket(c, this.x, ROCKET_Y);
      for (const o of this.course.objs) { if (o.type === "ring") { const y = sy(o.y); if (y > -80 && y < H + 80) this.drawRing(c, o, y, true); } }
      // floating texts
      c.textAlign = "center"; c.textBaseline = "middle";
      for (const t of this.texts) {
        const a = clamp(t.life / t.max * 1.5, 0, 1), sc = 1 + (1 - t.life / t.max) * 0.25;
        c.globalAlpha = a; c.font = `${Math.round(t.size * sc)}px "Luckiest Guy", system-ui, sans-serif`;
        c.lineWidth = 5; c.strokeStyle = "#170d33"; c.strokeText(t.t, t.x, sy(t.y)); c.fillStyle = t.c; c.fillText(t.t, t.x, sy(t.y));
      }
      c.globalAlpha = 1;
      c.restore();
      if (this.flash > 0) { c.fillStyle = `rgba(${this.flashColor},${this.flash * 0.45})`; c.fillRect(0, 0, W, H); }
      this.drawHud(c, m);
    },
    drawStars(c, m) {
      const a = clamp((m - 1100) / 1300, 0, 1); if (a <= 0) return;
      c.fillStyle = "#fff";
      for (let i = 0; i < 70; i++) {
        const x = (i * 137.5) % W, base = (i * 89.3) % H, y = (base + this.alt * 0.08 * (1 + (i % 3))) % H;
        c.globalAlpha = a * (0.4 + (i % 5) * 0.12); c.fillRect(x, y, i % 7 === 0 ? 3 : 2, i % 7 === 0 ? 3 : 2);
      }
      c.globalAlpha = 1;
      if (m > 3000) {   // the moon slowly rises into view
        const t = clamp((m - 3000) / 2500, 0, 1), y = lerp(-140, 150, t);
        c.fillStyle = "#f3f0d8"; c.beginPath(); c.arc(W * 0.78, y, 70, 0, 6.28); c.fill();
        c.fillStyle = "#d9d4b0"; [[-20, -15, 14], [25, 10, 10], [-5, 30, 8], [30, -30, 6]].forEach(([dx, dy, r]) => { c.beginPath(); c.arc(W * 0.78 + dx, y + dy, r, 0, 6.28); c.fill(); });
      }
    },
    drawDeco(c, sy, m) {
      const cloudA = 1 - clamp((m - 1500) / 600, 0, 1);
      if (cloudA <= 0) return;
      for (const d of this.course.deco) {
        const y = ROCKET_Y - (d.y - this.alt * 0.55) * 1; if (y < -80 || y > H + 80) continue;
        c.globalAlpha = cloudA * (0.55 + d.k * 0.35); c.fillStyle = "#ffffff";
        const s = d.s * 26; c.beginPath();
        c.arc(d.x, y, s, 0, 6.28); c.arc(d.x + s * 1.1, y + s * 0.2, s * 0.8, 0, 6.28); c.arc(d.x - s * 1.1, y + s * 0.25, s * 0.7, 0, 6.28); c.arc(d.x + s * 0.3, y - s * 0.55, s * 0.75, 0, 6.28);
        c.fill();
      }
      c.globalAlpha = 1;
    },
    drawGround(c, sy) {
      const gy = sy(-46);
      c.fillStyle = "#5fd36b"; c.beginPath(); c.moveTo(0, gy + 20); c.quadraticCurveTo(W * 0.25, gy - 18, W * 0.5, gy + 4); c.quadraticCurveTo(W * 0.78, gy + 24, W, gy - 6); c.lineTo(W, H + 400); c.lineTo(0, H + 400); c.fill();
      c.fillStyle = "#3fb35a"; c.fillRect(0, gy + 30, W, H + 400);
      // launch pad
      c.fillStyle = "#9aa6c8"; c.strokeStyle = "#170d33"; c.lineWidth = 4;
      c.beginPath(); c.roundRect ? c.roundRect(W / 2 - 60, gy - 4, 120, 16, 6) : c.rect(W / 2 - 60, gy - 4, 120, 16); c.fill(); c.stroke();
      c.fillStyle = "#ffd23f"; for (let i = 0; i < 5; i++) c.fillRect(W / 2 - 52 + i * 24, gy, 12, 6);
      // a few sunflowers
      [[50, 1], [W - 60, 0.8], [110, 0.7], [W - 120, 0.9]].forEach(([x, s]) => {
        c.strokeStyle = "#2f8f3f"; c.lineWidth = 4; c.beginPath(); c.moveTo(x, gy + 40); c.lineTo(x, gy - 10 * s); c.stroke();
        c.fillStyle = "#ffd23f"; for (let k = 0; k < 8; k++) { const a = k * 0.785; c.beginPath(); c.ellipse(x + Math.cos(a) * 10 * s, gy - 22 * s + Math.sin(a) * 10 * s, 7 * s, 4 * s, a, 0, 6.28); c.fill(); }
        c.fillStyle = "#6b3e1f"; c.beginPath(); c.arc(x, gy - 22 * s, 7 * s, 0, 6.28); c.fill();
      });
    },
    drawSeed(c, x, y, o) {
      const bob = Math.sin(this.time * 4 + o.rot) * 3;
      c.save(); c.translate(x, y + bob); c.rotate(o.rot + Math.sin(this.time * 2 + o.rot) * 0.3);
      if (o.gold) { c.fillStyle = "rgba(255,210,63,.35)"; c.beginPath(); c.arc(0, 0, 24, 0, 6.28); c.fill(); }
      c.fillStyle = o.gold ? "#ffd23f" : "#3a3550"; c.strokeStyle = "#170d33"; c.lineWidth = 3;
      c.beginPath(); c.moveTo(0, -15); c.bezierCurveTo(11, -8, 10, 10, 0, 15); c.bezierCurveTo(-10, 10, -11, -8, 0, -15); c.fill(); c.stroke();
      c.strokeStyle = o.gold ? "#fff6b0" : "#e8e4f5"; c.lineWidth = 2.2;
      c.beginPath(); c.moveTo(0, -11); c.lineTo(0, 11); c.moveTo(-4.5, -7); c.quadraticCurveTo(-6, 0, -4, 8); c.moveTo(4.5, -7); c.quadraticCurveTo(6, 0, 4, 8); c.stroke();
      c.restore();
    },
    drawRing(c, o, y, front) {
      c.save(); c.translate(o.x, y);
      const pulse = 1 + Math.sin(this.time * 6) * 0.04;
      c.scale(pulse, pulse);
      c.lineWidth = 9; c.strokeStyle = "#170d33";
      c.beginPath(); c.ellipse(0, 0, o.rx, o.ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke();
      c.lineWidth = 5; c.strokeStyle = o.used ? "rgba(127,231,255,.4)" : "#7fe7ff";
      c.beginPath(); c.ellipse(0, 0, o.rx, o.ry, 0, front ? 0 : Math.PI, front ? Math.PI : Math.PI * 2); c.stroke();
      if (!front && !o.used) { c.font = '13px "Luckiest Guy", sans-serif'; c.textAlign = "center"; c.fillStyle = "#fff"; c.fillText(TT("fx.ring", "BOOST"), 0, -o.ry - 8); }
      c.restore();
    },
    drawObstacle(c, o, y) {
      const t = this.time;
      c.save(); c.translate(o.x, y); c.lineJoin = "round"; c.lineWidth = 3.5; c.strokeStyle = "#170d33";
      if (o.type === "bird") {
        const dir = Math.cos(t * o.sp + o.ph) >= 0 ? 1 : -1; c.scale(dir, 1);
        const flap = Math.sin(t * 14 + o.ph) * 9;
        c.fillStyle = "#8a93b8"; c.beginPath(); c.ellipse(0, 0, 20, 14, 0, 0, 6.28); c.fill(); c.stroke();
        c.fillStyle = "#6d76a0"; c.beginPath(); c.moveTo(-4, -2); c.lineTo(-18, -12 - flap); c.lineTo(6, -6); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = "#ff9f1c"; c.beginPath(); c.moveTo(18, -2); c.lineTo(28, 2); c.lineTo(18, 6); c.closePath(); c.fill(); c.stroke();
        c.fillStyle = "#fff"; c.beginPath(); c.arc(10, -4, 4.5, 0, 6.28); c.fill(); c.fillStyle = "#170d33"; c.beginPath(); c.arc(11, -4, 2.2, 0, 6.28); c.fill();
        c.beginPath(); c.moveTo(5, -10); c.lineTo(15, -7); c.stroke();   // grumpy brow
      } else if (o.type === "storm") {
        c.fillStyle = "#5b5f7a"; c.beginPath(); c.arc(-18, 4, 18, 0, 6.28); c.arc(4, -6, 22, 0, 6.28); c.arc(24, 5, 16, 0, 6.28); c.fill();
        c.beginPath(); c.arc(-18, 4, 18, Math.PI * 0.6, Math.PI * 1.6); c.stroke();
        c.fillStyle = "#4a4e68"; c.fillRect(-34, 6, 66, 14);
        if (Math.sin(t * 7 + o.ph) > 0.2) { c.fillStyle = "#ffd23f"; c.beginPath(); c.moveTo(0, 14); c.lineTo(-8, 30); c.lineTo(0, 28); c.lineTo(-5, 42); c.lineTo(10, 24); c.lineTo(2, 25); c.lineTo(8, 14); c.closePath(); c.fill(); c.stroke(); }
        c.fillStyle = "#fff"; c.beginPath(); c.arc(-6, 0, 3.5, 0, 6.28); c.arc(10, 0, 3.5, 0, 6.28); c.fill();
      } else if (o.type === "drone") {
        c.strokeStyle = "#170d33"; c.lineWidth = 3;
        c.beginPath(); c.moveTo(-22, -4); c.lineTo(22, -4); c.stroke();
        const pr = Math.abs(Math.sin(t * 40)) * 12 + 4;
        c.lineWidth = 3; c.strokeStyle = "#dfe6ff"; c.beginPath(); c.moveTo(-22 - pr, -10); c.lineTo(-22 + pr, -10); c.moveTo(22 - pr, -10); c.lineTo(22 + pr, -10); c.stroke();
        c.strokeStyle = "#170d33"; c.fillStyle = "#3d4466"; c.beginPath(); c.roundRect ? c.roundRect(-14, -8, 28, 16, 6) : c.rect(-14, -8, 28, 16); c.fill(); c.stroke();
        c.fillStyle = Math.sin(t * 10) > 0 ? "#ff3d5a" : "#7a1020"; c.beginPath(); c.arc(0, 0, 4, 0, 6.28); c.fill();
      } else if (o.type === "sat") {
        c.rotate(Math.sin(t * 0.8 + o.ph) * 0.25);
        c.fillStyle = "#3b6fe0"; c.fillRect(-40, -9, 24, 18); c.strokeRect(-40, -9, 24, 18); c.fillRect(16, -9, 24, 18); c.strokeRect(16, -9, 24, 18);
        c.strokeStyle = "#9ecbff"; c.lineWidth = 1.5; c.beginPath(); c.moveTo(-28, -9); c.lineTo(-28, 9); c.moveTo(28, -9); c.lineTo(28, 9); c.stroke();
        c.strokeStyle = "#170d33"; c.lineWidth = 3.5; c.fillStyle = "#ffcf5a"; c.fillRect(-14, -13, 28, 26); c.strokeRect(-14, -13, 28, 26);
        c.beginPath(); c.moveTo(0, -13); c.lineTo(0, -22); c.stroke(); c.fillStyle = "#ff6b81"; c.beginPath(); c.arc(0, -24, 4, 0, 6.28); c.fill(); c.stroke();
      } else if (o.type === "rock") {
        c.rotate(t * 0.6 * o.sp + o.ph);
        c.fillStyle = "#8c7b6b"; c.beginPath();
        o.pts.forEach((k, i) => { const a = i / o.pts.length * 6.283, r = o.a * k; i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r); });
        c.closePath(); c.fill(); c.stroke();
        c.fillStyle = "#6e5f52"; c.beginPath(); c.arc(-o.a * 0.3, -o.a * 0.2, o.a * 0.22, 0, 6.28); c.arc(o.a * 0.35, o.a * 0.25, o.a * 0.15, 0, 6.28); c.fill();
      }
      c.restore();
    },
    drawRocket(c, x, y) {
      const shieldOn = this.sim.absorb > 0;   // gold rocket: shield ready to absorb one hit
      const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
      const cs = this.cos || {}, rk = (this.bonusRun || this.bonus || {}).rocket;
      c.save(); c.translate(x, y); c.rotate(this.tilt);
      if (blink) c.globalAlpha = 0.45;
      // flame
      const pow = this.state === "play" ? clamp(this.vy / 700, 0.15, 1.5) : (this.state === "ready" ? 0.12 : 0);
      if (pow > 0) {
        const L = 16 + pow * 46 + Math.random() * 8 + (this.boostT > 0 ? 22 : 0), w = 13 + pow * 4;
        const fy = 41;
        const g = c.createLinearGradient(0, fy, 0, fy + L); g.addColorStop(0, "#fff6b0"); g.addColorStop(0.35, "#ffb02e"); g.addColorStop(1, "rgba(255,61,90,0)");
        c.fillStyle = g; c.beginPath(); c.moveTo(-w, fy); c.quadraticCurveTo(-w * 0.9, fy + L * 0.6, 0, fy + L); c.quadraticCurveTo(w * 0.9, fy + L * 0.6, w, fy); c.closePath(); c.fill();
        c.fillStyle = "rgba(255,255,255,.8)"; c.beginPath(); c.moveTo(-w * 0.45, fy); c.quadraticCurveTo(0, fy + L * 0.5, w * 0.45, fy); c.fill();
      }
      const k = 1024 * S;
      const sb = sprite(rk ? "back:" + rk : "back");
      if (sb) c.drawImage(sb, -512 * S, -480 * S, k, k);
      // spokes (rotate with wheel)
      c.save(); c.rotate(this.wheelA); c.strokeStyle = "#5b63d6"; c.lineWidth = 1.6;
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(a) * 32, Math.sin(a) * 32); c.stroke(); }
      c.restore();
      // hamster (bobs while running)
      const bob = Math.sin(this.run) * 1.6, sq = 1 + Math.sin(this.run * 2) * 0.03;
      const sf = sprite(cs.skin ? "face:" + cs.skin : "face");
      if (sf) { c.save(); c.translate(0, -10 * S + bob); c.scale(0.94 * (2 - sq), 0.94 * sq); c.drawImage(sf, -512 * S, -520 * S, k, k); c.restore(); }
      // rim
      c.lineWidth = 64 * S; c.strokeStyle = "#170d33"; c.beginPath(); c.arc(0, 0, 262 * S, 0, 6.28); c.stroke();
      c.lineWidth = 40 * S; c.strokeStyle = this.boostT > 0 ? "#ffd23f" : (cs.skin === "gold" ? "#ffcf33" : "#38d9ff"); c.beginPath(); c.arc(0, 0, 262 * S, 0, 6.28); c.stroke();
      if (shieldOn) {   // Lucky Wheel gold shield bubble
        const pulse = 0.55 + 0.25 * Math.sin(performance.now() / 120);
        c.fillStyle = `rgba(255,214,64,${0.16 * pulse + 0.06})`; c.strokeStyle = `rgba(255,214,64,${pulse})`; c.lineWidth = 4;
        c.beginPath(); c.arc(0, 2, 52, 0, 6.28); c.fill(); c.stroke();
      }
      c.strokeStyle = "#e6fbff"; c.lineWidth = 1.6;
      for (let i = 0; i < 18; i++) { const a = this.wheelA * 1.0 + i * 6.283 / 18, r1 = 262 * S - 2.4, r2 = 262 * S + 2.4; c.beginPath(); c.moveTo(Math.cos(a) * r1, Math.sin(a) * r1); c.lineTo(Math.cos(a) * r2, Math.sin(a) * r2); c.stroke(); }
      c.restore();
    },
    drawHud(c, m) {
      c.textAlign = "center"; c.textBaseline = "alphabetic";
      // altitude
      c.font = '40px "Luckiest Guy", system-ui, sans-serif';
      c.lineWidth = 7; c.strokeStyle = "#170d33"; c.fillStyle = "#fff";
      const altTxt = fmt(this.state === "ready" ? 0 : this.maxAlt / PX_PER_M) + " m";
      c.strokeText(altTxt, W / 2, 56); c.fillText(altTxt, W / 2, 56);
      c.font = '15px "Luckiest Guy", system-ui, sans-serif'; c.lineWidth = 4;
      const best = this.mode === "daily" ? store.get("hr_best_" + this.round, 0) : store.get("hr_best_all", 0);
      const bn = this.bonusRun || this.bonus;
      const bnName = bn ? (window.HRWheel ? HRWheel.name(bn.id) : bn.name) : "";
      const sub = bn ? `${TT("hud.bonus", "BONUS RUN")} · ${bnName.toUpperCase()}` : (this.mode === "daily" ? `${TT("hud.daily", "DAILY")} #${dayNumber(this.round)} · ${TT("hud.best", "BEST")} ${fmt(best)} m` : `${TT("hud.free", "FREE FLIGHT")} · ${TT("hud.best", "BEST")} ${fmt(best)} m`);
      c.strokeText(sub, W / 2, 80, W - 110); c.fillStyle = bn ? "#ff9fc0" : "#ffe9a8"; c.fillText(sub, W / 2, 80, W - 110);
      // fuel bar
      const fx = 16, fy = 104, fw = W - 32, fh = 16, f = clamp(this.fuel / (START_FUEL + 6), 0, 1);
      c.fillStyle = "rgba(23,13,51,.55)"; rr(c, fx, fy, fw, fh, 8); c.fill();
      c.fillStyle = f < 0.25 ? (Math.sin(performance.now() / 90) > 0 ? "#ff3d5a" : "#ff8a1f") : "#ffd23f"; rr(c, fx + 3, fy + 3, Math.max(0, (fw - 6) * f), fh - 6, 5); c.fill();
      c.textAlign = "left"; c.font = '13px "Luckiest Guy", system-ui, sans-serif'; c.fillStyle = "#fff"; c.lineWidth = 3;
      const ft = `${TT("hud.fuel", "SEED FUEL")} ${Math.max(0, this.fuel).toFixed(1)}s`; c.strokeText(ft, fx + 6, fy + 31); c.fillText(ft, fx + 6, fy + 31);
      c.textAlign = "right"; const tt = `🌻 ${this.seeds}   ⏱ ${Math.max(0, MAX_TIME - this.time).toFixed(0)}s`;
      c.strokeText(tt, W - fx - 4, fy + 31); c.fillText(tt, W - fx - 4, fy + 31);
      // spin meter (bottom)
      const sx = 16, sy = H - 30, sw = W - 32, s = clamp(this.spin / 12, 0, 1);
      c.fillStyle = "rgba(23,13,51,.55)"; rr(c, sx, sy, sw, 14, 7); c.fill();
      const sg = c.createLinearGradient(sx, 0, sx + sw, 0); sg.addColorStop(0, "#38d9ff"); sg.addColorStop(0.6, "#ffd23f"); sg.addColorStop(1, "#ff3d5a");
      c.fillStyle = sg; rr(c, sx + 2, sy + 2, Math.max(0, (sw - 4) * s), 10, 5); c.fill();
      c.textAlign = "left"; c.fillStyle = "#fff"; c.font = '13px "Luckiest Guy", system-ui, sans-serif';
      const ws = TT("hud.spin", "WHEEL SPIN"); c.strokeText(ws, sx + 4, sy - 6); c.fillText(ws, sx + 4, sy - 6);
      if (this.combo >= 5 && performance.now() - this.lastTapMs < 350) {
        c.textAlign = "right"; c.font = '18px "Luckiest Guy", system-ui, sans-serif'; c.fillStyle = "#ffd23f";
        const ct = `x${this.combo} ${TT("hud.combo", "COMBO")}`; c.strokeText(ct, sx + sw - 2, sy - 6); c.fillText(ct, sx + sw - 2, sy - 6);
      }
      // zone banner
      if (this.banner) {
        const b = this.banner, a = clamp(Math.min(b.life, 2.2 - b.life + 0.3) * 3, 0, 1);
        c.globalAlpha = a; c.textAlign = "center"; c.font = '34px "Luckiest Guy", system-ui, sans-serif'; c.lineWidth = 7; c.strokeStyle = "#170d33"; c.fillStyle = "#ffd23f";
        c.strokeText(b.t, W / 2, H * 0.36, W - 24); c.fillText(b.t, W / 2, H * 0.36, W - 24); c.globalAlpha = 1;
      }
    }
  };
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }

  // ---------- layout ----------
  function resize() {
    const wrap = G.el.wrap, box = G.el.stage;
    const availW = wrap.clientWidth, availH = Math.max(420, wrap.clientHeight);
    H = Math.round(clamp(availH / availW * W, 640, 900)); ROCKET_Y = H * 0.64;
    const sc = Math.min(availW / W, availH / H);
    G.scale = sc; G.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const cw = Math.round(W * sc), ch = Math.round(H * sc);
    box.style.width = cw + "px"; box.style.height = ch + "px";
    G.canvas.width = Math.round(cw * G.dpr); G.canvas.height = Math.round(ch * G.dpr);
    bakeSprites(sc * G.dpr);
  }

  // ---------- input ----------
  function bindInput() {
    const cv = G.canvas;
    const onPointer = e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width * W;
      const dx = px - G.x;
      const dir = Math.abs(dx) < 26 ? 0 : Math.sign(dx);
      G.tap(dir, clamp(Math.abs(dx) / 110, 0.3, 1.2));
    };
    cv.addEventListener("pointerdown", onPointer, { passive: false });
    ["touchstart", "touchend", "dblclick", "contextmenu"].forEach(ev => cv.addEventListener(ev, e => e.preventDefault(), { passive: false }));
    G.el.overlay.addEventListener("pointerdown", e => { if (e.target.closest("button,a")) return; e.preventDefault(); onPointer(e); }, { passive: false });
    window.addEventListener("keydown", e => {
      if (e.repeat) { if (["Space", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(e.code) && G.inView) e.preventDefault(); return; }
      const t = e.target; if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      const map = { Space: 0, ArrowUp: 0, KeyW: 0, ArrowLeft: -1, KeyA: -1, ArrowRight: 1, KeyD: 1 };
      if (!(e.code in map)) { if (e.code === "Enter" && G.state === "over" && G.inView) { e.preventDefault(); restart(G.mode); } return; }
      if (!G.inView && G.state !== "play") return;   // don't hijack page scrolling elsewhere
      if (t && t.tagName === "BUTTON" && e.code === "Space" && G.state === "over") return;
      e.preventDefault();
      if (G.state === "over") return;
      G.tap(map[e.code], 1);
    });
  }

  // ---------- overlays ----------
  function showGameOver() {
    const el = G.el;
    el.goScore.textContent = fmt(G.score) + " m";
    const T = window.HRI18N ? HRI18N.t : (k, f) => f;
    const reasons = { "OUT OF SEEDS!": T("game.outOfSeeds", "OUT OF SEEDS!"), "MISSION TIME UP!": T("game.timeUp", "MISSION TIME UP!") };
    el.goReason.textContent = reasons[G.endReason] || G.endReason;
    el.goStats.textContent = `🌻 ${G.seeds} ${T("game.seeds", "seeds")} · 💥 ${G.hits} ${T("game.bumps", "bumps")} · 🔥 ${T("game.combo", "best combo")} x${G.maxCombo}`;
    const best = G.mode === "daily" ? store.get("hr_best_" + G.round, 0) : store.get("hr_best_all", 0);
    el.goBest.textContent = G.mode === "daily" ? `${T("game.todayBest", "Today's best")}${C()}${fmt(best)} m · ${T("game.allTime", "All-time")}${C()}${fmt(store.get("hr_best_all", 0))} m` : `${T("game.allTime", "All-time")}${C()}${fmt(best)} m`;
    el.goBadge.classList.toggle("hidden", !(G.newDay || G.newAll || G.newBonus));
    el.goBadge.textContent = G.newBonus ? T("game.newBonus", "NEW BONUS BEST!") : G.newAll ? T("game.newAll", "NEW ALL-TIME BEST!") : T("game.newDay", "NEW DAILY BEST!");
    const bn = G.bonusRun;
    el.goBonus.classList.toggle("hidden", !bn);
    el.goBonus.textContent = bn ? `🎁 ${T("game.bonusRun", "Bonus run")}${C()}${bn.emoji} ${window.HRWheel ? HRWheel.name(bn.id) : bn.name}. ${T("game.notCounted", "Not counted in your normal best.")} ${T("game.bonusBest", "Bonus best")}${C()}${fmt(store.get("hr_best_bonus", 0))} m` : "";
    el.goTitle.textContent = G.mode === "daily" ? `${T("game.daily", "Daily Challenge")} #${dayNumber(G.round)}` : T("game.freeTitle", "Free Flight");
    el.over.classList.remove("hidden");
    setTimeout(() => el.again && el.again.focus({ preventScroll: true }), 50);
    updateStartCard();
  }
  function updateStartCard() {
    const d = currentRound();
    const T = window.HRI18N ? HRI18N.t : (k, f) => f;
    const endLocal = new Date(SIM.roundEnd(d)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    G.el.startDay.textContent = `${T("game.daily", "Daily Challenge")} #${dayNumber(d)}`;
    const b = store.get("hr_best_" + d, 0);
    const W8 = window.HRWheel, bn = G.state === "ready" ? G.bonus : null, cs = G.cos || {};
    const bits = [];
    if (bn) bits.push(`🎁 ${T("game.bonusFor", "Bonus for this run")}${C()}${bn.emoji} ${W8 ? W8.name(bn.id) : bn.name}${C()}${W8 ? W8.effect(bn.id) : bn.effect} (${T("game.notCountedShort", "not counted in your normal best")})`);
    if (cs.id) bits.push(`${cs.emoji} ${W8 ? W8.name(cs.id) : cs.name} · ${T("game.looksOnly", "looks only")}`);
    G.el.startBonus.textContent = bits.join(" · "); G.el.startBonus.hidden = !bits.length;
    G.el.startWheel.textContent = `🎡 ${T("game.wheelReady", "Your free daily Lucky Wheel spin is ready")} →`;
    G.el.startWheel.hidden = !(W8 && W8.canSpin());
    G.el.startBest.textContent = b ? `${T("game.bestToday", "Your best this round")}${C()}${fmt(b)} m` : `${T("game.sameCourse", "Same course for everyone. New course at")} ${endLocal} (${T("game.yourTime", "your time")}).`;
  }
  function restart(mode) {
    G.mode = mode || "daily"; G.reset();
    G.el.over.classList.add("hidden"); G.el.overlay.classList.remove("hidden");
    G.el.overlay.querySelector(".hr-mode").textContent = G.mode === "daily" ? "" : (window.HRI18N ? HRI18N.t("game.free", "FREE FLIGHT (random course, no daily score)") : "FREE FLIGHT (random course, no daily score)");
    updateStartCard();
  }

  // ---------- share + score card ----------
  function shareText() {
    const b = G.bonusRun ? TT("share.bonus", " (Lucky Wheel bonus run)") : "";
    return TT("share.text", "I scored {n} m in Hamster Rocket 🐹🚀{b} Can you beat me?").replace("{n}", fmt(G.score)).replace("{b}", b);
  }
  function shareX() {
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(CFG.SITE_URL || location.href.split("#")[0])}`;
    window.open(url, "_blank", "noopener");
  }
  async function makeCard() {
    const cw = 1200, ch = 675, cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    const c = cv.getContext("2d");
    try { await document.fonts.load('60px "Luckiest Guy"'); await document.fonts.load('600 30px "Baloo 2"'); } catch (e) { }
    const g = c.createRadialGradient(cw * 0.3, ch * 0.45, 40, cw * 0.4, ch * 0.5, 900); g.addColorStop(0, "#4246c4"); g.addColorStop(0.5, "#1b1d6b"); g.addColorStop(1, "#0a0b2e");
    c.fillStyle = g; c.fillRect(0, 0, cw, ch);
    const r = rngFrom("card" + G.score); c.fillStyle = "#fff";
    for (let i = 0; i < 90; i++) { c.globalAlpha = 0.3 + r() * 0.7; const s = r() < 0.15 ? 3 : 2; c.fillRect(r() * cw, r() * ch, s, s); }
    c.globalAlpha = 1;
    if (sprites.logo) { c.save(); c.beginPath(); c.arc(300, 340, 230, 0, 6.28); c.clip(); c.drawImage(sprites.logo, 70, 110, 460, 460); c.restore(); c.lineWidth = 10; c.strokeStyle = "#38d9ff"; c.beginPath(); c.arc(300, 340, 232, 0, 6.28); c.stroke(); }
    c.textAlign = "left"; c.lineJoin = "round";
    const txt = (t, x, y, font, fill, stroke = 10) => { const mw = cw - x - 30; c.font = font; c.lineWidth = stroke; c.strokeStyle = "#170d33"; c.strokeText(t, x, y, mw); c.fillStyle = fill; c.fillText(t, x, y, mw); };
    txt((CFG.NAME || "Hamster Rocket").toUpperCase(), 590, 150, '64px "Luckiest Guy", sans-serif', "#ffd23f");
    txt((G.mode === "daily" ? `${TT("card.daily", "DAILY CHALLENGE")} #${dayNumber(G.round)} · ${G.round}` : TT("card.free", "FREE FLIGHT")) + (G.bonusRun ? ` · ${TT("card.bonus", "BONUS RUN")}` : ""), 592, 200, '30px "Luckiest Guy", sans-serif', "#c9f6ff", 7);
    txt(TT("card.flew", "MY HAMSTER FLEW"), 592, 290, '40px "Luckiest Guy", sans-serif', "#ffffff", 8);
    txt(`${fmt(G.score)} m`, 586, 410, '120px "Luckiest Guy", sans-serif', "#ffffff", 14);
    txt(`🌻 ${G.seeds} ${TT("card.seeds", "seeds")}   🔥 ${TT("card.combo", "combo")} x${G.maxCombo}`, 592, 475, '600 34px "Baloo 2", sans-serif', "#ffe9a8", 6);
    txt(TT("card.higher", "Can you fly higher?"), 592, 545, '40px "Luckiest Guy", sans-serif', "#ff8fa6", 8);
    const foot = (CFG.SITE_URL || location.host).replace(/^https?:\/\//, "").replace(/\/$/, "");
    txt(foot, 592, 615, '600 28px "Baloo 2", sans-serif', "#c9c9ff", 5);
    return cv;
  }
  async function scoreCard() {
    const cv = await makeCard();
    cv.toBlob(b => {
      const a = document.createElement("a"); a.href = URL.createObjectURL(b);
      a.download = `hamster-rocket-${G.mode === "daily" ? G.round : "free"}-${G.score}m.png`;
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    }, "image/png");
  }

  // ---------- loop ----------
  let last = 0;
  function frame(t) {
    const dt = Math.min(0.05, (t - last) / 1000 || 0); last = t;
    G.update(dt); G.render();
    requestAnimationFrame(frame);
  }

  // ---------- init ----------
  async function init() {
    const $ = id => document.getElementById(id);
    G.el = {
      wrap: $("hr-wrap"), stage: $("hr-stage"), overlay: $("hr-start"), over: $("hr-over"),
      goScore: $("go-score"), goReason: $("go-reason"), goStats: $("go-stats"), goBest: $("go-best"), goBadge: $("go-badge"), goTitle: $("go-title"), goBonus: $("go-bonus"),
      again: $("go-again"), startDay: $("start-day"), startBest: $("start-best"), startBonus: $("start-bonus"), startWheel: $("start-wheel"), mute: $("hr-mute")
    };
    if (!G.el.wrap) return;
    G.canvas = $("hr-canvas"); G.ctx = G.canvas.getContext("2d");
    const [back, face, logo] = await Promise.all([loadImg("assets/rocket_back.svg"), loadImg("assets/hamster_face.svg"), loadImg("assets/logo_512.png")]);
    Object.assign(sprites, { back, face, logo });
    G.reset(); resize(); bindInput(); updateStartCard();
    loadVariants();
    window.addEventListener("hr:wheel", () => { if (G.state === "ready") G.reset(); else G.cos = window.HRWheel ? HRWheel.cosmetics() : {}; updateStartCard(); });
    window.addEventListener("hr:lang", () => { updateStartCard(); syncMute(); if (G.state === "over") showGameOver(); });
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) new ResizeObserver(resize).observe(G.el.wrap);
    if (window.IntersectionObserver) new IntersectionObserver(es => { G.inView = es[0].isIntersecting && es[0].intersectionRatio > 0.45; }, { threshold: [0, 0.45, 0.8] }).observe(G.el.stage);
    else G.inView = true;
    $("go-again").addEventListener("click", () => restart("daily"));
    $("go-free").addEventListener("click", () => restart("free"));
    $("go-share").addEventListener("click", shareX);
    $("go-card").addEventListener("click", scoreCard);
    const syncMute = () => { G.el.mute.textContent = Sound.muted ? "🔇" : "🔊"; G.el.mute.setAttribute("aria-label", Sound.muted ? TT("a11y.unmute", "Unmute sound") : TT("a11y.mute", "Mute sound")); };
    G.el.mute.addEventListener("click", e => { Sound.muted = !Sound.muted; store.set("hr_muted", Sound.muted); syncMute(); Sound.init(); e.currentTarget.blur(); });
    syncMute();
    requestAnimationFrame(frame);
    window.HR_GAME = G; G.makeCard = makeCard; G.updateStartCard = updateStartCard;   // handy for debugging / tests
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
