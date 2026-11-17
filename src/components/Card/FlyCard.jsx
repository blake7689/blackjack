import { useContext, useLayoutEffect, useRef, useState } from "react";
import { FlightContext } from "../../context/FlightContext";
import { EASING, FLIP_EASING, GLIDE, SIDE_ROOM, TURN_AT, flightFrames, hold, markLanded, queue, reducedMotion, reserve, spots } from "../../utils/cardAnimation";
import "./Card.css";

// A card on the table (#81): `.fan-slot` (carries the hand's step and `data-fk`, the key useSmoothRow reads) > `.card` >
// `.cin` (turns) > `.cf` (the face) + `.cb` (the back, the `#cardback` sprite). A new card flies in from the shoe's mouth face down at a slight
// angle (-36 deg closing to 0), squares up and turns over as it lands (the turn starts at 80 % of the flight, #83): the flying copy in the flight
// layer carries both faces, and the real card takes its place face up once the turn is over. A card whose face arrives later (the dealer's hole
// card, a face-down double) flips in place, because it stays the same element. The face image only exists once the card has its face and is on the
// table (or, for a dealt card, once it starts turning), so a hidden card's rank, suit and id never reach the DOM. 3D is on only while the card is
// face down or turning (class `down` / `turning`; `up` has no transform at all, so its pixels stay sharp). Props: `dealOrder` (opening deal
// slot), `moved` (changed hands in a split: no animation), `sideways` (a double: lands turned 90 degrees).
export default function FlyCard({ card, fk, dealOrder, moved = false, sideways = false }) {
  const { enabled, layerRef, timing } = useContext(FlightContext);
  const ref = useRef(null);
  const innerRef = useRef(null);
  const copyRef = useRef(null);
  // Decided once, from what this card saw when it mounted: cards on the board's first render never fly.
  const [fly] = useState(() => enabled && !moved && !reducedMotion());
  const [shown, setShown] = useState(!fly);
  const [flipped, setFlipped] = useState(!!card && !fly);
  const [turning, setTurning] = useState(false);
  const faceId = card?.id; // the card object is a new copy on every reducer step; only its arrival and id matter here

  // Sideways double: the separate `rotate` property, so the flight and flip transforms don't override it, and room in the row.
  useLayoutEffect(() => {
    const el = ref.current;
    el.style.rotate = sideways ? "90deg" : "";
    el.style.marginInline = sideways ? `${el.offsetWidth * SIDE_ROOM}px` : "";
  });

  // A card that changed hands in a split lies where it did a moment ago (useSmoothRow remembers it): it glides from there.
  useLayoutEffect(() => {
    const old = moved && enabled && !reducedMotion() ? spots.get(fk) : null;
    if (!old) return;
    const r = ref.current.getBoundingClientRect();
    const glide = ref.current.animate([{ translate: `${old.x - r.left}px ${old.y - r.top}px` }, { translate: "0 0" }], { duration: GLIDE, easing: EASING });
    return () => glide.cancel();
    // Once per mount: the glide is fixed by where the card was.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useLayoutEffect(() => {
    if (!fly) return;
    const el = ref.current;
    const s = document.querySelector(".deck-stack").getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const dx = s.left + s.width / 2 - tx, dy = s.top + s.height / 2 - ty;
    const faced = !!card; // a dealt card turns on landing; the hole card and a face-down double stay down
    // The copy shows the back; a dealt card's face joins it when it starts turning (a card in flight has no face image).
    const copy = document.createElement("div");
    copy.className = "fly-copy";
    copy.setAttribute("aria-hidden", "true");
    copy.innerHTML = '<div class="cin fly-inner"><div class="cf"></div><div class="cb"><svg viewBox="0 0 250 363" focusable="false"><use href="#cardback"/></svg></div></div>';
    Object.assign(copy.style, { position: "fixed", left: `${tx - w / 2}px`, top: `${ty - h / 2}px`, width: `${w}px`, height: `${h}px`,
      borderRadius: `${w * 0.07}px`, visibility: "hidden", willChange: "transform" });
    layerRef.current.appendChild(copy);
    copyRef.current = copy;
    const now = performance.now();
    // The opening deal's cards start in order from the same moment (after a shuffle or a peek in progress); the others queue behind everything.
    const start = dealOrder === undefined ? Math.max(now, queue.free) : Math.max(now, queue.gate) + dealOrder * timing.stagger;
    const delay = start - now;
    const turnAt = timing.slide * TURN_AT;
    const total = faced ? Math.max(timing.slide, turnAt + timing.flip) : timing.slide;
    const undo = reserve(start + total);
    let anim, turn, lift, raf;
    // The copy follows the real card's live spot (the separate `translate` property, on top of the flight), so if the
    // layout moves while it flies (a total changing width, a row re-centring) it still lands exactly on the card.
    const follow = () => { const c = el.getBoundingClientRect(); copy.style.translate = `${c.left - r.left}px ${c.top - r.top}px`; };
    const tick = () => { follow(); raf = requestAnimationFrame(tick); };
    const land = () => { cancelAnimationFrame(raf); follow(); setShown(true); };
    const done = () => { land(); if (faced) setFlipped(true); }; // the turn is over: the real card is face up
    const turnOver = () => {
      copy.querySelector(".cf").innerHTML = `<img src="/cards/${card.rank}_of_${card.suit}.png" alt="" draggable="false">`;
      turn = copy.firstChild.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }], { duration: timing.flip, easing: FLIP_EASING, fill: "forwards" });
      lift = copy.animate([{ scale: 1 }, { scale: 1.07, offset: 0.5 }, { scale: 1 }], { duration: timing.flip, easing: FLIP_EASING }); // rises 7 % edge-on
      turn.onfinish = done;
    };
    const t1 = setTimeout(() => {
      copy.style.visibility = "visible";
      anim = copy.animate(flightFrames(dx, dy, sideways ? 90 : 0), { duration: timing.slide, easing: EASING, fill: "forwards" });
      if (!faced) anim.onfinish = done;
      tick();
    }, delay);
    const t3 = faced ? setTimeout(turnOver, delay + turnAt) : 0;
    // jsdom, and a background tab that never fires onfinish: the clock lands the card. If its turn was not reported over it then flips in place, and the board
    // stays busy until the browser says that is done.
    const t2 = setTimeout(land, delay + total + 150);
    return () => { undo(); cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); anim?.cancel(); turn?.cancel(); lift?.cancel(); copy.remove(); copyRef.current = null; };
    // Runs once per mount: the flight is fixed by what the card saw then.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The real card is in place: drop the flying copy before paint.
  useLayoutEffect(() => {
    if (shown) { copyRef.current?.remove(); copyRef.current = null; }
  }, [shown]);

  // Back -> face, once there is a face and the card is on the table.
  useLayoutEffect(() => {
    if (!faceId || flipped || !shown) return;
    if (reducedMotion()) { setFlipped(true); return; }
    const undo = reserve(performance.now() + timing.flip + timing.gap);
    setTurning(true);
    const an = innerRef.current.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
      { duration: timing.flip, easing: FLIP_EASING, fill: "forwards" });
    // the card rises 7 % at the edge-on moment
    const lift = ref.current.animate([{ scale: 1 }, { scale: 1.07, offset: 0.5 }, { scale: 1 }], { duration: timing.flip, easing: FLIP_EASING });
    an.onfinish = () => setFlipped(true);
    return () => { undo(); an.cancel(); lift.cancel(); setTurning(false); };
  }, [faceId, flipped, shown, timing]);

  // Not over until the browser says so: the board stays busy through a late frame, past the reserved time.
  const settled = shown && (!faceId || flipped);
  useLayoutEffect(() => (settled ? undefined : hold()), [settled]);

  // On the table and face up: its value now counts in the hand's total.
  useLayoutEffect(() => { if (faceId && shown && flipped) markLanded(faceId); }, [faceId, shown, flipped]);

  return (
    <div className="fan-slot" data-fk={fk}>
      <div ref={ref} className={`card fly-card ${flipped ? "up" : turning ? "turning" : "down"}`} style={shown ? undefined : { visibility: "hidden" }}>
        <div ref={innerRef} className="cin fly-inner">
          <div className="cf">
            {card && shown && <img className="fly-front" src={`/cards/${card.rank}_of_${card.suit}.png`} alt={`${card.rank} of ${card.suit}`} draggable={false} />}
          </div>
          <div className="cb fly-back" aria-hidden="true"><svg viewBox="0 0 250 363" focusable="false"><use href="#cardback" /></svg></div>
        </div>
      </div>
    </div>
  );
}
