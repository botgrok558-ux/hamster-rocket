/* DE/EN/FR language handling. Load in <head> (sets the language before first paint).
   Static text: <span data-l="en">…</span><span data-l="de">…</span><span data-l="fr">…</span> (CSS hides the inactive ones).
   Dynamic text (JS): HRI18N.t(key, englishFallback). Auto-detect: fr* -> fr, de* -> de, otherwise en. Choice saved in localStorage. */
(() => {
  const KEY = "hr_lang", LANGS = ["en", "de", "fr"];
  let saved = null; try { saved = localStorage.getItem(KEY); } catch (e) { }
  const nav = ((navigator.languages && navigator.languages[0]) || navigator.language || "").toLowerCase();
  const guess = /^fr\b/.test(nav) ? "fr" : /^de\b/.test(nav) ? "de" : "en";
  let lang = LANGS.includes(saved) ? saved : guess;
  const root = document.documentElement;
  root.dataset.lang = lang; root.lang = lang;

  const DICT = {
    de: {
      "game.daily": "Tages-Challenge", "game.bestToday": "Dein Bestwert in dieser Runde", "game.sameCourse": "Gleiche Strecke für alle. Neue Strecke um", "game.yourTime": "deine Zeit",
      "game.free": "FREIER FLUG (zufällige Strecke, keine Wertung)", "game.freeTitle": "Freier Flug", "game.todayBest": "Heute bester", "game.allTime": "Allzeit",
      "game.outOfSeeds": "KEINE KERNE MEHR!", "game.timeUp": "MISSIONSZEIT UM!", "game.newAll": "NEUER ALLZEIT-REKORD!", "game.newDay": "NEUER TAGESREKORD!", "game.seeds": "Kerne", "game.bumps": "Treffer", "game.combo": "beste Combo",
      "game.bonusRun": "Bonus-Flug", "game.notCounted": "Zählt nicht für deinen normalen Bestwert.", "game.notCountedShort": "zählt nicht für deinen normalen Bestwert",
      "game.bonusBest": "Bonus-Bestwert", "game.newBonus": "NEUER BONUS-BESTWERT!", "game.bonusFor": "Bonus für diesen Flug", "game.looksOnly": "nur Optik",
      "game.wheelReady": "Dein Gratis-Dreh am Glücksrad ist bereit",
      "hud.daily": "TAG", "hud.best": "BESTWERT", "hud.free": "FREIER FLUG", "hud.bonus": "BONUS-FLUG", "hud.fuel": "TREIBSTOFF", "hud.spin": "RADDREHUNG", "hud.combo": "COMBO",
      "fx.boost": "BOOST!", "fx.ring": "BOOST", "fx.ouch": "AUTSCH!", "fx.shield": "SCHILD!", "fx.combo": "COMBO!",
      "zone.LAUNCH PAD": "STARTRAMPE", "zone.BLUE SKY": "BLAUER HIMMEL", "zone.CLOUD CITY": "WOLKENSTADT", "zone.STRATOSPHERE": "STRATOSPHÄRE",
      "zone.OUTER SPACE": "WELTRAUM", "zone.MOON ORBIT": "MONDUMLAUF", "zone.DEEP SPACE": "TIEFER WELTRAUM",
      "card.daily": "TAGES-CHALLENGE", "card.free": "FREIER FLUG", "card.bonus": "BONUS-FLUG", "card.flew": "MEIN HAMSTER FLOG", "card.seeds": "Kerne", "card.combo": "Combo",
      "card.higher": "Fliegst du höher?",
      "share.text": "Ich habe {n} m in Hamster Rocket geschafft 🐹🚀{b} Schaffst du mehr?", "share.bonus": " (Glücksrad-Bonusflug)",
      "a11y.mute": "Ton aus", "a11y.unmute": "Ton an"
    },
    fr: {
      "game.daily": "Défi du jour", "game.bestToday": "Ton record de la manche", "game.sameCourse": "Même parcours pour tout le monde. Nouveau parcours à", "game.yourTime": "ton heure",
      "game.free": "VOL LIBRE (parcours aléatoire, sans score du jour)", "game.freeTitle": "Vol libre", "game.todayBest": "Record du jour", "game.allTime": "Record absolu",
      "game.outOfSeeds": "PLUS DE GRAINES\u00a0!", "game.timeUp": "TEMPS ÉCOULÉ\u00a0!", "game.newAll": "NOUVEAU RECORD ABSOLU\u00a0!", "game.newDay": "NOUVEAU RECORD DU JOUR\u00a0!", "game.seeds": "graines", "game.bumps": "chocs", "game.combo": "meilleur combo",
      "game.bonusRun": "Partie bonus", "game.notCounted": "Ne compte pas pour ton record normal.", "game.notCountedShort": "ne compte pas pour ton record normal",
      "game.bonusBest": "Record bonus", "game.newBonus": "NOUVEAU RECORD BONUS\u00a0!", "game.bonusFor": "Bonus pour cette partie", "game.looksOnly": "look uniquement",
      "game.wheelReady": "Ton tour gratuit de la roue de la chance est prêt",
      "hud.daily": "JOUR", "hud.best": "RECORD", "hud.free": "VOL LIBRE", "hud.bonus": "PARTIE BONUS", "hud.fuel": "CARBURANT", "hud.spin": "ROTATION", "hud.combo": "COMBO",
      "fx.boost": "BOOST\u00a0!", "fx.ring": "BOOST", "fx.ouch": "AÏE\u00a0!", "fx.shield": "BOUCLIER\u00a0!", "fx.combo": "COMBO\u00a0!",
      "zone.LAUNCH PAD": "AIRE DE LANCEMENT", "zone.BLUE SKY": "CIEL BLEU", "zone.CLOUD CITY": "CITÉ DES NUAGES", "zone.STRATOSPHERE": "STRATOSPHÈRE",
      "zone.OUTER SPACE": "ESPACE", "zone.MOON ORBIT": "ORBITE LUNAIRE", "zone.DEEP SPACE": "ESPACE PROFOND",
      "card.daily": "DÉFI DU JOUR", "card.free": "VOL LIBRE", "card.bonus": "PARTIE BONUS", "card.flew": "MON HAMSTER A VOLÉ", "card.seeds": "graines", "card.combo": "combo",
      "card.higher": "Tu peux voler plus haut\u00a0?",
      "share.text": "J’ai fait {n} m dans Hamster Rocket 🐹🚀{b} Tu peux me battre\u00a0?", "share.bonus": " (partie bonus de la roue de la chance)",
      "a11y.mute": "Couper le son", "a11y.unmute": "Activer le son"
    }
  };
  const t = (k, en) => (DICT[lang] && DICT[lang][k]) || en;
  function set(l) {
    lang = LANGS.includes(l) ? l : "en"; root.dataset.lang = lang; root.lang = lang;
    try { localStorage.setItem(KEY, lang); } catch (e) { }
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.langBtn === lang)));
    document.querySelectorAll("[data-i18n-attr]").forEach(el => { const [attr, en, de, fr] = el.dataset.i18nAttr.split("|"); el.setAttribute(attr, lang === "de" ? de : lang === "fr" ? (fr || en) : en); });
    window.dispatchEvent(new CustomEvent("hr:lang", { detail: lang }));
  }
  function apply() {   // same as set() but without saving: used on load so auto-detect isn't stored as a choice
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.langBtn === lang)));
    document.querySelectorAll("[data-i18n-attr]").forEach(el => { const [attr, en, de, fr] = el.dataset.i18nAttr.split("|"); el.setAttribute(attr, lang === "de" ? de : lang === "fr" ? (fr || en) : en); });
    window.dispatchEvent(new CustomEvent("hr:lang", { detail: lang }));
  }
  window.HRI18N = { t, set, get lang() { return lang; } };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.addEventListener("click", () => set(b.dataset.langBtn)));
    apply();
  });
})();
