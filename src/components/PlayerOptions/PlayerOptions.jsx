import "./PlayerOptions.css";

export default function PlayerOptions({ onHit, onStay, onDouble, onTriple, onSplit, showDouble, showTriple, showSplit }) {
  return (
    <div className="options-wrap">
      <button className="opt" onClick={onHit}>Hit</button>
      <button className="opt" onClick={onStay}>Stay</button>
      {showDouble && <button className="opt" onClick={onDouble}>Double</button>}
      {showTriple && <button className="opt" onClick={onTriple}>Triple</button>}
      {showSplit && <button className="opt" onClick={onSplit}>Split</button>}
    </div>
  );
}
