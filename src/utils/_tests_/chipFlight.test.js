import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { animations } from "../../_tests_/setup";
import { BACK_MS, BET_MS, GHOSTS, PAYOUT_MS, chipsToSpot, payoutFx, payoutKind, stackBack, stackSVG, stackToSide } from "../chipFlight";

// Chips that fly (#83): bet chips glide from the rack to the circle and back, a settled stack is lifted into a moving copy that is paid or swept.
// None of it may show before motion is on; none of it reserves the board's time (only the payout hands its length back).
const media = (flags = {}) => vi.stubGlobal("matchMedia", (q) => ({ matches: !!flags[q] }));
const REDUCED = "(prefers-reduced-motion: reduce)";
const COMPACT = "(max-height: 520px), (min-width: 900px) and (min-aspect-ratio: 5/4)";
const LANDSCAPE = "(max-height: 520px)";
const place = (el, { left = 0, top = 0, width = 0, height = 0 }) => {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  return el;
};
const $ = (sel) => document.querySelector(sel);
const ghosts = () => [...document.querySelectorAll(".flight-layer .ghost")];
const onGhost = (g) => animations.filter((a) => a.el === g);
// The centre a ghost animation ends at, from its last frame's translate (the ghost is `w` wide).
const endCentre = (anim, w) => { const [x, y] = anim.frames.at(-1).transform.match(/translate\((-?[\d.]+)px, (-?[\d.]+)px\)/).slice(1).map(Number); return [x + w / 2, y + w / 2]; };

// A table: the felt (800 x 600 at y 100), the dock under it, a rack with a $5 and a $25 chip ($25 selected), one seat with a bet circle at (420, 440)
// holding a stack, and a double's side stack and an insurance stack beside it.
function table({ rack = true, dock = true, dbl = true, ins = true } = {}) {
  document.body.innerHTML = `
    <div class="felt"></div>
    ${dock ? '<div class="dock"></div>' : ""}
    ${rack ? `<div class="rack">
      <button class="rc" data-chip="5" aria-label="$5 chip" aria-pressed="false"></button>
      <button class="rc" data-chip="25" aria-label="$25 chip" aria-pressed="true"></button></div>` : ""}
    <div class="seat">
      <div class="spot"><span class="stack"><svg><use href="#x"/></svg></span></div>
      ${dbl ? '<div class="side-spot dbl"><span class="stack"><svg></svg></span></div>' : ""}
      ${ins ? '<div class="side-spot ins"><span class="stack"><svg></svg></span></div>' : ""}
    </div>
    <div class="flight-layer"></div>`;
  place($(".felt"), { left: 0, top: 100, width: 800, height: 600 });
  if (dock) place($(".dock"), { left: 0, top: 700, width: 800, height: 100 });
  if (rack) { place($('.rc[data-chip="5"]'), { left: 100, top: 620, width: 50, height: 50 }); place($('.rc[data-chip="25"]'), { left: 200, top: 620, width: 50, height: 50 }); }
  place($(".spot"), { left: 380, top: 400, width: 80, height: 80 });
  place($(".spot .stack"), { left: 400, top: 410, width: 50, height: 50 });
  place($(".spot .stack svg"), { left: 400, top: 410, width: 50, height: 50 });
  if (dbl) {
    place($(".side-spot.dbl"), { left: 480, top: 400, width: 60, height: 60 });
    place($(".side-spot.dbl .stack"), { left: 480, top: 410, width: 50, height: 50 });
    place($(".side-spot.dbl .stack svg"), { left: 480, top: 410, width: 50, height: 50 });
  }
  if (ins) {
    place($(".side-spot.ins"), { left: 300, top: 400, width: 60, height: 60 });
    place($(".side-spot.ins .stack"), { left: 310, top: 410, width: 50, height: 50 });
    place($(".side-spot.ins .stack svg"), { left: 310, top: 410, width: 50, height: 50 });
  }
}
const spot = () => $(".spot");
const seat = () => $(".seat");

beforeEach(() => { vi.useFakeTimers(); table(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

describe("stackSVG", () => {
  it("draws nothing for nothing, and one chip per denomination, the numeral only on the top chip when it is wide enough", () => {
    expect(stackSVG(0)).toBe("");
    const wide = stackSVG(30); // $25 + $5, the $25 on the bottom
    expect(wide.match(/#chip-/g)).toHaveLength(2);
    expect(wide).toContain('href="#chip-5"'); // the top chip, numbered
    expect(wide).toContain('href="#chip-25-p"'); // the lower one plain
    expect(stackSVG(30, 30)).toContain('href="#chip-5-p"'); // too narrow for a numeral
    expect(stackSVG(30)).toBe(stackSVG(30, 44));
    expect(wide).toContain('aria-hidden="true"');
  });
});

describe("chipsToSpot (a bet goes in)", () => {
  it("a tap: one chip, copied from the rack chip of its own value, glides to the circle and shrinks to table size; the stack shows once it lands", () => {
    expect(chipsToSpot(spot(), 5)).toBe(BET_MS);
    const [g] = ghosts();
    expect(ghosts()).toHaveLength(1);
    expect(g.getAttribute("aria-hidden")).toBe("true"); // never in the accessibility tree
    expect(g.querySelector("use").getAttribute("href")).toBe("#chip-5");
    const [anim] = onGhost(g);
    expect(anim.options).toMatchObject({ duration: BET_MS, delay: 0, fill: "both" });
    expect(anim.frames[0].transform).toBe("translate(100px, 620px) scale(1)"); // the $5 rack chip's own place
    expect(endCentre(anim, 50)).toEqual([420, 440]); // the circle's centre
    expect(anim.frames[1].transform).toContain("scale(1)"); // stack is as wide as the chip here
  });

  it("a burst (Rebet, 2x) sends at most three chips, 70 ms apart, and says when the last lands", () => {
    expect(chipsToSpot(spot(), 185)).toBe(2 * 70 + BET_MS); // $100 + $50 + $25 + $10: four chips, three fly
    expect(ghosts()).toHaveLength(3);
    expect(animations.map((a) => a.options.delay)).toEqual([0, 70, 140]);
  });

  it("a chip the rack does not have leaves from the selected one, or from the first when none is selected", () => {
    chipsToSpot(spot(), 100);
    expect(onGhost(ghosts()[0])[0].frames[0].transform).toBe("translate(200px, 620px) scale(1)"); // the selected $25
    animations.length = 0;
    $('.rc[data-chip="25"]').setAttribute("aria-pressed", "false");
    chipsToSpot(spot(), 100);
    expect(onGhost(ghosts()[1])[0].frames[0].transform).toBe("translate(100px, 620px) scale(1)"); // the first
  });

  it("removes a ghost when it arrives, and by the clock if the browser never says (a background tab)", () => {
    chipsToSpot(spot(), 5);
    animations[0].onfinish();
    expect(ghosts()).toHaveLength(0);
    chipsToSpot(spot(), 5);
    vi.advanceTimersByTime(BET_MS + 149);
    expect(ghosts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(ghosts()).toHaveLength(0);
  });

  it("is instant (0, nothing in the air) with no rack, no flight layer, reduced motion, or a layer already holding too many chips", () => {
    table({ rack: false });
    expect(chipsToSpot(spot(), 5)).toBe(0);
    table();
    $(".flight-layer").remove();
    expect(chipsToSpot(spot(), 5)).toBe(0);
    table();
    media({ [REDUCED]: true });
    expect(chipsToSpot(spot(), 5)).toBe(0);
    vi.unstubAllGlobals();
    for (let i = 0; i < GHOSTS; i++) $(".flight-layer").insertAdjacentHTML("beforeend", '<div class="ghost"></div>');
    expect(chipsToSpot(spot(), 5)).toBe(0);
    expect(ghosts()).toHaveLength(GHOSTS);
    expect(animations).toHaveLength(0);
  });

  it("the bet's amount is exact: nothing to send for an amount with no chips", () => {
    expect(chipsToSpot(spot(), 0)).toBe(0);
    expect(ghosts()).toHaveLength(0);
  });
});

describe("stackBack (Undo, Clear)", () => {
  it("the stack glides back to the selected rack chip, shrinking and fading", () => {
    stackBack(spot(), 30);
    const [g] = ghosts();
    expect(g.querySelector("svg").getAttribute("viewBox")).toContain("100 "); // a stack, not a single chip
    const [anim] = onGhost(g);
    expect(anim.options.duration).toBe(BACK_MS);
    expect(anim.frames[0].opacity).toBe(1);
    expect(anim.frames[1]).toMatchObject({ opacity: 0.2 });
    expect(anim.frames[1].transform).toContain("scale(0.8)");
    expect(endCentre(anim, 50)).toEqual([225, 645]); // the $25 chip's centre
  });

  it("with no rack it slides down into the dock; with nothing to fly (reduced motion) it does nothing", () => {
    table({ rack: false });
    stackBack(spot(), 25);
    expect(endCentre(onGhost(ghosts()[0])[0], 50)).toEqual([innerWidth / 2, 708]);
    table();
    media({ [REDUCED]: true });
    stackBack(spot(), 25);
    expect(ghosts()).toHaveLength(0);
  });
});

describe("stackToSide (a double's stake or the insurance goes down beside the circle)", () => {
  it("the stack comes up from the dock to the side spot, and says how long", () => {
    expect(stackToSide($(".side-spot.dbl"), 10)).toBe(BET_MS);
    const [anim] = animations;
    expect(anim.frames[0].transform).toBe("translate(485px, 683px) scale(1)"); // under the side spot, at the dock's top edge
    expect(endCentre(anim, 50)).toEqual([510, 430]);
  });

  it("flies nothing (0) when motion is off", () => {
    media({ [REDUCED]: true });
    expect(stackToSide($(".side-spot.dbl"), 10)).toBe(0);
    expect(animations).toHaveLength(0);
  });
});

describe("payoutKind", () => {
  it("names what came back against what lay on the table", () => {
    expect([payoutKind(10, 20), payoutKind(10, 0), payoutKind(10, 5), payoutKind(10, 10)]).toEqual(["win", "lose", "part", "push"]);
  });
});

describe("payoutFx (the result's chips)", () => {
  beforeEach(() => table({ dbl: false, ins: false })); // a lone bet; the tests that need a side stack lay it themselves
  const settle = (opts, seatEl = seat()) => payoutFx(seatEl, { insured: false, insurancePaid: false, ...opts });
  const liftedOf = () => [...document.querySelectorAll(".ghost.lifted")];
  const inAir = () => animations.filter((a) => a.el.classList.contains("ghost"));

  it("cannot fly (null) with no layer, no spot, no felt, or reduced motion", () => {
    $(".flight-layer").remove();
    expect(settle({ stake: 10, ret: 0 })).toBeNull();
    table();
    $(".spot").remove();
    expect(settle({ stake: 10, ret: 0 })).toBeNull();
    table();
    $(".felt").remove();
    expect(settle({ stake: 10, ret: 0 })).toBeNull();
    table();
    media({ [REDUCED]: true });
    expect(settle({ stake: 10, ret: 0 })).toBeNull();
    expect($(".spot .stack").style.visibility).toBe(""); // nothing was hidden
  });

  it("a chip never blinks: the stack is replaced by an exact moving copy in the same call (original hidden, copy on show), ghosts hidden from assistive tech", () => {
    settle({ stake: 10, ret: 0 });
    expect($(".spot .stack").style.visibility).toBe("hidden");
    const [copy] = liftedOf();
    expect(copy).toBeTruthy();
    expect(copy.getAttribute("aria-hidden")).toBe("true");
    expect(copy.querySelector("svg").outerHTML).toBe($(".spot .stack svg").outerHTML);
    expect(copy.style.transform).toBe("translate(400px, 410px)"); // exactly where the original was
    expect(copy.style.width).toBe("50px");
  });

  it("covers every stack on the table (bet, double, insurance) the same way", () => {
    table();
    settle({ stake: 20, ret: 0, insured: true });
    expect(liftedOf()).toHaveLength(3);
    [".spot .stack", ".side-spot.dbl .stack", ".side-spot.ins .stack"].forEach((q) => expect($(q).style.visibility).toBe("hidden"));
  });

  it("does not lift a stack that is not there or not shown, or is in a hidden spot", () => {
    settle({ stake: 10, ret: 0 });
    expect(liftedOf()).toHaveLength(1);
    table();
    $(".spot .stack svg").remove();
    settle({ stake: 10, ret: 0 });
    expect(liftedOf()).toHaveLength(2); // the double's and the insurance's only
    table();
    $(".side-spot.dbl").setAttribute("hidden", "");
    settle({ stake: 10, ret: 0 });
    expect($(".side-spot.dbl .stack").style.visibility).toBe("");
  });

  describe("a win", () => {
    it("lasts 1580 ms; the dealer's chips come down from above the felt and land beside the stake (right of the circle in portrait), then everything slides down into the dock", () => {
      const fx = settle({ stake: 10, ret: 20 });
      expect(fx.ms).toBe(PAYOUT_MS.win);
      const win = ghosts().find((g) => !g.classList.contains("lifted"));
      const [come] = onGhost(win);
      expect(come.options.duration).toBe(560);
      expect(come.frames[0].transform).toBe("translate(375px, 45px) scale(1)"); // centred on the felt (400), 30 px above its top edge (100): a 50 px stack
      expect(endCentre(come, 50)[0]).toBeGreaterThan(425); // right of the circle's centre
      expect(inAir()).toHaveLength(1); // nothing else moves yet: the copies wait
      vi.advanceTimersByTime(560 + 240 - 1);
      expect(inAir()).toHaveLength(1);
      vi.advanceTimersByTime(1); // hold over: the stake and the winnings fall into the dock
      const fall = inAir().slice(1);
      expect(fall).toHaveLength(2);
      expect(fall.map((a) => a.options.duration)).toEqual([720, 720]);
      expect(fall.every((a) => a.frames[1].opacity === 0)).toBe(true);
      expect(fall.map((a) => a.frames[1].transform.match(/translate\([^,]+, ([\d.]+)px/)[1])).toEqual(["683", "683"]); // y = dock top 708 - 25
    });

    it("a doubled hand's second stack falls too, and on a wide or landscape screen the winnings land on the other side (left)", () => {
      table({ ins: false });
      media({ [COMPACT]: true });
      const fx = settle({ stake: 20, ret: 40 });
      const win = ghosts().find((g) => !g.classList.contains("lifted"));
      expect(endCentre(onGhost(win)[0], 50)[0]).toBe(Math.max(30, 420 - 50 * 1.15)); // left of the circle's centre (420)
      vi.advanceTimersByTime(800);
      expect(inAir()).toHaveLength(1 + 3); // main, double, winnings
      fx.cancel();
    });

    it("in landscape with a double the winnings keep two stack-widths clear of the circle", () => {
      table({ ins: false });
      media({ [COMPACT]: true, [LANDSCAPE]: true });
      settle({ stake: 20, ret: 40 });
      const win = ghosts().find((g) => !g.classList.contains("lifted"));
      expect(endCentre(onGhost(win)[0], 50)[0]).toBe(Math.max(30, 420 - 50 * 1.15 * 2));
    });

    it("never gets a winnings stack for a table with no room for ghosts, but the real ones still fall", () => {
      for (let i = 0; i < GHOSTS; i++) $(".flight-layer").insertAdjacentHTML("beforeend", '<div class="ghost"></div>');
      settle({ stake: 10, ret: 20 });
      vi.advanceTimersByTime(800);
      expect(inAir()).toHaveLength(1); // the main stack's fall only
    });
  });

  it("a circle with no stack drawn still pays the winnings, sized from the circle (60 % of it)", () => {
    $(".spot .stack").remove();
    const fx = settle({ stake: 10, ret: 20 });
    const win = ghosts().find((g) => !g.classList.contains("lifted"));
    expect(win.style.width).toBe("48px");
    vi.advanceTimersByTime(800);
    expect(inAir()).toHaveLength(2); // the winnings come down and fall; there is no stake to lift
    fx.cancel();
  });

  describe("a loss", () => {
    it("lasts 960 ms; after 260 ms the stack is swept up off the table's top edge, shrinking and fading over 700 ms", () => {
      const fx = settle({ stake: 10, ret: 0 });
      expect(fx.ms).toBe(PAYOUT_MS.lose);
      expect(inAir()).toHaveLength(0);
      vi.advanceTimersByTime(259);
      expect(inAir()).toHaveLength(0);
      vi.advanceTimersByTime(1);
      const [sweep] = inAir();
      expect(sweep.options.duration).toBe(700);
      expect(sweep.frames[1]).toMatchObject({ opacity: 0 });
      expect(sweep.frames[1].transform).toContain("scale(0.45)");
      expect(sweep.frames[1].transform).toContain("translate(375px, 45px)"); // up to the tray: centred on the felt, 30 px above its edge
    });

    it("a doubled hand sweeps both stacks", () => {
      table({ ins: false });
      settle({ stake: 20, ret: 0 });
      vi.advanceTimersByTime(260);
      expect(inAir()).toHaveLength(2);
    });
  });

  describe("a push", () => {
    it("lasts 1000 ms; after 320 ms the stake slides down into the dock over 680 ms", () => {
      const fx = settle({ stake: 10, ret: 10 });
      expect(fx.ms).toBe(PAYOUT_MS.push);
      vi.advanceTimersByTime(319);
      expect(inAir()).toHaveLength(0);
      vi.advanceTimersByTime(1);
      expect(inAir()[0].options.duration).toBe(680);
      expect(inAir()[0].frames[1].opacity).toBe(0);
    });
  });

  describe("a part back (surrender)", () => {
    it("lasts 960 ms; half goes up to the dealer, half comes back down", () => {
      const fx = settle({ stake: 10, ret: 5 });
      expect(fx.ms).toBe(PAYOUT_MS.part);
      vi.advanceTimersByTime(260);
      const up = inAir();
      expect(up).toHaveLength(2); // the stack swept up, and the half coming back
      expect(up[0].frames[1].transform).toContain("scale(0.45)");
      const back = ghosts().find((g) => !g.classList.contains("lifted"));
      expect(onGhost(back)[0].options.duration).toBe(700);
    });

    it("with no room for ghosts the half going up still goes", () => {
      for (let i = 0; i < GHOSTS; i++) $(".flight-layer").insertAdjacentHTML("beforeend", '<div class="ghost"></div>');
      settle({ stake: 10, ret: 5 });
      vi.advanceTimersByTime(260);
      expect(inAir()).toHaveLength(1);
    });
  });

  describe("insurance", () => {
    beforeEach(() => table({ dbl: false }));

    it("paid: its stack slides down into the dock after 300 ms; lost: it is swept up; the length is at least 1000 ms either way", () => {
      const paid = settle({ stake: 10, ret: 0, insured: true, insurancePaid: true });
      expect(paid.ms).toBe(1000); // the loss's 960 is stretched
      expect(inAir()).toHaveLength(1);
      const [pay] = inAir();
      expect(pay.options).toMatchObject({ duration: 700, delay: 300 });
      expect(pay.frames[1]).toMatchObject({ opacity: 0 });
      table({ dbl: false });
      animations.length = 0;
      const lost = settle({ stake: 10, ret: 10, insured: true, insurancePaid: false });
      expect(lost.ms).toBe(1000);
      const [sweep] = inAir();
      expect(sweep.options).toMatchObject({ duration: 700, delay: 0 });
      expect(sweep.frames[1].transform).toContain("scale(0.6)");
    });

    it("an uninsured hand is not stretched", () => {
      expect(settle({ stake: 10, ret: 20 }).ms).toBe(PAYOUT_MS.win);
    });
  });

  describe("cancel", () => {
    it("removes every copy, shows the real stacks again and stops what was still to come", () => {
      table();
      const fx = settle({ stake: 20, ret: 40, insured: true });
      expect(liftedOf().length).toBeGreaterThan(0);
      fx.cancel();
      expect(ghosts()).toHaveLength(0);
      [".spot .stack", ".side-spot.dbl .stack", ".side-spot.ins .stack"].forEach((s) => expect($(s).style.visibility).toBe(""));
      const before = animations.length;
      vi.advanceTimersByTime(2000);
      expect(animations).toHaveLength(before); // the fall never starts
    });

    it("the copies also remove themselves when they arrive, or by the clock", () => {
      settle({ stake: 10, ret: 0 });
      vi.advanceTimersByTime(260);
      inAir()[0].onfinish();
      expect(liftedOf()).toHaveLength(0);
      table();
      settle({ stake: 10, ret: 0 });
      vi.advanceTimersByTime(260 + 700 + 150);
      expect(liftedOf()).toHaveLength(0);
    });
  });
});
