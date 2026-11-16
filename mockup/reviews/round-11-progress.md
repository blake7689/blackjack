# Round 11 progress: complete

Every round-11 item is done and verified (mockup/ only, not committed; base a9bcaba). Vite on 5173 was down when work resumed, so the checks ran against a temporary static server on 5179 (stopped afterwards).

## Planner round 10
| Item | Status |
|---|---|
| B1 dealt cards fly face down, flip on landing | Done. Per-frame trace (390x844, 1440x900, reduced): `down` ~430 ms with no face image or alt, edge-on turn, face from the turn, total and count at landing. |
| I1 totals with several hands / landscape | Done. Own 56 px column; four hands in a centred landscape row; rows that do not fit scroll with seats wide enough. Layout 1-6 hands at 8 sizes: 0 problems. |
| I2 landscape dock labels; 320 px "auto" | Done. Icon-only small keys (names kept), Deal at least 96 px ("Shuffling" fits), "auto" hidden under 360 px. New check: no cut key label at 568x320, 667x375, 740x360, 844x390, 320x568, 375x667: 0 problems. |
| I3 felt contrast | Done. Brightest-pixel measurement, every glyph not under a card or a moving chip, 8 phases, 9 sizes, 3 felts x 2 modes: worst 4.56:1 (1280x720 and 1440x900, win). |
| M1-M5 | Done ("3 TO 2" via Cinzel; flight face image gone; shuffle-over-print decision recorded; motion shots retaken; 1920x1080 in every run). |

## Blake's round 10 notes
| Item | Status |
|---|---|
| Felt lettering as ink on cloth | Done (Cinzel / Cormorant Garamond, ink filter, strong arc, ruled band, fixed tracking, cards may overlap). DESIGN.md section 14. |
| Bet chip never disappears before its flight | Done; per-frame proof (win, loss, push with a double; 2 sizes). |
| Peek lifts the far edge | Done; shots. |
| Shuffle order, nothing vanishes | Done; per-frame proof (2 sizes). |
| Balance badge only on a change | Done; proof (2 sizes). |
| Discard pile a straight stack | Done; shots. |
| Cards turn face down as they are swept | Done; per-frame proof (2 sizes + reduced). Swept copies and turning cards carry their shadow on their faces (no flat slab). |

## Checks on the final code
Layout 546 states (7 sizes x 26 scenes x 1-3 seats), 667x375 78, 4-6 hands 240 states at 8 sizes, reduced motion 546, EU print 40: 0 problems. Settings QA 245 checks x 3 sizes: 0 failed. Rules play 16/16. Frame recording x 3 sizes: clean. UI contrast (axe) every accent x felt x mode at 390x844 and 1440x900: 0 failures. Felt contrast as above. Lint clean, no console errors.

Shots: `shots/round-11/` (37).
