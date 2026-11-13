> **Superseded (round 1, 2026-11-12):** this describes the first mockup, which Blake rejected. The current design is in DESIGN.md.

# Blakejack UI mockup: handoff for the build PRs (#79-#87)

Throwaway, static, no build: `index.html`, `mockup.css`, `mockup.js`, plus `SHADES.md` (felt shades). Open it through the dev server, `http://localhost:5173/mockup/index.html`; Settings is `#settings` (and `#settings/sec-rules`, `-play`, `-chips`, `-look`, `-sound`, `-account`, `-danger`). The Demo tab (bottom-left corner, top-left on very wide screens) switches scenes; it is not part of the product.

The build PRs copy values from here. Where this file and the code disagree, the code wins.

## 0. Load and storage
A fresh load, or a page restored from the back-forward cache, always opens on the betting state with one seat. Only settings and the felt theme are stored (`localStorage`, key `blakejack-mockup-v2`); no round, seat count or demo state is. The Demo panel's "Betting + auto deal" scene is a demo flag and never changes the saved Rebet or Auto deal settings. Moving to Settings and back inside one page visit keeps the round on screen, as the app will.

Messages in a round are short on purpose ("Your move", "House wins", "Dealer blackjack"): the message line shares its width with the outer seats' pills, which rise along the curve.

## 1. One spot by default
The epic ships one bet spot and one hand (multi-hand play is #59, not built). The table opens with ONE seat; every scene, the real flow and the screenshots use one seat. The seats, spots and layout are built for several: the Demo panel has a "Seats (demo only)" switch, 1 / 2 / 3, and a split adds a seat as it will in the app. It is a demo switch only, never a setting, and Settings does not mention it. The "Many hands (scroll)" scene shows six seats to prove the overflow rule (the row scrolls, fades at the edges, and the active seat is centred).

## 2. Look: one material system
Table and Settings share the same materials, so nothing looks bolted on.
- **Felt** (themeable cloth with grain and an overhead lamp that follows the active seat), **leather** (the padded rail with stitching, and the dealer's edge), **brass** (trim, hairlines, selected states, primary buttons), **dark panels** (dock, Settings cores).
- Hairlines are brass at 25-60 % (never grey); every raised surface has an inset top highlight; shadows are tinted by the felt (`--sh1/2/3`), never pure black.
- Settings sections are double bezels: leather shell, panel core, like the table's rail around its felt.
- No emoji; icons are 1.6-1.7 px line SVG.

### Tokens (`:root` in `mockup.css`)
| Group | Tokens |
|---|---|
| Colours per theme | `--felt-base/-light/-dark`, `--panel`, `--panel-raised`, `--brass/-light/-dark`, `--text`, `--text-dim`, `--print`, `--leather`, `--leather-hi`, `--room` (values for green / blue / red in `SHADES.md`) |
| Fixed colours | `--win #7fe3a1`, `--lose #ff8f80`, `--push #b9c6d8`, `--ivory #f7f1e1`, `--ink #2a1d05`, `--thread #d9c088` |
| Type | `--display` Fraunces (brand, balance, felt print, banners, section titles, preset names, chip numerals; weights 500-900, italic for the message line) and `--ui` Geist (everything else, 400-700). Both from Google Fonts; the app should self-host one woff2 of each (spec) with the same system fallbacks. Sizes: 12 px is the floor (felt print, card indexes, chip numerals, small labels); UI text 13-16; titles 22-28; brand 22-26 |
| Spacing | 4 px base: `--s1` 4, `--s2` 8, `--s3` 12, `--s4` 16, `--s5` 24, `--s6` 32 |
| Radii | `--r1` 6, `--r2` 10 (buttons in the dock), `--r3` 14 (buttons, segments), `--r4` 20 (panels, tiles), `--r5` 28 (Settings shell), pill 999 |
| Shadows | `--sh1` (controls), `--sh2` (raised: chips, cards, primary buttons), `--sh3` (floating: menu, save bar, dialog), `--hi` (inset top highlight) |
| Motion | `--ease` cubic-bezier(.22,1,.36,1) (default), `--spring` (.34,1.56,.64,1) (pops, chip drop, selection), `--glide` (.65,0,.35,1) (flips, riffle). Durations: `--t1` 140 ms (press), `--t2` 240 ms (state change, dock fade, chip drop), `--t3` 420 ms (card settle), `--t-card` 460 (flip), `--t-banner` 560. The flights driven from JS use the literal times in section 5 |
| Grain | `--noise` (felt and room) and `--grain` (leather) are inline SVG data URIs, no image files |

## 3. Layout rules and sizing formulas
One column at every size. **The dealer is always above the seats; nothing is ever side by side.** Top to bottom: header, the table (dealer edge, felt: count pill, dealer hand and total, felt print, message line, seats), the dock.

### The table shape
A kidney / half-stadium: flat dealer edge at the top, straight sides, an elliptical curve at the bottom (`--curve` = 22 % of the table height, clamped 56-150 px; horizontal radius 50 %). Layers from outside in, all concentric because the horizontal radius is `50%` of each layer's own width and the vertical radius loses the inset: `.table` (leather rail, `--rail` thick, stitching in `::before`, the dealer edge on top) > `.trim` (brass ring, `--trim` 3 px) > `.cloth` (felt, overflow hidden) > `.stage`. `.edge` is the leather band at the top: balance (fixed `--bal-w` so the count-up never shifts the tray), the chip tray, the shoe (it overhangs the felt a little; it is the card-flight origin).

### Sizes (the page is exactly the viewport: `100dvh`, `overflow: hidden`, no scroll at any size)
| Mode | Trigger | `--hdr` | `--dock-h` | `--edge-h` | `--rail` | `--rc` (rack chip) | dock |
|---|---|---|---|---|---|---|---|
| Tall phone | default | 54 | 190 | 66 | 14 | 54 | two rows |
| Short | height <= 740 | 44 | 148 | 52 | 12 | 44 | two rows |
| Wide | width >= 900 | 56 | 98 | 74 | 18 | 54 | one row (rack, then actions) |
| Wide and short | width >= 900, height <= 740 | 48 | 90 | 62 | 14 | 48 | one row |
| Landscape phone | height <= 520 | 0 (the header folds into the leather edge: menu, brand, balance, tray, shoe, settings in one 46 px band) | 76 | 46 | 8 | 44 | one row when width >= 640 |

`--rack-pad` (24 / 23 / 24 / 23 / 21) is the rack scroller's vertical padding: it holds the raised chip, its ring and glow so nothing is ever clipped. The table is also capped at `--table-max` 1080 px and centred.

### Card width: one formula (on `.stage`, a `container-type: size` box)
```
--card-w = clamp(--cmin, min( (100cqb - --k) / --d , 19cqi , 112px ), 120px)
tall:     --k 136px, --d 5.2, --cmin 44px
height <= 740: --k 141px (same d, cmin)
compact:  --k 86px,  --d 4.1, --cmin 32px   (height <= 520)
```
Everything else scales from `--card-w`:
- `--spot` (bet circle) = clamp(52, 1.5 x card, 108); inside the seats row it also shrinks to fit: clamp(48, min(1.5 x card, share - 8), 108)
- `--chip` (chip in a stack) = clamp(40, 0.62 x spot, 64); the small insurance and double stacks use 0.66 x their own spot, minimum 28, and carry no numeral (a numeral under 12 px is not allowed)
- `--pill` (total pill) = clamp(22, 0.5 x card, 30)
- `--print-h` (felt print box) = clamp(64, 0.9 x card + 24, 112); 38 in compact
- seats: `share = (100cqi - 16 - (n - 1) x gap) / n`, `gap = clamp(8, 2cqi, 20)`; `--seat-w` = clamp(spot + 8, share, 4.6 x card). When `n x seat-w` does not fit, `.seats` scrolls (edge fades via mask, snap), gets side padding of half the row minus half a seat so any seat can reach the middle, and `layoutSeats()` scrolls the active seat to the centre.
- Fan: a hand's cards overlap by `min(0.5 x card, (seat-w - card) / (n - 1))`, rotated 4.5 deg (3 deg past four cards) and arched 1.3 px x d^2.
- Never read `cqi`/`cqb` inside a nested container: only `.stage` is a container.

### Centring (checked by script to 2 px at every size)
The dealer hand, the felt print, the message line and the group of seats all centre on the felt; when the row overflows, the active seat centres in its scroller. Outer seats lift along the curve just enough to clear the rail (`liftSeats()`), so a bet spot or its amount is never cut by the curve. The seats row is a scroller, so it carries 34 px of empty padding above (offset by a negative margin) to give a lifted seat room; without it the pills of outer seats are clipped. The lamp (`--lx`, a registered `@property`) follows the active seat.

### Dock (fixed height, same box in every state)
Betting = top line + chip rack + Undo / Clear / Rebet / 2x / Deal (auto deal adds Pause / Resume in the top line and a progress bar on Deal). Playing = Hit / Stay / Double / Split / Surrender / Triple (a 3x2 grid; Triple is "Off"). Offers = Insurance $x / Even money / Surrender / No thanks (2x2). Results = net amount + Next hand. Targets are at least 44 px (the Pause pill is 32 px with a 44 px hit area).

## 4. Components: what and where
`mockup.css` is organised in the same order as this list. Function names are in `mockup.js`.
| Component | Where | Notes |
|---|---|---|
| Shoe | `shoeSVG()`, `.shoe` | Smoked-acrylic wedge on a walnut plinth, brass rim, a stack of card edges seen through the side, the top card peeking out of the mouth. The cut card is NOT in the picture until drawn (`.cutg`, shown by `.cut-out`). `#shoeMouth` is the flight origin. `.lay` and `.topcard` are the riffle targets |
| Chip tray | `traySVG()`, `.tray` | Decorative: six slots of chips. Payouts fly from it; losses are swept into it |
| Chip | `chipSVG(value, label)`, `CHIP_ART` | 64-unit SVG: body, edge spots, ring, numeral (Fraunces 800, 19.5-22 units so it is 12 px at 40 px) |
| Chip stack | `stackHTML()`, `.stack .col .sc` | Greedy over the enabled chips, 6 per column, up to 3 columns, `--edge` gives each chip its thickness; the exact amount is the `.amt` label |
| Bet spot | `renderSeats()`, `.spot .main/.dbl/.ins`, `.amt` | Printed double ring and "Bet"; a button (tap adds the selected chip). Double and insurance are separate smaller spots beside it. The exact amount is a badge on the rim of the spot (beside it in the landscape layout); the row under each spot is kept free for the result banner |
| Seat | `renderSeats()`, `layoutSeats()`, `liftSeats()`, `.seat`, `.seats` | Total pill, fanned hand, banner, spots |
| Card | `cardHTML()`, `.card .face .back` | Flip is one element (`.down`); the dealer's hole card never remounts; a flying card is a ghost in `#fx` so no scroller clips it |
| Dock states | `renderDock()`, `.dock .dock-sheet .dock-in` | The four states above |
| Chip rack | `renderDock()`, `wireRack()`, `.rack-wrap .rack .rc` | Snap scroll, edge fades, selected chip raised with a ring and glow inside the scroller's padding |
| Offers | `renderDock()` (phase `offers`) | Same fixed height as the other states; what is offered comes from the app's `offersAtDeal` |
| Result banner | `settle()`, `renderSeats()`, `placeBanners()`, `.banner` | Win / Lose / Push / Surrender / Even money / Blakejack! / Bust; plate with a coloured ring and a sheen sweep; smaller on three or more seats. It sits UNDER the hand and the total pill, centred on the main spot and overlapping only the spot's lower rim (which is empty once the chips have left); in the landscape layout it is one line on the spot. Where the curved rail is in the way (outer seats) it slides toward the middle and then up, never onto the cards. It replaces the amount badge while it shows. A script asserts it never touches a card or a total pill, for every result with 1, 2 and 3 seats and after a double |
| Felt print | `renderPrint()`, `.print` | SVG `textPath` arcs drawn 1:1 (viewBox = css pixels, so no text can fall under 12 px): "BLAKEJACK PAYS 3 TO 2" / "6 TO 5", "DEALER HITS SOFT 17" / "DEALER STANDS ON ALL 17s", the insurance banner "INSURANCE PAYS 2 TO 1" (hidden when insurance is off) between two rules, and the mode line (Dealer peeks / No peek / European no hole card). Font sizes are fitted to the width at runtime, so wording from `ruleCatalog.js` can change. Compact mode is two lines |
| Menu | `.menu` | Felt swatches, Table rules, Settings, Log out |
| Settings sections | `buildSettings()`, `sec()`, `.sec .sec-in .eyebrow` | One scrolling page; sticky blurred header with section chips |
| Preset tile | `renderRules()`, `.tile`, `.preset-detail` | Name, house edge, the summary from the app as a fact list; radio semantics. On phones the tiles are one horizontal snap row (name, edge, three key facts: decks, soft 17, surrender) and the full list of the selected preset sits in a panel under the row (the section is about 340 px tall there, down from about 1,200); from 720 px they are a three-column grid with the full list in every tile and no panel |
| Segmented control | `segHTML()`, `.seg` | Radio group; the house-edge change (+0.22 %) shows under each unselected option |
| Toggle | `sw()`, `.sw` | `role="switch"`; disabled state for "needs Rebet" etc. |
| Game-speed slider | `slider()`, `SPEED_STOPS`, `posToMs()` | 250-5000 ms. The four named stops (Very fast 250, Fast 500, Normal 1000, Slow 1500) sit evenly on the track; the last quarter runs 1500 to 5000. Snaps to a stop within 14 / 1000; the label shows the nearest name and the exact seconds |
| Chip picker | `.chip-pick .cp` | Toggle buttons with real chips; at least one stays on |
| Felt swatches | `swatchHTML()`, `.swatch` | Radio group, applies as a preview at once; the preview strip shows the print |
| Save bar | `#dirty`, `.dirty` | A floating island (not edge to edge): "n unsaved changes", Discard, Save changes. Rule changes count as one |
| Danger zone | `.sec.danger`, `#delDlg` | Oxblood core; outline button; confirm dialog |

## 5. Animation: directions and timings
All of it is transform and opacity only. `prefers-reduced-motion`: CSS durations collapse, flights and counts are skipped, state changes are instant.
| What | Direction | Timing |
|---|---|---|
| Card deal | from the shoe mouth (top right) to its place, face down, arcs up first, rotates from -28 deg, scales .42 to 1, then flips as it lands | flight 360-560 ms (follows game speed: step gap = clamp(0.45 x speed, 230, 900) ms), flip 460 ms |
| Bet chip | rack chip up to the spot (270 ms), the new top chip drops in 230 ms later with a spring | |
| Undo / Clear | the chip flies back from the spot to its rack chip | 320 ms, staggered 70 ms |
| Rebet / 2x | a short burst from the selected rack chip to each spot | 300 ms, staggered 70 ms |
| **Win** (also Blakejack, even money) | the dealer's chips come DOWN from the tray to beside the stake (560 ms), hold 240 ms, then stake and winnings slide DOWN toward the dock and fade at its edge (720 ms); the balance counts up as the slide starts | |
| **Loss / bust** | the stack is swept UP to the tray, shrinking and fading | hold 260 ms, 700 ms |
| **Push** | the stake slides DOWN, nothing comes from the tray | hold 320 ms, 680 ms |
| **Surrender** | the stack splits: half swept UP, half DOWN | hold 260 ms, 700 ms |
| **Insurance** | paid: the dealer's chips come DOWN to the small spot, then it slides down; lost: swept UP | same timings |
| Result banner | pops in with a spring, a sheen sweeps across | 560 ms, sheen 1100 ms after 450 ms |
| Balance | counts up/down in integer steps (display only) | 700 ms, ease-out cubic |
| Shuffle | the stack riffles (odd layers left, even layers right, 7 units), the shoe hops; message "Shuffling..." | 5 beats x 260 ms (about 1.4 s with the hold) |
| Cut card | the yellow card slides out of the mouth and lies beside the shoe until the round ends; next hand shuffles it back in | 780 ms |
| Peek check | the hole card lifts and tilts (20 % of a card up, -4 deg, 46 deg tipped) | 350 ms, held 1250 ms |
| Dock | the content fades up 6 px on every state change | 240 ms |
| Seat lamp | the felt's light moves to the active seat | 700 ms |

## 6. Checked
`npm run lint` is clean. A Playwright script (kept outside the repo) loaded every demo scene and result (WIN, LOSE, PUSH, SURRENDER, EVEN MONEY, BLAKEJACK, BUST, INSURANCE PAID, INSURANCE LOST; at the banner and after the payout), with 1, 2 and 3 seats, at 375x667, 375x812, 390x844, 1280x720, 1440x900 and 844x390. For each it asserted: the document is no taller or wider than the viewport; the stage does not overflow; every card, spot, amount, pill, banner and the print is inside the felt's curved edge and above the dock; the rack chips, their ring and their glow are inside the scroller; the dock's content is inside the dock; the dealer is above the seats and the message line sits between them without overlap; the dealer hand, print, message and seats are centred within 2 px (the active seat when the row scrolls); text is never under 12 px; touch targets are 44 px or more. Payout directions were traced per frame: wins move down, losses move up. The felt-edge test uses the cloth's true elliptical radii (the computed value is a percentage across), and a result banner is asserted never to touch a card or a total pill. Reduced motion (`prefers-reduced-motion: reduce`) re-ran 330 of those states at all six sizes with 1 and 3 seats, plus real rounds; the rule is `animation: none; transition: none` (a 0.001 ms duration turns on a transition for every property and crashed Chromium on the landscape table).

Also run, outside the table scenes: Settings at 375, 768 and 1440 (no horizontal scroll, text 12 px or more, targets 44 px or more); the real flow for 8 to 14 rounds at 375x667, 844x390 and 390x844 with reduced motion on, and with 2 and 3 seats (bet, undo, 2x, deal, offers, hit, stay, double, split, surrender, results, next hand, the shuffle after a cut card) with no console errors and no overflow.

**Limits.** The layout is verified down to 360x640 (portrait) and 667x375 (landscape). Below that it does not fit: at 320x568 the stage is about 74 px short, because four lines of 12 px felt print, two fanned hands, a bet spot and a 148 px dock cannot share 300 px. If PR 1 must support 320x568, drop the insurance banner line or fold the dock's top line into the message line there; 1200x360 (landscape, below 375 tall) overlaps the message line and the seats by 6 px.

## 7. Not in the mockup (build PRs)
Real settings persistence and the unsaved-changes guard on leaving; keyboard shortcuts and focus management (PR 6); sound and haptics playing (PR 7); the tip slot (#3) and the analytics entry (#15), which are reserved room only; the Table rules sheet (PR 8). Fonts load from Google Fonts here; the app self-hosts them. Triple down and the double face-down card are listed in Settings but the scenes do not play them.
