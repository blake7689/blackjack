export default function StatsPanel({ player }) {
  return (
    <div>
      <div>Player: {player ? player.userName : "Guest"}</div>
      <div>Credits: ${player ? Number(player.credits).toLocaleString() : 0}</div>
    </div>
  );
}