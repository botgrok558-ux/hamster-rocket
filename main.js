/* Fills placeholders from config.js (social links, local round time, mobile menu) + the games hub (hash routes, best scores on the cards). */
(() => {
  // hash routes: #/arena, #/stack, #/dash open the game pages; #/rocket (or #/) jumps to the Hamster Rocket game on this page
  const ROUTES = { "#/arena": "arena/", "#/stack": "stack/", "#/dash": "dash/" };
  const route = () => { const h = location.hash.toLowerCase().replace(/\/$/, "") || ""; if (ROUTES[h]) location.replace(ROUTES[h]); else if (h === "#/rocket") location.replace("#play"); else if (h === "#/games" || h === "#") location.replace("#games"); };
  route(); window.addEventListener("hashchange", route);
})();
(() => {
  const C = window.HR_CONFIG || {};
  // socials
  document.querySelectorAll("[data-social]").forEach(a => {
    const url = C[a.dataset.social];
    if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener"; a.classList.add("live"); }
  });
  // new daily course time in the visitor's local time
  try {
    const S = window.HRSim, end = S.roundEnd(S.roundFor(Date.now()));
    const at = new Date(end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    document.querySelectorAll("[data-round-local]").forEach(e => e.textContent = at);
  } catch (e) { }
  // mobile menu
  const nav = document.getElementById("nav"), burger = document.getElementById("burger");
  if (nav && burger) {
    const setOpen = o => { nav.classList.toggle("open", o); burger.setAttribute("aria-expanded", String(o)); };
    burger.addEventListener("click", () => setOpen(!nav.classList.contains("open")));
    nav.querySelectorAll("nav a").forEach(a => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("keydown", e => { if (e.key === "Escape") setOpen(false); });
    document.addEventListener("click", e => { if (!nav.contains(e.target)) setOpen(false); });
  }
})();

/* Games hub: each card shows your best score for that game (read-only, from this browser's localStorage). */
(() => {
  const T = (k, en) => (window.HRI18N ? HRI18N.t(k, en) : en);
  const num = k => { try { const v = localStorage.getItem(k); const n = v == null ? 0 : parseFloat(JSON.parse(v)); return isFinite(n) ? n : 0; } catch (e) { return 0; } };
  const mmss = s => { s = Math.floor(s); return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
  const nf = n => Math.round(n).toLocaleString(window.HRI18N ? HRI18N.lang : undefined);
  function render() {
    const best = {
      rocket: () => { const b = num("hr_best_all"); return b > 0 ? `${nf(b)} m` : ""; },
      arena: () => { const t = num("hra_bestTime"), k = num("hra_bestKills"); return t > 0 ? `${mmss(t)} · ${nf(k)} ${T("hub.kills", "kills")}` : ""; },
      stack: () => { const b = num("hrs_best"); return b > 0 ? `${nf(b)} ${T("hub.blocks", "blocks")}` : ""; },
      dash: () => { const b = num("hrd_best"); return b > 0 ? `${nf(b)} ${T("hub.points", "points")}` : ""; }
    };
    document.querySelectorAll("[data-best]").forEach(el => { const f = best[el.dataset.best], v = f ? f() : ""; el.textContent = v ? `🏆 ${T("hub.best", "Your best")}: ${v}` : ""; });
  }
  window.addEventListener("hr:lang", render);
  window.addEventListener("pageshow", render);   // coming back from a game (also via back/forward cache)
  window.addEventListener("storage", render);
  render();
})();
