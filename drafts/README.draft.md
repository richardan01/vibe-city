# Vibe City

**The road to AI PM**: an 80s neon open-world driving game that doubles as my portfolio. Drive around the city, hit the pink markers, and each one unlocks a chapter of my 12+ year career, from data centers and cloud to data, growth and AI product management.

Prefer to skip the game? Click **Skip to the résumé** on the title screen, or press `Tab` while driving. Best on desktop with a keyboard; it also works on touch screens, and with a gamepad for driving.

<!-- TODO: add the live "Play it now" URL and a screenshot/GIF once the deploy URL is confirmed -->

## Chapters

HPE → Huawei → Informatica (with a freelance Web3 side quest at Animoca) → Axi → KPay → what's next. Each stop is a mission card with the real scope, the numbers and what I took from it. Plus the origin story (Coventry), the builder's garage, and the Eval Lab on Prompt Island: an open-source lab that grades real Claude Code and Codex agent sessions, plus RegEval, an LLM-as-judge case study where the lab found its own held-out set was contaminated, invalidated the claim and rebuilt the measurement. (The held-out data is private, so that historical score isn't reproducible from the repo.)

## Controls

| Input | Action |
| --- | --- |
| `W` `A` `S` `D` or arrow keys | Drive |
| `Space` | Drift / handbrake |
| `H` | Horn |
| `R` / `Shift+R`, or `]` / `[` | Next / previous radio station |
| `N` | Mute |
| `T` | Taxi (fast travel) |
| `M` | Map |
| `Tab` | Résumé |
| `Esc` / `P` | Pause (`Esc` also closes a mission card or overlay) |
| `Enter` | Start / skip intro (`Space` also skips the intro) |

- **Gamepad:** left stick steers, RT or A accelerates, LT brakes/reverses, RB drift, B horn. Menus and mission cards need keyboard, mouse or touch.
- **Touch:** drag anywhere on the left side to drive, use the DRIFT and HORN buttons, and tap the HUD buttons for taxi, radio, map, résumé and pause.

## For developers

No build step, no dependencies: plain HTML, CSS and canvas JavaScript.

### Run it locally

```bash
python3 -m http.server 8000
```

Then visit http://localhost:8000. Serving the folder is recommended over opening `index.html` directly.

### Audio

The radio stations are synthesized live in the browser with Web Audio. The VCPR talk station uses the browser's speech synthesis. There is also an optional, local-only Flash FM station that plays `music/flash-fm.mp3` if you supply your own file. `music/` is excluded by `.gitignore` and `.vercelignore`. If you deploy from a local folder any other way, exclude `music/` first. Without the file, the station is skipped and the browser logs a 404.

### Editing the content

Chapter, résumé and radio-script content lives in [`js/data.js`](js/data.js). Edit it and refresh; use `**double asterisks**` to highlight a metric. Page metadata, the title-screen copy and the noscript fallback are in `index.html`, and the intro text, map district labels and education line are in `js/game.js`, so update those too when your details change.

### Structure

```
index.html      markup: HUD, title screen, overlays (pause, taxi, map, résumé)
css/style.css   styling
js/data.js      all profile and chapter content
js/world.js     map layout and procedural city generation
js/game.js      game loop, driving, rendering, UI
js/audio.js     procedural music, radio and talk station
js/util.js      shared helpers
fonts/          Monoton, Mr Dafoe, Passion One (woff2)
favicon.svg     icon
music/          optional local MP3 for Flash FM (git- and Vercel-ignored)
.gitignore      excludes music/ and .DS_Store
.vercelignore   excludes music/ from Vercel deploys
```

### Deploy

Static site: deploy the repo root. On Vercel, `.vercelignore` keeps `music/` out; git-based deploys exclude it via `.gitignore`; if you upload a local folder any other way, exclude `music/` yourself.

## Legal

No reuse licence is granted; all rights reserved. A fan-made homage to the 1980s and open-world games. Not affiliated with Rockstar Games.

## Contact

[LinkedIn](https://www.linkedin.com/in/richieriri/) · [GitHub](https://github.com/richardan01)
