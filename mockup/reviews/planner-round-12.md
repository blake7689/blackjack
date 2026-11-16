# Planner full audit after round 12 (Opus, high): verdict revise

Blake's round-11 notes all confirmed working. Planner frames: C:\Users\Blake\AppData\Local\Temp\claude\af96b080840a67b7\8625a56c-f317-4134-a7b5-8a38a8f32a84\scratchpad\planner\ (r12\, out\r12\).

Triage (branch thread): engineer does B2, I1, I2, I3 (with Blake's answer on Q4), I5, M1, M3, M5 now. B1 and I4 are the thread's (push after sign-off, Blake approved; scribe/spec and issue links). M2 (font licence) is recorded as a build-PR task. Q1-Q18 go to Blake; answers are appended here.

## Blocking
1. The mockup branch exists only on this PC. (Thread: push on sign-off, as Blake approved.)
2. Desktop: four split hands + a double make every bet circle and stack drop to 0x0 at 1280x720 and 1440x900 (first hand's "$50" half off the felt; `r12\split4dbl-1440x900.png`); the felt print's 3rd line renders ~11 px. At 844x390, 3 demo seats + a split cuts a double chip at the felt edge (`r12\split-double-844.png`). Fix: give the desktop multi-hand row the same card-width cap and side-stack column landscape got in round 11; re-render the print whenever its box changes; add these states to the layout suite (and fix the suite's renamed "BLAKEJACK" scene so the broad run completes).

## Important
1. DESIGN.md contradicts itself: §8-§15 round logs override §0-§7 that were never edited (count hidden while dealing; print fonts Clash 12-18 px vs Cinzel/Cormorant; --print 62% vs 96%; lamp 1.5 vs 1.1; badge "after a round" vs every real change; landscape print split vs one line; totals above hand vs own 56 px column; scroll rules; rack "no scrolling" vs whole-chip scroll; natural badge "Blakejack!" and "no ruled lines"; far-edge peek vs mirror peek; §1 "flash on Blakejack"; header "rounds 1-3"). Fix: one pass folding §8-§15 into §0-§7 so each topic is stated once and current; move round logs to an appendix marked history.
2. Winnings land on the player's cards on wide and landscape screens (payout stack "beside the stake" where the circle is left of the hand: up to 77% of a chip over a card for ~1.3 s at 1440x900/1280x720, 61% at 844x390). Fix: land winnings on the circle's outer side in those layouts.
3. The app's "Include cut card" setting (`includeCutCard`, in RESET_SETTINGS) is missing; with it off the shoe refills mid-round and there is no design for that; the new shuffle takes 4.55 s. Fix: per Blake's answer to Q4 below; design the mid-round refill with a short shuffle.
4. Build issues #79-#87 and the spec don't reference DESIGN.md and still carry overridden criteria. (Thread: scribe spec update + a "Design:" line on each issue.)
5. Focus lost after Deal (dock rebuilt, focus on body). Fix: move focus to the action keys on the player's turn and to the offers at OFFERS; document where focus goes in each state in DESIGN.md.

## Minor
1. Count box pushes numbers to its far right ("Count      0"): tighten or centre.
2. Fontshare licence for Clash Display / Satoshi unsettled: record as a #79 task (self-host, CREDITS.md).
3. Demo "Offers" scene with insurance off opens offers with only "No thanks" and "Surrender?": make the scene respect settings.
4. Resting cut card is a large yellow block (~43x255 at 390x844): see Q9.
5. Felt print scaled by its SVG box: guarantee no glyph under 12 px in any box size.
