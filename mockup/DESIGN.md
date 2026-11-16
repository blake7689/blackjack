# Blakejack design system (round 14)

Source of truth for the build PRs (#79-#87). Every value below is current; each topic is stated once. The mockup (`index.html`, `mockup.css`, `mockup.js`, `rules.js`, `assets/`) shows all of it; where this file and the code disagree, the code wins. Open it through the dev server: `http://localhost:5173/mockup/index.html` (`#settings`, `#settings/sec-look`, `#brand`; `?clean` hides the Demo tab). `BRIEF.md` holds Blake's decisions and feedback; `RESEARCH.md` says what we took from whom. How a decision came about is in the appendix (history only, nothing there is binding).

## 0. Authority, and where this overrides the approved spec
**This file is the design authority for the build PRs #79-#87.** Where the approved spec (`01-Projects/Blackjack/Specs/UI revamp.md`) and this file differ, this file wins; the spec will be amended to match.

| Topic | The spec says | This mockup decides | Why |
|---|---|---|---|
| Look | Brass, leather and serif "luxury" | Modern dark premium: near-black UI, one accent, real objects on a lit felt | Blake, round 1 |
| Fonts | One self-hosted display font + system UI | Clash Display (display) + Satoshi (UI), both Fontshare; self-host one woff2 each (licence to settle in #79, with a CREDITS.md) | Round 1 direction |
| Felt fonts | The display font | **Two serif families, the felt print only:** Cinzel 700 (payout line) and Cormorant Garamond 700 with lining numerals (rules and insurance lines). Both OFL; self-host one woff2 each, subset to A-Z, a-z, 0-9, space and "·" | Blake, round 10 |
| Rules presets | Preset tiles with summaries | A compact dropdown showing the preset and its house edge; "Custom" when any rule is changed (a state, not a choice) | Blake, rounds 1 and 7 |
| Settings layout | Collapsed Customize / House variations / Advanced groups | Every Settings section is a disclosure, **closed on arrival, one open at a time** (an accordion); its header names it and sums up its values; inside Table rules, flat groups (Shoe, Dealer, Payouts, Doubling, Splitting, Surrender, House variations, Advanced) | Blake, rounds 1, 7 and 12 |
| Hole-card mode | "Second card" segment + an Advanced "doesn't check" checkbox | One choice "Dealer's second card": Peeks / No peek / **No second card**; the same words on the felt print and in the rules sheet | Planner, Blake rounds 7 and 9 |
| Shoe | A shoe in the top strip | Only the corner of the top card, at the felt's top-right; the shoe is off the table | Blake, round 1 |
| Card width | 44-120 px | 40-156 px, whole pixels (section 4) | Readable cards on large screens |
| Chip stacks | Up to 6 chips per column, several columns | One column, up to 10 chips, each lifted 6 % of its width | Blake, round 1 |
| Chip rack | Scrolling rack | Whole chips only: evenly spaced when they fit; otherwise it scrolls by whole chips, none cut at rest | Blake: chips never clip |
| Chip tap | A tap on a chip bets it (one seat) | **A tap on a rack chip selects it; a double tap (double click) adds it to the first bet circle; a tap on the circle bets the selected chip** | Blake, rounds 12 and 13 |
| Table limits | (none) | None (play money); per-preset limits are a `later` issue | Blake, round 12 |
| Totals | A total pill | Beside the hand, never on a card (above it with several hands in portrait, in its own column on wide and landscape screens); a natural says "Blackjack!" | Blake |
| Brand word | "Blakejack on Split", "Blakejack Pays" … | **The hand is "blackjack" everywhere** (Settings, the rules sheet, the felt print, the pill, the verdict, the tags, for player and dealer); **"Blakejack" is only the app's name** (wordmark, page title, card back). Sentence case everywhere | Blake, rounds 7, 9, 11 |
| Hand totals | Always shown | Display setting **Show hand totals** (`showTotals`, on): off hides every total pill in every phase and drops the totals from the hands' accessible names; **the "Blackjack!" badge still shows** (and the hand's name says "blackjack"). Not a rule key | Blake, rounds 7 and 12 |
| Count | Hidden while the opening cards are dealt (`dealingStyle`) | **Live, never blank:** changes as each card lands face up (the hole card when it turns); fixed-width figures in a fixed box. Totals still hide while dealing | Blake, round 11 |
| Dock actions | All shown, unavailable ones dimmed | **Turned off by a setting: not shown** (Surrender when "none", Triple when off, insurance and even money when insurance is off). **Possible in the rules but not on this hand: shown dimmed** | Blake, round 11 |
| Result tags | A tag on every hand | Per-hand tags only with two or more hands; one hand shows the verdict line and the dock summary | Blake, round 11 |
| Top bar | Balance after the wordmark | Balance centred on a sleek bar; menu and wordmark left, count and Settings right | Blake, round 7 |
| Peek | (not designed) | The mirror check: the hole card slides up a short way and back; most of it stays in view; **its length follows Game speed** | Blake, rounds 11 and 12 |
| Shuffle | (not designed) | In the centre, in order, nothing vanishing; its length follows Game speed; a tap skips it | Blake, rounds 10 and 12 |
| Include cut card | A switch | Kept, in the Shoe group; off = no end-of-shoe shuffle, and a mid-round refill plays a short shuffle | Blake, round 12 |
| Split dealing | Not in the spec | **New rule key `splitDeal`** ("Deal split hands": One at a time / Both at once), default "one". **Needs its own issue:** `LEGACY_RULES.splitDeal = "both"`, a `SETTINGS_VERSION` bump, a `RULE_SINCE` entry | Blake |
| Doubles | Sideways double (shipped); #66 face-down double | Both designed (section 5) | Blake |
| Start screen | Home first | **A signed-in player opens straight onto the table** (Home is in the menu); a signed-out player sees Home | Blake, round 12 |
| Tip slot (#3) | Reserved line above the action bar | Kept: `.tip-line` above the dock, 0 px while empty | — |
| Kept as they are (Blake, round 12) | — | Count on by default; the results dock keeps the balance; the red "−$25" bet badge; the full-size resting cut card; out of credits = the hidden top-up only (no follow-up); all four fonts; light mode leaves the felt and cards unchanged; the insurance "No thanks" nudge; "Deal split hands" defaults to One at a time (#133); landscape betting keys icon-only; the sideways double stays sideways | Blake, round 12 answers |

## 1. Direction in one paragraph
Modern dark premium. A near-black room, flat dark UI with one bold accent (emerald by default), and a table that is a real object seen from above: real card faces at real proportions, small printed **ceramic** chips, the corner of the top card peeking out of a shoe that sits off the table, lettering printed into the cloth, all lit by **one overhead lamp**. The UI never imitates materials; the table never looks flat. Signature moves: the lamp follows the hand in play and the light *is* the result (a bloom on a win, a sheen on a blackjack, dim on a loss); one verdict line on the felt; the **Blakejack wordmark** (no monogram anywhere) in the top bar and on every card back.

## 2. Real-table proportions
Everything on the table scales from the card width `cw` (a real card is 63 mm wide):
| Object | Real | On screen |
|---|---|---|
| Card | 63 x 88 mm | `cw` x `1.452cw` (the PNG face sits at 94 % inside a white card with 6 % corners) |
| Chip | 39 mm, 3.3 mm thick | `0.6cw`; each chip in a stack is lifted 6 % of its width |
| Bet circle | about 75 mm | `1.15cw` in portrait (narrow seats: 0.6 x seat width), `cw` beside the hand on wide and landscape screens; never under 44 px |
| Card spread | about half a card | **step `0.27cw`** for every hand: each earlier card shows its corner strip (rank and suit whole; the corner is 20 % of the card), the newest card whole. A hand longer than its room never tightens: it slides left, clear of the shoe |
| Felt print | about 15 mm capitals | 16-26 px payout line, 14-17 px rules line, 13-15 px insurance line; never under 12 px |

## 3. Tokens

### Theme axes (attributes on `<html>`)
| Attribute | Values | Default |
|---|---|---|
| `data-felt` | `green`, `blue`, `red` | green |
| `data-accent` | `emerald`, `sapphire`, `ember`, `orchid` | emerald |
| `data-mode` | `dark`, `light` (Settings also offers "Device") | dark |
| `class="no-totals"` | Show hand totals off | absent |
The felt and the table objects do not change with the mode; only the UI around them flips. Because these attributes sit on `<html>`, no click handler may look them up with `closest("[data-felt]")` (it matches `<html>`); the pickers use `button[data-felt]`, `data-pick-accent`, `data-pick-mode`. Never reuse the class `.ghost` (the flying-chip layer) for a button.

### UI colours per mode
| Token | Dark | Light | Use |
|---|---|---|---|
| `--bg` | `#070908` | `#e6e7e2` | Room, page, top bar |
| `--bg-2` | `#0c0f0e` | `#f8f8f5` | Dock |
| `--surf` | `#141817` | `#ffffff` | Keys, segments, dialogs, Settings section headers |
| `--surf-2` | `#1c211f` | `#eef0eb` | Hover |
| `--surf-3` | `#252b29` | `#e2e5df` | Toggle track off, save bar, toast, hint |
| `--sec-body` | `#0a0d0c` | `#eaece6` | A Settings section's inset body |
| `--line` / `--line-2` | white 8 % / 15 % | ink 10 % / 18 % | Hairlines / borders |
| `--tx` / `--tx-2` / `--tx-3` | `#eef2ef` / `#a6b0aa` / `#85908a` | `#0d110f` / `#48514c` / `#59625d` | Text levels (`--tx-3` AA on `--bg-2` and `--surf`) |
| `--win-tx` / `--lose-tx` | `#3fe397` / `#ff6b5e` | `#07703f` / `#b42318` | Win and loss as text on the UI (badge, dock summary, danger buttons) |
| `--lose-line` | coral 50 % | `#b42318` 45 % | Danger outline border |
| `.ferr`, alerts | `#ff8f84`, `#ffd2cc` | `#b3261e`, `#8c1d14` | Inline errors, the login alert |
| `--groove-1/2` | `#040505` / `#0f1211` | `#d9dcd5` / `#eceee9` | Rack and chip-picker groove |

### Accent (fill, ink on the fill, accent as text)
| Accent | Dark fill | Ink | Text on dark | Light fill (white ink) | Light text |
|---|---|---|---|---|---|
| Emerald (default) | `#1ed18a` | `#02160d` | `#3fe39f` | `#077f4f` (5.05:1) | `#066b43` (5.29:1) |
| Sapphire | `#6b95ff` | `#040c22` | `#8eaeff` | `#2f61e3` (5.33:1) | `#2552c4` (5.48:1) |
| Ember | `#ff7b3f` | `#1e0a01` | `#ff9566` | `#b8450f` (5.39:1) | `#b04110` (4.68:1) |
| Orchid | `#c28dff` | `#15062a` | `#d2a9ff` | `#8a4ad8` (5.18:1) | `#7438bf` (5.52:1) |
Also `--accent-rgb` (glows) and `--back-hi` (the card back's light line). The accent appears on: the primary key (Deal, Hit, Next hand, Save), the selected rack chip's ring, the active bet circle, the active total's ring, the wordmark's diamond, the card back's guilloche, focus rings, toggles, sliders and the win light. Nowhere else. The primary key's small "auto" line and its key hint are full ink; other keys' hints are `--tx-2`.

**Contrast (measured):** axe `color-contrast` over every screen and state for every accent x felt x mode at 390x844 and 1440x900: no failures (a disabled control is exempt as inactive). The felt print and the message line, which axe cannot judge, are measured over the **brightest felt pixel behind each glyph** not under a card or a moving chip, in betting, playing, offers, cut card, win, blackjack, loss and bust, every felt and mode, 320x568 to 1920x1080: every line at least 4.5:1 (worst 4.6:1, desktop win).

### Felt (per `data-felt`)
| Token | Green | Blue | Red | Use |
|---|---|---|---|---|
| `--felt` | `#0a422c` | `#0e3253` | `#52111a` | Cloth mid tone |
| `--felt-hi` | `#0f593a` | `#174a7a` | `#771d2a` | Cloth under the lamp |
| `--felt-lo` | `#021710` | `#041325` | `#1c0407` | Cloth at the edges |
| `--print` | near-white 96 % | 96 % | 96 % | The felt print, bet rings |
| `--print-strong` | 100 % | 100 % | 100 % | The message line |
| `--shadow-c` | `1 14 8` | `2 9 20` | `18 3 5` | RGB of cast shadows |
| `--back-bg` | `#0f1513` | `#0f1218` | `#151011` | Card back ground |

### Fixed colours
`--win #3fe397`, `--lose #ff6b5e`, `--push #c5cfd8`, `--even #6fe3d2`, `--surr #f0b77d` (on the felt, both modes), rail `#17191a` > `#050606`, cut card `#f7d55a` > `#e9b81f`.

Ceramic chips (`assets/build.mjs`, `CHIPS`): body / print / ink / side. `1` `#ebe8e1` `#27458f` `#1f3473` · `5` `#a5222b` `#f1ebe0` · `10` `#1f4a96` `#f1ebe0` · `25` `#1e6a45` `#f1ebe0` · `50` `#c8682a` `#1d2b4d` · `100` `#1c1c21` `#e9e2d2` · `1K` `#d6a92c` `#22201a` · `5K` `#5e3a24` `#ead8b2` · `10K` `#d4709a` `#fbeef3` · `20K` `#7fb6dc` `#0f2c44` · `50K` `#5b3a8f` `#efe6fb` · `100K` `#8d9296` `#16191b` ("100K" set tighter so it stays 12 px on a 44 px chip).

### Type
| Role | Face | Weight | Size |
|---|---|---|---|
| Display: balance, verdict, section titles, house edge, chip numerals | Clash Display | 500-600 | balance 19 (21 desktop, 17 landscape); verdict 28-40; Settings section title 19 |
| Felt print, payout and insurance lines | Cinzel (capitals + its small capitals) | 700 | payout 16-26, insurance 13-15 |
| Felt print, rules line (and the landscape line after the payout) | Cormorant Garamond, **lining numerals** | 700 | 14-17 (12 in the landscape line) |
| UI: everything else | Satoshi | 400 / 500 / 700 | keys 13 and 17; rows 15; segments 14; labels 12; hints 13 |
| Wordmark | drawn paths | stroke 6 | top bar 15-19 px tall |
12 px is the floor everywhere. The print is laid out at 1:1 in its own box and fitted to its width (each line keeps its own tracking), and it is redrawn whenever its box changes, so no glyph is ever scaled under 12 px.

### Space, radii, elevation
Space 4 px base (`--s1` 4 to `--s7` 48). Radii `--r1` 8, `--r2` 12, `--r3` 16 (keys, Settings sections), `--r4` 22, `--r5` 28 (felt slab from 600 px); cards 7 % of their width. UI is flat (1 px `--line` borders); only the primary key and floating layers (menu, save bar, toast, hint, preset list) carry shadow.

### The light model (table objects only)
One lamp above the table, slightly toward the player. Art is lit top-left (chips' gloss, the card back's paper light, a sheen on faces). `.felt-light` is a radial pool at `--lx --ly` (alpha `.08 x --lamp`, 900 ms) that sits mid-table between rounds and follows the active hand. Cast shadows fall away from the lamp (`shadowFor()`). Result light (900 ms): a win lifts the lamp to 1.1 with an accent bloom at the player's edge (`75% 34%`, 30 %) that stays below the print; a blackjack adds an 8 % sheen sweep; loss, bust and surrender darken from the bottom with the lamp at .55; a push is a faint cool bloom. The shoe throws a soft shadow into the top-right corner.

### Motion
Easings: `--e-out (.16,1,.3,1)` UI · `--e-weight (.33,0,.15,1)` objects on cloth · `--e-spring (.34,1.4,.64,1)` verdict/toggles · `--e-io (.65,0,.35,1)` flips and light. Durations: press 120, UI 220, state 320, flip 420, slide 560, light 900 ms.
| Moment | What moves | Timing |
|---|---|---|
| Deal | a card leaves the shoe's mouth face down at a slight angle (-36 deg through -12 deg to -5 deg at 84 %), squares up and **turns over as it lands** (the turn starts at 80 % of the flight); the hole card stays down. A card in flight is `down` with **no face image and no alt**; its face arrives with the turn | slide `clamp(.52 x speed, 300, 760)` ms; turn 420 ms |
| Flips (landing, hole card, face-down double, sweep) | 3D, edge-on: `rotateY` with a 520 px perspective and a 7 % lift at the edge-on moment; the shadow travels on the faces while turning. One element, flips in place | 420 ms `--e-io` |
| Peek | the mirror check: the hole card slides up so its top edge tucks under the felt's top (about 14 % of the card), holds, slides back; at least 85 % of it stays in view every frame; its face never shows | up 420k, hold 450k, down 420k ms; k = speed / 1000, 0.33-1.2 (as the shuffle) |
| Bet chip | **a chip tap selects; a double tap on the chip or a tap on the circle bets:** the rack chip's copy glides to the circle and shrinks to table size | 360 ms |
| Undo / Clear | the stack glides back to the rack | 380 ms |
| Win | the dealer's chips come down from above the table's edge and land beside the stake **on the side away from the hand** (right of the circle in portrait, left on wide and landscape screens), hold, then both slide down into the dock | 560 ms, hold 240, 720 ms |
| Loss / bust | the stack is swept up off the table's top edge | hold 260, 700 ms |
| Push / surrender | the stake slides down / half up, half down | 680 / 700 ms |
| Settle handoff | each stack on the table (bet, double, insurance) is replaced by an exact moving copy **in the same frame** it hides: a chip never blinks out | — |
| Verdict | pops in, letter-spacing closing; "BLACKJACK!" glows in the accent with a sheen | 620 ms spring; sheen 1400 ms |
| Balance | counts in whole dollars. **The badge shows every real change of the balance**: "−$25" when a bet is placed (by hand, by Rebet, 2x, a double, a split, insurance, or **when a new round re-places the bet automatically**), "+$50" when a win pays, "+$25" when a push returns the stake; nothing after a loss. On phones it takes the label's place, on wide screens it sits after the number; the balance never moves | 700 ms; badge 2.6 s + 400 ms |
| Count | changes as each card lands face up (the hole card when it turns); never blank | with the landing |
| Totals | change only once the card has landed face up; hidden while the opening cards are dealt | with the landing |
| End of round | Next hand: every card sweeps off to the discard pile (top left), the dealer's first, 45 ms apart, **turning face down as it starts**, landing square; the pile shows only backs and thickens when they arrive | 620 ms each |
| Shuffle | in order, nothing fading: **the shoe slides away** (the discard pile with it, emptied), **the deck comes down** into the centre, **riffles**, **goes back up** off the top, then **the shoe slides back**. Its length follows **Game speed** (4.5 s at Normal, about 1.5 s on Very fast); **a tap on the table or the dock skips it** (every move jumps to its end, the order stays). It covers the print's lower lines while it plays (accepted) | shoe 780k, down 620k, riffle 1700k, up 560k, shoe 780k ms; k = speed / 1000, 0.33-1.2 |
| Mid-round refill (Include cut card off) | when the shoe runs out mid-round the same shuffle plays short (k 0.35), then dealing goes on; the cards on the table stay | about 1.6 s |
| Cut card | once drawn it comes out of the shoe and lies at the felt's left edge, half off it, well below the discard pile, until the shuffle | 760 ms |
| Re-centring | when a hand grows or re-centres, or a split narrows the seats, every card already down glides | 320-360 ms |
`prefers-reduced-motion: reduce`: no flights, flips, sweeps or shuffle; the same order of states, each shown at once.

## 4. Layout
One column; the dealer is always above the player; everything centres on the felt; the page is exactly the viewport (no scroll).
| Mode | Trigger | `--top` | `--dock` | `--rail` | `--rc` | Notes |
|---|---|---|---|---|---|---|
| Phone | default | 48 | 134 | 10 | 44 | dock two rows (rack 54, keys 50) |
| Short phone | height <= 740 | 44 | 126 | 8 | 44 | dock two rows (52, 46) |
| Tablet | width >= 600 | | | | | the felt becomes a slab with gutters and `--r5` corners |
| Desktop | width >= 900 | 52 | 92 | 12 | 50 | dock one row; keys show shortcuts |
| Desktop short | width >= 900, height <= 740 | 46 | 84 | | 46 | |
| Landscape phone | height <= 520 | 40 | 64 | 8 | 44 | dock one row (small betting keys icon-only, Deal at least 96 px); the circle beside the hand; the print one line |
| Wide desktop | width >= 900 and aspect >= 5:4 | as Desktop | | | | the circle beside the hand, as in landscape; the print the same arc as on a phone |

**Card width** (`.stage-in`, inside the size container `.stage`): `--cwr = clamp(min, min((100cqb - --fixed) / --rows, --cwi, --cmax), max)`, floored by script into whole-pixel `--cw` / `--ch` (and hands snapped with `--fx/--fy`), so faces never resample.
- Portrait: `--fixed` 172 (204 with several seats, 226 when narrow seats keep room for side stacks), `--rows` 4.254, `--cwi` 23cqi (17cqi multi), `--cmax` 118 (128 from 900 px wide).
- Landscape: `--fixed` 88, `--rows` 2.904, `--cwi` 13cqi, max 100; with several hands capped so up to four fit a row: `((100cqi - 24 - (min(n,4) - 1) x gap) / min(n,4) - 82) / 3.664`, min 40.
- Wide desktop: `--fixed` 168, `--rows` 3.104, `--cwi` 12cqi, max 156; several hands 9cqi (6.5cqi from four) with the same four-in-a-row cap, min 48.
Results: about 89 px at 390x844, 148 at 1440x900, 66 at 844x390 (one hand).

**Stage padding** (room above the dealer's cards): 20 px on phones (15 on short phones), 26 on desktop, 12 in landscape.

**Hands:** cards in a straight row, square to the screen, each new card on top of the one before it, to the right, for dealer and player alike. 3D is on only while a card is face down or turning. The **total** never touches a card: beside the hand on the right for the dealer and a single seat; centred above the hand with several seats in portrait (32 px reserved); in its own 56 px column beside each hand on wide and landscape screens. The dealer's hand stays clear of the shoe (its room is measured from the shoe's corner card).

**Seats:** one by default; a split adds a seat, keyed by hand (cards already down glide). Up to four hands share one centred row; when a row does not fit (five or more, or four on a small landscape phone, or a side stack spilling) it scrolls one hand at a time, the active hand centred, neighbours fading at the edges. The decision is made once per hand count and width, so a re-render never resets it. Hands not in play dim to 62 % brightness (never opacity).

**Side stacks (double, insurance):** never over the bet. Portrait with room: beside the circle (insurance left, double right). Narrow portrait seats: under the amount, in room the seats keep for them. Wide screens: just above the circle, side by side, "INS" beside its stack. Landscape phones: on the circle's outer side, the circle's column growing to hold them.

**Middle:** the felt print and the message line are one block, **centred between the dealer's hand and the first seat** (`centrePrint()`, by their boxes so it never jumps), never closer to the player's cards than 8 px plus room for a two-line verdict. The message line is 48 px (12 px tracked caps) or the verdict.

**Other:** safe areas on all four sides (`viewport-fit=cover`); one 1240 px column for the top bar, felt and dock; the tip line (#3) above the dock at 0 px; on wide screens between rounds the dealer's card place is printed faintly (one outline, 16 %).

## 5. Components
| Component | Code | Notes |
|---|---|---|
| Top bar | `.top` | One quiet row, no boxes, three columns with equal outer ones: menu + wordmark left; the **balance centred** (label over the number on phones, one line on wide screens and landscape; plain text, the hidden top-up listens here: no role/tabindex/aria); count + Settings right. Heights in section 4 |
| Count | `#count` | Hi-Lo over cards seen face up, reset on a new shoe; true count `round(running / max(1, cards left / 52))`. Two short lines on phones ("Count +3", "True +1"), one line on wide screens: each label then its figure in a fixed right-aligned column (tabular), no gap opening up; hidden when the count setting is off |
| Menu | `.menu` | Home, Table rules, Analytics (Soon, #15), Settings, felt swatches, Log out |
| Felt + rail | `.felt`, `.rail` | A thin matte rail along the dealer's edge; no chip tray |
| Shoe, discard pile, cut card | `.shoe`, `.shoe-card`, `.mouth`; `.discard`, `#dmouth`; `.cut-rest` | The shoe is off the table, top right: only the corner of its top card shows (rotated -36 deg, clipped by the felt). The **discard pile** is a straight stack, square to the screen, partly off the top-left corner (backs only; hidden while empty; thicker as it grows). The **cut card**, once drawn, rests at the felt's left edge, half off it, with clear room below the pile. None is in the accessibility tree |
| Card | `.card > .cin > .cf + .cb` | Real PNG face clipped to 7 % corners; the back is `#cardback`. A face-down card (in flight, the hole card, a face-down double) has no face image and no alt in the DOM; a face-up card's image alt is its name ("king of diamonds") |
| Card back | `#cardback` | Graphite ground, white border, lattice and waves, a guilloche rosette in the accent, the wordmark on a plate |
| Chip / stack | `#chip-<v>`, `stackSVG()`, `.stack` | Ceramic chip; one SVG per stack, biggest chip at the bottom centred on the circle, each above lifted by its thickness; up to 10 drawn |
| Bet circle | `.spot`, `.side-spot.dbl/.ins`, `.amt` | Printed double ring, "BET" when empty (breathing while betting is open), accent ring when active; idle and disabled when nothing is affordable |
| Total | `.pill` (`.soft`, `.bust`, `.bj`, `.on`) | Dark glass; soft totals "7/17"; a natural on an unsplit hand "Blackjack!" (a split A + ten is 21, unless "Blackjack on split"); the "Blackjack!" badge shows even with Show hand totals off |
| Felt print | `renderPrint()`, `#print` | Printed on the cloth: line 1 "Blackjack Pays 3 to 2" / "6 to 5" (Cinzel); line 2 "Dealer hits soft 17 · Dealer peeks" (or "Dealer stands on all 17s", "No peek", "No second card"; Cormorant, lining numerals); line 3 "Insurance pays 2 to 1" (Cormorant, lining numerals) inside a ruled band of two thin arcs, when insurance is on. Strong arc (radius 1.45 x width), the `#ink` filter (a hint of weave, 0.28 px soft edge), full ink. Landscape: one line. Cards may lie over it. A button named "Table rules" (44 px tall in landscape) that opens the rules sheet |
| Verdict | `.verdict.<kind>` | One word on the felt ("WIN", "BLACKJACK!" …), never over a card; with several hands the net plus a tag under each circle |
| Dock | `renderDock()`, `.key` | Same height in every state. Betting: rack + Undo, Clear, Rebet, 2x, (Pause/Resume), Deal. Playing: Double, Split, (Surrender), (Triple) + Stay, Hit. Offers: Insurance $x / Even money / Surrender + No thanks. Results: net, balance, Next hand. Out of credits: the rack becomes a note with an info icon; nothing that bets is live |
| Chip rack | `.rack-wrap .rack .rc` | The enabled chips the balance covers; evenly spaced when they fit, else scrolled by whole chips with a chevron toward more; the selected chip lifts with an accent ring; desktop shows 1-9 |
| Settings | `buildSettings()` | Sections Table rules, Gameplay, Chips, Appearance, Sound & haptics, Account: each a card (raised `--surf` header, inset `--sec-body` body under a divider), **all closed on arrival, one open at a time**; the header (a button in an h2, `aria-expanded`) shows the name, a one-line summary and a dot when the section has unsaved changes. A deep link opens its section; Save with an invalid name opens Account. Delete profile sits apart at the bottom. Sticky Save/Discard bar |
| Setting hints | `.hint-i`, `.hint-tip` | Every setting name is followed by a small "i" (18 px mark, 44 px tap area) whose hint is a few words on one line ("Same bet each round", "What a natural pays"): a tap or click on the "i" shows it (for 2.6 s, or until the next tap; it never toggles the control), as does 250 ms of hover on the "i" with a pointer or keyboard focus on the control. The "i" is `aria-hidden`; the same text is the control's `aria-describedby` |
| Rules | `renderRules()` | Preset dropdown (button + listbox of the five presets with their edges; "Custom" heads it, not choosable, while edited; full keyboard). Groups: Shoe (Deck size, **Include cut card**), Dealer, Payouts, Doubling, Splitting, Surrender, House variations, Advanced; a group with nothing to show has no heading; rules a mode makes meaningless are hidden |
| Appearance | `.felts`, `.accents`, mode segments | Felt swatches, four accent dots, Dark / Light / Device |
| Rules sheet | `#rulesDlg` | A bottom sheet on phones, a panel from 720 px; preset, house edge, then Payouts, Dealer, Doubling, Splitting, Surrender in plain English; even money only when offered |
| Wordmark | `#wordmark` | "Blakejack" drawn as a monoline logotype; the j's tittle is a diamond in the accent |

## 6. Rules
`mockup/rules.js` holds every rule decision the table makes, as pure functions named after their counterparts in `src/utils/blackjackLogic.js`, `gameEngine.js` and `gameReducer.js` (`canSplit` by card value, `canHit`, `canDouble`, `canSurrender`, `earlyOffer`, `offersAtDeal`, the waiting surrender, the dealer's steps, `settleHand` with 6:5 to the cent and `noHoleCardLoss`, the face-down double's reveal). `simulateRound()` plays a round through the same steps; a scratch audit compares it with the app's reducer (`playRound` in `src/utils/_tests_/stackedShoe.js`) on 30,000 random rounds, 40,000 unit cases and a fixed set "split, first hand A + ten (21), second hand a ten pair" (it resplits whenever `maxSplitHands` allows): no difference. The one rule the app does not have yet is **Deal split hands** (section 0).

## 7. Assets and build notes
`node mockup/assets/build.mjs` regenerates `assets/sprite.svg` (chips, chip sides, card back, wordmark, icons) and `assets/brand/wordmark*.svg`. The sprite is inlined at boot so CSS variables reach inside it. The card faces in `public/cards` are about 4.7 MB of PNG: convert them to WebP for the build, keeping a 500 px-wide source (the largest card is 156 px at DPR 3). Fonts: self-host Clash Display, Satoshi, Cinzel and Cormorant Garamond (one woff2 each; the felt fonts subset), licences recorded in #79.

## 8. Screens, states and focus

### Table states and where focus goes
| State | Message line | Focus |
|---|---|---|
| Betting | "Place your bets" / "Tap Deal" / "Dealing soon" (auto) | stays where the player is (rack, circle, Deal) |
| Dealing | "Dealing" | unchanged (keys dimmed) |
| Offers | "Insurance?" / "Even money?" / "Surrender?" | **moves to the first offer key** (Insurance, Even money or Surrender) |
| Player's turn | "Your move" ("Last hand before the shuffle" once the cut card is out) | **moves to Hit** |
| Dealer, settling | "Dealer plays" … | unchanged |
| Results | the verdict | **moves to Next hand** |
| Shuffling | "Shuffling" | unchanged; a tap skips |
Focus moves only when it was on nothing, or already in the dock; it is never pulled away from anywhere else (Settings, the menu, a dialog). Dialogs give focus to their safe button.

### Keys
H hit, S stay, D double, T triple, P split, R surrender; at the offers I insurance, E even money, R surrender, N no thanks; Space or Enter deal / next hand; 1-9 select a chip, and the same number again straight after adds it to the first bet circle (1, 1 = select, add; any other key in between starts over; a held key does not repeat); U undo, C clear, B rebet, X 2x. Keys follow the dock: a hidden or dimmed action does nothing.

### Settings behaviour
- Hidden rules: EU-only rules hide in US modes; "Blackjack pays immediately" and "If the dealer has blackjack" hide under a peek; "Resplit aces" hides with two hands. The preset match ignores hidden rules.
- Leaving with unsaved changes asks "Discard your changes?" (Keep editing / Discard and leave); a page unload uses the browser's prompt.
- Saving a rule in `RESET_SETTINGS` (including **Include cut card**) mid-round asks "Start a new shoe?": the hand in play ends and bets on it are lost (only an undealt circle bet comes back); between rounds it deals the new shoe without asking.
- An empty first or last name shows its error and stays unsaved, but never blocks the settings: Save saves the rest.
- Sound and vibration are off by default; dependent sliders are disabled (grey, never accent) while their switch is off.
- Display settings that are not rules (no LEGACY_RULES / RULE_SINCE, not in RESET_SETTINGS or the presets): Show hand totals, Show the count, Game speed, Rebet, Auto deal and its delay, chips, appearance, sound.

### Screens
- A signed-in player opens on the **table**; Home is in the menu. *Implementation note:* in the app `/game` redirects to `/` until a game has started (`src/pages/Game.jsx:11`), and only Home's Start Game starts it (`src/pages/Home.jsx:12`). So: while the session restores, show Loading (up to 90 s on a cold start, `COLD_START_TIMEOUT_MS`); once it has, start the game and replace to `/game`. After a log in, start the game and land on the table the same way. This happens once per restore or log in, never on every visit to `/`: Home opened from the menu stays on Home (no bounce back), and a signed-out `/` stays on Home, so there is no redirect loop. **Home** (signed in): wordmark, a felt hero (two cards lying flat and a chip), Play / Rules / Settings, "Signed in as … · Log out". **Signed out** (`#home/out`): "Please log in to start playing.", Log in / Create an account / Rules.
- **Login:** "Log in" (heading and button), label "Username or email" with placeholder **"Username or Email"** (tests fill it by placeholder), "Password"; waking state ("Waking up the table…", "Logging in..."); error state (one alert, fields `aria-invalid`). **Create an account:** the app's five fields and messages; "Create account" disabled until all are valid.
- **Loading** ("Shuffling up...") and **Error** ("Can't reach the table", Try again, Home).
- **Notices:** "Reconnecting..." with a pulsing dot; a refused bet in coral; out of credits as in section 5.
- **Leaving the table mid-round** (menu Home once cards are out) asks "Leave game and return Home?" / "Any bet in the circle will be lost." (Keep playing / Leave).
- **Destructive confirms** use the danger outline; the safe button comes first and takes focus.
- **Hidden top-up (#90):** 7 taps in 3 s on the balance (balance under $100, betting, nothing on the table) create the "Enter code" dialog; nothing about it is in the DOM before that; every refusal shows "That didn't work."; removed on close.
- **Inline links** (Log out, Create an account, Log in) have a 44 px tap area without changing their look.

## 9. Test names (e2e and the live smoke)
**Rule:** keep the app's accessible name wherever the look stays the same; rename only where the visible text or the behaviour changes. Every rename is made in `e2e/` **and** `e2e-live/live.spec.js` **in the same PR** as the screen it tests. The CLAUDE.md hooks `.flight-layer`, `.fly-inner`, `.options-wrap` and `.board.busy` go on the equivalent new elements; they stay.

| e2e / live smoke uses | Where | The mockup | Action |
|---|---|---|---|
| link "Log in" | fixtures, live | Signed-out Home "Log in" link | keep |
| placeholder "Username or Email", "Password" | fixtures, live | same placeholders | keep |
| button "Log in" (exact) | fixtures, live, a11y | Login button "Log in" | keep |
| text "Please log in to start playing." | a11y | Signed-out Home | keep |
| role alert (login error) | a11y | `role="alert"` | keep |
| text /waking up/ | cold-start specs | "Waking up the table…" | update: `/waking up/i` |
| button "Start Game" | most specs, live | Home "Play" (a link) | update |
| button "tester" (header name) | smoke | Home "Signed in as …" | update |
| button "Settings" (exact) | routing, settings, a11y | top bar icon button "Settings" | keep |
| button "Back to game" | routing | Settings back button "Table" | update |
| tabs "Player", "Game", "Dev" | settings, routing, a11y | accordion sections, each a button with `aria-expanded` (`getByRole('button', { name: /^Table rules/ })`); no Dev section yet | update |
| label "playTimeout" | dev-setting spec | not designed | update when designed |
| button "Add 10", /^Add \d+$/ | most specs, live | **a chip click selects it:** rack chip "$10 chip" (`aria-pressed`), then the bet circle "Bet spot 1, …" bets it; or double-click the chip (`dblclick()`, or key 2 pressed twice) to bet it at once | update: select the chip and click the circle, or `dblclick()` the chip |
| button "Deal" (exact) | most specs, live | Deal key "Deal" | keep |
| buttons "Hit", "Stay", "Surrender", "No thanks" | many, live | same labels (Surrender is absent when surrender is "none") | keep |
| group "Offers" with "Insurance $5", "No thanks" | a11y, offers, live | the dock is `role="group"` "Offers" at the offers | keep |
| text "Insurance?" | offers | message line "Insurance?" | keep |
| text "Insurance or surrender?" | offers | one question per offer | update |
| button "Pause auto deal" | autodeal | Pause key "Pause auto deal" / "Resume auto deal" | keep |
| img "king of diamonds" … | deal, split, rules specs | face `alt` (only once the card has turned face up) | keep |
| text "Click anywhere to continue..." | most specs, live | "Next hand" key (a click on the felt still continues) | update |
| text "Place your bets!" | fixtures, live | "Place your bets" | update |
| text "Credits:" | a11y top-up specs | top bar "Balance" | update |
| `.stats-panel > div:nth-child(2)` | live | `#bal` | update |
| dialog "Enter code", label "Code", "Submit", "Cancel", role alert | top-up specs | same | keep |
| rule group names and `aria-pressed` options | settings | open "Table rules" first; sentence-case names ("Blackjack pays", "Double on", "Deck size", "Include cut card" …); options `role="radio"` + `aria-checked`; each control `aria-describedby` its hint | update |
| checkbox "Blackjack on Split" | settings | switch "Blackjack on split" under House variations | update |
| preset tile /^Vegas/ | settings | the "Preset" dropdown; options `role="option"` | update |
| rule hint text (/insure for half your bet…/ …) | settings | short hints (each control's `aria-describedby`; the "i" `.hint-i[data-hint]` shows it) and the rules sheet | update |
| `.hand-result.Win` / `.Surrendered` | rules specs | `.tag.win` / `.tag.surrender` (several hands), the verdict (one) | update |
| `.page-bg`, `details[open]`, `.rule-tile, .seg-btn, .rules-section summary, .toggle-row` | settings, a11y | `.settings-screen`, `.sec-h`, `[data-rule]`, `[data-preset]`, `.sw` | update |
| (new) switch "Show hand totals" | — | Gameplay | add tests |

## Appendix: history (not binding)
How the current design came about; each line is superseded by sections 0-9 where they differ.
- **Rounds 1-4:** direction (modern dark, one accent, lit felt), real proportions, ceramic chips, the shoe corner, the wordmark and card back; rules mirrored in `rules.js` and audited against the app.
- **Round 5:** contrast of the print (then 95th-percentile measurement), sideways and face-down doubles, 12 chips and the whole-chip rack, Settings safety (leave/reset confirms, profile errors), new screens (rules sheet, Home, Login, loading, error, notices, out of credits, hidden top-up), safe areas, keys.
- **Rounds 6-7:** side stacks never over the bet; out of credits fully idle; e2e placeholders kept; leave-table confirm; destructive confirms in the danger outline; test-name rule (section 9).
- **Round 8:** Show hand totals; preset dropdown; collapsible sections; "blackjack" in Settings; the balance centred.
- **Round 9:** light mode AA; long dealer hands; "Delete profile".
- **Round 10:** Settings sections as cards; the dealer's up-card gap dropped; tweaks from Blake's recording (0.27 overlap, face-down flight and turn, edge-on flips, sweep to a discard pile, cut card at the left edge, centre shuffle, the recording-style print).
- **Round 11:** dealt cards truly face down until the turn; totals in their own column on wide screens; landscape dock icon-only; the print and light retuned for AA over the brightest pixel; lettering as ink on cloth (Cinzel, Cormorant); chip handoff; mirror shuffle order; balance badge on real changes; straight discard pile; face-down sweep.
- **Round 12:** the print centred between the hands; "Blackjack!" in play; the count live; setting-off actions hidden; split A + ten shows 21; the mirror peek (short slide); cut card clear of the pile.
- **Round 13:** desktop multi-hand fixes (four hands in a row, a CSS cycle that made circles 0x0, the print redrawn on resize); winnings on the circle's outer side on wide screens; focus per state; chip tap selects only; the shuffle follows Game speed and can be skipped; Include cut card and the mid-round refill; the badge on the automatic rebet; setting hints; the Settings accordion; the peek follows Game speed; signed-in players start on the table; the "Blackjack!" badge shows with totals off; this document folded into one current text.
- **Round 14:** a double tap (or a number key twice) adds the chip; the "i" after each setting name replaces the long press; the signed-in start-up note; "A+ten after a split counts as blackjack"; the mid-round refill says "Shuffling".
