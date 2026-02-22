import type { MatchData, StatBlock } from "../types/match";

interface MatchSummaryProps {
  match: MatchData;
  ply?: number;
  flipped?: boolean;
}

export default function MatchSummary({ match, ply, flipped }: MatchSummaryProps) {
  const stats = match.MatchStats;
  const rawScore = match.Games.length > 0
    ? match.Games.reduce(
        (acc, g) => {
          if (g.Winner === match.Player1) return [acc[0] + g.PointsWon, acc[1]];
          if (g.Winner === match.Player2) return [acc[0], acc[1] + g.PointsWon];
          return acc;
        },
        [0, 0],
      )
    : [0, 0];
  const cap = match.MatchLength > 0 ? match.MatchLength : Infinity;
  const finalScore: [number, number] = [Math.min(rawScore[0], cap), Math.min(rawScore[1], cap)];

  const [i, j] = flipped ? [1, 0] as const : [0, 1] as const;
  const leftPlayer = flipped ? match.Player2 : match.Player1;
  const rightPlayer = flipped ? match.Player1 : match.Player2;

  return (
    <div data-testid="match-summary" style={{ fontSize: 13, lineHeight: 1.8 }}>
      {/* Header: score */}
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, fontSize: 20, fontWeight: "bold" }}>
          <span style={{ textAlign: "right", flex: 1, minWidth: 0 }}>{leftPlayer}</span>
          <span style={{ whiteSpace: "nowrap", flexShrink: 0 }}>{finalScore[i]} - {finalScore[j]}</span>
          <span style={{ textAlign: "left", flex: 1, minWidth: 0 }}>{rightPlayer}</span>
        </div>
        <div style={{ fontSize: 14, color: "#888" }}>
          {match.MatchLength > 0 ? `${match.MatchLength} point` : "Unlimited"}
          {ply != null && <> · {ply}-ply analysis</>}
        </div>
      </div>

      {/* Stats table */}
      {stats && <StatsTable stats={stats} player1={leftPlayer} player2={rightPlayer} i={i} j={j} />}
    </div>
  );
}

function StatsTable({ stats, player1, player2, i, j }: { stats: StatBlock; player1: string; player2: string; i: number; j: number }) {
  const fmt = (v: number) => Math.abs(v).toFixed(3);
  const cp = stats.Checkerplay;
  const cube = stats.Cube;
  const overall = stats.Overall;
  const luck = stats.Luck;

  const rows: { label: string; v1: string; v2: string }[] = [
    { label: "Overall PR", v1: fmt(overall[i].SnowieErrorRate), v2: fmt(overall[j].SnowieErrorRate) },
    { label: "Error Rate (MWC)", v1: fmt(overall[i].ErrorRateMWC), v2: fmt(overall[j].ErrorRateMWC) },
    { label: "Unforced Moves", v1: `${cp[i].UnforcedMoves}`, v2: `${cp[j].UnforcedMoves}` },
    { label: "Move Errors (MWC)", v1: fmt(cp[i].ErrorRateMWC), v2: fmt(cp[j].ErrorRateMWC) },
    { label: "Close Cube Decisions", v1: `${cube[i].CloseOrActual}`, v2: `${cube[j].CloseOrActual}` },
    { label: "Total Cube Decisions", v1: `${cube[i].TotalDecisions}`, v2: `${cube[j].TotalDecisions}` },
    { label: "Cube Errors (MWC)", v1: fmt(cube[i].ErrorRateMWC), v2: fmt(cube[j].ErrorRateMWC) },
    { label: "Luck (MWC)", v1: (luck[i].TotalMWC >= 0 ? "+" : "") + luck[i].TotalMWC.toFixed(3) + "%", v2: (luck[j].TotalMWC >= 0 ? "+" : "") + luck[j].TotalMWC.toFixed(3) + "%" },
    { label: "FIBS Rating", v1: overall[i].FIBSRating.toFixed(0), v2: overall[j].FIBSRating.toFixed(0) },
  ];

  const cellStyle = { padding: "1px 8px", textAlign: "right" as const };

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "monospace" }}>
      <thead>
        <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
          <th style={{ textAlign: "left", padding: "2px 8px", fontWeight: "normal", color: "#888" }}></th>
          <th style={{ ...cellStyle, fontWeight: "bold", fontSize: 13, fontFamily: "sans-serif" }}>{player1}</th>
          <th style={{ ...cellStyle, fontWeight: "bold", fontSize: 13, fontFamily: "sans-serif" }}>{player2}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label} style={{ borderBottom: "1px solid #f3f4f6" }}>
            <td style={{ padding: "1px 8px", fontWeight: "bold", fontFamily: "sans-serif", whiteSpace: "nowrap" }}>{row.label}</td>
            <td style={cellStyle}>{row.v1}</td>
            <td style={cellStyle}>{row.v2}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
