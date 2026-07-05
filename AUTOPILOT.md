# TTasks Autopilot — unattended execution plan

You are one session in a sequence. Each session executes **exactly one batch**
from the queue below, then stops. A driver script starts the next session.

## Protocol (read first, every session)

1. Run `git status` and `git branch --show-current`. All work happens on
   `feat/ui-polish-autopilot`. If it doesn't exist, create it from the current
   branch. Never work on `main`.
2. Find the **first unchecked batch** in the queue. That is your entire scope.
   Do not start the next batch even if you finish early.
3. Read the referenced items in `UI_POLISH_TASKS.md` / `NATIVE_FEATURES_TASKS.md`
   — they contain the spec, file:line pointers, and gotchas. Follow CLAUDE.md
   conventions (design tokens, pure-module boundaries, processFrontMatter, etc.).
4. When the batch is done per the Definition of Done, check its box here, mark
   its items **[DONE]** (with a one-line note) in their task file, and commit.

## Definition of Done (every batch)

- `npm run build` exits 0 — show the output.
- Full test suite passes — show the summary line.
- For UI batches: `npm run rig:shots` has been run; screenshots exist in
  `test-rig/shots/`.
- Items marked [DONE] in their task file; batch checked off below.
- All changes committed on `feat/ui-polish-autopilot` with a conventional
  message (`feat(...)`, `style(...)`, `docs(...)`); `git status` clean.

## Hard rules

- **Never push, never merge, never open PRs.** Taylor reviews the branch.
- **No data-model / frontmatter-schema changes.** If a task seems to need one,
  write the proposal into the task file and mark the item [BLOCKED] instead.
- **No new dependencies** without a note explaining why in the commit.
- Design-judgment batches (marked ⚖ below) must stay **conservative**: prefer
  the smallest change that satisfies the spec; describe alternatives in the
  task-file note rather than exploring them in code.

## Stuck protocol (prevents infinite loops)

If after a genuine attempt a batch cannot be completed (unreproducible bug,
needs live Obsidian/vault, needs Taylor's judgment):

1. Mark the affected item(s) **[BLOCKED]** in their task file with what you
   tried and what's needed.
2. Check the batch off below with `(BLOCKED — see task file)` appended.
3. Commit that documentation. The batch then counts as done for the queue.

## Batch queue

- [x] **Batch A** — UI_POLISH P5 + P6, NATIVE N1 (detail-pane centering, top +
  bottom actions via `addAction`, board/rail header actions — P6/N1 overlap,
  implement the detail actions once)
- [x] **Batch B** — UI_POLISH P1 + P3 (kanban collapsed one-line header;
  selected-row box size)
- [x] **Batch C** ⚖ — UI_POLISH P2 (list-row visual pass; conservative, with
  before/after rig shots committed or described in the task-file note)
- [x] **Batch D** — NATIVE N4 + N5 (jump-to-task fuzzy switcher, then protocol
  `action=jump` + prefill + URI docs)
- [ ] **Batch E** — NATIVE N2 + N6 (view state persistence; status bar polish)
- [ ] **Batch F** ⚖ — UI_POLISH P7 (settings overhaul; IA/presentation only,
  every existing setting stays functional)
- [ ] **Batch G** — UI_POLISH P4 + C1 (graph mobile touch/pinch; zoom-edge
  repro in the rig — if unreproducible, follow the Stuck protocol for C1 only)
- [ ] **Batch H** — NATIVE N3 (write `API_DESIGN.md` per spec — design doc
  only, no changes under `src/`)
- [ ] **Batch I** ⚖ — UI_POLISH C2 (graph layout: baseline metrics + 2–3
  variant proposals with screenshots in a writeup — commit the writeup, do
  NOT land a layout change)

**Excluded from autopilot** (need Taylor live): N7 (Bases, needs the real
vault), final decisions on C2 variants, N3 review.

## When the queue is empty

Add a dated "Autopilot complete" section to ROADMAP.md summarizing what
landed and what's [BLOCKED], so Taylor's review starts from one place.
