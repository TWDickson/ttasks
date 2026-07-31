# TTasks visual test rig

Renders the real plugin components in a browser with the **actual Obsidian
`app.css`**, the vault's **Underwater theme**, and the vault accent color, so
style work can be reviewed (and screenshotted) without launching Obsidian.

## Commands

| Command | What it does |
| --- | --- |
| `npm run rig` | Vite dev server on <http://localhost:5199> with HMR — edit `styles.css` or a component and the browser updates live. |
| `npm run rig:shots` | Headless screenshot matrix → `test-rig/shots/*.png` (desktop + mobile, dark + light, list/kanban/agenda/graph/detail/create-modal). Pass a filter: `npm run rig:shots mobile`. Starts the dev server itself if it isn't running. |
| `npm run rig:sync-css` | Refresh `vendor/` — from the local Obsidian install + vault when present, otherwise downloaded from GitHub. |
| `npm run rig:browser` | Download a Chromium into `.browser/` for the screenshot/driver scripts. |

## Running without Obsidian (server / CI)

The rig needs three machine-local things, none of which exist on a server, and
all of which now degrade or resolve remotely:

| Need | With Obsidian installed | Without |
| --- | --- | --- |
| `app.css` | extracted from the local `obsidian.asar` | downloaded from `obsidianmd/obsidian-releases` (`obsidian-<v>.asar.gz`, cached in `.cache/`) |
| Underwater theme | copied from the vault | downloaded from `seniblue/Underwater` |
| Vault tasks | served at `/__vault.json` | empty payload → the rig falls back to `fixtures.ts` |

So a fresh clone anywhere is `npm ci && npm run rig:sync-css && npm run rig`.
Skip `rig:sync-css` and the rig still boots — `vendor/` is stubbed with empty
CSS and the dev server prints a warning. Structure and behaviour are real;
Obsidian's native look is not, so **don't sign off visual work against a
stubbed rig**.

### Env overrides

Set in `localPaths.mjs`' resolution order; an override wins outright even if the
path doesn't exist, so typos fail loudly. Set one to the **empty string** to
declare the resource absent — that's how a machine that *has* a vault reproduces
the server's behaviour.

| Var | Overrides |
| --- | --- |
| `TTASKS_VAULT` | vault root (the theme path is derived from it) |
| `TTASKS_OBSIDIAN_ASAR` | local `obsidian.asar` |
| `TTASKS_THEME_CSS` | local theme stylesheet |
| `TTASKS_OBSIDIAN_VERSION` | Obsidian release to download (default: latest) |
| `TTASKS_THEME_URL` | raw `theme.css` URL |
| `CHROME_PATH` / `PUPPETEER_EXECUTABLE_PATH` | browser binary |

Browsers are probed in `localPaths.mjs` (`.browser/` download first, then system
Chrome/Edge/Chromium across Windows, macOS and Linux) and shared by `shots.mjs`
and the `run-ttasks` skill driver. On Linux the launch args add `--no-sandbox`
and `--disable-dev-shm-usage` so headless works in a container.

## URL params

`?theme=light|dark` · `?view=list|kanban|agenda|graph|today|inbox|logbook` ·
`?detail=1` opens the first task's detail panel · `?modal=1` opens the Create
Task modal. The top bar has the same controls for interactive use.

## How it works

- `obsidian-shim.ts` stands in for the `obsidian` package (vite alias):
  Obsidian's `HTMLElement` helpers, `setIcon` backed by the real `lucide`
  package, and Modal/Menu/Notice that reproduce Obsidian's DOM so `app.css`
  styles them.
- `fixtures.ts` is a live in-memory TaskStore — drag-drop, status changes, and
  detail edits mutate the store, so interactions behave like the real plugin.
- `vendor/` (gitignored) holds `obsidian-app.css` extracted from
  `obsidian.asar` and the theme CSS — see the table above for where each comes
  from. `.browser/` (gitignored) holds a plain Chromium — corporate policy
  blocks DevTools debugging on branded Chrome/Edge, but not on Chromium builds.
- `localPaths.mjs` is the single place that knows about machine-local paths;
  `vendorCss.mjs` writes the stubs that keep the rig bootable without them.

## Limits

Close, not pixel-identical: no Obsidian workspace chrome around the board, no
real iOS safe-area insets, and snippets from the vault aren't loaded (add
imports in `main.ts` if one starts affecting plugin UI). Final sign-off still
happens in Obsidian; this rig is for fast iteration.
