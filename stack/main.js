/* UI glue for Hamster Stack in the game hub: overlays, language, share. The game itself is in stack.js. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const T = window.HRI18N ? HRI18N.scoped("stack") : (k, en) => en;   // shared site language, keys under "stack."
  const SITE = "https://botgrok558-ux.github.io/hamster-rocket-demo/stack/";   // share link: this game on the Hamster Rocket site
  const overlays = ["ov-start", "ov-pause", "ov-over"];
  const show = id => overlays.forEach(o => $(o).classList.toggle("hidden", o !== id));
  let lastResult = null, overAt = 0;

  const game = HamsterStack.create({ canvas: $("game"), assetBase: "../assets/", t: T, storagePrefix: "hrs_", onEvent });
  window.HR_STACK = game;   // handy for testing from the console

  function onEvent(type, d) {
    if (type === "state") {
      $("btn-pause").classList.toggle("hidden", !(d.state === "play" || d.state === "dying"));
      if (d.state === "play") { show(null); if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); }
      else if (d.state === "paused") show("ov-pause");
    } else if (type === "gameover") {
      lastResult = d;
      $("go-score").textContent = d.score;
      $("go-perfects").textContent = d.perfects;
      $("go-combo").textContent = d.maxCombo;
      $("go-newbest").classList.toggle("hidden", !d.newBest);
      updateBest();
      show("ov-over"); overAt = performance.now();
      // short lock so a frantic extra tap doesn't restart before you see your score
      ["btn-again", "btn-share"].forEach(id => { $(id).disabled = true; });
      setTimeout(() => { ["btn-again", "btn-share"].forEach(id => { $(id).disabled = false; }); $("btn-again").focus({ preventScroll: true }); }, 450);
    } else if (type === "mute") updateMute();
  }
  function updateBest() {
    const b = game.best(), txt = b.score > 0 ? `${T("ui.best", "Best")}: ${b.score} ${T("ui.blocks", "blocks")} · ${T("ui.combo", "best combo")} ×${b.combo}` : T("ui.noBest", "No best score yet. Go for it!");
    $("start-best").textContent = txt;
    $("go-best").textContent = b.score > 0 ? txt : "";
  }
  function updateMute() {
    const m = game.muted;
    $("btn-mute").classList.toggle("is-muted", m);
    $("btn-mute").setAttribute("aria-label", m ? T("a11y.unmute", "Unmute") : T("a11y.mute", "Mute"));
    $("btn-mute").setAttribute("aria-pressed", String(m));
  }
  function play() { game.start(); }
  function share() {
    const text = T("share.text", "I stacked a {n}-block tower in Hamster Stack 🐹🌻 Can you beat me?").replace("{n}", lastResult ? lastResult.score : 0);
    const url = "https://x.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(SITE);
    window.open(url, "_blank", "noopener,noreferrer");
  }

  $("btn-play").addEventListener("click", play);
  $("btn-again").addEventListener("click", play);
  $("btn-restart").addEventListener("click", play);
  $("btn-resume").addEventListener("click", () => game.resume());
  $("btn-pause").addEventListener("click", () => game.pause("button"));
  $("btn-mute").addEventListener("click", () => game.toggleMute());
  $("btn-share").addEventListener("click", share);
  document.addEventListener("keydown", e => {
    if ((e.code !== "Enter" && e.code !== "Space") || e.repeat) return;
    if (game.state === "menu" || (game.state === "over" && performance.now() - overAt > 600)) {
      if (document.activeElement && document.activeElement.tagName === "BUTTON") return;   // the button handles it
      e.preventDefault(); play();
    }
  });
  // leaving the game (back button, link, closing the tab): stop the loop, input and audio
  let left = false;
  function leave() { if (left) return; left = true; try { game.destroy(); } catch (e) { } }
  $("btn-back").addEventListener("click", leave);
  window.addEventListener("pagehide", leave);
  window.addEventListener("pageshow", e => { if (e.persisted && left) location.reload(); });   // came back via back/forward cache: start fresh
  window.addEventListener("hr:lang", () => { updateBest(); updateMute(); });
  updateBest(); updateMute();
})();
