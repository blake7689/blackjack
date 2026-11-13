# Planner review of round 4 (Opus, high) — verdict: revise

Triage by the branch thread (what the engineer does now):
- DO: B2, B3, B5, I1-I12, M1-M6 (M7 note in DESIGN.md only).
- DO (handoff): B6 — DESIGN.md gets an "Overrides the approved spec" table (each item: spec says / mockup decides / why), and states DESIGN.md is the design authority for #79-#87. The thread updates the vault spec itself later via scribe.
- WAIT for Blake: B1 (split-deal default and its own issue), B4 (sideways double / face-down double). Leave both as they are until told.
- DONE by the thread: B7 (mockup committed locally on feature/78-ui-mockup).

## Already excellent (do not change)
- Fit: no page scroll and no clipping at any size or scene; no text under 12 px or target under 44 px. The 6-seat row scrolls with fades as intended.
- Rules: `rules.js` matches the app (offersAtDeal, presets, house edge, K+10 split, soft totals "1 / 11", peek, payouts, surrender amounts).
- Art direction: the wordmark card back, ceramic chips, result light, the one verdict line, the shoe corner with the cut card.
- Dock one height in every state; totals change only after landing; balance fixed with no role/tabindex/aria; auto deal Pause + progress; the 1280x720 split layout.

## Blocking
1. "Deal split hands" is a new game rule no build PR owns; default "One at a time" changes today's behaviour (needs reducer step, SETTINGS_VERSION bump, LEGACY_RULES "both", RULE_SINCE, sanitize; existing saved settings would keep "both"). → Blake decides.
2. Settings shows EU-only rules in US modes, and preset matching counts hidden rules (`mockup.js:68-75`, `presetOf` at `mockup.js:29`). Fix: the spec's `showWhen` (hide dealerDrawsOnPlayerBlackjack, dealerDrawsOnPlayerBust, dealerDrawsOnceOn21 in US modes; hide blackjackPaysImmediately under US peek) and ignore hidden keys in `presetOf`.
3. Four of the app's 12 chip values have no design (`ALLOWED_CHIPS` has 10K, 20K, 50K, 100K; mockup has 8). Add them in the spec colours (10K pink, 20K light blue, 50K purple, 100K grey) and define the rack for 9-12 chips (scroll with snap and edge fades, as the spec says; chips must still never clip).
4. Doubles drop shipped behaviour: today the double card lands sideways; the face-down double (#66) has no design. → Blake decides.
5. Settings save flow not designed: leaving Settings with unsaved changes must confirm (spec); the mid-round "this resets the table" confirm at Save is missing; the inline profile-field error state is missing. Add all three.
6. The approved spec is out of date on Blake's later decisions (preset tiles vs compact selector, collapsed groups vs flat sections, top-strip shoe vs shoe corner, card width 44-120 vs 40-156, max 6 chips per stack vs 10 in one column, scrolling rack, fonts, brass vs modern dark). Fix: an overrides table in DESIGN.md naming it the authority.
7. `mockup/` was untracked. (Done: committed.)

## Important
1. Felt print fails AA contrast (3.5:1 green, 3.8 blue, 4.1 red for 12 px text, inside SVG so axe misses it). Raise `--print` (~80%) and use weight 600 on the 12 px lines; verify ≥4.5:1 on every felt, dark and light.
2. Landscape (844x390) print still splits into two corners; Blake said the print must match on every size. Make it one centred block/arc there too (shrink it), keeping the no-scroll fit.
3. Sound and haptics on by default (`mockup.js:91`); spec says off. Remove the extra "Card sounds" toggle (not in spec). Disable the Volume and Auto deal delay sliders while their toggle is off.
4. Brand strings: rule labels still say "Blackjack Pays", "If the Dealer Has Blackjack…", "Blackjack on Split", "Blackjack Pays Immediately", "…Player Blackjack" (`mockup.js:50,52,69-71`). Use "Blakejack" per the spec's Brand list. A natural shows a "21" pill: show a "Blakejack!" badge on the hand (spec).
5. No top safe area: add `viewport-fit=cover` handling with `env(safe-area-inset-top/bottom/left/right)` once, for an installed iPhone app.
6. Wide desktop (1920x1080): top bar, felt and dock use three different widths; betting state is a huge empty felt. Share one max-width column for top bar, felt and dock; give the empty betting felt structure (the print/arc and spot carry it).
7. Hole-card mode split across two controls ("Second Card" segment + an Advanced switch). Make it one three-way choice: Peeks / No peek / No hole card (matching the felt print mode line), mapped to dealerHoleBehaviour.
8. Screens the build PRs need have no design: the Table rules sheet (from the menu and the felt print), Home (logo, Play, Rules, Settings), Login (with labels; placeholders kept), loading and error states, "Reconnecting..." and notices on the message line, the hidden top-up code prompt (#90: nothing in the DOM before 7 taps, one generic refusal message), and an out-of-credits state. Design them all in the same system.
9. Tip slot: spec wants a reserved, collapsible line above the dock (empty for now). Put it there, not in the top bar; it must not change the layout when empty.
10. Keyboard: add I and E at the offers (plus N), 1-9 to pick a chip, U undo, with visible key hints consistent with the dock's existing hints.
11. "Last hand before the shuffle" never appears in real play: show it on the message line when the cut card is drawn.
12. Label casing mixed: use sentence case everywhere; don't repeat the selected value in a label ("Max hands after splits", not "...: 4").

## Minor polish
1. The count starts at +3 / +1 on a fresh shoe: start at 0.
2. 6-seat scene: the dealer total sits ~33 px from the cards (dealer laid out before seats resize); lay out the dealer after the seats.
3. While shuffling the rack looks enabled; dim/disable it outside betting.
4. "INSURANCE PAYS" uses the even-money colour and hides that the main bet lost: show both clearly.
5. Half-dollar amounts drawn as an extra $1 chip overstate the bet: draw no chip for the cents (the label is exact).
6. With several hands, dim the inactive hands slightly.
7. Card face PNGs are ~4.7 MB: note WebP conversion for the build in DESIGN.md.
8. HANDOFF.md and SHADES.md are superseded: delete them (DESIGN.md is the one handoff doc).
