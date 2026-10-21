# 07 - Skill Recommendations (Agent 7, Skill Scout)

Skills already installed on this machine, mapped to each agent. Call them with the Skill tool using the
exact name in `code`. ★ = the single most important skill for that agent. Nothing was installed.

## Agent 1 - Ideation (novel recommendation methods)
- ★ `agent-skills:idea-refine` - structured diverge-then-converge ideation with assumption stress-testing.
  Apply: generate 10+ recommendation methods (e.g. BPM/key bridges, MusicBrainz relation walks, Deezer "related artists" graph hops, era/label drift), then converge on 3-5 with a one-line "why it's novel".
- `superpowers:brainstorming` - forces purpose/constraints/success-criteria before ideas.
  Apply: pin constraints first (free no-key APIs only: Deezer, iTunes, MusicBrainz; Windows desktop; no login) so ideas stay buildable.
- `agent-skills:interview-me` - only if intent is unclear; one question at a time.
  Apply: skip unless the user's "discovery" goal (new artists vs. deep cuts vs. moods) is ambiguous.

## Agent 2 - Feasibility / effectiveness judge
- ★ `agent-skills:doubt-driven-development` - adversarial cross-examination of every non-trivial claim.
  Apply: for each idea, attack "does the free API actually return this field?", rate limits (MusicBrainz 1 req/s, needs User-Agent), CORS, data coverage.
- `agent-skills:source-driven-development` - ground decisions in official docs, cite them.
  Apply: verify each endpoint (Deezer `/artist/{id}/related`, iTunes Search `entity=song`, MusicBrainz `/ws/2`) against docs before approving.
- `estimate` - scope a change: files, size, breakage.
  Apply: give each surviving idea an S/M/L build cost so Agent 3 gets a ranked list.

## Agent 3 - Builder (functional MVP)
- ★ `agent-skills:incremental-implementation` - thin, verifiable slices, each one working before the next.
  Apply: slice 1 = Electron window + search box hitting Deezer; slice 2 = one recommendation method; slice 3 = 30s preview playback; slice 4 = more methods.
- `ponytail:ponytail` - smallest complete change, no unrequested abstractions.
  Apply: vanilla JS, no framework, no build step, no extra npm deps beyond `electron`.
- `agent-skills:planning-and-task-breakdown` (or `superpowers:writing-plans`) - ordered tasks with acceptance criteria.
  Apply: write a short task list in `docs/` before coding so Agents 4-6 know which files exist.
- `run` - launch and drive the app to confirm a slice works (has a built-in Electron pattern).
  Apply: after each slice, run it and confirm search + results render.

## Agent 4 - Bug hunter / fixer (after each build phase)
- ★ `superpowers:systematic-debugging` - root cause before any fix; no guess-patching.
  Apply: reproduce each bug (API failure, empty results, preview not playing), trace to cause, fix once in shared code.
- `code-review` - reviews the current diff/path for correctness bugs; `--fix` applies findings. (`ponytail:ponytail-review` is a similar alternative.)
  Apply: since the folder is not a git repo, target a path: review `main.js`, `renderer/*.js` at `high` effort.
- `ponytail:ponytail-audit` - one-shot whole-repo audit: bugs, security, load, untested risk. Changes nothing.
  Apply: run once per build phase to get a ranked bug list.
- `superpowers:verification-before-completion` - evidence before "fixed" claims.
  Apply: re-run the app (see Testing section) and show output/screenshot before declaring a bug fixed.

## Agent 5 - UI/UX (intuitiveness, usability)
- ★ `agent-skills:frontend-ui-engineering` - production-quality, accessible UI: layout, states, WCAG, keyboard nav.
  Apply: define loading/empty/error states for every API call, keyboard-first search (Enter, arrows, Esc), visible focus, one clear primary action per screen.
- `claude-in-chrome` - drive the real UI, click through flows, screenshot.
  Apply: open `renderer/index.html` in Chrome to walk the first-run flow (see caveats below).
- `superpowers:brainstorming` - clarify the user's job-to-be-done before redesigning flows.
  Apply: answer "what does a user do in the first 10 seconds?" before moving any control.

## Agent 6 - Visual design (colors, typography, aesthetics)
- ★ `frontend-design:frontend-design` - distinctive, non-templated aesthetic direction, palette and type grounded in the subject.
  Apply: derive the look from music culture (vinyl sleeves, liner notes, gig posters), not a generic dark dashboard; one or two font families; color tokens in CSS `:root`.
- `agent-skills:frontend-ui-engineering` - keeps the visuals accessible (contrast, focus rings, spacing scale).
  Apply: check text contrast >= 4.5:1 on album-art backgrounds.
- `dataviz` - only if the app shows charts (genre map, taste radar, similarity graph).
  Apply: use its palette/validator for any graph of artist relations.

## Agent 8 - Final advisor / reviewer
- ★ `agent-skills:shipping-and-launch` - pre-launch checklist and go/no-go. (`agent-skills:ship` fans it out to specialist personas.)
  Apply: final go/no-go: app launches cleanly, offline/API-down behavior, packaging/run instructions, no secrets.
- `agent-skills:code-review-and-quality` - five-axis review (correctness, readability, architecture, security, performance).
  Apply: one full review pass of the final codebase.
- `agent-skills:security-and-hardening` - Electron-specific risk: untrusted API data into the DOM.
  Apply: confirm `contextIsolation: true`, `nodeIntegration: false`, no `innerHTML` with API strings, CSP meta tag.
- `superpowers:verification-before-completion` - require a fresh run/screenshot as evidence for the final verdict.

## Testing and screenshots - what is actually available
Checked on this machine (2026-10-21):
- Node v24.22.0. Global npm packages: only `@anthropic-ai/claude-code` and `n8n`. **Playwright is NOT installed** (globally or browsers in `%LOCALAPPDATA%\ms-playwright`).
- Chrome DevTools MCP is **not configured**, so `agent-skills:browser-testing-with-devtools` will not work as-is.
- `claude-in-chrome` (Chrome extension MCP) **is available**: can open a local HTML file, click, read console, screenshot.

Recommended approaches, best first:
1. **`run` skill** - built-in Electron pattern; use it to launch and drive the app. First choice for "does it work".
2. **Electron self-screenshot (no extra deps)** - `electron` is a project dependency anyway. Add a test hook in `main.js`:
   ```js
   // shortcut: test-only screenshot hook, remove or keep behind the env var
   if (process.env.SNAP) win.webContents.once('did-finish-load', () => setTimeout(async () => {
     require('fs').writeFileSync(process.env.SNAP, (await win.webContents.capturePage()).toPNG()); app.quit();
   }, 2500));
   ```
   Run: `$env:SNAP="docs/shot.png"; npx electron .` then view the PNG with the Read tool. Works without a visible user.
3. **`claude-in-chrome`** - open `file:///.../renderer/index.html` in Chrome for UI/UX walkthroughs. Caveat: no Node/preload APIs there; works only if the renderer fetches APIs directly (Deezer may hit CORS in a plain browser; Electron avoids it if fetches run in main via IPC).
4. **Smoke test with no screenshots** - `node --test` on pure recommendation functions (feed fixture JSON), per `agent-skills:test-driven-development`.
5. Playwright `_electron.launch()` would be ideal but requires `npm i -D playwright` (download); only if the user approves.
