import { useEffect, useRef } from "react";
import { GamePhases } from "../../utils/constants/gamePhases";
import { HandStatus } from "../../utils/constants/handStatus";
import { SurrenderOptions } from "../../utils/constants/ruleOptions";
import { handActions, insuranceStake, roundNet } from "../../utils/blackjackLogic";
import { visibleChips } from "../../utils/chips";
import { signed } from "../../utils/money";
import { usePlayer } from "../../hooks/usePlayer";
import { useGameState, useGameActions } from "../../hooks/useGame";
import "./Dock.css";

const NOTHING = { hit: false, double: false, triple: false, split: false, surrender: false }; // not your turn: every action dimmed

// A key never leaves the layout: an action that can't be taken now is dimmed with aria-disabled (it still takes focus and
// keeps its place). `focus` marks the key the dock moves focus to when the phase changes (see Dock). //
function Key({ label, name, sub, kind = "", off = false, focus = false, onClick }) {
  return (
    <button type="button" className={`key ${kind}`} aria-label={name} aria-disabled={off || undefined} data-focus={focus || undefined}
      onClick={off ? undefined : onClick}>
      <span>{label}</span>
      {sub && <small>{sub}</small>}
    </button>
  );
}

function Chip({ value, onClick }) {
  return (
    <button type="button" className="chip" onClick={onClick} aria-label={`Add ${value}`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" />
        <circle cx="50" cy="50" r="32" />
        <text x="50" y="58" textAnchor="middle" fontSize="28" fontWeight="bold">${value}</text>
      </svg>
    </button>
  );
}

// The fixed-height bottom dock: the same height in every state, so the table never resizes. One of four faces by phase:
// betting (before the deal), offers (insurance, even money, surrender), your move (the action bar, dimmed until it is your turn)
// and results (the net, the balance, Next hand). `busy`: a card is still flying, so the keys that act wait. //
export default function Dock({ busy }) {
  const { player } = usePlayer();
  const { phase, hands, dealer, offers, selectedHandIndex, betCircle, settings, autoDealPending, autoDealPaused } = useGameState();
  const actions = useGameActions();
  const ref = useRef(null);
  const credits = player ? player.credits : 0; // a signed-out player has nothing to bet or double with

  // Focus follows the phase (offers: the first offer; your move: Hit; results: Next hand), but only when it was on nothing
  // or already in the dock: never pulled from Settings, a menu or a dialog. It also runs when the open offers change: the focused
  // offer unmounts when taken, and focus would fall to the page.
  const openOffers = offers ? `${!!offers.insurance}${!!offers.evenMoney}${!!offers.surrender}` : "";
  useEffect(() => {
    const active = document.activeElement;
    if (active && active !== document.body && !ref.current.contains(active)) return;
    ref.current.querySelector("[data-focus]")?.focus({ preventScroll: true });
  }, [phase, openOffers]);

  const autoOn = settings.autoDeal && settings.resetInitialBet; // Pause / Resume shows between rounds while auto deal is on
  const pause = autoOn && (
    <Key label={autoDealPaused ? "Resume" : "Pause"} name={autoDealPaused ? "Resume auto deal" : "Pause auto deal"}
      onClick={autoDealPaused ? actions.resumeAutoDeal : actions.pauseAutoDeal} />
  );
  let face, rowA, rowB, acting = false;

  if (phase === GamePhases.PRE_DEAL) {
    face = "betting";
    rowA = (
      <div className="rack" role="group" aria-label="Chips">
        {visibleChips(settings.chipValues, credits).map((v) => <Chip key={v} value={v} onClick={() => actions.addBet(v)} />)}
      </div>
    );
    rowB = (
      <>
        <div className="bet-box" role="status">
          <span>${betCircle.toLocaleString()}</span>
        </div>
        <Key label="Clear" off={betCircle === 0} onClick={actions.clearBet} />
        {pause}
        <Key label="Deal" name="Deal" kind="primary big wider" sub={autoDealPending ? "auto" : undefined} off={betCircle === 0 || !player}
          onClick={actions.deal} />
      </>
    );
  } else if (phase === GamePhases.OFFERS) {
    face = "offers";
    acting = true;
    const half = insuranceStake(hands[0].bet);
    const open = [
      offers.insurance && { id: "insurance", label: `Insurance $${half}`, onClick: actions.takeInsurance },
      offers.evenMoney && { id: "evenMoney", label: "Even money", onClick: actions.evenMoney },
      offers.surrender && { id: "surrender", label: "Surrender", sub: `$${half} back`, onClick: () => actions.surrender(0) },
    ].filter(Boolean);
    rowA = open.map((o, i) => <Key key={o.id} label={o.label} sub={o.sub} kind="offer" off={busy} focus={i === 0} onClick={o.onClick} />);
    rowB = <Key label="No thanks" kind="solid big" off={busy} onClick={actions.declineOffers} />;
  } else if (phase === GamePhases.POST_ROUND || phase === GamePhases.END_ROUND) {
    face = "results";
    const net = roundNet(hands);
    rowA = (
      <div className="summary">
        <div className="s-l">
          <small>{net > 0 ? "You won" : net < 0 ? "You lost" : "Even round"}</small>
          <b className={net > 0 ? "up" : net < 0 ? "down" : undefined}>{signed(net)}</b>
        </div>
        <div className="s-r">Balance<b>${credits.toLocaleString()}</b></div>
      </div>
    );
    rowB = (
      <>
        {pause}
        <Key label="Next hand" kind="primary big wider" focus onClick={actions.continueRound} />
      </>
    );
  } else {
    face = "play";
    acting = true;
    const sel = selectedHandIndex;
    // Only on your turn, on a hand still in play with its cards dealt (a split hand waits for its card), and no card in flight.
    const yours = !busy && phase === GamePhases.PLAYER_TURN && hands[sel]?.status === HandStatus.PLAYING && !hands[sel].awaitingCard;
    const can = yours ? handActions(hands[sel], dealer, hands.length, credits, settings) : NOTHING;
    rowA = (
      <>
        <Key label="Double" off={!can.double} onClick={() => actions.double(sel)} />
        <Key label="Split" off={!can.split} onClick={() => actions.split(sel)} />
        {settings.surrender !== SurrenderOptions.NONE && <Key label="Surrender" off={!can.surrender} onClick={() => actions.surrender(sel)} />}
        {settings.tripleDown && <Key label="Triple" off={!can.triple} onClick={() => actions.triple(sel)} />}
      </>
    );
    rowB = (
      <>
        <Key label="Stay" kind="solid big" off={!yours} onClick={() => actions.stand(sel)} />
        <Key label="Hit" kind="primary big" off={!can.hit} focus={phase === GamePhases.PLAYER_TURN} onClick={() => actions.hit(sel)} />
      </>
    );
  }

  // .options-wrap: the hook for "the keys that act wait while cards fly" (the e2e tests watch it; .board.busy .options-wrap is inert).
  return (
    <footer className="dock" aria-label="Controls">
      <div ref={ref} className={`dock-in${acting ? " options-wrap" : ""}`} data-face={face}
        role={face === "offers" ? "group" : undefined} aria-label={face === "offers" ? "Offers" : undefined}>
        <div className="dock-row">{rowA}</div>
        <div className="dock-row">{rowB}</div>
      </div>
    </footer>
  );
}
