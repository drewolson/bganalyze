import { useCallback, useEffect, useRef, useState } from "react";
import Board from "./components/Board";
import Upload from "./components/Upload";
import MatchSummary from "./components/MatchSummary";
import MoveList, { diffToSeverity, severityArrowColor } from "./components/MoveList";
import { STARTING_POSITION, STARTING_PIP_COUNTS } from "./types/match";
import type { MatchData } from "./types/match";
import { decodePositionId } from "./lib/positionId";
import { parseMoveNotation } from "./lib/moveNotation";

interface HistoryEntry {
  id: string;
  player1: string;
  player2: string;
  matchLength: number;
  finalScore: [number, number];
  date: string;
  ply?: number;
  data: MatchData;
  flipped?: boolean;
}

function computeFinalScore(data: MatchData): [number, number] {
  if (data.Games.length === 0) return [0, 0];
  const last = data.Games[data.Games.length - 1];
  const [s1, s2] = last.ScoreBefore;
  const raw: [number, number] = last.Winner === data.Player1
    ? [s1 + last.PointsWon, s2]
    : last.Winner === data.Player2
      ? [s1, s2 + last.PointsWon]
      : [s1, s2];
  const cap = data.MatchLength > 0 ? data.MatchLength : Infinity;
  return [Math.min(raw[0], cap), Math.min(raw[1], cap)];
}

async function fetchHistory(): Promise<HistoryEntry[]> {
  const resp = await fetch("/api/history");
  if (!resp.ok) return [];
  return resp.json();
}

type AppState =
  | { phase: "idle" }
  | { phase: "analyzing"; matchID: string; ply: number }
  | { phase: "complete"; matchID: string; ply: number }
  | { phase: "viewing"; ply?: number }
  | { phase: "error"; message: string }
  | { phase: "archive" };

function App() {
  const [state, setState] = useState<AppState>({ phase: "idle" });
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [selectedGame, setSelectedGame] = useState(-1); // -1 = summary view
  const [selectedMove, setSelectedMove] = useState(0);
  const [selectedAlt, setSelectedAlt] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [viewingMatchId, setViewingMatchId] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [reanalyzePly, setReanalyzePly] = useState(2);
  const timerRef = useRef<ReturnType<typeof setInterval>>(null);
  const reanalyzeFlippedRef = useRef<boolean | null>(null);

  // Update document title during analysis
  useEffect(() => {
    if (state.phase !== "analyzing") {
      document.title = "BGAnalyze";
      return;
    }
    const frames = ["◐", "◓", "◑", "◒"];
    let i = 0;
    document.title = `${frames[0]} Analyzing...`;
    const id = setInterval(() => {
      i = (i + 1) % frames.length;
      document.title = `${frames[i]} Analyzing...`;
    }, 200);
    return () => {
      clearInterval(id);
      document.title = "BGAnalyze";
    };
  }, [state.phase]);

  // Load history from server on mount
  useEffect(() => {
    fetchHistory().then((entries) => {
      setHistory(entries);
      setHistoryLoading(false);
    });
  }, []);

  const onUpload = useCallback((matchID: string, ply: number) => {
    setState({ phase: "analyzing", matchID, ply });
  }, []);

  const goHome = useCallback(() => {
    setMatchData(null);
    setSelectedGame(-1);
    setSelectedMove(0);
    setSelectedAlt(0);
    setFlipped(false);
    setViewingMatchId(null);
    setState({ phase: "idle" });
  }, []);

  const viewMatch = useCallback((entry: HistoryEntry) => {
    setMatchData(entry.data);
    setSelectedGame(-1);
    setSelectedMove(0);
    setSelectedAlt(0);
    setFlipped(entry.flipped ?? false);
    setViewingMatchId(entry.id);
    setReanalyzePly(Math.min((entry.ply ?? 2) + 1, 4));
    setState({ phase: "viewing", ply: entry.ply });
  }, []);

  const deleteEntry = useCallback((id: string) => {
    setHistory((prev) => prev.filter((e) => e.id !== id));
    fetch(`/api/history/${id}`, { method: "DELETE" });
  }, []);

  const clearHistory = useCallback(() => {
    setHistory([]);
    fetch("/api/history", { method: "DELETE" });
  }, []);

  useEffect(() => {
    if (state.phase !== "analyzing") return;

    const poll = async () => {
      try {
        const resp = await fetch(`/api/match/${state.matchID}/status`);
        if (!resp.ok) {
          setState({ phase: "error", message: "Failed to check status" });
          return;
        }
        const data = await resp.json();
        if (data.status === "complete") {
          setState({ phase: "complete", matchID: state.matchID, ply: state.ply });
        } else if (data.status === "error") {
          setState({ phase: "error", message: data.error || "Analysis failed" });
        }
      } catch {
        setState({ phase: "error", message: "Failed to check status" });
      }
    };

    poll();
    timerRef.current = setInterval(poll, 2000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [state.phase, state.phase === "analyzing" ? state.matchID : null]);

  function chosenAltIndex(data: MatchData, gameIdx: number, moveIdx: number): number {
    const move = data.Games[gameIdx]?.Moves[moveIdx];
    if (move?.MoveAnalysis?.Alternatives) {
      const idx = move.MoveAnalysis.Alternatives.findIndex((a) => a.IsChosen);
      if (idx >= 0) return idx;
    }
    return 0;
  }

  useEffect(() => {
    if (state.phase !== "complete") return;
    fetch(`/api/match/${state.matchID}/analysis`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: MatchData) => {
        const preservedFlipped = reanalyzeFlippedRef.current ?? false;
        reanalyzeFlippedRef.current = null;

        setMatchData(data);
        setSelectedGame(-1);
        setSelectedMove(0);
        setSelectedAlt(0);
        setFlipped(preservedFlipped);
        setViewingMatchId(state.matchID);
        setReanalyzePly(Math.min(state.ply + 1, 4));

        // Save to history
        const entry: HistoryEntry = {
          id: state.matchID,
          player1: data.Player1,
          player2: data.Player2,
          matchLength: data.MatchLength,
          finalScore: computeFinalScore(data),
          date: new Date().toISOString(),
          ply: state.ply,
          data,
          flipped: preservedFlipped,
        };
        setHistory((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)]);
        fetch("/api/history", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });

        setState({ phase: "viewing", ply: state.ply });
      })
      .catch(() => setMatchData(null));
  }, [state.phase, state.phase === "complete" ? state.matchID : null]);

  // When game changes, reset move selection
  const handleGameChange = useCallback((gameIdx: number) => {
    setSelectedGame(gameIdx);
    setSelectedMove(0);
    if (gameIdx >= 0 && matchData) {
      setSelectedAlt(chosenAltIndex(matchData, gameIdx, 0));
    } else {
      setSelectedAlt(0);
    }
  }, [matchData]);

  // When move changes, default alt to the chosen one
  const handleMoveSelect = useCallback(
    (moveIdx: number) => {
      setSelectedMove(moveIdx);
      if (matchData) {
        const game = matchData.Games[selectedGame];
        const move = game?.Moves[moveIdx];
        if (move?.MoveAnalysis?.Alternatives) {
          const chosenIdx = move.MoveAnalysis.Alternatives.findIndex((a) => a.IsChosen);
          setSelectedAlt(chosenIdx >= 0 ? chosenIdx : 0);
        } else {
          setSelectedAlt(0);
        }
      }
    },
    [matchData, selectedGame],
  );

  const handleAltSelect = useCallback((_moveIdx: number, altIdx: number) => {
    setSelectedAlt(altIdx);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (state.phase !== "viewing" || !matchData) return;

    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowHelp(false);
        return;
      }
      if (e.key === "?") {
        setShowHelp((v) => !v);
        return;
      }
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        setSelectedGame((prevGame) => {
          if (e.key === "ArrowRight") {
            if (prevGame === -1) {
              const newGame = 0;
              setSelectedMove(0);
              setSelectedAlt(chosenAltIndex(matchData, newGame, 0));
              return newGame;
            }
            setSelectedMove((prevMove) => {
              const game = matchData.Games[prevGame];
              if (!game) return prevMove;
              const nextMove = prevMove + 1;
              if (nextMove < game.Moves.length) {
                setSelectedAlt(chosenAltIndex(matchData, prevGame, nextMove));
                return nextMove;
              }
              const nextGame = prevGame + 1;
              if (nextGame < matchData.Games.length) {
                setSelectedGame(nextGame);
                setSelectedAlt(chosenAltIndex(matchData, nextGame, 0));
                return 0;
              }
              return prevMove;
            });
          } else {
            if (prevGame === -1) return prevGame;
            setSelectedMove((prevMove) => {
              if (prevMove > 0) {
                const newMove = prevMove - 1;
                setSelectedAlt(chosenAltIndex(matchData, prevGame, newMove));
                return newMove;
              }
              const prevGameIdx = prevGame - 1;
              if (prevGameIdx >= 0) {
                const prevGameData = matchData.Games[prevGameIdx];
                const lastMove = prevGameData.Moves.length - 1;
                setSelectedGame(prevGameIdx);
                setSelectedAlt(chosenAltIndex(matchData, prevGameIdx, lastMove));
                return lastMove;
              }
              setSelectedGame(-1);
              setSelectedAlt(0);
              return 0;
            });
          }
          return prevGame;
        });
      }

      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedGame((prevGame) => {
          if (prevGame < 0) return prevGame;
          setSelectedMove((prevMove) => {
            const game = matchData.Games[prevGame];
            const move = game?.Moves[prevMove];
            const alts = move?.MoveAnalysis?.Alternatives;
            if (!alts || alts.length === 0) return prevMove;
            setSelectedAlt((prevAlt) => {
              if (e.key === "ArrowDown") {
                return prevAlt < alts.length - 1 ? prevAlt + 1 : prevAlt;
              }
              return prevAlt > 0 ? prevAlt - 1 : prevAlt;
            });
            return prevMove;
          });
          return prevGame;
        });
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [state.phase, matchData]);

  // --- Home screen ---
  if (state.phase === "idle") {
    return (
      <div style={{ maxWidth: 960, margin: "60px auto", padding: "0 32px" }}>
        <h1>BGAnalyze</h1>
        <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
          {/* Left: history */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#666" }}>Recently Analyzed</h3>
            {historyLoading ? (
              <p style={{ fontSize: 15, color: "#999" }}>Loading...</p>
            ) : history.length === 0 ? (
              <p style={{ fontSize: 15, color: "#999" }}>No matches analyzed yet.</p>
            ) : (
              <>
                <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
                  {history.slice(0, 5).map((entry) => (
                    <div
                      key={entry.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        padding: "10px 14px",
                        borderBottom: "1px solid #f3f4f6",
                        cursor: "pointer",
                        fontSize: 15,
                      }}
                      onClick={() => viewMatch(entry)}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: "bold" }}>
                          {entry.flipped ? entry.player2 : entry.player1} vs {entry.flipped ? entry.player1 : entry.player2}
                        </div>
                        <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                          {entry.finalScore ? (() => {
                            const cap = entry.matchLength > 0 ? entry.matchLength : Infinity;
                            const [s0, s1] = entry.flipped ? [entry.finalScore[1], entry.finalScore[0]] : entry.finalScore;
                            return `${Math.min(s0, cap)}–${Math.min(s1, cap)}`;
                          })() : ""}
                          {" · "}{entry.matchLength > 0 ? `${entry.matchLength} point` : "Unlimited"}
                          {entry.ply != null && <> · {entry.ply}-ply</>}
                          {" · "}
                          {new Date(entry.date).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                        title="Delete"
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", padding: "4px 8px" }}
                      >
                        x
                      </button>
                    </div>
                  ))}
                </div>
                {history.length > 5 && (
                  <button
                    onClick={() => setState({ phase: "archive" })}
                    style={{ marginTop: 10, fontSize: 14, padding: "6px 14px", cursor: "pointer" }}
                  >
                    View Archive
                  </button>
                )}
              </>
            )}
          </div>

          {/* Right: upload */}
          <div style={{ width: 360, flexShrink: 0 }}>
            <h3 style={{ margin: "0 0 12px", fontSize: 16, color: "#666" }}>New Analysis</h3>

            <Upload onUpload={onUpload} />
          </div>
        </div>
      </div>
    );
  }

  if (state.phase === "archive") {
    return (
      <div style={{ maxWidth: 960, margin: "60px auto", padding: "0 32px" }}>
        <h1 style={{ marginBottom: 16 }}>Archive</h1>
        {history.length === 0 ? (
          <p style={{ fontSize: 15, color: "#999" }}>No matches analyzed yet.</p>
        ) : (
          <>
            <div style={{ border: "1px solid #e5e7eb", borderRadius: 6, overflow: "hidden" }}>
              {history.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 14px",
                    borderBottom: "1px solid #f3f4f6",
                    cursor: "pointer",
                    fontSize: 15,
                  }}
                  onClick={() => viewMatch(entry)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: "bold" }}>
                      {entry.flipped ? entry.player2 : entry.player1} vs {entry.flipped ? entry.player1 : entry.player2}
                    </div>
                    <div style={{ fontSize: 13, color: "#888", marginTop: 2 }}>
                      {entry.finalScore ? (() => {
                        const cap = entry.matchLength > 0 ? entry.matchLength : Infinity;
                        const [s0, s1] = entry.flipped ? [entry.finalScore[1], entry.finalScore[0]] : entry.finalScore;
                        return `${Math.min(s0, cap)}–${Math.min(s1, cap)}`;
                      })() : ""}
                      {" · "}{entry.matchLength > 0 ? `${entry.matchLength} point` : "Unlimited"}
                      {entry.ply != null && <> · {entry.ply}-ply</>}
                      {" · "}
                      {new Date(entry.date).toLocaleDateString()}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteEntry(entry.id); }}
                    title="Delete"
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 18, color: "#999", padding: "4px 8px" }}
                  >
                    x
                  </button>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button
                onClick={goHome}
                style={{ fontSize: 14, padding: "6px 14px", cursor: "pointer" }}
              >
                Back Home
              </button>
              <button
                onClick={() => { if (window.confirm("Clear all history? This cannot be undone.")) clearHistory(); }}
                style={{ fontSize: 14, padding: "6px 14px", cursor: "pointer" }}
              >
                Clear All
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  if (state.phase === "analyzing") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        <div style={{
          width: 32, height: 32, margin: "0 auto 16px",
          border: "3px solid #e5e7eb", borderTopColor: "#3b82f6",
          borderRadius: "50%", animation: "spin 0.8s linear infinite",
        }} />
        <p data-testid="analyzing-message">Analyzing match...</p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div style={{ maxWidth: 480, margin: "80px auto", padding: "0 16px", textAlign: "center" }}>
        <h1>BGAnalyze</h1>
        <p data-testid="error-message" style={{ color: "red" }}>{state.message}</p>
        <button onClick={goHome}>Try again</button>
      </div>
    );
  }

  // phase === "viewing" (or "complete" while fetching)
  const game = matchData?.Games[selectedGame];
  const currentMove = game?.Moves[selectedMove];

  const playerOnRoll: 1 | 2 = currentMove?.Player === matchData?.Player1 ? 1 : 2;

  // For reject/take moves, the position ID was copied from the preceding double,
  // so it's encoded from the doubler's perspective, not the responder's.
  const positionPlayer: 1 | 2 =
    currentMove?.Type === "reject" || currentMove?.Type === "take"
      ? playerOnRoll === 1 ? 2 : 1
      : playerOnRoll;

  let position = STARTING_POSITION;
  if (currentMove?.PositionID) {
    try {
      position = decodePositionId(currentMove.PositionID, positionPlayer);
    } catch {
      // fall back to starting position
    }
  }

  const pipCounts = currentMove?.PipCounts[0]
    ? (currentMove.PipCounts as [number, number])
    : STARTING_PIP_COUNTS;

  let cubeValue = 1;
  let cubeOwner: 0 | 1 | 2 = 0;
  if (game) {
    for (let i = 0; i <= selectedMove; i++) {
      const m = game.Moves[i];
      if (!m) break;
      if (m.Type === "double") {
        const next = game.Moves[i + 1];
        if (next && (next.Type === "take" || next.Action === "accepts")) {
          cubeValue *= 2;
          cubeOwner = m.Player === matchData?.Player1 ? 2 : 1;
        }
      }
    }
  }

  let crawfordLabel: string | undefined;
  if (matchData && matchData.MatchLength > 0 && game) {
    const [s1, s2] = game.ScoreBefore;
    const ml = matchData.MatchLength;
    const p1away = ml - s1;
    const p2away = ml - s2;
    if (p1away === 1 || p2away === 1) {
      let crawfordAlreadyPlayed = false;
      for (let g = 0; g < selectedGame; g++) {
        const prev = matchData.Games[g];
        const prev1away = ml - prev.ScoreBefore[0];
        const prev2away = ml - prev.ScoreBefore[1];
        if (prev1away === 1 || prev2away === 1) {
          crawfordAlreadyPlayed = true;
          break;
        }
      }
      crawfordLabel = crawfordAlreadyPlayed ? "Post-Crawford" : "Crawford";
    }
  }

  let arrowColor: string | undefined;
  const selectedAltData = currentMove?.MoveAnalysis?.Alternatives?.[selectedAlt];
  if (selectedAltData) {
    arrowColor = severityArrowColor(diffToSeverity(selectedAltData.Diff));
  }

  let arrows = undefined;
  if (currentMove?.MoveAnalysis?.Alternatives) {
    const alt = currentMove.MoveAnalysis.Alternatives[selectedAlt];
    if (alt?.Move) {
      let steps = parseMoveNotation(alt.Move);
      if (playerOnRoll === 2) {
        steps = steps.map((s) => ({
          from: s.from >= 1 && s.from <= 24 ? 25 - s.from : s.from,
          to: s.to >= 1 && s.to <= 24 ? 25 - s.to : s.to,
        }));
      }
      arrows = steps;
    }
  }

  const isSummary = selectedGame === -1;

  return (
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      {/* Left panel: game selector + move list or summary */}
      <div style={{ width: 420, display: "flex", flexDirection: "column", borderRight: "1px solid #e5e7eb", minHeight: 0, overflow: "hidden" }}>
        {matchData && (
          <div style={{ padding: "6px 8px", borderBottom: "1px solid #e5e7eb", display: "flex", gap: 6, alignItems: "center" }}>
            <button
              onClick={goHome}
              style={{ fontSize: 12, padding: "3px 8px", cursor: "pointer", flexShrink: 0 }}
            >
              Home
            </button>
            <select
              data-testid="game-selector"
              value={selectedGame}
              onChange={(e) => handleGameChange(Number(e.target.value))}
              style={{ flex: 1, fontSize: 13, padding: "4px" }}
            >
              <option value={-1}>Match Summary</option>
              {matchData.Games.map((g, i) => (
                <option key={i} value={i}>
                  Game {g.GameNumber} — {g.ScoreBefore[0]}-{g.ScoreBefore[1]}
                  {g.Winner ? ` (${g.Winner} wins ${g.PointsWon})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div style={{ flex: 1, overflow: "auto", minHeight: 0 }}>
          {isSummary && matchData ? (
            <div style={{ padding: "12px 16px" }}>
              <MatchSummary match={matchData} ply={state.phase === "viewing" ? state.ply : undefined} flipped={flipped} />
            </div>
          ) : game && (
            <MoveList
              game={game}
              selectedMoveIndex={selectedMove}
              selectedAltIndex={selectedAlt}
              onSelectMove={handleMoveSelect}
              onSelectAlt={handleAltSelect}
            />
          )}
        </div>
      </div>

      {/* Right panel: board */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 16, minHeight: 0, overflow: "hidden" }}>
        <div style={{ alignSelf: "flex-end", marginBottom: 4, display: "flex", gap: 4, alignItems: "center" }}>
          <button
            onClick={() => setShowHelp(true)}
            style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
            title="Keyboard shortcuts"
          >
            ?
          </button>
          <button
            onClick={() => setFlipped((f) => {
              const next = !f;
              if (viewingMatchId) {
                setHistory((prev) => prev.map((e) => e.id === viewingMatchId ? { ...e, flipped: next } : e));
                fetch(`/api/history/${viewingMatchId}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ flipped: next }),
                });
              }
              return next;
            })}
            style={{ fontSize: 12, padding: "2px 8px", cursor: "pointer" }}
            title="Flip board"
          >
            Flip Board
          </button>
          {state.phase === "viewing" && viewingMatchId && (
            <>
              <select
                data-testid="reanalyze-ply"
                value={reanalyzePly}
                onChange={(e) => setReanalyzePly(Number(e.target.value))}
                style={{ fontSize: 12, padding: "2px" }}
              >
                {[0, 1, 2, 3, 4].map((p) => (
                  <option key={p} value={p}>{p}-ply</option>
                ))}
              </select>
              <button
                data-testid="reanalyze-btn"
                onClick={async () => {
                  try {
                    const resp = await fetch(`/api/history/${viewingMatchId}/reanalyze`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ ply: reanalyzePly }),
                    });
                    if (!resp.ok) {
                      const text = await resp.text();
                      setState({ phase: "error", message: text || "Re-analysis failed" });
                      return;
                    }
                    reanalyzeFlippedRef.current = flipped;
                    setState({ phase: "analyzing", matchID: viewingMatchId, ply: reanalyzePly });
                  } catch {
                    setState({ phase: "error", message: "Re-analysis failed" });
                  }
                }}
                style={{ fontSize: 12, padding: "3px 3px", cursor: "pointer" }}
              >
                Re-analyze
              </button>
            </>
          )}
        </div>
        <Board
          position={position}
          players={matchData ? { player1: matchData.Player1, player2: matchData.Player2 } : undefined}
          pipCounts={pipCounts}
          cubeValue={cubeValue}
          cubeOwner={cubeOwner}
          score={isSummary ? undefined : game?.ScoreBefore}
          matchLength={matchData?.MatchLength}
          crawfordLabel={isSummary ? undefined : crawfordLabel}
          arrows={isSummary ? undefined : arrows}
          arrowPlayerOnRoll={playerOnRoll}
          arrowColor={arrowColor}
          dice={isSummary ? undefined : currentMove?.Dice}
          dicePlayer={playerOnRoll}
          flipped={flipped}
          matchInfo={matchData ? (() => {
            const fs = computeFinalScore(matchData);
            const stats = matchData.MatchStats?.Overall;
            const [i, j] = flipped ? [1, 0] as const : [0, 1] as const;
            return {
              player1: flipped ? matchData.Player2 : matchData.Player1,
              player2: flipped ? matchData.Player1 : matchData.Player2,
              score: [fs[i], fs[j]] as [number, number],
              player1PR: stats ? Math.abs(stats[i].SnowieErrorRate) : undefined,
              player2PR: stats ? Math.abs(stats[j].SnowieErrorRate) : undefined,
            };
          })() : undefined}
        />
      </div>

      {showHelp && (
        <div
          onClick={() => setShowHelp(false)}
          style={{
            position: "fixed", inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex", alignItems: "center", justifyContent: "center",
            zIndex: 100,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "#fff", borderRadius: 8, padding: "24px 32px",
              minWidth: 280, boxShadow: "0 4px 24px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ margin: "0 0 16px" }}>Keyboard Shortcuts</h3>
            <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                {[
                  ["→", "Next move"],
                  ["←", "Previous move"],
                  ["↓", "Next alternative"],
                  ["↑", "Previous alternative"],
                  ["?", "Toggle this help"],
                  ["Esc", "Close"],
                ].map(([key, desc]) => (
                  <tr key={key}>
                    <td style={{ padding: "4px 16px 4px 0", fontWeight: "bold", fontFamily: "monospace" }}>{key}</td>
                    <td style={{ padding: "4px 0" }}>{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <h3 style={{ margin: "20px 0 12px" }}>Move List Icons</h3>
            <table style={{ fontSize: 13, borderCollapse: "collapse" }}>
              <tbody>
                <tr>
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    <svg width="10" height="10" viewBox="0 0 8 8"><circle cx="4" cy="4" r="3.5" fill="none" stroke="#888" strokeWidth="1" /></svg>
                  </td>
                  <td style={{ padding: "4px 0" }}>Move error</td>
                </tr>
                <tr>
                  <td style={{ padding: "4px 16px 4px 0" }}>
                    <svg width="10" height="10" viewBox="0 0 8 8"><rect x="0.5" y="0.5" width="7" height="7" fill="none" stroke="#888" strokeWidth="1" /></svg>
                  </td>
                  <td style={{ padding: "4px 0" }}>Cube error</td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: 16, textAlign: "right" }}>
              <button onClick={() => setShowHelp(false)} style={{ fontSize: 12, padding: "4px 12px", cursor: "pointer" }}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
