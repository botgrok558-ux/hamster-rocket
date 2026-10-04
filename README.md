# Hamster Rocket

Free browser mini-games starring a cartoon hamster. Works on mobile and PC, fully offline, best scores saved locally in your browser.

Free to play. Rewards for the daily Top 5 are planned and not live yet. Best scores stay on this device.

Play: https://botgrok558-ux.github.io/hamster-rocket/

## Games
| Game | Route | Best-score keys (localStorage) |
|---|---|---|
| Hamster Rocket (main game + daily Lucky Wheel) | `./#play` (or `#/rocket`) | `hr_best_all`, `hr_best_<day>`, `hr_best_bonus`, `hr_wheel`, `hr_bonus` |
| Hamster Rocket Arena (survival shooter) | `./arena/` (or `#/arena`) | `hra_bestTime`, `hra_bestKills` |
| Hamster Stack (one-tap stacking) | `./stack/` (or `#/stack`) | `hrs_best`, `hrs_bestCombo` |
| Hamster Dash (lane runner) | `./dash/` (or `#/dash`) | `hrd_best`, `hrd_bestSeeds`, `hrd_bestDist` |

The hub (`#games`) shows one card per game. Each game page has a back-to-hub button; leaving a game stops its loop, input and audio (`destroy()` closes the AudioContext). One shared language choice (`hr_lang`, DE / EN / FR) for the whole site, all texts in `i18n.js` (mini-game keys are prefixed `arena.`, `stack.`, `dash.`).

Roadmap: see the Roadmap section on the site (`#roadmap`).

No external requests, no CDN libraries, no tracking.

Gratuit. Des récompenses pour le Top 5 du jour sont prévues mais pas encore actives. Les records restent sur cet appareil.
