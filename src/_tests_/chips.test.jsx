import { describe, it, expect } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { renderUI } from "./testUtils";
import { stackedShoe } from "../utils/_tests_/stackedShoe";
import { splitChips, effectiveChip, DEFAULT_CHIP, MAX_STACK } from "../utils/chips";
import { ALLOWED_CHIPS } from "../utils/constants/chips";
import { GamePhases } from "../utils/constants/gamePhases";
import { HandStatus } from "../utils/constants/handStatus";
import { HandResult } from "../utils/constants/handResult";
import { Chip, ChipStack } from "../components/Chip/Chip";
import ChipSymbols from "../components/Sprite/ChipSymbols";
import PlayerHand from "../components/Playerhand/PlayerHand";

const hrefs = (el) => [...el.querySelectorAll("use")].map((u) => u.getAttribute("href"));

describe("splitChips (the chips a stack draws)", () => {
  it("splits greedily into the largest chips, biggest first", () => {
    expect(splitChips(135)).toEqual([100, 25, 10]);
    expect(splitChips(99)).toEqual([50, 25, 10, 10, 1, 1, 1, 1]);
    expect(splitChips(1000)).toEqual([1000]);
    expect(splitChips(165000)).toEqual([100000, 50000, 10000, 5000]);
    expect(splitChips(1)).toEqual([1]);
  });

  it("every allowed chip is its own stack of one", () => {
    for (const v of ALLOWED_CHIPS) expect(splitChips(v), String(v)).toEqual([v]);
  });

  it("counts in cents, so half a dollar of insurance or a 2.2x payout never drifts", () => {
    expect(splitChips(2.5)).toEqual([1, 1]); // the $0.50 has no chip
    expect(splitChips(22.8)).toEqual([10, 10, 1, 1]);
    expect(splitChips(0.1 + 0.2 + 4.7)).toEqual([5]); // 4.999999999999999 + ... is 5 to the cent
  });

  it("an amount under $1, zero or nothing has no chip", () => {
    expect(splitChips(0.99)).toEqual([]);
    expect(splitChips(0.5)).toEqual([]);
    expect(splitChips(0)).toEqual([]);
  });

  it("keeps the biggest ten when there are more (the label has the exact amount)", () => {
    expect(MAX_STACK).toBe(10);
    expect(splitChips(1_234_567)).toEqual(Array(10).fill(100000));
    expect(splitChips(5555)).toEqual([5000, 100, 100, 100, 100, 100, 50, 5]); // eight: under the cap, all drawn
    expect(splitChips(1_100_000)).toHaveLength(10); // eleven 100K chips, ten drawn
  });
});

describe("effectiveChip (the chip the rack shows as selected)", () => {
  it("is the picked chip while the rack offers it", () => {
    expect(effectiveChip([1, 5, 25], 5)).toBe(5);
  });

  it("falls to the largest chip below it when the rack no longer offers it, else the smallest", () => {
    expect(effectiveChip([1, 5, 25], 100)).toBe(25);
    expect(effectiveChip([1, 5, 25], 10)).toBe(5);
    expect(effectiveChip([5, 25], 1)).toBe(5);
  });

  it("is null with no chips, and the default arrives as $25", () => {
    expect(effectiveChip([], 25)).toBeNull();
    expect(DEFAULT_CHIP).toBe(25);
  });
});

describe("Chip", () => {
  it("is a decorative sprite chip: nothing for a screen reader, the button around it names it", () => {
    const { container } = render(<Chip value={25} />);
    const svg = container.querySelector("svg");
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(svg.getAttribute("focusable")).toBe("false");
    expect(hrefs(svg)).toEqual(["#chip-25"]);
  });
});

describe("ChipStack", () => {
  const stack = (amount) => render(<ChipStack amount={amount} />).container.querySelector("svg");

  it("draws nothing for an amount with no chip", () => {
    expect(render(<ChipStack amount={0} />).container.firstChild).toBeNull();
    expect(render(<ChipStack amount={0.5} />).container.firstChild).toBeNull();
  });

  it("is decorative, and one column: the biggest chip at the bottom, only the top chip with its numeral", () => {
    const svg = stack(135);
    expect(svg.getAttribute("aria-hidden")).toBe("true");
    expect(hrefs(svg)).toEqual(["#side-100", "#chip-100-p", "#side-25", "#chip-25-p", "#side-10", "#chip-10", "#chip-10-p"]);
    expect(svg.querySelector(".num-face").getAttribute("href")).toBe("#chip-10");
    expect(svg.querySelector(".plain-face").getAttribute("href")).toBe("#chip-10-p");
  });

  it("lifts each chip above by 6 % of its width: the box grows 6 per chip and the anchor sits on the bottom chip's centre", () => {
    const one = stack(25);
    expect(one.getAttribute("viewBox")).toBe("0 0 100 106");
    expect(one.style.getPropertyValue("--k")).toBe("50");
    const three = stack(135);
    expect(three.getAttribute("viewBox")).toBe("0 0 100 118");
    expect(three.style.getPropertyValue("--k")).toBe("62"); // (3 - 1) * 6 + 50
    const faces = [...three.querySelectorAll("use")].filter((u) => u.getAttribute("href").startsWith("#chip-"));
    expect(faces.map((u) => u.getAttribute("y"))).toEqual(["12", "6", "0", "0"]); // the bottom chip lowest, the top one (both faces) highest
    expect(faces.every((u) => u.getAttribute("width") === "100" && u.getAttribute("height") === "100")).toBe(true);
  });

  it("the first chip's band sits a little higher than the others (it rests on the felt), the rest under the chip above", () => {
    const sides = [...stack(135).querySelectorAll("use")].filter((u) => u.getAttribute("href").startsWith("#side-")).map((u) => Number(u.getAttribute("y")));
    expect(sides).toEqual([15.6, 12, 6]); // 12 + 6 x 0.6, then each chip's own y + 6
  });

  it("draws at most ten chips, however large the bet", () => {
    const svg = stack(1_234_567);
    expect(svg.getAttribute("viewBox")).toBe("0 0 100 160");
    expect(svg.querySelectorAll('use[href^="#side-"]')).toHaveLength(10);
    expect(svg.querySelectorAll(".num-face")).toHaveLength(1);
  });
});

describe("ChipSymbols (the sprite's chips)", () => {
  const sprite = () => render(<svg><ChipSymbols /></svg>).container;
  const face = (c, v, plain = false) => c.querySelector(`symbol[id="chip-${v}${plain ? "-p" : ""}"]`);
  const colour = (c, v) => ({ body: face(c, v).querySelector("circle").getAttribute("fill"), ink: face(c, v).querySelector("text")?.getAttribute("fill") });
  const BODY = { 1: "#ebe8e1", 5: "#a5222b", 10: "#1f4a96", 25: "#1e6a45", 50: "#c8682a", 100: "#1c1c21", 1000: "#d6a92c", 5000: "#5e3a24", 10000: "#d4709a", 20000: "#7fb6dc", 50000: "#5b3a8f", 100000: "#8d9296" };
  const INK = { 1: "#1f3473", 5: "#f6f1e7", 10: "#f6f1e7", 25: "#f6f1e7", 50: "#fff6ea", 100: "#f2ecdf", 1000: "#2a2414", 5000: "#f4e6c8", 10000: "#3a0f22", 20000: "#0c2538", 50000: "#f6f0ff", 100000: "#121517" };
  const LABEL = { 1: "1", 5: "5", 10: "10", 25: "25", 50: "50", 100: "100", 1000: "1K", 5000: "5K", 10000: "10K", 20000: "20K", 50000: "50K", 100000: "100K" };

  it("has, for every allowed chip, a face with its numeral, a plain face and a side band", () => {
    const c = sprite();
    for (const v of ALLOWED_CHIPS) {
      expect(face(c, v), `#chip-${v}`).not.toBeNull();
      expect(face(c, v, true), `#chip-${v}-p`).not.toBeNull();
      expect(c.querySelector(`symbol[id="side-${v}"]`), `#side-${v}`).not.toBeNull();
    }
    expect(c.querySelectorAll("symbol")).toHaveLength(ALLOWED_CHIPS.length * 3);
  });

  it("prints each denomination ($1,000 as 1K, up to 100K) on the numeral face, and a diamond, no text, on the plain one", () => {
    const c = sprite();
    for (const v of ALLOWED_CHIPS) {
      expect(face(c, v).querySelector("text").textContent, String(v)).toBe(LABEL[v]);
      expect(face(c, v, true).querySelector("text"), `${v} plain`).toBeNull();
      expect(face(c, v, true).querySelector("path[d^='M50 44.5']"), `${v} plain`).not.toBeNull();
    }
  });

  it("uses the colours of the issue's table (body, numeral ink) on every chip", () => {
    const c = sprite();
    for (const v of ALLOWED_CHIPS) expect(colour(c, v), String(v)).toEqual({ body: BODY[v], ink: INK[v] });
  });

  it("numerals are at least 12 px on a 44 px chip, the longest ('100K') set tighter to stay there", () => {
    const c = sprite();
    const size = (v) => Number(face(c, v).querySelector("text").getAttribute("font-size"));
    for (const v of ALLOWED_CHIPS) expect(size(v) * 0.44, String(v)).toBeGreaterThanOrEqual(12);
    expect([size(1), size(10), size(100), size(1000), size(10000), size(100000)]).toEqual([32, 32, 28, 32, 28, 27.5]);
  });

  // WCAG AA: 4.5:1 for text under 18 px bold.
  const lin = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255); };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  it.each(ALLOWED_CHIPS.filter((v) => v !== 50))("the $%i chip's numeral passes AA contrast on its face", (v) => {
    expect(ratio(BODY[v], INK[v])).toBeGreaterThanOrEqual(4.5);
  });

  // KNOWN FAILURE (reported on #82): the colours are the approved table's, and the $50 numeral (#fff6ea on #c8682a) is 3.6:1. `it.fails` keeps the suite
  // green while it is open and goes red the day it is fixed (then turn it into the plain test above and drop it from the filter).
  it.fails("the $50 chip's numeral passes AA contrast on its face", () => {
    expect(ratio(BODY[50], INK[50])).toBeGreaterThanOrEqual(4.5);
  });
});

describe("PlayerHand: the bet circle and its stacks (#82)", () => {
  let n = 0;
  const hand = (extra = {}) => ({
    tag: `c${n++}`, cards: [], hiddenCards: [], bet: 0, status: HandStatus.PLAYING, result: HandResult.NONE, totals: [], total: 0,
    isBusted: false, isBlackjack: false, ...extra,
  });
  const dealt = (extra = {}) => hand({ cards: stackedShoe(["10", "6"]), totals: [16], total: 16, ...extra });
  const BETTING = GamePhases.PRE_DEAL;
  const view = (h, props = {}) => renderUI(<PlayerHand hand={h} active gamePhase={BETTING} chip={25} canBet onBet={() => {}} {...props} />);
  const spot = (name) => screen.getByRole("button", { name });
  const amounts = (c) => [...c.querySelectorAll(".stack")].map((s) => s.querySelector("svg")?.querySelectorAll('use[href^="#side-"]').length ?? 0);

  describe("the circle", () => {
    it("is open while betting with nothing on it: it says BET, names the chip it adds, and bets that chip when pressed", () => {
      const calls = [];
      const { container } = view(hand(), { onBet: (v) => calls.push(v) });
      const s = spot("Bet spot 1, $0. Adds a $25 chip");
      expect(s.classList.contains("open")).toBe(true);
      expect(s.classList.contains("has")).toBe(false);
      expect(s.disabled).toBe(false);
      expect(within(s).getByText("BET")).toBeTruthy();
      expect(container.querySelector(".stack svg")).toBeNull(); // no chips yet
      s.click();
      expect(calls).toEqual([25]);
    });

    it("carries its seat number in its name", () => {
      view(hand(), { index: 2 });
      expect(spot("Bet spot 3, $0. Adds a $25 chip")).toBeTruthy();
    });

    it("with chips on it: not open, shows its stack and the amount, and still takes more", () => {
      const calls = [];
      const { container } = view(hand({ bet: 35 }), { chip: 5, onBet: (v) => calls.push(v) });
      const s = spot("Bet spot 1, $35. Adds a $5 chip");
      expect([s.classList.contains("open"), s.classList.contains("has"), s.disabled]).toEqual([false, true, false]);
      expect(hrefs(s.querySelector("svg")).filter((h) => h.startsWith("#side-"))).toEqual(["#side-25", "#side-10"]);
      expect(container.querySelector(".amt .num").textContent).toBe("$35");
      s.click();
      expect(calls).toEqual([5]);
    });

    it("is disabled when nothing can be bet (no chip on offer, or no player): the name does not offer a chip", () => {
      const { unmount } = view(hand(), { canBet: false, chip: null });
      const s = spot("Bet spot 1, $0");
      expect([s.disabled, s.classList.contains("open")]).toEqual([true, false]);
      unmount();
      view(hand(), { canBet: true, chip: null });
      expect(spot("Bet spot 1, $0").disabled).toBe(false); // canBet is the gate; with it but no chip the name just offers none
    });

    it("is idle: not the accent seat, when it is not active", () => {
      const { container } = view(hand(), { active: false });
      expect(container.querySelector(".seat").classList.contains("active")).toBe(false);
    });

    it("is not a live control after the deal: disabled, named by its amount alone", () => {
      for (const gamePhase of [GamePhases.DEALING, GamePhases.PLAYER_TURN, GamePhases.POST_ROUND]) {
        const { unmount } = view(dealt({ bet: 10 }), { gamePhase });
        const s = spot("Bet $10");
        expect(s.disabled, gamePhase).toBe(true);
        unmount();
      }
    });
  });

  describe("stacks", () => {
    it("the bet is one column of chips, split greedily, under the hand", () => {
      const { container } = view(dealt({ bet: 135 }), { gamePhase: GamePhases.PLAYER_TURN });
      expect(amounts(container)).toEqual([3]);
      expect(container.querySelector(".side-spot")).toBeNull();
    });

    it("a double adds a side stack of its own stake, on the right, and the bet stack keeps the first stake", () => {
      const { container } = view(dealt({ bet: 20, baseStake: 10, isDouble: true }), { gamePhase: GamePhases.PLAYER_TURN });
      const dbl = container.querySelector(".side-spot.dbl");
      expect(hrefs(dbl.querySelector("svg")).filter((h) => h.startsWith("#side-"))).toEqual(["#side-10"]);
      expect(hrefs(container.querySelector(".spot .stack svg")).filter((h) => h.startsWith("#side-"))).toEqual(["#side-10"]); // 20 - 10
      expect(container.querySelector(".amt .num").textContent).toBe("$20"); // the label is the whole bet
      expect(container.querySelector(".seat").classList.contains("sides")).toBe(true);
      const row = [...container.querySelector(".spot-row").children];
      expect(row.map((el) => el.className.split(" ")[0])).toEqual(["spot", "side-spot"]); // the double sits right of the circle
    });

    it("a double with no stake left (a refused bet) draws no side stack", () => {
      const { container } = view(dealt({ bet: 0, isDouble: true }), { gamePhase: GamePhases.PLAYER_TURN });
      expect(container.querySelector(".side-spot")).toBeNull();
      expect(container.querySelector(".seat").classList.contains("sides")).toBe(false);
    });

    it.each([
      ["a tripled hand", { bet: 30, baseStake: 10, isDouble: false }],
      ["a double whose extra stake was refused", { bet: 10, baseStake: 10, isDouble: true }],
      ["a double on a split-off hand (baseStake 0)", { bet: 20, baseStake: 0, isDouble: true }],
    ])("%s is one stack of the whole bet, with no side stack", (_, extra) => {
      const { container } = view(dealt(extra), { gamePhase: GamePhases.PLAYER_TURN });
      expect(container.querySelector(".side-spot")).toBeNull();
      expect(container.querySelector(".amt .num").textContent).toBe(`$${extra.bet}`);
    });

    it("the insurance stake is its own side stack on the left, with INS and its amount on a label", () => {
      const { container } = view(dealt({ bet: 10, insurance: 5 }), { gamePhase: GamePhases.PLAYER_TURN });
      const ins = container.querySelector(".side-spot.ins");
      expect(ins.querySelector("i").textContent).toBe("INS $5");
      expect(hrefs(ins.querySelector("svg")).filter((h) => h.startsWith("#side-"))).toEqual(["#side-5"]);
      expect([...container.querySelector(".spot-row").children].map((el) => el.className.split(" ")[0])).toEqual(["side-spot", "spot"]); // left of the circle
      expect(container.querySelector(".seat").classList.contains("sides")).toBe(true);
    });

    it("an insurance and a double sit either side of the circle, and the bet stack is never covered by them", () => {
      const { container } = view(dealt({ bet: 20, baseStake: 10, isDouble: true, insurance: 5 }), { gamePhase: GamePhases.PLAYER_TURN });
      expect([...container.querySelector(".spot-row").children].map((el) => el.className.split(" ").slice(0, 2).join(" "))).toEqual(["side-spot ins", "spot has", "side-spot dbl"]);
    });

    it("a half-dollar insurance stake shows its label, and a stack of no chip", () => {
      const { container } = view(dealt({ bet: 5, insurance: 2.5 }), { gamePhase: GamePhases.PLAYER_TURN });
      expect(container.querySelector(".side-spot.ins i").textContent).toBe("INS $2.50");
      expect(hrefs(container.querySelector(".side-spot.ins svg")).filter((h) => h.startsWith("#side-"))).toEqual(["#side-1", "#side-1"]);
    });

    it("no insurance (none taken, zero on a split-off hand) shows no side stack", () => {
      for (const insurance of [undefined, 0]) {
        const { container, unmount } = view(dealt({ bet: 10, insurance }), { gamePhase: GamePhases.PLAYER_TURN });
        expect(container.querySelector(".side-spot"), String(insurance)).toBeNull();
        unmount();
      }
    });

    it("each split hand has its own stack", () => {
      const { container } = renderUI(<>
        <PlayerHand hand={dealt({ bet: 10 })} index={0} active gamePhase={GamePhases.PLAYER_TURN} />
        <PlayerHand hand={dealt({ bet: 25 })} index={1} active={false} gamePhase={GamePhases.PLAYER_TURN} />
      </>);
      expect([...container.querySelectorAll(".seat")].map((s) => hrefs(s.querySelector(".spot .stack svg")).filter((h) => h.startsWith("#side-")))).toEqual([["#side-10"], ["#side-25"]]);
    });
  });
});
