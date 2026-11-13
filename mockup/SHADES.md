> **Superseded (round 1, 2026-11-12):** this describes the first mockup, which Blake rejected. The current design is in DESIGN.md.

# Blakejack felt themes (mockup for #78)

Custom properties on `:root`; the theme is set with `data-theme="green|blue|red"` on `<html>` (green is the default and has no attribute).
The same table is in the comment block at the top of `mockup.css`. Everything on the table and in Settings is painted from these tokens, so a theme is nothing more than this list.

| Token | What it paints | Green (default) | Blue | Red |
|---|---|---|---|---|
| `--felt-base` | Table cloth, mid tone | `#17623f` | `#184b7e` | `#7e1c28` |
| `--felt-light` | Spotlight at the centre of the cloth | `#23865a` | `#2a6aa6` | `#a8303d` |
| `--felt-dark` | Vignette and rim | `#082c1c` | `#071f3b` | `#2f0a10` |
| `--panel` | Dock and the Settings cores | `#0b2619` | `#0a1c33` | `#260b10` |
| `--panel-raised` | Buttons and surfaces sitting on a panel | `#123526` | `#112c4c` | `#3a1219` |
| `--brass` | Trim, hairlines, rules | `#c9a24b` | `#cfa84e` | `#d6ad58` |
| `--brass-light` | Highlights, selected state, the balance figure | `#efd78f` | `#f1d993` | `#f4dc9a` |
| `--brass-dark` | Shadow side of the trim, button edges | `#7f6120` | `#86672a` | `#8d6a2c` |
| `--text` | Primary text (cream) | `#f5efdc` | `#f3f1e8` | `#f7eee0` |
| `--text-dim` | Secondary text, hints | `#b4c4b4` | `#b3c1d6` | `#d8b9b9` |
| `--print` | Ink printed on the felt (rules arcs, bet circles) | `#e3d6ad` | `#dfe2e6` | `#ecdcba` |
| `--leather` | Padded rail and the dealer's edge (dark end) | `#150e08` | `#141922` | `#240d10` |
| `--leather-hi` | Rail highlight (light end) | `#34241a` | `#2b3340` | `#4a2328` |
| `--room` | The dark room around the table, Settings background | `#050c08` | `#050a12` | `#0d0507` |

New in this pass: `--leather`, `--leather-hi` and `--room`. The five felt, panel, brass, text and print shades are unchanged from the first mockup.

Same in every theme:

| Token | Value | Use |
|---|---|---|
| `--win` | `#7fe3a1` | Win text and glow, balance up |
| `--lose` | `#ff8f80` | Lose, bust, balance down |
| `--push` | `#b9c6d8` | Push |
| `--ivory` | `#f7f1e1` | Card face |
| `--ink` | `#2a1d05` | Text on a brass plate (primary buttons, selected segment, Blakejack pill) |
| `--thread` | `#d9c088` | Stitching on the leather rail |
| banner extras | even money `#6fe3d2`, surrender `#e6bd8e` | Result banners only |

Brass is also a gradient: `--brass-grad` = `--brass-light` > `--brass` (52 %) > `--brass-dark`, top to bottom; `--brass-metal` adds a second highlight for the trim ring around the felt.

Chip colours (SVG, fixed; the second colour is the edge spots and the third the numeral): 1 white `#e9e4d6`, 5 red `#b8232b`, 10 blue `#1d54ad`, 25 green `#1b7f48`, 50 orange `#df7a26`, 100 black `#1b1b20`, 1K yellow `#e0b92f`, 5K brown `#6d4326`. Each chip also has an edge colour (the stack thickness): `#a8a291`, `#6d1217`, `#0f356f`, `#0d4d2a`, `#8f4a10`, `#000`, `#8d6f0c`, `#35200f`.

Notes
- Brass is nudged per theme (not identical) so it keeps its contrast against each panel and leather colour.
- Blue felt prints in cool silver (`--print`), green and red print in warm cream.
- Contrast (WCAG, computed), green / blue / red:
  - `--text-dim` on `--panel` 8.8 / 9.4 / 10.2, on `--panel-raised` 7.4 / 7.7 / 9.0.
  - `--text` on `--panel-raised` 11.7 / 12.5 / 14.3.
  - `--brass-light` on `--leather-hi` (the balance on the rail) 10.5 / 9.1 / 10.0, on `--leather` 13.5 / 12.7 / 13.6.
  - `--ink` on `--brass` (button plates) 6.9 / 7.3 / 7.8.
  - `--print` on `--felt-base` 5.1 / 6.9 / 7.4 (the printed felt text is 12.5 to 26 px and bold, so 4.5 is the bar).
  - Result banner colours on the banner's near-black plate: win 11.9, lose 8.4, push 10.7, even money 12.0, surrender 10.7.
