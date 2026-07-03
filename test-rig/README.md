# TTasks visual test rig

Renders the real plugin components in a browser with the **actual Obsidian
`app.css`**, the vault's **Underwater theme**, and the vault accent color, so
style work can be reviewed (and screenshotted) without launching Obsidian.

## Commands

| Command | What it does |
| --- | --- |
| `npm run rig` | Vite dev server on <http://localhost:5199> with HMR — edit `styles.css` or a component and the browser updates live. |
| `npm run rig:shots` | Headless screenshot matrix → `test-rig/shots/*.png` (desktop + mobile, dark + light, list/kanban/agenda/graph/detail/create-modal). Pass a filter: `npm run rig:shots mobile`. Starts the dev server itself if it isn't running. |
| `npm run rig:sync-css` | Refresh `vendor/` from the installed Obsidian app + vault theme (run after an Obsidian update or theme change). |

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
  `obsidian.asar` and the vault's theme CSS. `.browser/` (gitignored) holds a
  plain Chromium — corporate policy blocks DevTools debugging on branded
  Chrome/Edge, but not on Chromium builds.

## Limits

Close, not pixel-identical: no Obsidian workspace chrome around the board, no
real iOS safe-area insets, and snippets from the vault aren't loaded (add
imports in `main.ts` if one starts affecting plugin UI). Final sign-off still
happens in Obsidian; this rig is for fast iteration.
