# Blakejack design system (round 9)

Source of truth for the build PRs (#79-#87). The mockup (`index.html`, `mockup.css`, `mockup.js`, `assets/`) shows every value below; where this file and the code disagree, the code wins. Open it through the dev server: `http://localhost:5173/mockup/index.html` (`#settings`, `#settings/sec-look`, `#brand`; `?clean` hides the Demo tab). `BRIEF.md` holds Blake's decisions and his feedback on rounds 1-3; `RESEARCH.md` says what we took from whom. 

## 0. Authority, and where this overrides the approved spec
**This file is the design authority for the build PRs #79-#87.** Where the approved spec (`01-Projects/Blackjack/Specs/UI revamp.md`) and this file differ, this file wins; the spec will be amended to match.

| Topic | The spec says | This mockup decides | Why |
|---|---|---|---|
| Look | Brass, leather and serif "luxury" | Modern dark premium: near-black UI, one accent, real objects on a lit felt | Blake rejected the first look (round 1) |
| Fonts | One self-hosted display font + system UI | Clash Display (display) + Satoshi (UI), both from Fontshare; self-host one woff2 each | Round 1 direction; licence to be checked |
| Rules presets | Preset tiles with summaries | A compact dropdown (button + listbox) showing the preset and its house edge; "Custom" when any rule is changed (a state, not a choice) | Blake, rounds 1 and 7 |
| Rules layout | Collapsed Customize / House variations / Advanced groups | Every Settings section is collapsible and **collapsed by default**, its header naming it and summing up its values; inside Table rules, flat groups (Shoe, Dealer, Payouts, Doubling, Splitting, Surrender, House variations, Advanced), hidden rules not shown | Blake, rounds 1 and 7 |
| Hole-card mode | "Second card" segment + an Advanced "doesn't check" checkbox | One three-way choice "Dealer's second card": Peeks / No peek / **No second card** (= dealerHoleBehaviour). The same words everywhere the mode shows: the felt print's mode line "DEALER PEEKS" / "NO PEEK" / **"NO SECOND CARD"** (portrait arc and landscape line alike) and the rules sheet ("No second card: the dealer takes it after you play") | Planner I7, Blake rounds 7 and 9 |
| Shoe | A shoe in the top strip | Only the corner of the top card, at the felt's top-right; the shoe is off the table | Blake, round 1 |
| Card width | 44-120 px | 40-156 px, whole pixels, from `--cwr` (section 4) | Readable cards on large screens (round 2) |
| Chip stacks | Up to 6 chips per column, several columns | One column, up to 10 chips, each lifted 6 % of its width | Blake, round 1 (compact stacks that build the right way) |
| Chip rack | Scrolling rack | Whole chips only: evenly spaced when they fit; past that it scrolls by whole chips, no chip cut at rest | Blake: chips never clip |
| Totals | A total pill | Beside the hand (above it with several hands), never on a card; a natural says "Blakejack!" | Blake rounds 1-3 |
| Brand strings | "Blakejack on Split", "Blakejack Pays" … (the Brand list) | **In Settings the hand is "blackjack"** ("Blackjack pays", "Blackjack on split", "If the dealer has blackjack", "Blackjack pays immediately"): Blakejack is only the app's name. The **Table rules sheet uses "blackjack" too** ("Blackjack pays 3 to 2", "Even money on your blackjack"). "Blakejack" stays only on the felt print's payout line ("BLAKEJACK PAYS 3 TO 2") and the player's natural badge ("Blakejack!") (Blake, round 9). Sentence case everywhere | Blake round 7 (overrides the spec's Brand list for Settings) |
| Hand totals | Always shown | A display setting **Show hand totals** (`showTotals`, on by default): off hides every total pill, the player's and the dealer's, in every phase (visibility, so nothing moves) and drops the total from the hands' accessible names. Not a rule key: no LEGACY_RULES / RULE_SINCE, not in RESET_SETTINGS or the presets | Blake round 7 |
| Dealer's cards | Overlapped as dealt | The up card **stands alone**: a clear gap (14 % of a card, at least 8 px) after it; the hole card and later cards fan after the gap | Blake round 7 |
| Top bar | Balance after the wordmark | **Balance centred** on the bar (equal outer columns, so nothing beside it moves it), a sleeker bar (44-52 px, no boxes): menu and wordmark left, count and Settings right | Blake round 7 |
| Tip slot (#3) | Reserved line above the action bar | Kept: `.tip-line` above the dock, 0 px while empty | — |
| Split dealing | Not in the spec | **New rule key `splitDeal`** ("Deal split hands": One at a time / Both at once), default "one" for new players. **Needs its own issue:** `LEGACY_RULES.splitDeal = "both"`, a `SETTINGS_VERSION` bump and its `RULE_SINCE` entry, so saved settings keep today's "Both at once" | Blake, round 2 + B1 decision |
| Doubles | The double card lands sideways (shipped); #66 face-down double | Both designed (section 5): sideways double card; a face-down double lands sideways and face down and turns over at REVEAL_HIDDEN | Blake, B4 decision |

## 1. Direction in one paragraph
Modern dark premium. A near-black room, flat dark UI with one bold accent (emerald by default), and a table that is a real object seen from above: real card faces at real proportions, small printed **ceramic** chips, the corner of the top card peeking out of a shoe that sits off the table, all lit by **one overhead lamp**. The UI never imitates materials; the table never looks flat. Signature moves: the lamp follows the hand in play and the light *is* the result (bloom on a win, a flash on Blakejack, dim on a loss); one verdict line on the felt; the **Blakejack wordmark** (no monogram anywhere) in the top bar and across every card back.

## 2. Real-table proportions
Everything on the table scales from the card width `cw` (a real card is 63 mm wide):
| Object | Real | On screen |
|---|---|---|
| Card | 63 x 88 mm | `cw` x `1.452cw` (the PNG faces carry their own white border) |
| Chip | 39 mm, 3.3 mm thick | `0.6cw`; each chip in a stack is lifted `6 %` of its width |
| Bet circle | about 75 mm | `1.15cw` (narrow seats: `0.6 x seat width`) |
| Card spread | dealers spread about half a card | step `0.62cw`, never under `0.27cw` (the rank and suit corner is 20 % of the card) |
| Card margin | the printed art sits inside a white border | the PNG face is drawn at 94 % inside a white card with `6 %` corners, so no index meets the rounded edge |
| Felt print | about 15 mm capitals | 12-18 px, fitted to the width |

## 3. Tokens

### Theme axes (attributes on `<html>`)
| Attribute | Values | Default |
|---|---|---|
| `data-felt` | `green`, `blue`, `red` | green |
| `data-accent` | `emerald`, `sapphire`, `ember`, `orchid` | emerald |
| `data-mode` | `dark`, `light` (Settings also offers "Device", resolved to one of these) | dark |
The felt and the table objects do not change with the mode; only the UI around them (top bar, dock, Settings) flips. Because these attributes sit on `<html>`, no click handler may look them up with `closest("[data-felt]")` (it matches `<html>`: that was round 2's "Accent and Mode not clickable" bug); the pickers use `button[data-felt]`, `data-pick-accent` and `data-pick-mode`. Likewise never reuse the class `.ghost` (the flying-chip layer) for a button.

### UI colours per mode
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#070908` | `#e6e7e2` | Room, page background, top bar |
| `--bg-2` | `#0c0f0e` | `#f8f8f5` | Dock surface |
| `--surf` | `#141817` | `#ffffff` | Keys, segments, dialogs, count box |
| `--surf-2` | `#1c211f` | `#eef0eb` | Hover |
| `--surf-3` | `#252b29` | `#e2e5df` | Toggle track off, save bar, toast |
| `--line` / `--line-2` | white 8 % / 15 % | ink 10 % / 18 % | Hairlines / borders |
| `--tx` | `#eef2ef` | `#0d110f` | Primary text; the selected segment's fill; the Stay key |
| `--tx-2` | `#a6b0aa` | `#48514c` | Secondary text |
| `--tx-3` | `#85908a` | `#59625d` | Labels, group titles, edge deltas (AA on `--bg-2` and `--surf`) |
| `--win-tx` / `--lose-tx` | `#3fe397` / `#ff6b5e` | `#07703f` / `#b42318` | Win and loss as **text on the UI** (balance badge, dock summary, danger buttons). On `--bg` light: 4.97:1 / 5.29:1. The felt keeps `--win` / `--lose` (tags, verdict, bust pill), which sit on the felt in both modes |
| `--lose-line` | coral 50 % | `#b42318` 45 % | The danger outline button's border |
| Field errors (`.ferr`), alerts | `#ff8f84`, `#ffd2cc` | `#b3261e`, `#8c1d14` | Inline errors, the login alert |
| `--groove-1/2` | `#040505` / `#0f1211` | `#d9dcd5` / `#eceee9` | Chip rack and chip-picker groove |

### Accent (fill, ink on the fill, accent as text)
| Accent | Dark fill | Ink | Text on dark | Light-mode fill (white ink) | Light-mode text |
|---|---|---|---|---|---|
| Emerald (default) | `#1ed18a` | `#02160d` | `#3fe39f` | `#077f4f` (white 5.05:1) | `#066b43` (5.29:1 on `--bg`) |
| Sapphire | `#6b95ff` | `#040c22` | `#8eaeff` | `#2f61e3` (white 5.33:1) | `#2552c4` (5.48:1) |
| Ember | `#ff7b3f` | `#1e0a01` | `#ff9566` | `#b8450f` (white 5.39:1) | `#b04110` (4.68:1) |
| Orchid | `#c28dff` | `#15062a` | `#d2a9ff` | `#8a4ad8` (white 5.18:1) | `#7438bf` (5.52:1) |
**Contrast, round 9 (measured):** axe `color-contrast` over every screen and state (table: betting, playing, offers, a win, a loss, out of credits, auto deal; the rules sheet; the leave, delete and reset dialogs; Settings with every section open, the preset list, a field error; Home signed in and out; Login, its error and waking states; sign-up with errors; loading; error) for every accent x felt x dark/light at 390x844 and 1440x900: no failures. A disabled control (a slider whose switch is off) is exempt as inactive. Text on the felt is a gradient that axe cannot judge; `contrast.mjs` measures it on rendered pixels (worst 5.00:1). The primary key's small "auto" line and its key hint (Space, desktop) are full ink (they were 72 % and 45 %); other keys' hints are `--tx-2`.

Also `--accent-rgb` (glows) and `--back-hi` (the card back's light line). The accent appears on: the primary key (Deal, Hit, Next hand, Save), the selected rack chip's ring, the active bet circle, the active total's ring, the wordmark's diamond, the card back's guilloche, focus rings, toggles, sliders, and the win light. Nowhere else.

### Felt (per `data-felt`)
| Token | Green | Blue | Red | Use |
|---|---|---|---|---|
| `--felt` | `#0b4a31` | `#0f3559` | `#56121b` | Cloth mid tone |
| `--felt-hi` | `#146c47` | `#1a5288` | `#80202d` | Cloth under the lamp |
| `--felt-lo` | `#021710` | `#041325` | `#1c0407` | Cloth at the edges |
| `--print` | cream 62 % | cool white 62 % | warm white 62 % | Rules printed on the felt, bet rings |
| `--print-strong` | 82 % | 84 % | 84 % | The message line |
| `--shadow-c` | `1 14 8` | `2 9 20` | `18 3 5` | RGB of cast shadows |
| `--back-bg` | `#0f1513` | `#0f1218` | `#151011` | Card back ground |

### Fixed colours
`--win #3fe397`, `--lose #ff6b5e`, `--push #c5cfd8`, `--even #6fe3d2`, `--surr #f0b77d`, rail `#17191a` > `#050606`, `--paper #f6f4ee`, cut card `#f7d55a` > `#e9b81f`.

Ceramic chips (`assets/build.mjs`, `CHIPS`): body / print (edge blocks, rings, hatch) / ink (numeral) / side.
`1` `#ebe8e1` `#27458f` `#1f3473` · `5` `#a5222b` `#f1ebe0` · `10` `#1f4a96` `#f1ebe0` · `25` `#1e6a45` `#f1ebe0` · `50` `#c8682a` `#1d2b4d` · `100` `#1c1c21` `#e9e2d2` · `1K` `#d6a92c` `#22201a` · `5K` `#5e3a24` `#ead8b2` · `10K` pink `#d4709a` `#fbeef3` · `20K` light blue `#7fb6dc` `#0f2c44` · `50K` purple `#5b3a8f` `#efe6fb` · `100K` grey `#8d9296` `#16191b` (spec colours; "100K" is set at 27.5 units with tighter spacing so it stays 12 px on a 44 px chip).

### Type
| Role | Face | Weight | Size |
|---|---|---|---|
| Display: balance, verdict, section titles, house edge, felt print, chip numerals | Clash Display (Fontshare) | 500-600 | balance 19 (22 desktop, 18 landscape); verdict 28-40; section title 22; felt print 12-18 |
| UI: everything else | Satoshi (Fontshare) | 400 / 500 / 700 | keys 13 and 17 (big keys); rows 15; segments 14; labels 12 |
| Wordmark | drawn paths, no font | stroke 6 on a 28-unit x-height | top bar 17 px tall (15 under 380 px wide, 19 tablet, 21 desktop) |
12 px is the floor everywhere: the felt print is fitted at runtime, never under 12; chip numerals are 32 units (28 for "100") on a 100-unit chip, so they only show on chips of 44 px or more (rack chips are 44-50 px; stacks show a numeral when `0.6cw >= 44`, otherwise a small diamond and the amount label under the circle).

### Space, radii, elevation
Space 4 px base (`--s1` 4 to `--s7` 48). Radii `--r1` 8, `--r2` 12 (segments, buttons), `--r3` 16 (dock keys), `--r4` 22 (rack groove), `--r5` 28 (felt slab from 600 px); cards `7 %` of their width. UI is flat (1 px `--line` borders); only the primary key and floating layers (menu, save bar, toast) carry shadow.

### The light model (table objects only)
One lamp above the table, slightly toward the player. Art is lit top-left (`ceramicGloss` on chips, `paperLight` on the card back, a 150 deg sheen on faces). `.felt-light` is a radial pool at `--lx --ly` (registered `@property`, 900 ms) that sits mid-table between rounds and follows the active hand. Cast shadows fall away from the lamp (`shadowFor()` sets `--shx/--shy` per hand and stack). Result light (`.felt.r-*`, 900 ms): win bloom `accent / .34` from the player's edge with `--lamp 1.5`; Blakejack adds a sheen sweep; loss/bust/surrender darken from the bottom with `--lamp .55`; push is a faint cool bloom. The shoe throws a soft shadow into the top-right corner of the cloth.

### Motion
Easings: `--e-out (.16,1,.3,1)` UI · `--e-weight (.33,0,.15,1)` objects on cloth · `--e-spring (.34,1.4,.64,1)` lift/verdict/toggles · `--e-io (.65,0,.35,1)` flips and light. Durations: press 120, UI 220, state 320, flip 420, slide 560, light 900 ms.
| Moment | What moves | Timing |
|---|---|---|
| Deal | a card slides out from under the shoe's corner (top right), face down, turning from the shoe's -36 deg to square, settles, then turns over | slide `clamp(.52 x speed, 300, 760)` ms, step gap `clamp(.45 x speed, 200, 900)`, flip 420 |
| Hole card | one element; flips in place | 420 ms |
| Peek | the hole card lifts and tips toward the dealer | 350 ms, held 1250 |
| Bet chip | the rack chip glides to the circle and shrinks to table size | 360 ms |
| Undo / Clear | the stack glides back to the rack | 380 ms |
| Win | the dealer's chips come down from above the table's edge and land beside the stake (560 ms), hold 240, then both slide **down** into the dock (720) | |
| Loss / bust | the stack is swept **up** off the table's top edge | hold 260, 700 ms |
| Push | the stake slides down | hold 320, 680 ms |
| Surrender | half up, half down | 700 ms |
| Verdict | pops in, letter-spacing closing; Blakejack glows in the accent and flashes once | 620 ms spring; flash 1400 ms |
| Balance | counts in whole dollars; the change badge shows for 2.6 s after a round, then fades | 700 ms; badge 2.6 s + 400 ms fade |
| Shuffle | the shoe's top card withdraws; a deck comes out of the shoe onto the dealer's side of the felt, splits into two halves, riffles together card by card, squares up and goes back into the shoe; the message says "Shuffling" | 2.6 s |
| Cut card | its yellow corner slides out beside the top card and stays until the next hand | 780 ms |
| Totals and count | change only once the card has landed (and turned over); hidden while the opening cards are dealt (as `dealingStyle` in the app) | with the landing |
| Re-centring | a hand grows from the left; when it re-centres, or a split narrows the seats, every card already down glides to its new place | 320-360 ms `--e-weight` |
`prefers-reduced-motion: reduce`: all animation and transition off; flights skipped; same order of states.

## 4. Layout
One column; the dealer is always above the player; everything centres on the felt; the page is exactly the viewport.
| Mode | Trigger | `--top` | `--dock` | `--rail` | `--rc` | Dock |
|---|---|---|---|---|---|---|
| Phone | default | 54 | 134 | 10 | 44 | two rows (rack 54, keys 50) |
| Short phone | height <= 740 | 48 | 126 | 8 | 44 | two rows (52, 46) |
| Tablet | width >= 600 | | | | | the felt becomes a slab with gutters and `--r5` corners |
| Desktop | width >= 900 | 62 | 92 | 12 | 50 | one row; keys show shortcuts |
| Desktop short | width >= 900, height <= 740 | 52 | 84 | | 46 | one row |
| Landscape phone | height <= 520 | 42 | 64 | 8 | 44 | one row; the bet circle sits left of the hand; the print splits left / right |
| Wide desktop | width >= 900 and aspect >= 5:4 | as Desktop | | | | the bet circle beside the hand, as on a landscape phone, so cards can be large (148 px at 1440x900); the felt print is the same centred arc as on a phone, between the dealer and the player; totals 17 px |

**Card width** (on `.stage-in`, inside the one size container `.stage`): `--cw = clamp(40px, min((100cqb - --fixed) / --rows, --cwi, --cmax), 140px)`. Portrait: `--fixed` 162 (194 with two or more seats, for the totals above the hands), `--rows` 4.254, `--cwi` 23cqi (17cqi multi), `--cmax` 118; desktop `--cmax` 128, `--cwi` 15cqi (12cqi multi); landscape `--fixed` 60, `--rows` 2.904, `--cwi` 13cqi, max 100. Wide desktop: `--fixed` 156, `--rows` 3.104 (the arc print sits in the flow), `--cwi` 12cqi (10cqi with two or three hands, 6.5cqi with four), max 156. Results: 89 px at 390x844, 76 at 375x667, 148 at 1440x900, about 70 at 844x390. The raw formula is `--cwr`; script floors it to whole pixels into `--cw` / `--ch` and snaps every hand to whole pixels (`--fx` / `--fy`), so card faces never resample at fractional sizes.

**Hands:** cards in a straight row, square to the screen (no tilt: a rotated bitmap blurs), each new card on top of the one before it, to the right, for the dealer exactly as for the player. 3D (perspective, preserve-3d, the back face) is switched on only while a card is face down or turning, so a face-up card is a flat, sharp image. Step as in section 2. The **total** never touches a card: beside the hand on the right, vertically centred, for the dealer and a single seat; centred above the hand when two or more seats share the row (the hand reserves 32 px above). The dealer's hand stays clear of the shoe corner and keeps room for its total: `maxWidth = min(stage - 2 x (0.55cw + 14), stage - 116)`.

**Seats:** one by default; a split adds a seat, keyed by hand (cards already down keep their element and glide). A split hand gets its second card only when play reaches it, as at a real table. More than four hands scroll (from four on a landscape phone): snap, edge fades, active hand centred.

**Middle line:** 48 px between the print and the seats for the message (12 px tracked caps) or the verdict.

## 5. Components
| Component | Code | Notes |
|---|---|---|
| Top bar | `.top` | One quiet row, no boxes, three columns with equal outer ones: menu + wordmark left; the **balance centred** on the bar (label "Balance" over the number on phones, one line on wide screens and landscape; plain text, the hidden top-up listens here: no role/tabindex/aria); count (plain text) + Settings right. The change badge takes the label's place for 2.6 s on phones and sits after the number on wide screens, absolutely placed: the balance never moves. Height 48 px (44 on short phones, 52 desktop, 46 short desktop, 40 landscape) |
| Count | `#count` | As the app: Hi-Lo over cards seen (the hole card when it is turned), reset on a new shoe; true count = `round(running / max(1, cards left / 52))`, an integer. Values hidden while the opening cards are dealt. Two short lines on phones ("Count +3", "True +1"), one pill on wide screens; hidden when the count is off |
| Menu | `.menu` | Table rules, Analytics (Soon, #15), Settings, felt swatches, Log out. The wordmark screen is reached from the Demo panel only |
| Felt + rail | `.felt`, `.rail` | A thin matte rail along the dealer's edge. No chip tray: the dealer's float is off screen above it |
| Shoe corner | `.shoe`, `.shoe-card`, `.cut-card`, `.mouth` | The shoe is off the table, top right. Only the corner of its top card shows (a real card back, rotated -36 deg, clipped by the felt), with the shoe's shadow on the cloth. `.mouth` is the deal origin. The cut card's yellow corner appears only once it is drawn (`.cut-out`) |
| Card | `.card > .cin > .cf + .cb` | Real PNG face clipped to 7 % corners; the back is `#cardback`. A face-down card has no face image in the DOM |
| Card back | `#cardback` | Graphite ground, white border, lattice, wave lines and a guilloche rosette in the accent, the wordmark on a pill-shaped plate across the centre |
| Chip | `#chip-<v>` (numeral) / `#chip-<v>-p` (diamond) / `#side-<v>` | Ceramic: flat printed face; eight edge blocks with five fine lines each, dots between, a ring, a hatched band, a centre disc with the numeral; a light diagonal gloss and a thin rim |
| Chip stack | `stackSVG()`, `.stack` | One SVG. Biggest chip at the bottom, its face centred on the circle (`--k` anchors it); each chip above is lifted up the screen by its thickness, so the lower edges show and the top chip is whole. Up to 10 chips drawn |
| Bet circle | `.spot`, `.side-spot.dbl/.ins`, `.amt` | Printed double ring, "BET" when empty (breathing), accent ring when active. Double and insurance stacks at table chip size, never over the bet (where they go per layout: section 8, Layout) |
| Total | `.pill` (`.soft`, `.bust`, `.bj`, `.on`) | Dark glass; soft totals "7/17" |
| Felt print | `renderPrint()` | "BLAKEJACK PAYS 3 TO 2" / "6 TO 5"; "DEALER HITS SOFT 17" or "DEALER STANDS ON ALL 17s" · the mode ("DEALER PEEKS", "NO PEEK" or "NO SECOND CARD"); the insurance band (hidden when insurance is off) |
| Verdict | `.verdict.<kind>` | One word on the felt, never over a card; several hands show the net plus a tag under each bet. The message line says "Your move" for every hand (no "hand 1 of 2": the lit circle and the lamp show which) |
| Dock | `renderDock()`, `.key` | Same height in every state. Betting: rack + Undo, Clear, Rebet, 2x, (Pause/Resume), Deal. Playing: Double, Split, Surrender, (Triple) + Stay, Hit. Offers: Insurance $x / Even money / Surrender + No thanks. Results: net, balance, Next hand |
| Chip rack | `.rack-wrap .rack .rc` | Every enabled chip on show, evenly spaced, no scrolling and nothing cropped (eight 44 px chips fit in 355 px). The chosen chip lifts 3 px with an accent ring inside its own edge |
| Settings | `buildSettings()` | One calm page of disclosure sections, **all collapsed on arrival**: Table rules, Gameplay, Chips, Appearance, Sound & haptics, Account. Each header is a button (`aria-expanded`, `aria-controls`; Enter/Space) in an h2, showing the name, a one-line summary of the current values ("Vegas · 0.6% house edge", "Normal speed · totals on · count on", "12 of 12 chips", "Green felt · Emerald · Dark", "Sound off · vibration off", the player's name) and a dot when that section has unsaved changes; the body is a region. No section nav (the headers are the index). A deep link (`#settings/sec-rules`) opens its section; Save with an invalid name opens Account. The delete action sits apart at the bottom in a thin coral frame, with no title. Sticky Save/Discard bar |
| Rules | `renderRules()` | A **preset dropdown**: label "Preset", a button showing the preset name and its house edge ("Vegas · 0.6% house edge"); it opens a listbox of the five presets, each with its own edge and a tick on the current one ("Custom" heads the list, not choosable, while rules are edited). Keys: Down/Up/Enter/Space open; arrows, Home/End and a first letter move; Enter/Space choose; Escape closes and returns focus; Tab closes. Below, one group per section: Shoe, Dealer, Payouts, Doubling, Splitting, Surrender, House variations (Blackjack on split, Triple down, …, face-down double), Advanced. A preset sets every rule; any hand change makes it read Custom |
| Appearance | `.felts`, `.accents`, mode segments | Felt swatches, four accent dots, Dark / Light / Device |
| Wordmark | `#wordmark`, `assets/brand/*.svg` | "Blakejack" drawn as a monoline geometric logotype: capital B, single-storey a's, an open c, short-armed k's; the j's tittle is a diamond in the accent |

## 6. Rules
`mockup/rules.js` holds every rule decision the table makes, as pure functions named after their counterparts in `src/utils/blackjackLogic.js`, `gameEngine.js` and `gameReducer.js` (`canSplit` by card value, `canHit`, `canDouble`, `canSurrender`, `earlyOffer`, `offersAtDeal`, `playerSurrender`'s waiting rule, the initial player and dealer evaluations, `dealerNeedsToPlay`, `dealerOnlyChecksBlackjack`, `dealerShowsSecondCard`, the dealer step, `settleHand` with 6:5 to the cent and `noHoleCardLoss`). `simulateRound()` plays a round through the same steps; a scratch audit compared it with the app's reducer (`playRound` in `src/utils/_tests_/stackedShoe.js`) on 30,000 random rounds and 40,000 unit cases with no difference. The one rule the app does not have yet is **Deal split hands** (Splitting): *One at a time* (default; the next split hand gets its second card when play reaches it) or *Both at once* (the app today). Wording proposed for `ruleCatalog.js`: "Deal split hands" / "One at a time" / "Both at once".

## 7. Assets
`node mockup/assets/build.mjs` regenerates `assets/sprite.svg` (chips, chip sides, card back, wordmark, icons; about 140 KB) and `assets/brand/wordmark*.svg` (pure paths). The sprite is inlined at boot so CSS variables reach inside it; the app can import the same symbols as components.

## 8. Round 5 additions

### Contrast (planner I1)
The felt print and the message line are near-white (`--print` 96 %, `--print-strong` 100 %), every print line is weight 600, the lamp is `.11` and the lit felt tones are slightly darker (green `#0f593a`, blue `#174a7a`, red `#771d2a`). Measured on rendered pixels (each glyph against the 95th-percentile felt behind it, print hidden), every felt x dark/light at 390x844, 1440x900 and 844x390: **worst 4.95:1** (green, desktop insurance line); AA for 12 px text is 4.5.

### Print (I2, Blake round 4)
One centred arc between the dealer and the player at every size. A landscape phone sets it as one 12 px line ("BLAKEJACK PAYS 3 TO 2 · DEALER HITS SOFT 17 · INSURANCE PAYS 2 TO 1 · DEALER PEEKS"). The print is a button: it opens the Table rules sheet.

### Doubles (B4)
- **Double:** the card lands **sideways** (rotated 90 deg) across the end of the hand, as at a casino. Its visual box is a card's height wide; the hand reserves that width. The card height is forced to the same parity as its width, so a card turned 90 deg keeps its corners on whole pixels (crisp).
- **Face-down double (`doubleFaceDown`):** the card lands sideways and **face down**; it is not in the hand's cards (`hand.hiddenCards` in the app), has no face image in the DOM, and the total, a bust and the count ignore it. After the dealer, at **REVEAL_HIDDEN**, it turns over in place ("The double card" on the message line), then the hand is worked out again and settled. The dealer plays as if the hand were alive (`dealerNeedsToPlay`).

### Chips and rack (B3, M3, M5)
Twelve chips (`ALLOWED_CHIPS`). The rack shows `visibleChips`: the enabled chips the balance covers (with $1,250 that is seven). When they fit they are evenly spaced; when they do not, the rack holds exactly k whole chips, scrolls by whole chips (snap), hides anything in its padding and shows a chevron on a side with more chips, so no chip is ever cut at rest. Outside betting the rack dims and takes no taps. A half dollar is not drawn as a chip; the amount label is exact.

### Settings (B2, B5, I3, I7, I12)
- Hidden rules (one list, `hiddenKeys`): EU-only rules (`dealerDrawsOnPlayerBlackjack`, `dealerDrawsOnPlayerBust`, `dealerDrawsOnceOn21`) hide in US modes; "Blakejack pays immediately" hides under a peek; "If the dealer has blackjack" hides under a peek; "Resplit aces" hides with two hands. The preset match ignores hidden rules.
- **Leaving with unsaved changes** (Back, the menu, Home, Log out) asks "Discard your changes?" (Keep editing / Discard and leave); a page unload uses the browser's own prompt.
- **Saving a rule that resets the table** (`RESET_SETTINGS`) mid-round asks "Start a new shoe?" (Cancel / Save and reset): the hand in play ends and any bets on it are lost (as `resetTable`: only an undealt circle bet comes back), a new shoe is dealt. Between rounds it deals the new shoe without asking.
- **Profile fields:** an empty first or last name shows "Enter your first name." under the field (`aria-invalid`, `aria-describedby`), and stays unsaved with its error, but never blocks the settings: Save saves everything else and the bar then reads "1 unsaved change" (the field). With only the invalid field changed, Save is disabled.
- Sound and vibration are **off by default**; there is one "Sound" switch (no separate card sounds), Volume is disabled while Sound is off, Auto deal delay while Auto deal is off. A disabled slider is grey (track fill and thumb ring), never the accent.
- (Round 6 section-nav fades: superseded in round 8, the nav is gone.)
- Labels are sentence case and never repeat the chosen value ("Max hands after splits", "Deck size").

### Screens (I8)
- **Table rules sheet:** a bottom sheet on phones, a centred panel from 720 px, opened from the menu, Home's Rules and the felt print. Preset name, house edge, then Payouts, Dealer, Doubling, Splitting, Surrender in plain English, hidden rules left out; Close and Change rules. Even money is listed only when the mode offers it (`offersAtDeal`: not when your blackjack already pays at once). "Blakejack" names only the player's natural; the dealer's is "blackjack" everywhere.
- **Home:** the wordmark, a felt hero (two cards lying flat, as dealt, on whole pixels, and a chip), Play / Rules / Settings, "Signed in as … · Log out".
- **Login:** "Log in" (heading and button: the e2e and live smoke click the button by that name); labelled fields that keep the app's placeholders: label "Username or email", placeholder **"Username or Email"** (e2e `fixtures.js` and the live smoke fill it by placeholder; never change it), "Password". **Waking** state (spinner, "Waking up the table. The first log-in can take up to 30 seconds.", the button reads "Logging in..."); **error** state (one alert, both fields `aria-invalid`).
- **Create an account** (`#login/signup`, from "Create an account" under the form): the app's five fields in its order, each labelled, with its placeholder: Username, Email, Password, First name, Last name. Errors show under a field once it is typed in or left, in the app's words ("Username must be at least 3 characters.", "Invalid email format.", "Password is required." …, `aria-invalid` + `aria-describedby`); "Create account" stays disabled until all five are valid; "Have an account? Log in" goes back.
- **Loading:** three card backs dealt in a loop, "Shuffling up...". **Error:** "Can't reach the table", Try again, Home.
- **Message line notices:** "Reconnecting..." with a pulsing dot (dock busy); a refused bet in a soft coral. "Last hand before the shuffle" shows once the cut card is drawn.
- **Out of credits:** with nothing affordable the rack becomes a note with an info icon ("Out of credits. Your balance is $0."), the message line says so, and nothing that bets is live: Rebet is off unless a last bet is affordable (as 2x), the bet circle is idle (no glow, no breathing, disabled) and the keys follow the dock (Space, B, X, 1-9 do nothing). The balance taps for the hidden top-up still work.
- **Leaving the table mid-round** (menu Home, once cards are out: any phase but betting and shuffling, as the app's Home button) asks "Leave game and return Home?" / "Any bet in the circle will be lost." (Keep playing / Leave); Leave ends the round as `resetTable` does.
- **Hidden top-up (#90):** 7 taps in 3 s on the balance (only while the balance is under $100, betting, nothing on the table) create a dialog: "Enter code", a labelled field, Submit / Cancel. Nothing about it exists in the DOM before the 7th tap, and every refusal shows the same "That didn't work." It is removed from the DOM on close.

### Layout (I5, I6, I9, M2, M6)
- Safe areas on all four sides (`viewport-fit=cover`; top inset in the top row's height, bottom in the dock's, left/right in the top bar, felt and dock).
- One column (`--col` 1240 px) for the top bar, the felt and the dock, so they line up at 1920x1080.
- The tip line (#3) sits above the dock at 0 px while empty.
- With several hands, the hands not in play dim to 62 % brightness (`filter: brightness(.62)`, never opacity: a card is never see-through). The dealer is laid out after the seats (a seat count change resizes the cards).
- **Side stacks (double, insurance), round 6:** never over the bet. Portrait with room: beside the circle (insurance left, double right). Narrow portrait seats (three on a phone): under the amount, in room the seats keep for them, so nothing moves when one appears. Wide screens: just above the circle, on the insurance line, side by side when both, "INS" beside its stack. Landscape phones (no room above: the print and the verdict are there): on the circle's outer side, the circle's column growing to hold them (one seat: both outer columns, so the hand stays centred; several: the fan closes up); three seats cap the card width so a sideways double and a side stack both fit. The layout check now fails any side stack touching the bet, a card, a label, the print or another side stack, at all seven sizes and 667x375.
- **Hit areas:** the landscape print is a 44 px button around its 24 px line (same look and footprint); a bet circle is never under 44 px.
- **Wide screens between rounds:** the dealer's card place is printed faintly (one card outline, 16 %) so the empty felt has a centre; it goes as soon as a card is dealt.

### Keys (I10)
H hit, S stay, D double, T triple, P split, R surrender; at the offers I insurance, E even money, R surrender, N no thanks; Space or Enter deal / next hand; 1-9 pick a chip (desktop shows the digit on each rack chip); U undo, C clear, B rebet, X 2x.

### Count (M1)
Starts at 0 on a fresh shoe; only cards that have landed face up count (the hole card and a face-down double when they turn).

### Build note (M7)
The card faces in `public/cards` are about 4.7 MB of PNG: convert them (and the back) to WebP for the build, keeping a 500 px-wide source so a card is never upscaled (the largest card is 156 px at DPR 3 = 468 px).

### Round 7 polish
- **Destructive confirms** ("Discard and leave", "Leave", "Save and reset", "Delete for good"): the destructive button is the danger outline (`.btn.danger-o`; delete keeps the filled `.btn.danger`), never the accent; the safe button ("Keep editing", "Keep playing", "Cancel", "Keep my profile") is first and takes focus when the dialog opens.
- **Rules sheet:** "Even money on your Blakejack against a dealer ace" only with insurance on and when the blackjack is not already paid at once (as `offersAtDeal`); with insurance off it reads "No insurance or even money".
- **Home hero:** the chip sits clear of the king's corner.
- **The felt print's name is just "Table rules"** (it used to read the rules out, and "Dealer hits soft 17" in a name also matches `getByRole('button', { name: 'Hit' })`, so the test would find two buttons). The sheet reads the rules.
- **Signed-out Home** (`#home/out`, where Log out lands): the hero, "Please log in to start playing.", Log in / Create an account / Rules.

## 9. Test names (e2e and the live smoke)
**Rule:** keep the app's accessible name wherever the visible look stays the same (aria-label, alt text, role); rename only where the visible text changes. Every rename below is made in `e2e/` **and** `e2e-live/live.spec.js` **in the same PR** as the screen it tests (the live smoke runs only after deploy, so a missed rename fails in production CI). The CLAUDE.md hooks `.flight-layer`, `.fly-inner`, `.options-wrap` and `.board.busy` go on the equivalent new elements (FlyCard's layer and inner, the action keys' wrapper, the table while it is busy); they are classes, not design, so they stay.

| e2e / live smoke uses | Where | The mockup | Action |
|---|---|---|---|
| link "Log in" | fixtures, live | Signed-out Home: "Log in" link | keep |
| placeholder "Username or Email", "Password" | fixtures, live | Login: same placeholders (labels "Username or email", "Password") | keep |
| button "Log in" (exact) | fixtures, live, a11y | Login button "Log in" | keep |
| text "Please log in to start playing." | a11y | Signed-out Home, same text | keep |
| role alert (login error) | a11y | Login error `role="alert"` | keep |
| text /waking up/ | cold-start specs | "Waking up the table. The first log-in can take up to 30 seconds." | update: `/waking up/i` |
| button "Start Game" | most specs, live | Home "Play" (a link) | update |
| button "tester" (player name in the header) | smoke | no name in the top bar; Home "Signed in as …" | update |
| button "Settings" (exact) | routing, settings, a11y | top bar icon button, `aria-label="Settings"` | keep |
| button "Back to game" | routing | Settings back button "Table" | update |
| tabs "Player", "Game", "Dev" (`selected`) | settings, routing, a11y | one page of collapsed sections, each a button with `aria-expanded` (Table rules, Gameplay, Chips, Appearance, Sound & haptics, Account): open a section with `getByRole('button', { name: /^Table rules/ })`; no Dev section designed yet | update |
| label "playTimeout" | dev-setting spec | not in the mockup (Dev not designed) | update when designed |
| button "Add 10", /^Add \d+$/, `Add ${chipValues[0]}` | most specs, live | rack chip `aria-label="Add 10"` (shows "10") | keep |
| button "Deal" (exact) | most specs, live | Deal key `aria-label="Deal"` (the "auto" note and the Space hint are not in the name) | keep |
| buttons "Hit", "Stay", "Surrender", "No thanks" | many, live | same labels; key hints are `aria-hidden` | keep |
| group "Offers" with "Insurance $5", "No thanks" | a11y, offers, live | the dock is `role="group"` "Offers" at the offers; key "Insurance $5" | keep |
| text "Insurance?" | offers | message line "Insurance?" | keep |
| text "Insurance or surrender?" | offers | one question per offer ("Insurance?", "Even money?", "Surrender?") | update |
| button "Pause auto deal" | autodeal | Pause key `aria-label="Pause auto deal"` ("Resume auto deal" when paused) | keep |
| img "king of diamonds", "7 of clubs" … | deal, split, rules specs | card face `<img alt="king of diamonds">`; hands are `role="group"` so the faces stay in the tree | keep |
| text "Click anywhere to continue..." | most specs, live | "Next hand" key (a click on the felt still continues) | update |
| text "Place your bets!" | fixtures, live | "Place your bets" | update |
| text "Credits:" | a11y top-up specs | top bar "Balance" | update |
| `.stats-panel > div:nth-child(2)` (balance read) | live | `#bal` in the top bar | update |
| dialog "Enter code", label "Code", "Submit", "Cancel", role alert | top-up specs | same names; the error is `role="alert"` | keep |
| group names "Soft 17", "Blackjack Pays", "Double On", "Deck size: 6", "Max Hands After Splits: Unlimited", "If the Dealer Has Blackjack, You Lose", "Surrender", "Insurance and Even Money", "Resplit Aces"; options as buttons with `aria-pressed` | settings | open "Table rules" first; sentence case, no value in the label ("Soft 17", "Blackjack pays", "Double on", "Deck size", "Max hands after splits", "If the dealer has blackjack, you lose", "Surrender", "Insurance and even money", "Resplit aces"); options are `role="radio"` + `aria-checked` | update |
| checkbox "Blackjack on Split" | settings | switch "Blackjack on split" (`role="switch"`), now under House variations | update (role and case) |
| preset tile button /^Vegas/ `pressed` | settings | the "Preset" dropdown: button named "Preset Vegas 0.6% house edge"; options `role="option"` "Vegas 0.6%" with `aria-selected` (`getByRole('option', { name: /^Vegas/ })` after opening) | update |
| rule hint text (/insure for half your bet…/, /Give up half your bet…/ …) | settings | no paragraphs in Settings; plain-English lines in the Table rules sheet | update |
| `.hand-total … .hand-result.Win` / `.Surrendered` | rules specs | result tag `.tag.win` / `.tag.surrender` (several hands), verdict line (one) | update |
| `.page-bg`, `details[open]`, `.rule-tile, .seg-btn, .rules-section summary, .toggle-row` | settings, a11y | `.settings-screen`; no collapsed groups; `[data-rule]`, `[data-preset]`, `.sw` | update |
| (new) switch "Show hand totals" | — | Gameplay: `role="switch"` "Show hand totals" | add tests with the setting |

## 10. Round 8 (Blake's round 7 notes)
- **Dealer's up card alone:** `layoutHand` puts the dealer's first card at 0, then a gap of max(8 px, 14 % of a card); the hole card and every later card fan after it at the usual step. The flights land on those places; the layout check covers every scene.
- **Show hand totals** (Gameplay, default on): `<html class="no-totals">` hides every `#stageIn .pill` with `visibility` (no layout change, so a mid-round toggle moves nothing); the hands' accessible names drop the total too. Saved like any setting (`showTotals`, a flat boolean).
- **Preset dropdown, sections, "No second card", Blackjack on split in House variations, "blackjack" in Settings, delete with no title, the centred balance:** see sections 0 and 5.
- The section nav and the wide-screen index are gone: with every section collapsed the page is one screen of headers.

## 11. Round 9 (planner check of round 8)
- **Light mode passes AA** with the colours in section 3 (accent fills darkened for emerald and ember; light win/loss/danger text tokens).
- **A group with nothing to show has no heading** (Advanced under a peek: every Advanced rule is hidden there).
- **Long dealer hands:** the fan never drops under 0.27 of a card (section 2). A long hand gives up the up card's gap first (down to touching); a hand still longer than its room (6-7 cards on a phone) slides left so it stays clear of the shoe instead of tightening the fan.
- **Wording (Blake):** the EU mode reads "No second card" in Settings, on the felt print ("NO SECOND CARD") and in the rules sheet; the rules sheet says "blackjack" for the hand (section 0).
- **The delete button reads "Delete profile"** (the row is "Your profile · Balance and history, for good.").
