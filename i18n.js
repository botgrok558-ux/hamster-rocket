/* DE/EN language handling. Load in <head> (sets the language before first paint).
   Static text: <span data-l="en">…</span><span data-l="de">…</span> (CSS hides the inactive one).
   Dynamic text (JS): HRI18N.t(key, englishFallback). Choice is saved in localStorage. */
(() => {
  const KEY = "hr_lang";
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { }
  const guess = /^de\b/i.test((navigator.languages && navigator.languages[0]) || navigator.language || "") ? "de" : "en";
  let lang = saved === "de" || saved === "en" ? saved : guess;
  const root = document.documentElement;
  root.dataset.lang = lang; root.lang = lang;

  const DE = {
    "game.daily": "Tages-Challenge", "game.bestToday": "Dein Bestwert in dieser Runde", "game.sameCourse": "Gleiche Strecke für alle. Neue Strecke um", "game.yourTime": "deine Zeit",
    "game.free": "FREIER FLUG (zufällige Strecke, keine Wertung)", "game.freeTitle": "Freier Flug", "game.todayBest": "Heute bester", "game.allTime": "Allzeit",
    "game.outOfSeeds": "KEINE KERNE MEHR!", "game.timeUp": "MISSIONSZEIT UM!", "game.newAll": "NEUER ALLZEIT-REKORD!", "game.newDay": "NEUER TAGESREKORD!", "game.seeds": "Kerne", "game.bumps": "Treffer", "game.combo": "beste Combo",
    "game.bonusRun": "Bonus-Flug", "game.notCounted": "Zählt nicht für deinen normalen Bestwert.", "game.notCountedShort": "zählt nicht für deinen normalen Bestwert",
    "game.bonusBest": "Bonus-Bestwert", "game.newBonus": "NEUER BONUS-BESTWERT!", "game.bonusFor": "Bonus für diesen Flug", "game.looksOnly": "nur Optik",
    "game.wheelReady": "Dein Gratis-Dreh am Glücksrad ist bereit"
  };
  const t = (k, en) => (lang === "de" && DE[k]) || en;
  function set(l) {
    lang = l === "de" ? "de" : "en"; root.dataset.lang = lang; root.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { }
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.langBtn === lang)));
    document.querySelectorAll("[data-i18n-attr]").forEach(el => { const [attr, en, de] = el.dataset.i18nAttr.split("|"); el.setAttribute(attr, lang === "de" ? de : en); });
    window.dispatchEvent(new CustomEvent("hr:lang", { detail: lang }));
  }
  window.HRI18N = { t, set, get lang() { return lang; } };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.addEventListener("click", () => set(b.dataset.langBtn)));
    set(lang);
  });
})();
