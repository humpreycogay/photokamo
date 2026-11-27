# Auto review (plan_workflow.md Task 4)

**Status:** to fill in by the owner. The fixtures in `node tools/workflow-fixtures.mjs` check the mechanics (no new clipping over 0.5 %, deterministic, idempotent, low-/high-key kept, timing); only real photos can say whether Auto looks *better*.

**Done when:** on 20 owned photos, Auto is better or equal on at least 15 and clearly worse on at most 1. No photo has new clipping above 0.5 % (the clip guard enforces this).

## How to review

1. Open the photo, Adjust tab, tap **Auto** (Basic, Original look). Hold to compare (`\`) for before/after.
2. Note the verdict: **better**, **equal**, **worse**, or **clearly worse**, and a few words why.
3. Repeat on 3–5 of them with a Basic preset at 60 % and with a Kamo look.
4. The reasons line under the buttons says what Auto did; copy it into the notes.

Cover: skin tones (several), snow, night, tungsten indoors, mixed light, foliage, a product shot, a high-key and a low-key photo, a strong single colour (sunset), and one already well exposed.

## Results

| # | Photo (kind) | Look | Auto values | Reasons line | Verdict | Notes |
|---|---|---|---|---|---|---|
| 1 | | Original | | | | |
| 2 | | | | | | |
| 3 | | | | | | |
| 4 | | | | | | |
| 5 | | | | | | |
| 6 | | | | | | |
| 7 | | | | | | |
| 8 | | | | | | |
| 9 | | | | | | |
| 10 | | | | | | |
| 11 | | | | | | |
| 12 | | | | | | |
| 13 | | | | | | |
| 14 | | | | | | |
| 15 | | | | | | |
| 16 | | | | | | |
| 17 | | | | | | |
| 18 | | | | | | |
| 19 | | | | | | |
| 20 | | | | | | |

**Totals:** better __ · equal __ · worse __ · clearly worse __

## Known behaviour to watch

- The bundled sample (a warm, backlit portrait) gets Temperature −27 from Auto white balance: the estimators read the golden light as a cast with high confidence. If the set shows Auto cooling intentional warm light, the confidence gate (A§5.3) needs a warm-light guard.
