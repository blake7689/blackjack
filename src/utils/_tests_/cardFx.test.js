import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { animations } from "../../_tests_/setup";
import { CUT_MS, PEEK, SWEEP_GAP, SWEEP_MS, cutFly, mirrorCheck, sweepCards } from "../cardFx";
import { TURN } from "../cardAnimation";

const noMotion = () => vi.stubGlobal("matchMedia", () => ({ matches: true }));
const place = (el, { left = 0, top = 0, width = 0, height = 0 }) => {
  el.getBoundingClientRect = () => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top });
  Object.defineProperty(el, "offsetWidth", { value: width, configurable: true });
  Object.defineProperty(el, "offsetHeight", { value: height, configurable: true });
  return el;
};

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

// The table: a stage with the discard pile, the dealer's face-up card, the player's face-down one and a sideways (double) face-up card.
function table() {
  document.body.innerHTML = `
    <div class="stage-in">
      <div class="discard"><div class="mouth"></div></div>
      <div class="dealer-hand"><div class="fan-row"><div class="card" id="d1"><div class="cf"><img src="/cards/king.png" alt="king of hearts"></div></div></div></div>
      <div class="seats"><div class="fan-row">
        <div class="card" id="p1"><div class="cf"></div></div>
        <div class="card" id="p2" style="rotate: 90deg"><div class="cf"><img src="/cards/five.png" alt="five of clubs"></div></div>
      </div></div>
    </div>`;
  place(document.querySelector(".stage-in"), { left: 10, top: 20, width: 800, height: 500 });
  place(document.querySelector(".discard .mouth"), { left: 30, top: 40, width: 40, height: 58 });
  place(document.getElementById("d1"), { left: 300, top: 60, width: 60, height: 87 });
  place(document.getElementById("p1"), { left: 300, top: 300, width: 60, height: 87 });
  place(document.getElementById("p2"), { left: 380, top: 300, width: 60, height: 87 });
  document.getElementById("p2").style.rotate = "90deg";
}

describe("sweepCards (end of round)", () => {
  it("does nothing without a stage, a pile or cards, and under reduced motion", () => {
    expect(sweepCards()).toBeNull();
    table();
    document.querySelector(".discard").remove();
    expect(sweepCards()).toBeNull();
    table();
    document.querySelectorAll(".card").forEach((c) => c.remove());
    expect(sweepCards()).toBeNull();
    table();
    noMotion();
    expect(sweepCards()).toBeNull();
    expect(animations).toHaveLength(0);
    expect(document.getElementById("d1").style.visibility).toBe("");
  });

  it("sweeps every card to the pile, the dealer's first, 45 ms apart, turning face down as it starts", () => {
    table();
    const fx = sweepCards();
    expect(fx.ms).toBe(SWEEP_MS + 2 * SWEEP_GAP); // 620 + 2 x 45
    const copies = [...document.querySelectorAll(".fly-copy.sweep")];
    expect(copies.map((c) => c.className.includes("up"))).toEqual([true, false, true]); // the dealer's card is face up, the player's first face down
    const slides = animations.filter((a) => a.options.duration === SWEEP_MS);
    expect(slides.map((a) => a.options.delay)).toEqual([0, 45, 90]);
    expect(slides.every((a) => a.options.fill === "both")).toBe(true);
    // The dealer's card travels from its centre (330, 103.5) to the pile's corner (30, 40): the pile's top left, in px.
    expect(slides[0].frames[1].translate).toBe("-300px -63.5px");
    expect(slides[0].frames[1].rotate).toBe("0deg");
    expect(slides[2].frames[0].rotate).toBe("90deg"); // the sideways card squares up as it goes
    expect(slides[0].frames[0].rotate).toBe("0deg");
    // Only face-up cards turn (the face image rotates from 180 to 0 degrees); a face-down one just slides.
    const turns = animations.filter((a) => a.options.duration === TURN);
    expect(turns).toHaveLength(2);
    expect(turns[0].frames[0].transform).toBe("rotateY(180deg)");
    expect(turns.map((a) => a.options.delay)).toEqual([0, 90]);
    // The real cards hide in the frame their copy appears; the copy is aria-hidden and a face-down copy has no face image at all.
    expect(document.getElementById("d1").style.visibility).toBe("hidden");
    expect(copies.every((c) => c.getAttribute("aria-hidden") === "true")).toBe(true);
    expect(copies[1].querySelector("img")).toBeNull();
    expect(copies[0].querySelector("img").getAttribute("alt")).toBe("");
    expect(copies[0].style.left).toBe("290px"); // card left 300 minus the stage's 10
    expect(copies[0].style.top).toBe("40px");
  });

  it("removes the copies a moment after they land", () => {
    table();
    const fx = sweepCards();
    expect(document.querySelectorAll(".fly-copy")).toHaveLength(3);
    vi.advanceTimersByTime(fx.ms + 99);
    expect(document.querySelectorAll(".fly-copy")).toHaveLength(3);
    vi.advanceTimersByTime(2);
    expect(document.querySelectorAll(".fly-copy")).toHaveLength(0);
  });

  it("cancel removes the copies and shows the real cards again", () => {
    table();
    const fx = sweepCards();
    fx.cancel();
    expect(document.querySelectorAll(".fly-copy")).toHaveLength(0);
    expect([...document.querySelectorAll(".card")].map((c) => c.style.visibility)).toEqual(["", "", ""]);
  });
});

describe("mirrorCheck (the peek)", () => {
  function peekTable({ feltTop = 90, top = 100, height = 100 } = {}) {
    document.body.innerHTML = '<div class="felt"></div><div class="dealer-hand"><div data-fk="hole"><div class="card"></div></div></div>';
    place(document.querySelector(".felt"), { top: feltTop, height: 600, width: 800 });
    return place(document.querySelector(".card"), { top, height, width: 70 });
  }

  it("does nothing with no hole card or felt, or under reduced motion", () => {
    expect(mirrorCheck(1)).toBeNull();
    peekTable();
    document.querySelector(".felt").remove();
    expect(mirrorCheck(1)).toBeNull();
    peekTable();
    noMotion();
    expect(mirrorCheck(1)).toBeNull();
    expect(animations).toHaveLength(0);
  });

  it("slides up 420k, holds 450k, slides back 420k (follows Game speed)", () => {
    peekTable();
    const fx = mirrorCheck(0.5);
    expect(fx.ms).toBe((PEEK.up + PEEK.hold + PEEK.down) * 0.5);
    const [out, back] = animations;
    expect(out.options.duration).toBe(PEEK.up * 0.5);
    expect(back.options.duration).toBe(PEEK.down * 0.5);
    expect(back.options.delay).toBe((PEEK.up + PEEK.hold) * 0.5); // starts after the hold
    expect(out.frames[0].translate).toBe("0 0");
    expect(back.frames[1].translate).toBe("0 0");
  });

  it.each([[100, 90, 100], [87, 20, 87], [210, 200, 40], [60, 0, 130]])("at least 85 percent of the card stays in view (card top %i, felt top %i, height %i)", (top, feltTop, height) => {
    peekTable({ top, feltTop, height });
    mirrorCheck(1);
    const lift = parseFloat(animations[0].frames[1].translate.split(" ")[1]); // negative: up
    expect(lift).toBeLessThan(0);
    const hiddenAbove = Math.max(0, feltTop - (top + lift)); // the part of the card above the felt's top edge
    expect(height - hiddenAbove).toBeGreaterThanOrEqual(height * 0.85);
    expect(hiddenAbove).toBeGreaterThan(0); // the top edge does tuck under the felt
  });

  it("plays the same animation whatever the card is, and never touches its face", () => {
    peekTable();
    const html = document.querySelector(".card").outerHTML;
    mirrorCheck(1);
    expect(document.querySelector(".card").outerHTML).toBe(html); // no face image, no id, no class change
    expect(animations.every((a) => Object.keys(a.frames[0]).join() === "translate")).toBe(true); // translate only: nothing turns
  });

  it("cancels itself when the check is over, and on request", () => {
    peekTable();
    const fx = mirrorCheck(1);
    vi.advanceTimersByTime(fx.ms + 49);
    expect(animations.some((a) => a.cancelled)).toBe(false);
    vi.advanceTimersByTime(2);
    expect(animations.every((a) => a.cancelled)).toBe(true);

    peekTable();
    const early = mirrorCheck(1);
    early.cancel();
    expect(animations.slice(2).every((a) => a.cancelled)).toBe(true);
  });
});

describe("cutFly (the cut card leaves the shoe)", () => {
  it("does nothing without a card or a shoe mouth, or under reduced motion", () => {
    const card = document.body.appendChild(document.createElement("div"));
    cutFly(card);
    cutFly(null);
    document.body.insertAdjacentHTML("beforeend", '<div class="shoe"><div class="mouth"></div></div>');
    noMotion();
    cutFly(card);
    expect(animations).toHaveLength(0);
  });

  it("flies from the shoe's mouth, tilted, to rest in 760 ms", () => {
    const card = place(document.body.appendChild(document.createElement("div")), { left: 0, top: 200, width: 40, height: 60 });
    document.body.insertAdjacentHTML("beforeend", '<div class="shoe"><div class="mouth"></div></div>');
    place(document.querySelector(".shoe .mouth"), { left: 500, top: 50 });
    cutFly(card);
    const [a] = animations;
    expect(a.options.duration).toBe(CUT_MS);
    expect(a.frames[0]).toEqual({ translate: "480px -180px", rotate: "-36deg" });
    expect(a.frames[1]).toEqual({ translate: "0 0", rotate: "0deg" });
  });
});
