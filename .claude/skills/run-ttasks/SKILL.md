---
name: run-ttasks
description: Run, build, test, screenshot, or visually drive the TTasks Obsidian plugin. Use when asked to run the app, verify a UI change, take screenshots of list/kanban/agenda/graph/detail/modal views, or check a style fix without launching Obsidian.
---

# Run TTasks

TTasks is an Obsidian plugin (TypeScript + Svelte 4, esbuild). It cannot run
standalone — the runnable surface is the **visual test rig** (`test-rig/`),
which renders the real components with the actual Obsidian `app.css` + vault
theme in a browser. Drive it with `.claude/skills/run-ttasks/driver.mjs`
(headless Chrome via `puppeteer-core`, already a devDependency). All paths
below are relative to the repo root.

## Prerequisites

- Node + `npm ci` (nothing OS-level; puppeteer-core uses an installed
  browser — on the Mac it picks Microsoft Edge, in a cloud container it finds
  the pre-installed Chromium, per the `BROWSERS` list in the driver).
- `test-rig/vendor/` is **gitignored**. If missing, regenerate it. With a local
  Obsidian install + vault it copies from them; otherwise (server, cloud
  session) it downloads `app.css` and the Underwater theme from GitHub:

```bash
npm run rig:sync-css
```

## Build / test

```bash
npm run build      # tsc --noEmit + esbuild production → main.js
npm run check      # lint → build → test (~1.9k tests, ~1 min)
npm run check:all  # + rig:smoke (11 scenes) — the full CI equivalent
```

## Run (agent path) — drive the rig

One-shot driver: opens a rig URL, runs commands left-to-right, exits.
Starts the vite dev server on :5199 itself if it isn't running.
Screenshots land in `test-rig/shots/` (gitignored).

**Working in a worktree? Set `TTASKS_RIG_PORT`.** A rig already running from
another worktree answers on :5199, and the driver will happily reuse it — you'd
then be verifying that worktree's code, with nothing to indicate it. Check with
`pgrep -fl vite` if a result looks wrong.

```bash
# click the first task row → detail pane opens → screenshot it
node .claude/skills/run-ttasks/driver.mjs '/?view=list' \
  count '.tt-task' click '.tt-task-btn' wait 400 shot detail-open.png

# type into the create modal, then screenshot
node .claude/skills/run-ttasks/driver.mjs '/?view=list&modal=1' \
  type 'input.tt-modal-name' 'Driver smoke task' shot modal-typed.png

# phone viewport (390×844)
node .claude/skills/run-ttasks/driver.mjs --mobile '/?view=kanban' shot mobile-kanban.png
```

Commands: `shot <file>` · `click <sel>` · `type <sel> <text>` ·
`text <sel>` · `count <sel>` · `eval <js>` · `wait <ms>`.

URL params: `view=list|kanban|agenda|graph|timeline|today|inbox|logbook` ·
`theme=light|dark` (dark is default) · `data=fixtures` (synthetic stress
fixtures; default is **live vault data**) · `detail=1` · `modal=1`.

For the standard before/after matrix (desktop+mobile × dark+light ×
all views), use the existing batch script — pass a substring filter:

```bash
npm run rig:shots            # full matrix → test-rig/shots/*.png
npm run rig:shots detail     # only shots whose name contains "detail"
```

Interactive HMR session (edit `styles.css` / a component, browser updates):

```bash
npm run rig                  # vite on http://localhost:5199, Ctrl-C to stop
```

## Run (human path) — live Obsidian

`npm run build` copies `main.js` / `manifest.json` / `styles.css` into the
vault's plugin folder (a real folder, not a symlink — a symlink pointed Obsidian
Sync at the whole repo, fixed 2026-07-31). `npm run dev` is watch-only and
**does not touch the vault**, so use `build` to deploy. Only needed for what the
rig can't show (see Gotchas); useless headless.

## Key selectors (verified in the rig)

- Task row: `.tt-task` (there is **no** `.tt-task-row`); its clickable
  surface is `.tt-task-btn`
- Detail pane root: `.tt-detail`
- Create-modal name input: `input.tt-modal-name`
- Readiness: the driver waits for `body[data-rig-ready="1"]` before acting —
  do the same in any custom script or you'll shoot a blank page.

## Gotchas

- **The rig defaults to live vault data**, not fixtures — screenshots will
  contain Taylor's real task names. Use `data=fixtures` for shareable shots
  or when you need the P2 stress row (3 labels + overdue + chevron).
- **The settings tab is not covered by the rig.** Settings-pane changes can
  only be verified in live Obsidian.
- **Browser order matters on macOS**: this machine's Chrome (107) predates
  the headless mode puppeteer-core 25 expects, so Edge is preferred — keep
  the `BROWSERS` lists in `driver.mjs` and `test-rig/shots.mjs` in sync.
- Rig limits: no Obsidian workspace chrome around the board, no real iOS
  safe-area insets. Final sign-off happens in Obsidian.
- `npm run rig:sync-css` prints a shell-args deprecation warning — harmless.

## Troubleshooting

- `TimeoutError: Waiting for selector '.tt-task-row'` → wrong selector; rows
  are `.tt-task` (see Key selectors above).
- `No Chrome/Edge found` → edit the `BROWSERS` list in
  `.claude/skills/run-ttasks/driver.mjs`.
- `vite dev server did not come up on :5199` → port already taken by a stale
  rig; `pkill -f 'vite --config test-rig'` and retry.
