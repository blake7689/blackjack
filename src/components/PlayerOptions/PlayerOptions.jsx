import "./PlayerOptions.css";

export default function PlayerOptions({ onHit, onStay, onDouble, onSplit, showDouble, showSplit }) {
  return (
    <div className="options-wrap">
      <button className="opt" onClick={onHit}>Hit</button>
      <button className="opt" onClick={onStay}>Stay</button>
      {showDouble && <button className="opt" onClick={onDouble}>Double</button>}
      {showSplit && <button className="opt" onClick={onSplit}>Split</button>}
    </div>
  );
}
