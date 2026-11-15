# Round 11 progress (paused at Blake's request)

State: all code for round 11 is in the working tree (mockup/ only, nothing committed; base 2fccb7f). Lint is clean and the mockup loads with no console errors (checked: table scenes betting, playing, offers, cut, shuffle, sideways, facedown, win, loss; Settings, Home, Login, sign-up).

## Planner round 10 (`planner-round-10.md`)

| Item | Status | Notes |
|---|---|---|
| B1 Dealt cards fly face down and flip on landing | Done | A card in flight is created `down` with no face image or alt; the face is added at the turn (`flip(el, card)`), which starts at 80 % of the flight. Hands' accessible names call an unlanded card "face-down card" and leave it out of the total. Per-frame trace (`scratchpad/fliptrace.mjs`) passed at 390x844 and 1440x900 (down ~430 ms, edge-on turn, face/alt from the turn, total and count at landing) and under reduced motion. |
| I1 Totals in landscape / many hands | Done | Totals get a 56 px column; four hands fit one centred row on landscape phones (cards capped); a row that does not fit scrolls, with seats wide enough for circle + hand + total. New layout check "a total touches another seat": 1-6 hands at 844x390, 667x375, 1280x720, 1440x900 and 1920x1080 (plus 375x667 and 390x844 for split/playing) = 0 problems on the last run. |
| I2 Landscape betting labels clip; 320 px Deal "auto" | Done, not re-verified | Undo/Clear/Rebet/Pause icon-only in landscape (label kept as visually hidden accessible name); "auto" note hidden under 360 px. No screenshot or target check run yet at 667x375, 740x360, 844x390, 320x568. |
| I3 Felt rules line AA on desktop | Done for the round-10 print; needs re-measuring after Blake's new lettering | Lines 2-3 at full ink 600; lamp pool `.095`, win lamp 1.1, bloom kept below the print, sheen 8 %. New measurement `scratchpad/contrast2.mjs` (brightest pixel per glyph, text opacity included, glyphs under cards skipped, two frames per phase). Last partial run (390x844, 1440x900, 844x390; betting, playing, win) worst 4.56:1 with the new lettering. Full run over all sizes and phases not done. |
| M1 "3 To 2" | Done (superseded) | Now Cinzel: capitals + its small capitals render "3 TO 2". |
| M2 Face image during flight | Done | Fixed by B1. |
| M3 Shuffle covers the print | Done | Recorded as a decision in DESIGN.md §13. |
| M4 Re-take mislabelled motion shots | Not started | `shots/round-11/` not created yet. |
| M5 Layout run incl. 1920x1080 | Partly | 1920x1080 included in the multi-hand layout run above; the full 7-size x 26-scene run (plus 667x375 and reduced motion) not re-run after Blake's notes. |

## Blake's round 10 feedback (BRIEF.md) and the later note

| Item | Status | Notes |
|---|---|---|
| Felt lettering as real ink on cloth (font, spacing, stronger curve, ruled arc lines, cards may overlap) | Done, not fully verified | Cinzel 700 (capitals + small caps) for the payout and insurance lines, Cormorant Garamond 700 for the rules line, loaded from Google Fonts in index.html (OFL; self-host in the build). SVG `#ink` filter (slight weave displacement + 0.28 blur). Arc radius 1.45 x width (was 3.2). Ruled band around "Insurance pays 2 to 1" restored. Fit keeps each line's letter-spacing ratio (the old fit reset it to 0.14 em). The layout check no longer fails cards over the print. Landscape: one Cinzel line. Not yet: DESIGN.md §5/§12 text for the new lettering; full contrast run; landscape/desktop screenshots reviewed. |
| Bet chip never disappears before its flight | Done | `lift()` copies each stack (main, double, insurance) into a moving ghost in the same frame the original hides. Per-frame proof `scratchpad/traces2.mjs`: win, loss, push (with a double) at 390x844 and 1440x900 = copy present in the hiding frame, 0 gap frames. |
| Peek lifts the far edge | Done | `.card.lift .cin`: origin at the near (bottom) edge, `rotateY(180) rotateX(36deg)`; screenshot checked (far edge rises). |
| Shuffle order shoe away > deck down > riffle > deck up > shoe back, no vanishing | Done | Rewritten `shuffleFx()`; the discard pile slides away with the shoe and empties. Per-frame proof (`traces2.mjs`) at 390x844 and 1440x900: exact order, deck on the felt ~840-3730 ms with a card showing in every frame, shoe returns after the deck leaves. |
| Balance badge only when the balance changes | Done | `bump(d)`: chip placed, betting actions, double/triple, split, insurance, payout > 0; nothing on a loss. Proof (`traces2.mjs`, 390x844): bet "-$25", loss none, win "+$50", push "+$25". |
| Discard pile a straight stack, partly off the top-left | Done, not screenshot-checked | Square card back at the top-left corner, partly off; sweep lands square on it. |
| Cards flip face down as they are swept (same 3D turn; reduced motion: appear face down) | Done, not verified | Each swept copy gets `flipping` + `down` at its start (CSS edge-on turn). No mid-sweep trace or shot yet. Reduced motion skips the sweep (pile just grows). |

## Checks run on the current code
- Lint; console-error smoke (above).
- `fliptrace.mjs` 390x844, 1440x900, reduced: ok (run before the lettering, shuffle, chip and sweep changes; the deal path was not touched after).
- `traces2.mjs` 390x844 and 1440x900: chip handoff, shuffle order, balance badge (390 only): ok.
- Layout with 1-6 hands, subset of scenes, 5 sizes: 0 problems (before the lettering change).
- `contrast2.mjs` partial (3 sizes, 3 phases): worst 4.56:1.

## Not run yet (to do on resume)
- Full layout: 7 sizes x 26 scenes x 1-3 seats, plus 667x375, plus reduced motion, plus 4-6 hands; EU print run.
- `contrast2.mjs` over all 9 sizes and 8 phases; `uicontrast.mjs` (axe) in both modes.
- Settings QA x3 (the print check was updated to "Blackjack Pays", case-insensitive), rules play, frame recording x3, `fliptrace.mjs` re-run, `traces2.mjs` badge at 1440.
- DESIGN.md: §13 covers the planner items; Blake's round-10 notes (lettering, peek, shuffle order, badge, straight pile, face-down sweep, chip handoff) still need their DESIGN.md entries (§3 Motion rows, §5 felt print and shoe/discard rows).
- `shots/round-11/`: true face-down flight, mid-flip, mid-sweep turn, discard pile at rest, shuffle steps, peek, chip handoff, new felt print (phone/desktop/landscape), landscape 4-hand totals, landscape betting dock, 320x568 dock, desktop print between rounds.
