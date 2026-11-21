# PhotoKamo redesign – handover

1. Copy `CLAUDE.md` to the repo root (merge if one exists).
2. Copy this folder (SPEC.md, TASKS.md, mockups/) to `docs/handover/` in the repo.
3. In VS Code with the Claude extension, open the repo and send:

   > Read `CLAUDE.md`, `docs/handover/SPEC.md` and `docs/handover/TASKS.md`. Do **T1** only. Show me the plan first, then implement. Stop after the T1 checks.

4. Verify the Check list, commit, then ask for T2, and so on through T9.

| File | What it is |
|---|---|
| `SPEC.md` | Decisions, current-code facts, data model, render pipeline, per-screen acceptance criteria |
| `TASKS.md` | T1–T9, ordered, each with a Check list |
| `CLAUDE.md` | Repo rules for Claude (run, layout, constraints) |
| `mockups/` | A–I screens rendered from the design canvas |

Design canvas (editable): https://claude.ai/code/artifact/d35862b2-b86a-4208-9c45-e8718164854e
Note: the filmstrip "photos" in the mockups are crops/tints of the one sample image, and look thumbnails are approximate grades.
