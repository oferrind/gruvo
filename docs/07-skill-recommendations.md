# 07 - Skill Recommendations (Agent 7, Skill Scout) - rev 2

Skills already installed on this machine, mapped to each agent. Call them with the Skill tool using the
exact name in `code`. ★ = the single most important skill for that agent. Nothing was installed.

## Everyone: graphify first, files second (token saver)
A code-only graph exists in `graphify-out/` (`GRAPH_REPORT.md`, `graph.json`). Before you open source files, run these from the project root:
- `graphify query "<question>" --budget 1500` - BFS context (add `--dfs` to trace one path).
- `graphify explain "renderTrack"` - one node and its neighbours. `graphify path "app.js" "net.js"` - how two parts connect.
- Read `graphify-out/GRAPH_REPORT.md` once for god nodes and communities. Then Read only the files the graph points to.
- The graph goes stale after edits. Re-run with the `graphify` skill (args `. --update`) after a build phase.

## Agent 1 - Ideation (novel recommendation methods)
- ★ `agent-skills:idea-refine` - diverge, then converge, stress-testing assumptions on the way.
  Apply: produce 10+ methods (Deezer related-artist hops, MusicBrainz relation walks, era/label/country drift), then keep 3-5.
- `superpowers:brainstorming` - pin constraints first: free no-key APIs only, Windows desktop, no login.
- graphify: `graphify query "what data does src/music.js already fetch" --budget 800` - build ideas on what is already wired.

## Agent 2 - Feasibility / effectiveness judge
- ★ `agent-skills:doubt-driven-development` - adversarial check of each claim.
  Apply: does the free API really return the field? Check rate limits (MusicBrainz 1 req/s + User-Agent), coverage, and cache hit rate.
- `agent-skills:source-driven-development` - check every endpoint against the official docs.
- `estimate` - S/M/L cost per idea, so Agent 3 gets a ranked list.
- graphify: `graphify explain "net.js"` / `"cache.js"` - see what rate limiting and caching already exist before costing an idea.

## Agent 3 - Builder (functional MVP)
- ★ `agent-skills:incremental-implementation` - thin slices that each work.
- `ponytail:ponytail` - vanilla JS, no framework, no dependencies beyond `electron`.
- `run` - launch the app to confirm each slice (it has a built-in Electron pattern).
- graphify: `graphify path "app.js" "music.js"` before adding a feature - reuse the existing IPC route, don't add a parallel one.

## Agent 4 - Bug hunter / fixer (after each build phase)
- ★ `superpowers:systematic-debugging` - find the root cause before any fix.
- `code-review` - the project is now a **git repo**, so it can review the current diff or a commit range directly
  (e.g. `code-review high` on the working tree, or target the last build-phase commits). Add `--fix` to apply findings.
- `ponytail:ponytail-audit` - one-shot ranked audit of the whole repo; changes nothing.
- `superpowers:verification-before-completion` - attach a SNAP screenshot or test output as proof before you say "fixed".
- graphify: `graphify query "who calls <fn>" --dfs --budget 600` - find every caller before you change shared code in `src/`.

## Agent 5 - UI/UX (intuitiveness, usability)
- ★ `agent-skills:frontend-ui-engineering` - loading, empty and error states, keyboard flow, focus and WCAG basics.
- `superpowers:brainstorming` - settle "what does a user do in the first 10 seconds?" before moving controls.
- graphify: `graphify explain "app.js"` - map the four tabs and their handlers without reading the whole renderer.

## Agent 6 - Visual design (colors, typography, aesthetics)
Current state: `renderer/styles.css` is 18 lines, light only (`#fff`/`#111`, `system-ui`), 10 hard-coded hex colors, no tokens, no dark mode.
Design skills installed and how each one fits:
| Skill | Use it? | How |
|---|---|---|
| ★ `frontend-design:frontend-design` | Yes, first | Sets the aesthetic direction: palette and type grounded in the subject. |
| `agent-skills:frontend-ui-engineering` | Yes, as a check | Contrast, focus rings, spacing scale, reduced motion. |
| `dataviz` | Only for charts | Palette and validator for any taste, genre or country visual (`countries.js`). |
| `artifact-design` | Optional | Publish a private palette/type preview page for the user to approve before restyling. |
| `canva:*` | No | These only work on existing Canva designs and need Canva sign-in. Not useful for CSS. |
Steps:
1. Invoke `frontend-design:frontend-design`. Write a 3-line brief: subject = music discovery, mood = record-shop crate digging, not a generic Spotify clone.
2. Put every color in CSS custom properties on `:root`: `--bg --surface --text --muted --accent --accent-ink --border`. Replace all 10 hex values with them.
3. Dark mode: redefine the tokens in `@media (prefers-color-scheme: dark)`. Make dark the first-class theme for a music app (warm near-black, not pure #000), with a light set too. Optionally add a toggle that sets `data-theme` on `<html>` (persist in `store.js`).
4. Type: one display face plus `system-ui` for body. Bundle the font locally (offline Electron, no Google Fonts call). Use tabular numerals for durations and BPM.
5. Use album art as the hero element: large covers, a subtle accent picked from the active tab. Keep text contrast >= 4.5:1 on art overlays (the `frontend-ui-engineering` check).
6. Verify both themes with SNAP (see below), using `SNAP_JS` to force the theme, and look at both PNGs.
- graphify: `graphify query "which renderer elements get CSS classes" --budget 800`. Only restyle classes that exist.

## Agent 8 - Final advisor / reviewer
- ★ `agent-skills:shipping-and-launch` - final go/no-go checklist. For a multi-persona pass, use `agent-skills:ship` (fans out to the code-reviewer, security-auditor and test-engineer agents).
- `code-review` - run it at `high` effort on the whole branch diff since the first commit (now possible with git).
- `agent-skills:security-and-hardening` - Electron checklist: `contextIsolation: true`, `nodeIntegration: false`,
  a narrow `preload.js` API (no raw `ipcRenderer` exposed), no `innerHTML` with API strings, a CSP meta tag in `index.html`,
  and `shell.openExternal` only for https URLs.
- `superpowers:verification-before-completion` - verdict only on fresh evidence: launch, the 4 tabs (SNAP each), API-down behaviour, `ponytail:ponytail-debt` list of open `shortcut:` comments.
- graphify: read `GRAPH_REPORT.md` god nodes first. A file that everything depends on is where review time goes.
Deliver a short go/no-go with a ranked list of 5 or fewer must-fix items. Leave nice-to-haves to a separate list.

## Testing and screenshots - what is actually available
- Node v24.22.0. Global npm: only `@anthropic-ai/claude-code` and `n8n`. **Playwright is NOT installed**. Chrome DevTools MCP is not configured, so `agent-skills:browser-testing-with-devtools` won't work.
- **SNAP hook in `main.js` (primary):** `SNAP` = output PNG path, `SNAP_JS` = JS run in the page first (switch tab, set theme), `SNAP_WAIT` = ms delay (default 2500).
  `$env:SNAP="docs/shot.png"; $env:SNAP_JS="document.documentElement.dataset.theme='dark'"; npx electron .` then Read the PNG.
- **`run` skill:** launch and drive the app interactively.
- **`claude-in-chrome`:** can open `renderer/index.html`, but preload/IPC is missing there, so only static layout is checkable.
- **`node --test`:** unit-test pure logic in `src/` with fixture JSON.
- Playwright `_electron` needs a download. Only add it with the user's approval.
