#!/usr/bin/env fish
# TTasks autopilot driver — one fresh Claude session per batch in AUTOPILOT.md.
# Stop anytime with Ctrl+C; re-running resumes at the first unchecked batch.

cd (dirname (status filename))

set goal "/goal Read AUTOPILOT.md and follow its Protocol: execute exactly ONE batch — the first unchecked one in the Batch queue. The goal is met when that batch's checkbox is ticked in AUTOPILOT.md, its Definition of Done holds (npm run build exit 0 and full test suite passing, both shown in output), items are marked [DONE] or [BLOCKED] in their task file, and everything is committed on feat/ui-polish-autopilot with git status clean. Never push, merge, or start a second batch. Or stop after 35 turns."

while grep -q '^- \[ \] \*\*Batch' AUTOPILOT.md
    set batch (grep -m1 '^- \[ \] \*\*Batch' AUTOPILOT.md)
    echo "=== Starting session for: $batch ==="

    claude --permission-mode auto -p "$goal"
    or begin
        echo "Session exited non-zero — stopping so you can inspect." >&2
        break
    end

    # Safety: if the session didn't tick a box, don't loop forever on it.
    if test "$batch" = "$(grep -m1 '^- \[ \] \*\*Batch' AUTOPILOT.md)"
        echo "Batch was not checked off — stopping. See AUTOPILOT.md / git log." >&2
        break
    end
end

echo "Autopilot finished. Review branch feat/ui-polish-autopilot:"
git log --oneline main..feat/ui-polish-autopilot 2>/dev/null
