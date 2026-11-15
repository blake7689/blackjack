# Planner review of round 10 (Opus, high): verdict revise

Confirmed working: felt print wording and style, Settings section cards (AA in both modes), dealer overlap at 0.27, the 3D hole-card flip (no face in DOM before the turn, total waits), the sweep, discard pile and cut card (never cover anything, 8 sizes), centre shuffle, reduced motion, round-9 link targets.

Planner's frames and scripts: C:\Users\Blake\AppData\Local\Temp\claude\af96b080840a67b7\8625a56c-f317-4134-a7b5-8a38a8f32a84\scratchpad\planner\r10\

## Blocking
1. Cards dealt face up never fly face down and never flip as they land: the first dealt card never has `down`, its inner element never rotates, its face image shows the whole flight. `flip()` removes a `down` class the card never had (`mockup.js:440-443`); `cardEl()` gives `down` only to cards that stay hidden (`mockup.js:220-222`). The round-10 shots named "in flight face down" / "mid flip" show face-up cards. Fix: a card that will fly in starts with `down` and NO face image; at landing call `flip(el, card)` (the hole card's working path), which adds the face. Totals and the count wait for the flip.

## Important
1. Landscape phone with four hands: each total sits on the next hand's bet circle (844x390, 667x375; `r10\pills-844x390-3-split.png`), and the row starts off centre. At 1280/1440 with six hands (Unlimited splits) totals touch the next circle. Fix: in landscape with several hands put the total above/below the cards or reserve its width in the seat; keep the row centred.
2. Landscape betting buttons clip their labels (Undo, Clear, Rebet, Pause at 667x375, 740x360, 844x390); at 320x568 the "Deal / auto" label clips. Fix: icon-only buttons in landscape (keep the accessible names in DESIGN.md §9); drop the "auto" note under 360 px.
3. Felt rules line under AA on desktop between rounds: the 14 px lines 2-3 at 81 % opacity measure 3.89:1 (green) / 4.17:1 (blue) at 1440x900 and 1920x1080 over the light pool; phones 4.56-5.35. Fix: full opacity and/or weight 600 for lines 2 and 3; re-measure over the brightest felt pixel in every phase at every size.

## Minor
1. Small-caps payout renders "3 To 2": use lowercase "to" in the source.
2. A dealt card's face image (and alt) is in the DOM during the flight; Blocking 1's fix (add the face at the flip) removes it.
3. The centre shuffle covers the print's lower lines for 2.6 s: accepted (matches the recording); record it in DESIGN.md as a decision.
4. Re-take the mislabelled `motion-*-card-in-flight-face-down.png` / `motion-*-mid-flip.png` shots after the fix.
5. The planner's layout run timed out before 1920x1080: include that size in your re-run.
