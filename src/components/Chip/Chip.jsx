import { Fragment } from "react";
import { splitChips } from "../../utils/chips";

// A ceramic chip (#82): the sprite's `#chip-<v>` (assets in components/Sprite/ChipSymbols.jsx), sized by its box. Decorative: the button or label around it names it. //
export function Chip({ value }) {
  return <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><use href={`#chip-${value}`} /></svg>;
}

export const THICK = 6; // each chip in a stack is lifted 6 % of its width (a 39 mm chip is 3.3 mm thick, foreshortened); chipFlight.js draws the same stacks

// One stack seen from above (#82, the mockup's stackSVG): the amount split greedily into the largest chips, the biggest at the bottom, up to ten
// drawn, each above lifted by its thickness so only its lower edge shows. `--k` is where the bottom chip's centre sits (1/100 of the width), so CSS
// anchors the stack on it. The top chip carries its numeral, unless the stack is under 44 px wide (CSS swaps in the plain face then). //
export function ChipStack({ amount }) {
  const list = splitChips(amount);
  if (!list.length) return null;
  const n = list.length;
  return (
    <svg viewBox={`0 0 100 ${100 + n * THICK}`} style={{ "--k": (n - 1) * THICK + 50 }} aria-hidden="true" focusable="false">
      {list.map((v, i) => {
        const y = (n - 1 - i) * THICK;
        const top = i === n - 1;
        return (
          <Fragment key={i}>
            <use href={`#side-${v}`} y={i ? y + THICK : y + THICK * 0.6} width="100" height="100" />
            {top
              ? <><use className="num-face" href={`#chip-${v}`} y={y} width="100" height="100" /><use className="plain-face" href={`#chip-${v}-p`} y={y} width="100" height="100" /></>
              : <use href={`#chip-${v}-p`} y={y} width="100" height="100" />}
          </Fragment>
        );
      })}
    </svg>
  );
}
