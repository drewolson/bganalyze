import { useEffect, useRef } from "react";
import type { Game, Move, Alternative, CubeAnalysis } from "../types/match";

interface MoveListProps {
  game: Game;
  selectedMoveIndex: number;
  selectedAltIndex: number;
  onSelectMove: (moveIndex: number) => void;
  onSelectAlt: (moveIndex: number, altIndex: number) => void;
}

function alertSeverity(alerts: string[] | null): "very_bad" | "bad" | "doubtful" | null {
  if (!alerts) return null;
  for (const a of alerts) {
    if (a.includes("very bad")) return "very_bad";
  }
  for (const a of alerts) {
    if (a.includes("bad") || a.includes("wrong")) return "bad";
  }
  for (const a of alerts) {
    if (a.includes("doubtful")) return "doubtful";
  }
  return null;
}

function alertErrorTypes(alerts: string[] | null): { move: boolean; cube: boolean } {
  if (!alerts) return { move: false, cube: false };
  let move = false;
  let cube = false;
  for (const a of alerts) {
    const l = a.toLowerCase();
    if (l.includes("move")) move = true;
    if (l.includes("double") || l.includes("pass") || l.includes("take")) cube = true;
  }
  return { move, cube };
}

type Severity = "very_bad" | "bad" | "doubtful" | null;

export function severityColor(severity: Severity): string | undefined {
  switch (severity) {
    case "very_bad": return "#fee2e2";
    case "bad": return "#ffedd5";
    case "doubtful": return "#fef9c3";
    default: return undefined;
  }
}

export function severityArrowColor(severity: Severity): string | undefined {
  switch (severity) {
    case "very_bad": return "rgba(220,38,38,0.7)";
    case "bad": return "rgba(234,88,12,0.7)";
    case "doubtful": return "rgba(202,138,4,0.7)";
    default: return undefined;
  }
}

export function diffToSeverity(diff: number): Severity {
  if (diff <= -0.120) return "very_bad";
  if (diff <= -0.080) return "bad";
  if (diff <= -0.020) return "doubtful";
  return null;
}

function diceStr(dice: [number, number]): string {
  if (dice[0] === 0 && dice[1] === 0) return "";
  return `${dice[0]}${dice[1]}`;
}

function equityChangeStr(move: Move): string {
  if (!move.MoveAnalysis) return "";
  const eq = move.MoveAnalysis.EquityChange;
  return eq >= 0 ? `+${eq.toFixed(3)}` : eq.toFixed(3);
}

// chosenRankStr removed — we only use background color for blunders now

export default function MoveList({
  game,
  selectedMoveIndex,
  selectedAltIndex,
  onSelectMove,
  onSelectAlt,
}: MoveListProps) {
  const selectedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    selectedRef.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [selectedMoveIndex]);

  return (
    <div data-testid="move-list" style={{ overflowY: "auto", maxHeight: "100%" }}>
      {game.Moves.map((move, mi) => {
        const isSelected = mi === selectedMoveIndex;
        const chosenAlt = move.MoveAnalysis?.Alternatives?.find(a => a.IsChosen);
        const severity = chosenAlt
          ? diffToSeverity(chosenAlt.Diff)
          : alertSeverity(move.Alerts);
        const bg = isSelected && !severity ? "#dbeafe" : severityColor(severity);
        const errorTypes = severity ? alertErrorTypes(move.Alerts) : { move: false, cube: false };

        return (
          <div key={mi} ref={isSelected ? selectedRef : undefined}>
            <div
              data-testid={`move-row-${mi}`}
              onClick={() => onSelectMove(mi)}
              style={{
                display: "flex",
                gap: 8,
                padding: "3px 6px",
                cursor: "pointer",
                background: bg,
                fontSize: 12,
                fontFamily: "monospace",
                borderBottom: "1px solid #eee",
                alignItems: "center",
                outline: isSelected ? "2px solid #3b82f6" : undefined,
                outlineOffset: -2,
              }}
            >
              <span style={{ width: 24, color: "#888", flexShrink: 0 }}>{move.Number}</span>
              <span style={{ width: 80, flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{move.Player}</span>
              <span style={{ width: 24, flexShrink: 0 }}>{diceStr(move.Dice)}</span>
              <span style={{ flex: 1 }}>{move.Action}</span>
              <span style={{ width: 52, textAlign: "right", flexShrink: 0 }}>
                {equityChangeStr(move)}
              </span>
              <span style={{ width: 24, display: "flex", gap: 2, alignItems: "center", justifyContent: "flex-end", flexShrink: 0 }}>
                {errorTypes.move && (
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <circle cx="4" cy="4" r="3.5" fill="none" stroke="#888" strokeWidth="1" />
                  </svg>
                )}
                {errorTypes.cube && (
                  <svg width="8" height="8" viewBox="0 0 8 8">
                    <rect x="0.5" y="0.5" width="7" height="7" fill="none" stroke="#888" strokeWidth="1" />
                  </svg>
                )}
              </span>
            </div>

            {isSelected && move.MoveAnalysis?.Alternatives && move.MoveAnalysis.Alternatives.length > 0 && (
              <AlternativesList
                alternatives={move.MoveAnalysis.Alternatives}
                selectedAltIndex={selectedAltIndex}
                onSelectAlt={(altIdx) => onSelectAlt(mi, altIdx)}
              />
            )}

            {isSelected && move.CubeAnalysis && (
              <CubeAnalysisPanel cube={move.CubeAnalysis} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function AlternativesList({
  alternatives,
  selectedAltIndex,
  onSelectAlt,
}: {
  alternatives: Alternative[];
  selectedAltIndex: number;
  onSelectAlt: (altIndex: number) => void;
}) {
  return (
    <div style={{ paddingLeft: 24, background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
      {alternatives.map((alt, ai) => {
        const isSelected = ai === selectedAltIndex;
        const bg = severityColor(diffToSeverity(alt.Diff));
        return (
          <div
            key={ai}
            data-testid={`alt-row-${ai}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelectAlt(ai);
            }}
            style={{
              display: "flex",
              gap: 8,
              padding: "2px 6px",
              cursor: "pointer",
              background: bg,
              fontSize: 11,
              fontFamily: "monospace",
              outline: isSelected ? "2px solid #3b82f6" : undefined,
              outlineOffset: -2,
            }}
          >
            <span style={{ width: 20, color: alt.IsChosen ? "#000" : "#888" }}>
              {alt.IsChosen ? "*" : ""}{alt.Rank}.
            </span>
            <span style={{ flex: 1 }}>{alt.Move}</span>
            <span style={{ width: 52, textAlign: "right" }}>
              {alt.Equity >= 0 ? "+" : ""}{alt.Equity.toFixed(3)}
            </span>
            <span style={{ width: 60, textAlign: "right", color: "#888" }}>
              ({alt.Diff >= 0 ? "+" : ""}{alt.Diff.toFixed(3)})
            </span>
          </div>
        );
      })}
    </div>
  );
}

function CubeAnalysisPanel({ cube }: { cube: CubeAnalysis }) {
  // Compute diffs relative to the best option
  const best = Math.max(cube.NoDouble, cube.DoubleTake, cube.DoublePass);
  const ndDiff = cube.NoDouble - best;
  const dtDiff = cube.DoubleTake - best;
  const dpDiff = cube.DoublePass - best;

  return (
    <div
      data-testid="cube-analysis"
      style={{ paddingLeft: 24, background: "#f9fafb", borderBottom: "1px solid #e5e7eb", fontSize: 11, fontFamily: "monospace" }}
    >
      <CubeRow label="Cubeless Equity" value={cube.CubelessEquity} />
      <CubeRow label="No double" value={cube.NoDouble} diff={ndDiff} />
      <CubeRow label="Double/Take" value={cube.DoubleTake} diff={dtDiff} />
      <CubeRow label="Double/Pass" value={cube.DoublePass} diff={dpDiff} />
      <div style={{ padding: "2px 6px", fontSize: 10, fontWeight: "bold" }}>
        {cube.ProperAction}
      </div>
    </div>
  );
}

function CubeRow({ label, value, diff }: { label: string; value: number; diff?: number }) {
  return (
    <div style={{ display: "flex", padding: "2px 6px" }}>
      <span style={{ flex: 1 }}>{label}</span>
      <span style={{ width: 60, textAlign: "right" }}>
        {value >= 0 ? "+" : ""}{value.toFixed(3)}
      </span>
      {diff !== undefined && diff !== 0 && (
        <span style={{ width: 60, textAlign: "right", color: "#888" }}>
          ({diff >= 0 ? "+" : ""}{diff.toFixed(3)})
        </span>
      )}
    </div>
  );
}
