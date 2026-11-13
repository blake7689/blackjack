# Blakejack design system (round 4)

Source of truth for the build PRs (#79-#87). The mockup (`index.html`, `mockup.css`, `mockup.js`, `assets/`) shows every value below; where this file and the code disagree, the code wins. Open it through the dev server: `http://localhost:5173/mockup/index.html` (`#settings`, `#settings/sec-look`, `#brand`; `?clean` hides the Demo tab). `BRIEF.md` holds Blake's decisions and his feedback on rounds 1-3; `RESEARCH.md` says what we took from whom. `HANDOFF.md` and `SHADES.md` describe the rejected first mockup.

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
| `--groove-1/2` | `#040505` / `#0f1211` | `#d9dcd5` / `#eceee9` | Chip rack and chip-picker groove |

### Accent (fill, ink on the fill, accent as text)
| Accent | Dark fill | Ink | Text on dark | Light-mode fill (white ink) | Light-mode text |
|---|---|---|---|---|---|
| Emerald (default) | `#1ed18a` | `#02160d` | `#3fe39f` | `#0b9d63` | `#087a4c` |
| Sapphire | `#6b95ff` | `#040c22` | `#8eaeff` | `#2f61e3` | `#2552c4` |
| Ember | `#ff7b3f` | `#1e0a01` | `#ff9566` | `#d4521a` | `#b04110` |
| Orchid | `#c28dff` | `#15062a` | `#d2a9ff` | `#8a4ad8` | `#7438bf` |
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
`1` `#ebe8e1` `#27458f` `#1f3473` · `5` `#a5222b` `#f1ebe0` · `10` `#1f4a96` `#f1ebe0` · `25` `#1e6a45` `#f1ebe0` · `50` `#c8682a` `#1d2b4d` · `100` `#1c1c21` `#e9e2d2` · `1K` `#d6a92c` `#22201a` · `5K` `#5e3a24` `#ead8b2`.

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
| Top bar | `.top` | Menu button, wordmark, then the balance at a fixed place right after the wordmark (left-anchored: the count box or anything on the right never moves it; plain text, the hidden top-up listens here: no role/tabindex/aria) with its change badge beside the label; on the right the count box, the reserved empty tip slot (`.tip-slot`), Settings |
| Count | `#count` | As the app: Hi-Lo over cards seen (the hole card when it is turned), reset on a new shoe; true count = `round(running / max(1, cards left / 52))`, an integer. Values hidden while the opening cards are dealt. Two short lines on phones ("Count +3", "True +1"), one pill on wide screens; hidden when the count is off |
| Menu | `.menu` | Table rules, Analytics (Soon, #15), Settings, felt swatches, Log out. The wordmark screen is reached from the Demo panel only |
| Felt + rail | `.felt`, `.rail` | A thin matte rail along the dealer's edge. No chip tray: the dealer's float is off screen above it |
| Shoe corner | `.shoe`, `.shoe-card`, `.cut-card`, `.mouth` | The shoe is off the table, top right. Only the corner of its top card shows (a real card back, rotated -36 deg, clipped by the felt), with the shoe's shadow on the cloth. `.mouth` is the deal origin. The cut card's yellow corner appears only once it is drawn (`.cut-out`) |
| Card | `.card > .cin > .cf + .cb` | Real PNG face clipped to 7 % corners; the back is `#cardback`. A face-down card has no face image in the DOM |
| Card back | `#cardback` | Graphite ground, white border, lattice, wave lines and a guilloche rosette in the accent, the wordmark on a pill-shaped plate across the centre |
| Chip | `#chip-<v>` (numeral) / `#chip-<v>-p` (diamond) / `#side-<v>` | Ceramic: flat printed face; eight edge blocks with five fine lines each, dots between, a ring, a hatched band, a centre disc with the numeral; a light diagonal gloss and a thin rim |
| Chip stack | `stackSVG()`, `.stack` | One SVG. Biggest chip at the bottom, its face centred on the circle (`--k` anchors it); each chip above is lifted up the screen by its thickness, so the lower edges show and the top chip is whole. Up to 10 chips drawn |
| Bet circle | `.spot`, `.side-spot.dbl/.ins`, `.amt` | Printed double ring, "BET" when empty (breathing), accent ring when active. Double and insurance stacks sit beside it at table chip size |
| Total | `.pill` (`.soft`, `.bust`, `.bj`, `.on`) | Dark glass; soft totals "7/17" |
| Felt print | `renderPrint()` | "BLAKEJACK PAYS 3 TO 2" / "6 TO 5"; "DEALER HITS SOFT 17" or "DEALER STANDS ON ALL 17s" · mode; the insurance band (hidden when insurance is off) |
| Verdict | `.verdict.<kind>` | One word on the felt, never over a card; several hands show the net plus a tag under each bet. The message line says "Your move" for every hand (no "hand 1 of 2": the lit circle and the lamp show which) |
| Dock | `renderDock()`, `.key` | Same height in every state. Betting: rack + Undo, Clear, Rebet, 2x, (Pause/Resume), Deal. Playing: Double, Split, Surrender, (Triple) + Stay, Hit. Offers: Insurance $x / Even money / Surrender + No thanks. Results: net, balance, Next hand |
| Chip rack | `.rack-wrap .rack .rc` | Every enabled chip on show, evenly spaced, no scrolling and nothing cropped (eight 44 px chips fit in 355 px). The chosen chip lifts 3 px with an accent ring inside its own edge |
| Settings | `buildSettings()` | One calm page: Rules, Gameplay, Chips, Appearance, Sound & haptics, Account, Danger zone; a sticky section nav (phone) or a quiet index (>= 1100 px); sticky Save/Discard bar |
| Rules | `renderRules()` | A compact preset selector (Vegas, Atlantic City, Europe, Australia, Singapore, Custom; 3 x 2 on phones, one row from 720 px) and the house edge as one small figure. Below, one group per section: Shoe, Dealer, Payouts, Doubling, Splitting, Surrender, House variations, Advanced. A preset sets every rule; any hand change makes the selector read Custom (Custom is a state, not a choice). Each rule is a label and a segmented control; the other choices carry their house-edge change as a small grey figure. No paragraphs; the presets' full rule list is their tooltip |
| Appearance | `.felts`, `.accents`, mode segments | Felt swatches, four accent dots, Dark / Light / Device |
| Wordmark | `#wordmark`, `assets/brand/*.svg` | "Blakejack" drawn as a monoline geometric logotype: capital B, single-storey a's, an open c, short-armed k's; the j's tittle is a diamond in the accent |

## 6. Rules
`mockup/rules.js` holds every rule decision the table makes, as pure functions named after their counterparts in `src/utils/blackjackLogic.js`, `gameEngine.js` and `gameReducer.js` (`canSplit` by card value, `canHit`, `canDouble`, `canSurrender`, `earlyOffer`, `offersAtDeal`, `playerSurrender`'s waiting rule, the initial player and dealer evaluations, `dealerNeedsToPlay`, `dealerOnlyChecksBlackjack`, `dealerShowsSecondCard`, the dealer step, `settleHand` with 6:5 to the cent and `noHoleCardLoss`). `simulateRound()` plays a round through the same steps; a scratch audit compared it with the app's reducer (`playRound` in `src/utils/_tests_/stackedShoe.js`) on 30,000 random rounds and 40,000 unit cases with no difference. The one rule the app does not have yet is **Deal split hands** (Splitting): *One at a time* (default; the next split hand gets its second card when play reaches it) or *Both at once* (the app today). Wording proposed for `ruleCatalog.js`: "Deal split hands" / "One at a time" / "Both at once".

## 7. Assets
`node mockup/assets/build.mjs` regenerates `assets/sprite.svg` (chips, chip sides, card back, wordmark, icons; about 140 KB) and `assets/brand/wordmark*.svg` (pure paths). The sprite is inlined at boot so CSS variables reach inside it; the app can import the same symbols as components.
