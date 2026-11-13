# Planner review of round 5 (Opus, high): verdict revise

All round-4 items confirmed fixed in the running mockup (B1-B7, I1-I12, M1-M8). Triage: DO everything below; B2 follows the spec (profile error doesn't block the settings save).

## Blocking
1. Reset confirm promises bets come back; the app keeps them once dealt (`resetTable` refunds only an undealt circle bet, `src/utils/gameReducer.js:172`; today's prompt says "Any bets will be lost", `src/pages/Settings.jsx:22`). Fix `#resetDlg` text: "The hand in play ends and any bets on it are lost." Match DESIGN.md §8.
2. A profile error blocks every settings save (Save disabled, "Fix 1 field to save"). Spec: profile first, settings regardless; a failed/invalid profile stays dirty with its inline error. Fix: Save saves the settings, keeps the name field unsaved with its error, bar reads "1 unsaved change".

## Important
1. Landscape phone and wide desktop: side stacks (double, insurance) cover the main bet stack (`1440x900-sideways.png`, `844x390-facedown.png`, `ins-1440.png`). Put side stacks beside the circle (outer side or above), never over it; check every layout.
2. Out-of-credits still has live controls: Rebet enabled at $0 (`mockup.js:376` ignores balance); the bet circle keeps its open glow and takes taps. Disable unaffordable Rebet/2x/chips, show the circle idle, keys off (DESIGN.md §8).
3. Login placeholder must stay "Username or Email" (e2e `e2e/fixtures.js:96`, live smoke `e2e-live/live.spec.js:34`); label "Username or email". Design the "Create an account" form (the app's 5 sign-up fields; read `src/pages/Login.jsx`).
4. Leaving the table mid-round (menu Home) needs the confirm the app has: "Leave game and return Home? Any bet in the circle will be lost." (`src/components/Header/Header.jsx:40`), in the existing dialog style.

## Minor
1. Landscape: the felt print button is 24 px tall; make its hit area ≥44 px without changing the look.
2. Rules sheet (`mockup.js:905-909`): mention even money only when it's offered in the mode; use "dealer blackjack"/"Blakejack" consistently (brand word for the player's natural only, as elsewhere).
3. Out-of-credits "⊕" icon reads as "add credits": use an info icon or none.
4. Home hero cards are tilted: use flat cards (no tilt rule), or keep tilt only if rendered crisp; prefer flat.
5. Disabled Volume slider still shows the accent fill: grey it out.
6. Settings section nav cuts off "Sound & ha…" at 390 with no fade: add edge fades / scroll affordance.
7. Face-down double with two seats: the hand isn't centred over its bet circle (`fd2-390.png`).
8. 1920x1080 betting felt is a large empty slab: optional, give it quiet structure if it improves it.
