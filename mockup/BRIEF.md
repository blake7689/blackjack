# Blakejack mockup: design brief (Blake's decisions, 2026-11-12)

Blake rejected the previous mockup: "it lost all of the uniqueness and looks like AI made it". Goal: **the most badass blackjack app ever**, production-ready, perfect at every size. This mockup is the design target for the build PRs #79-#87 (epic blackjack#4; spec `D:\repos\second-brain\01-Projects\Blackjack\Specs\UI revamp.md`).

## What was wrong (all of it, per Blake)
- Nothing looks real.
- The gold serif + brass + leather "luxury" cliché.
- Template layout (felt oval, pills, dock that reads like every card-game template).
- Fake-looking cards, chips and shoe (CSS approximations).
- Settings looks like a generic SaaS dashboard.

## Decisions
| Topic | Decision |
|---|---|
| Direction | **Modern dark premium**: near-black, crisp type, one bold accent, felt only on the table itself, minimal ornament. |
| References | **Live-dealer apps** (Evolution-style: real table, overlay UI, clean betting dock) and **premium indie card games** (Balatro / polished solitaire: strong art direction, few buttons). Research the top-rated blackjack and live-casino apps and say what is taken from each. |
| Keep from today's app | Its **realistic cards** (`public/cards/*.png`, real card faces) and its **overall simplicity**: the cards and the play take the space, little chrome. |
| Realism | **Real objects, modern UI**: photo-real cards, chips and shoe on the table (images or rendered-looking art with real lighting and shadow); all UI (dock, buttons, Settings) flat, modern and dark. |
| Accent | **Emerald green**. |
| Motion | **Cinematic live-dealer**: smooth, weighty, realistic: cards slide, chips glide, soft lighting changes on results. Respect reduced motion. |
| Camera | **Top-down with depth**: overhead, square to the screen, but real lighting, shadows and card/chip thickness so it feels physical. |
| Themes | **Felt + UI themes**: felt colours (green default, blue, red) AND UI themes: accent choice (emerald default + a few others) AND dark/light mode. |
| Priority | **Phone first** (portrait); desktop scales from it and must still look designed. |
| Type | **Geometric sans** (e.g. Inter Display, Satoshi, General Sans). No serif clichés. |
| Actions | **Bottom dock** in thumb reach (as the spec says): betting and playing states at one fixed height. |
| Brand mark | Designer's choice: propose 2-3 options (wordmark, monogram, card-based mark) in round 1. Brand text is "Blakejack". |
| Check-ins | Blake sees screenshots **after every round** (engineer and planner). |

## Round 1 feedback (Blake, 2026-11-13): right direction, "I like a lot of it", fundamentals still wrong
- **Cards look cut off.** Every card must read clearly: the rank and suit corner of every card always visible, no card looking cropped by the fan, the felt edge or another element. Less overlap, real proportions.
- **Proportions are off** overall and it looks weird. Rebalance cards, chips, spot, print, shoe and dock against each other like a real table seen from above.
- **Chips look cartoonish.** Make them realistic **ceramic** chips (flat printed ceramic face with fine artwork, subtle gloss, thin edge, real casino proportions) and **smaller**. They must **never clip** an edge anywhere.
- **Chip stack takes less space**, and stacks currently go **the wrong way**: a stack must build like a real stack seen from above with depth (each chip offset slightly up the screen, thickness showing on the lower edge, the top chip fully visible).
- **Drop the dealer chip tray**; it is unnecessary.
- **Shoe:** not proportionally right. Instead, only the corner of the top card sticking out of a shoe that is out of sight (off the edge of the table/screen). Think sophisticated, understated.
- **Brand:** Blake hates the BJ monogram. Use a **"Blakejack" wordmark** instead (designed logotype, no monogram anywhere, including the card back).
- **Settings, simplify while keeping all functionality:**
  - No long descriptions; details subtle and concise. Minimal house-edge verbiage (a small figure, no paragraph).
  - Preset types take up far too much space. Presets exist only to set the rules to that house's values: a compact preset selector (e.g. one segmented row or select) at the top of the rules.
  - Settings are **sections that separate the game settings** (e.g. Dealer, Payouts, Doubling, Splitting, Surrender, Shoe, Gameplay...). Choosing a preset changes those settings to its values; changing any rule by hand makes the preset read **Custom**.
- **Count:** show both the **running count and the true count** (running count / decks remaining) when the count is on.
- Felt print: keep "BLAKEJACK PAYS 3 TO 2" unless told otherwise.

## Round 2 feedback (Blake, 2026-11-13)
- **Keep:** the Blakejack wordmark (he likes it).
- **Split, one hand at a time:** after a split, only the hand being played gets its second card; the next split hand gets its second card when play moves to it (as at a real table), not both at once.
- **Count and true count follow today's app logic:** Hi-Lo values from `src/utils/cards.js` (`card.count`), running count over cards seen only (the hole card counts when revealed), `trueCount = round(running / max(1, cardsRemaining / 52))` (an integer), reset on a new shoe, values hidden while dealing (`dealingStyle`). See `countSeen` in `src/utils/gameReducer.js` and `CardCountDisplay.jsx`.
- **Cards unreadable on large screens and fuzzy on mobile; edges still slightly cut off on both.** Cards must be crisp at every size and DPR (no upscaled bitmaps, no blur from transforms/filters/fractional scaling; use the sharpest source or render faces as vector) and fully whole, with no edge cropped.
- **The shuffle can't be seen at all.** Make it clearly visible and understandable.
- **Totals update before the card lands/flips.** The player and dealer totals must change only once the card has landed or the hole card has flipped.
- **Cards glitch when landing.** Smooth landings, no jump, double render or snap.
- **Centre felt words are cut off on both sides.** The print must sit fully inside the felt at every size.
- **Drop "hand 1 of 2"**: the highlighted bet spot and the lighting are enough.
- **Appearance: Accent and Mode are not clickable.** Fix them (and test every Settings control by clicking).
- **The +/- balance change badge shows too long** and can confuse: short, clear, then gone.
- **Dealer cards lie as dealt, like the player's:** the same overlap direction and order (each new card on top of the previous, to the right), except the face-down hole card. Never a middle card on top of both neighbours. User-friendly reading.
- **The top-left drop-down must not include the wordmark/brand screen**: that's demo only (move it into the Demo panel if kept).

## Round 3 feedback (Blake, 2026-11-13)
- **Can't split K + 10 in play.** Splitting must follow today's app: `canSplit` in `src/utils/blackjackLogic.js` compares card **value** (any two ten-value cards split), plus `maxSplitHands` (0 = unlimited) and `resplitAces`.
- **Balance in the top bar is fixed in place**, not right-aligned: it must not move when the count box or other content changes width.
- **All the blackjack logic must make sense and match the app's rules** (`src/utils/blackjackLogic.js`, `gameEngine.js`, `gameReducer.js`, `rulePresets.js`, and the Gotchas in the repo's CLAUDE.md): naturals vs 21, soft totals, dealer S17/H17, peek / no peek / EU hole card, doubling rules (`doubleOn`, DAS, never on split aces), split aces one card unless `hitSplitAces`, resplit aces, surrender (late/early/earlyNoAce, never after split or double), insurance and even money only when offered, payouts (3:2, 6:5 rounded to cents), `noHoleCardLoss`.
- **Add the split option as a setting** (Splitting section): "Deal split hands" = **One at a time** (the next hand gets its second card when play reaches it) or **Both at once** (today's app behaviour). The mockup plays both.
- **Felt print matches on every size:** desktop uses the same single centred arc as the phone (between dealer and player), not text split into the top corners.

## Round 7 feedback (Blake, 2026-11-14)
- **Dealer's first card always stands alone**: never overlapped by the hole card or later cards (a clear gap after the up card; the rest fan as dealt after it).
- **New setting: show hand totals** (on/off, default on) for the player and dealer total pills. A display setting, not a rule key (no LEGACY_RULES / RULE_SINCE; not in RESET_SETTINGS or presets). Off hides every total pill, including during play.
- **Settings:**
  - Rule presets as a cool, compact **dropdown** (custom-styled select/listbox in the design system, showing the preset name and its small house-edge figure; "Custom" when edited).
  - Dealer's second card: rename "No hole card" to **"No second card"** (Peeks / No peek / No second card).
  - **Sections collapsible, collapsed by default** (each section header shows its name and a short current-value summary; keyboard and screen-reader friendly).
  - Move **"Blackjack on split"** into **House variations**.
  - In Settings, the hand is **"blackjack"** (e.g. "Blackjack pays", "Blackjack on split", "If the dealer has blackjack"). "Blakejack" is only the app name. This overrides the spec's Brand list for Settings labels; the felt print and the player's natural badge on the table keep "Blakejack" unless told otherwise. Record it in DESIGN.md §0.
  - **"Danger zone" has no title**: just the delete action, set apart at the bottom.
- **Top bar:** the balance is **centred** at the top of the screen (fixed, never shifting), and the bar is **sleeker** (less height and chrome; menu, wordmark, balance, count and settings balanced).

## Round 8 decisions (Blake, 2026-11-14)
- Settings keeps "No second card", and the felt print's mode line says "NO SECOND CARD" to match.
- The Table rules sheet says "blackjack" for the hand, like Settings; "Blakejack" stays only on the felt payout line and the natural badge.

## Round 9 feedback (Blake, 2026-11-15)
- **Felt print says "BLACKJACK PAYS 3 TO 2"** (not Blakejack). "Blakejack" stays as the app name and the natural badge.
- **Settings needs more contrast between sections:** section headers, section bodies and groups blend together. Make headers clearly distinct from bodies (surface, weight, dividers, spacing) in dark and light mode, keeping AA.
- **Dealer's first card goes back to the normal overlap** (as before round 8: the dealer's cards fan like the player's, laid as dealt, the hole card face down). Drop the up-card gap.
- A phone screen recording of another blackjack app was offered as inspiration for **minor** tweaks only (card animations, flips, cut card, shoe and discard placement, felt writing, card overlaps). Nothing from it is changed until Blake approves each tweak.
- **Approved tweaks from the recording (Blake, 2026-11-15)**, all minor, layout unchanged:
  - **Tighter overlap:** earlier cards show only their corner strip (rank + suit fully readable), the newest card whole; hands stay compact. Dealer and player alike.
  - **Cards fly face down from the shoe with a slight angle and turn over as they land** (the hole card stays down).
  - **3D edge-on flips** for every turn (landing, hole card, face-down double reveal).
  - **End of round: cards sweep off to the discard pile** (instead of fading).
  - **Discard pile at the top-left corner**, partly off the felt, mirroring the shoe at the top-right; it grows through the shoe and empties at the shuffle.
  - **Cut card, once drawn, rests at the left edge of the felt**, partly off it, until the shuffle.
  - **Shuffle plays in the centre of the felt**, then the deck slides back into the shoe.
  - **Felt print in the recording's style:** two lines on a gentle arc, "BLACKJACK PAYS 3 TO 2" in small caps and a smaller, lighter line below ("Dealer hits soft 17 · Dealer peeks" / "No second card"); no ruled lines or insurance band box; insurance as a third small line when on. AA contrast still required.
  - Results: keep our verdict line (no change).

## Round 10 feedback (Blake, 2026-11-15)
- **Felt lettering looks wrong:** fix the letter spacing and pick a better font so it reads like **real printed lettering on the felt itself** (ink on cloth: slightly soft, follows the weave, not UI text). **Curve it more.** Bring back the **ruled arc lines** he liked. **Cards may overlap the lettering** (it is printed on the cloth, under the cards). AA contrast still applies to the text where it isn't covered.
- **The player's bet chip disappears for a moment before its animation:** no gap; the chip stays visible until the moving copy takes over (same frame).
- **Peek check:** the dealer lifts the **opposite (far) edge** of the hole card, as a dealer checking it would, not the near edge.
- **Shuffle sequence:** the shoe slides away first, then the shuffle comes down into the centre, riffles, the shuffled deck goes back up, and only then the shoe slides back into place (mirrored in and out). No moment where the stack vanishes.
- **Top-bar balance badge shows only when the balance actually changes** (e.g. "−$25" when the bet is placed, "+$50" when a win pays). A lost hand changes nothing, so no badge. The middle verdict and the dock's win/lose amounts stay as they are.
- **Cards turn face down as they are swept to the discard pile** (a flip at the start of the sweep; the pile is all backs).
- **Discard pile is a straight stack** (square to the screen, like the recording), partly off the top-left edge, not angled into the corner.

## Round 11 feedback (Blake, 2026-11-16): planned as the last run
- **Felt writing and dealer hand sit too high:** centre the writing vertically between dealer and player without crowding the player area, and give the dealer's cards a little room at the top.
- **"Blackjack", not "Blakejack", for the hand everywhere in play:** the natural badge/pill ("Blackjack!"), the result tag, the verdict, and the end celebration, for player and dealer. "Blakejack" is only the app name (wordmark, title, card back).
- **Count:** it shifts sideways awkwardly when its value changes (use fixed-width numerals / a fixed box), and the values must not disappear each round. This overrides the app's hide-while-dealing behaviour: record it in DESIGN.md §0.
- **Hide dock actions whose setting is off:** Surrender when surrender is "none", Triple when triple down is off, and any other action or offer turned off by a setting (e.g. insurance). Never show them greyed with "Off".
- **Possible bug:** after a split where the first hand makes 21 with A + ten, the second hand with two ten-value cards could not split. Reproduce; if real, fix so it matches the app's engine (`canSplit` by value, `maxSplitHands`, the split-aces rules), and add it to the rules audit.
- **Peek check:** replace the far-edge lift with the casino mirror check: the hole card slides up a short way (its top edge just tucks under the top of the felt/view), with most of the card always visible, then slides back down into place. It must **never leave the screen fully**, or it looks like the card is being swapped.
- **Cut card and discard pile:** leave clear room between them.
- Answers (same day): the count updates **live per card** (as each card lands face up; the hole card when it flips). Actions not possible on this hand stay **greyed** (setting-off actions are hidden). Keep the DEMO edge tab. Keep the current Blackjack celebration. **Per-hand result tags only with 2+ hands** (one hand: verdict + dock only). Defaults stay green felt, emerald, dark. Sound stays with #86 (mockup silent).

## Round 12 audit answers and notes (Blake, 2026-11-16/17)
- **Chip tap:** first tap on a rack chip only selects it; a tap on the bet circle bets it (overrides the spec's one-seat "tap bets" rule).
- **Table limits:** none now (play money); a `later` issue for per-preset limits.
- **Shuffle:** duration scales with Game speed (about 1.5 s on Very fast) and a tap skips it.
- **Include cut card:** a switch in the Shoe group, as today; with it off, a mid-round refill plays a short shuffle.
- **Balance badge on the auto rebet:** when a new round re-places the bet (Rebet / reset bet), the top badge must show the deduction ("−$25"), like a manual bet.
- **Setting hints:** a long press (mobile) or hover (desktop) on a setting's name shows an extremely short description (a few words, one line).
- **Settings sections are an accordion:** only one open at a time; opening one collapses the other.
- **Kept as is:** count on by default; results dock keeps the balance; red "−$25" bet badge; the full-size resting cut card; out of credits = hidden top-up only (no follow-up); all four fonts; light mode leaves the felt and cards unchanged; the insurance "No thanks" nudge; "Deal split hands" defaults to One at a time (#133); landscape betting keys icon-only; the sideways double stays sideways.
- **Changed:** the peek's duration scales with Game speed (like the shuffle); a signed-in player opens straight onto the table (Home in the menu), a signed-out player sees Home; the "Blackjack!" badge always shows, even with "Show hand totals" off.

## Round 13 answers (Blake, 2026-11-17)
- **Chips: single click/tap selects, double click/tap adds that chip to the circle** (tapping the circle still bets the selected chip). Keyboard mirror: pressing a chip's number key once selects it, twice in a row adds it.
- **Setting hints: a small "i" after each setting name shows the hint on tap** (and on hover/focus on desktop), replacing the long press.

## Still binding from the approved spec and earlier feedback
- One column, **dealer always above the player** at every size, play always horizontally centred.
- The table must **fit the screen with no vertical scroll** while playing (375x667 up to 1440x900, and 844x390 landscape with dealer still on top).
- **One seat by default** (multi-hand is #59); a demo-only seat switch (1/2/3) shows the layout copes; splits add seats.
- Win payouts move **down** toward the player, losses sweep **up** to the dealer.
- The shoe is a real dealing shoe; the cut card is invisible until drawn.
- Rack chips never clip. Result banners never cover the cards or totals.
- Scope items from #78: felt print following the rules (3:2 / 6:5, soft 17, insurance, hole-card mode line), dock betting state (chip rack, Undo, Clear, Rebet, 2x, Deal, auto deal Pause/Resume), dock playing state (Hit, Stay, Double, Split, Surrender, Triple when allowed, Next hand), the offers step (Insurance $x, Even money, Surrender, No thanks) at the same height, result banners (WIN, LOSE, PUSH, BUST, SURRENDER, EVEN MONEY, Blakejack!), insurance stake beside the bet spot, US peek check, shuffle, cut card, one-page Settings with a sticky Save/Discard bar and #91's rules section (preset tiles Vegas / Atlantic City / Europe / Australia / Singapore + Custom with house edge, Customize, House variations, Advanced), Gameplay, Chips, Appearance, Sound & haptics, Account, Danger zone.
- 44 px touch targets, 12 px minimum text, AA contrast, the hidden top-up's balance has no role/tabindex/aria.
- The top strip keeps: balance with change badge, count pill (when on), the shoe, menu/rules/analytics entry; a reserved, empty tip slot (#3).
