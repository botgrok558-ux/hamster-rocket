/* Fills placeholders from config.js (social links, local round time, mobile menu). */
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
