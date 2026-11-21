---
description: Implement one phase of the mobile film edit panel redesign
argument-hint: <phase number 0-5>
---

You are implementing **Phase $ARGUMENTS** of the mobile film-engine edit panel redesign.

The handover lives in `docs/handover-mobile-film-panel/`. Before doing anything:

1. Read `SPEC.md`, `PLAN.md` and `QA.md` in that folder.
2. If `NOTES.md` exists there, read it. It maps the spec to this codebase. If it doesn't exist and the phase is not 0, stop and ask me to run `/film-panel 0` first.
3. Open `mockups/option-a.html` (or `option-b.html` for phase 5) as the visual reference. Don't copy its code verbatim; adapt to this codebase's framework and conventions.

Then:

- Do **only** the tasks listed under Phase $ARGUMENTS in `PLAN.md`.
- Phase 0 is read-only: write `NOTES.md` and stop.
- Restrict changes to viewports ≤ 600px and non-basic engines. Desktop and the Basic engine must not change.
- Use variables from `tokens.css`; don't hard-code colours.
- Don't add dependencies without asking.
- Parameter lists come from the engine definitions in the code, never from the mockup (its params are placeholders except Scan black/white point).

When done:

- Summarise what changed (files + one line each).
- Go through the phase's **Acceptance** list in `PLAN.md` and mark each item pass / not yet, with how you checked.
- Tick the completed task checkboxes in `PLAN.md`.
- Stop and wait for review before starting the next phase.
