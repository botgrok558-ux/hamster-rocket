/* DE/EN/FR language handling for the whole site (hub + all mini-games, one shared choice). Load in <head> (sets the language before first paint).
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
      "a11y.mute": "Ton aus", "a11y.unmute": "Ton an",
      "ca.copied": "Kopiert!", "hub.best": "Dein Bestwert", "hub.kills": "Gegner", "hub.blocks": "Blöcke", "hub.points": "Punkte"
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
      "a11y.mute": "Couper le son", "a11y.unmute": "Activer le son",
      "ca.copied": "Copié\u00a0!", "hub.best": "Ton record", "hub.kills": "ennemis", "hub.blocks": "blocs", "hub.points": "points"
    }
  };
  /* Mini-games in the hub (arena/, stack/, dash/). Their keys live under a prefix ("arena.", "stack.", "dash.")
     so they never clash with the Hamster Rocket keys above; each game page passes HRI18N.scoped("arena") etc. as its t(). */
  const GAMES = {
    arena: {
      de: {
        "hud.level": "LV", "hud.horde": "HORDE IM ANMARSCH!", "hud.bossWave": "BOSS!", "hud.bossName": "RIESIGE ROBO-KATZE",
        "hud.bossDown": "ROBO-KATZE BESIEGT!", "hud.boss": "ROBO-KATZE", "hud.move": "BEWEGEN", "hud.aim": "ZIELEN + SCHIESSEN", "up.damage": "Kern-Schaden",
        "up.damage.d": "+25 % Schaden", "up.rate": "Feuerrate", "up.rate.d": "15 % schneller schießen", "up.multi": "Mehrfachschuss",
        "up.multi.d": "+1 Kern pro Schuss", "up.speed": "Tempo", "up.speed.d": "10 % schneller fliegen", "up.hp": "Max. Leben",
        "up.hp.d": "+20 max. Leben, heilt 20", "up.pierce": "Durchschlag", "up.pierce.d": "Kerne durchbohren +1 Gegner", "ui.lvl": "Stufe",
        "ui.best": "Bestwert", "ui.kills": "Gegner", "ui.noBest": "Noch kein Bestwert. Leg los!", "ui.debug": "Debug-Start (zählt nicht als Bestwert)",
        "share.text": "Ich habe {t} in Hamster Rocket Arena überlebt 🐹🚀 Schaffst du mehr?", "a11y.mute": "Ton aus", "a11y.unmute": "Ton an",
        "a11y.pause": "Pause"
      },
      fr: {
        "hud.level": "NIV", "hud.horde": "LA HORDE ARRIVE !", "hud.bossWave": "BOSS !", "hud.bossName": "ROBO-CHAT GÉANT",
        "hud.bossDown": "ROBO-CHAT VAINCU !", "hud.boss": "ROBO-CHAT", "hud.move": "BOUGER", "hud.aim": "VISER + TIRER", "up.damage": "Dégâts",
        "up.damage.d": "+25 % de dégâts", "up.rate": "Cadence de tir", "up.rate.d": "Tire 15 % plus vite", "up.multi": "Tir multiple",
        "up.multi.d": "+1 graine par tir", "up.speed": "Vitesse", "up.speed.d": "Vole 10 % plus vite", "up.hp": "Vie max", "up.hp.d": "+20 PV max, soigne 20",
        "up.pierce": "Perforation", "up.pierce.d": "Les graines traversent +1 ennemi", "ui.lvl": "Niv.", "ui.best": "Record", "ui.kills": "ennemis",
        "ui.noBest": "Pas encore de record. À toi de jouer !", "ui.debug": "Départ debug (pas compté comme record)",
        "share.text": "J’ai survécu pendant {t} dans Hamster Rocket Arena 🐹🚀 Tu peux me battre ?", "a11y.mute": "Couper le son",
        "a11y.unmute": "Activer le son", "a11y.pause": "Pause"
      }
    },
    stack: {
      de: {
        "hud.perfect": "PERFEKT!", "hud.combo": "KOMBO", "hud.tap": "TIPPEN ZUM FALLENLASSEN!", "ui.best": "Bestwert", "ui.blocks": "Blöcke",
        "ui.combo": "beste Kombo", "ui.noBest": "Noch kein Bestwert. Leg los!",
        "share.text": "Ich habe einen Turm aus {n} Blöcken in Hamster Stack gebaut 🐹🌻 Schaffst du mehr?", "a11y.mute": "Ton aus", "a11y.unmute": "Ton an"
      },
      fr: {
        "hud.perfect": "PARFAIT !", "hud.combo": "COMBO", "hud.tap": "TAPE POUR LÂCHER !", "ui.best": "Record", "ui.blocks": "blocs",
        "ui.combo": "meilleur combo", "ui.noBest": "Pas encore de record. À toi de jouer !",
        "share.text": "J’ai empilé une tour de {n} blocs dans Hamster Stack 🐹🌻 Tu peux faire mieux ?", "a11y.mute": "Couper le son",
        "a11y.unmute": "Activer le son"
      }
    },
    dash: {
      de: {
        "hud.saved": "GERETTET!", "hud.magnet": "MAGNET!", "hud.shield": "SCHILD!", "hud.faster": "SCHNELLER!", "hud.swipe": "WISCHEN ← →",
        "hud.keys": "← → / A D", "ui.best": "Bestwert", "ui.seeds": "Kerne", "ui.noBest": "Noch kein Bestwert. Leg los!",
        "reason.cat": "Eine Katze hat dich erwischt!", "reason.trap": "Schnapp! Mausefalle!", "reason.puddle": "Platsch! In die Pfütze gerutscht!",
        "share.text": "Ich habe {n} Punkte in Hamster Dash geholt 🐹💨 Schaffst du mehr?", "a11y.mute": "Ton aus", "a11y.unmute": "Ton an"
      },
      fr: {
        "hud.saved": "SAUVÉ !", "hud.magnet": "AIMANT !", "hud.shield": "BOUCLIER !", "hud.faster": "PLUS VITE !", "hud.swipe": "GLISSE ← →",
        "hud.keys": "← → / A D", "ui.best": "Record", "ui.seeds": "graines", "ui.noBest": "Pas encore de record. À toi de jouer !",
        "reason.cat": "Un chat t’a attrapé !", "reason.trap": "Clac ! Une tapette à souris !", "reason.puddle": "Plouf ! Tu as glissé dans une flaque !",
        "share.text": "J’ai fait {n} points dans Hamster Dash 🐹💨 Tu peux faire mieux ?", "a11y.mute": "Couper le son", "a11y.unmute": "Activer le son"
      }
    }
  };
  Object.keys(GAMES).forEach(g => ["de", "fr"].forEach(l => Object.keys(GAMES[g][l]).forEach(k => { DICT[l][g + "." + k] = GAMES[g][l][k]; })));
  const t = (k, en) => (DICT[lang] && DICT[lang][k]) || en;
  const scoped = prefix => (k, en) => t(prefix + "." + k, en);   // t() for one mini-game
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
  window.HRI18N = { t, scoped, set, get lang() { return lang; } };
  document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll("[data-lang-btn]").forEach(b => b.addEventListener("click", () => set(b.dataset.langBtn)));
    apply();
  });
})();
