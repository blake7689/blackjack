import { useContext, useLayoutEffect, useRef, useState } from "react";
import { FlightContext } from "../../context/FlightContext";
import { EASING, SIDE_ROOM, flightFrames, hold, markLanded, queue, reducedMotion, reserve } from "../../utils/cardAnimation";
import "./Card.css";

// A card on the table. A new one flies in from the shoe face down and flips as it lands; a card whose face arrives later
// (the dealer's hole card, a face-down double) flips in place, because it stays the same element. The face only exists
// once `card` is set, so a hidden card's rank, suit and id never reach the DOM. Props: `dealOrder` (opening deal slot),
// `moved` (changed hands in a split: no animation), `sideways` (a double: lands turned 90 degrees).
export default function FlyCard({ card, fk, dealOrder, moved = false, sideways = false }) {
  const { enabled, layerRef, timing } = useContext(FlightContext);
  const ref = useRef(null);
  const innerRef = useRef(null);
  const copyRef = useRef(null);
  // Decided once, from what this card saw when it mounted: cards on the board's first render never fly.
  const [fly] = useState(() => enabled && !moved && !reducedMotion());
  const [shown, setShown] = useState(!fly);
  const [flipped, setFlipped] = useState(!!card && !fly);
  const faceId = card?.id; // the card object is a new copy on every reducer step; only its arrival and id matter here

  // Sideways double: the separate `rotate` property, so the flight and flip transforms don't override it, and room in the row.
  useLayoutEffect(() => {
    const el = ref.current;
    el.style.rotate = sideways ? "90deg" : "";
    el.style.marginInline = sideways ? `${el.offsetWidth * SIDE_ROOM}px` : "";
  });

  useLayoutEffect(() => {
    if (!fly) return;
    const el = ref.current;
    const s = document.querySelector(".deck-stack").getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const w = el.offsetWidth, h = el.offsetHeight;
    const tx = r.left + r.width / 2, ty = r.top + r.height / 2;
    const dx = s.left + s.width / 2 - tx, dy = s.top + s.height / 2 - ty;
    // The copy always shows the back: a hidden card must, and the rest turn over as they land.
    const img = document.createElement("img");
    img.src = "/cards/back.png";
    img.alt = "";
    img.setAttribute("aria-hidden", "true");
    Object.assign(img.style, { position: "fixed", left: `${tx - w / 2}px`, top: `${ty - h / 2}px`, width: `${w}px`, height: `${h}px`,
      objectFit: "contain", borderRadius: "2px", boxShadow: "0 2px 6px rgba(0,0,0,.25)", visibility: "hidden", willChange: "transform" });
    layerRef.current.appendChild(img);
    copyRef.current = img;
    const now = performance.now();
    const start = dealOrder === undefined ? Math.max(now, queue.free) : now + dealOrder * timing.stagger;
    const delay = start - now;
    const undo = reserve(start + timing.stagger + (card ? timing.flip : 0));
    let anim, raf;
    // The copy follows the real card's live spot (the separate `translate` property, on top of the flight), so if the
    // layout moves while it flies (a total changing width, a row re-centring) it still lands exactly on the card.
    const follow = () => { const c = el.getBoundingClientRect(); img.style.translate = `${c.left - r.left}px ${c.top - r.top}px`; };
    const tick = () => { follow(); raf = requestAnimationFrame(tick); };
    const done = () => { cancelAnimationFrame(raf); follow(); setShown(true); };
    const t1 = setTimeout(() => {
      img.style.visibility = "visible";
      anim = img.animate(flightFrames(dx, dy, sideways ? 90 : 0), { duration: timing.slide, easing: EASING, fill: "forwards" });
      anim.onfinish = done;
      tick();
    }, delay);
    const t2 = setTimeout(done, delay + timing.slide + 150); // jsdom, and a background tab that never fires onfinish
    return () => { undo(); cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); anim?.cancel(); img.remove(); copyRef.current = null; };
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
    const an = innerRef.current.animate([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }],
      { duration: timing.flip, easing: "ease-in-out", fill: "forwards" });
    an.onfinish = () => setFlipped(true);
    return () => { undo(); an.cancel(); };
  }, [faceId, flipped, shown, timing]);

  // Not over until the browser says so: the board stays busy through a late frame, past the reserved time.
  const settled = shown && (!faceId || flipped);
  useLayoutEffect(() => (settled ? undefined : hold()), [settled]);

  // On the table and face up: its value now counts in the hand's total.
  useLayoutEffect(() => { if (faceId && shown && flipped) markLanded(faceId); }, [faceId, shown, flipped]);

  return (
    <div ref={ref} className="card-wrap fly-card" data-fk={fk} style={shown ? undefined : { visibility: "hidden" }}>
      <div ref={innerRef} className="fly-inner" style={{ transform: `rotateY(${flipped ? 180 : 0}deg)` }}>
        <div className="card-img fly-back" aria-hidden="true" />
        {card && <img className="card-img fly-front" src={`/cards/${card.rank}_of_${card.suit}.png`} alt={`${card.rank} of ${card.suit}`} draggable={false} />}
      </div>
    </div>
  );
}
