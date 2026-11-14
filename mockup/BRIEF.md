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
