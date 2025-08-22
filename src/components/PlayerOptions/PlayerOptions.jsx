import "./PlayerOptions.css";

export default function PlayerOptions({ onHit, onStay, onDouble, onSplit, showDouble, showSplit, disableActions, disableDouble, disableSplit }) {
  return (
    <div className="options-wrap">
      <button className="opt" onClick={onHit} disabled={disableActions}>Hit</button>
      <button className="opt" onClick={onStay} disabled={disableActions}>Stay</button>
      {showDouble && <button className="opt" onClick={onDouble} disabled={disableActions || disableDouble}>Double</button>}
      {showSplit && <button className="opt" onClick={onSplit} disabled={disableActions || disableSplit}>Split</button>}
    </div>
  );
}