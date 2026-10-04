# Hamster Rocket

Free browser mini-games starring a cartoon hamster. Works on mobile and PC, fully offline, best scores saved locally in your browser.

Just a game for fun. No prizes, no rewards, no tokens to win.

Play: https://botgrok558-ux.github.io/hamster-rocket/

## Games
| Game | Route | Best-score keys (localStorage) |
|---|---|---|
| Hamster Rocket (main game + daily Lucky Wheel) | `./#play` (or `#/rocket`) | `hr_best_all`, `hr_best_<day>`, `hr_best_bonus`, `hr_wheel`, `hr_bonus` |
| Hamster Rocket Arena (survival shooter) | `./arena/` (or `#/arena`) | `hra_bestTime`, `hra_bestKills` |
| Hamster Stack (one-tap stacking) | `./stack/` (or `#/stack`) | `hrs_best`, `hrs_bestCombo` |
| Hamster Dash (lane runner) | `./dash/` (or `#/dash`) | `hrd_best`, `hrd_bestSeeds`, `hrd_bestDist` |

The hub (`#games`) shows one card per game. Each game page has a back-to-hub button; leaving a game stops its loop, input and audio (`destroy()` closes the AudioContext). One shared language choice (`hr_lang`, DE / EN / FR) for the whole site, all texts in `i18n.js` (mini-game keys are prefixed `arena.`, `stack.`, `dash.`).

No external requests, no CDN libraries, no tracking.

Juste un jeu pour s’amuser. Pas de prix, pas de récompenses, aucun token à gagner.
