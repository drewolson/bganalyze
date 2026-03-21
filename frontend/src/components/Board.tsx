import type { BoardProps } from "../types/match";
import type { MoveStep } from "../lib/moveNotation";

const BOARD_WIDTH = 600;
const BORDER = 2;
const BAR_WIDTH = 52;
const BAR_GAP = 2;
const HALF_POINTS = 6;
const POINT_WIDTH = (BOARD_WIDTH - BAR_WIDTH - BORDER * 2 - BAR_GAP * 2) / 12;
const MAX_VISIBLE = 6;
const CHECKER_RADIUS = POINT_WIDTH / 2 - 1;
const CHECKER_DIAMETER = CHECKER_RADIUS * 2;
const POINT_HEIGHT = MAX_VISIBLE * (CHECKER_DIAMETER + 1);
const BOARD_HEIGHT = 2 * POINT_HEIGHT + 40;
const CUBE_SIZE = 36;

// Left tray holds the cube, right tray holds score info
const LEFT_TRAY = CUBE_SIZE + 10;
const RIGHT_TRAY = 140;


// Vertical layout: labels | board | labels
const LABEL_HEIGHT = 16;
const BOARD_Y = LABEL_HEIGHT;
const TOTAL_HEIGHT = LABEL_HEIGHT + BOARD_HEIGHT + LABEL_HEIGHT;

// X origins for left and right halves of the playing area
const LEFT_X = LEFT_TRAY + BORDER;
const BAR_X = LEFT_X + HALF_POINTS * POINT_WIDTH + BAR_GAP;
const RIGHT_X = BAR_X + BAR_WIDTH + BAR_GAP;

// Colors — flat 2D black and white
const SURFACE = "#DEDEDE";
const POINT_LIGHT = "#FAFAFA";
const POINT_DARK = "#A8A8A8";
const BORDER_COLOR = "#000";
const BAR_COLOR = "#C0C0C0";
const CHECKER_BLACK = "#555";
const CHECKER_WHITE = "#fff";

// Layout: top row L-R: 13..18 | bar | 19..24
//         bot row L-R: 12..7  | bar | 6..1
function pointLayout(pointIndex: number, flipped = false): { x: number; top: boolean } {
  const p = pointIndex + 1;
  let top: boolean;
  let x: number;
  if (p >= 13 && p <= 18) { x = LEFT_X + (p - 13) * POINT_WIDTH; top = true; }
  else if (p >= 19 && p <= 24) { x = RIGHT_X + (p - 19) * POINT_WIDTH; top = true; }
  else if (p >= 7 && p <= 12) { x = LEFT_X + (12 - p) * POINT_WIDTH; top = false; }
  else { x = RIGHT_X + (6 - p) * POINT_WIDTH; top = false; }
  return { x, top: flipped ? !top : top };
}

function PointTriangle({ x, top, dark, label }: { x: number; top: boolean; dark: boolean; label: number }) {
  const baseY = top ? BOARD_Y : BOARD_Y + BOARD_HEIGHT;
  const tipY = top ? BOARD_Y + POINT_HEIGHT : BOARD_Y + BOARD_HEIGHT - POINT_HEIGHT;
  const labelY = top ? BOARD_Y - 4 : BOARD_Y + BOARD_HEIGHT + LABEL_HEIGHT - 2;

  return (
    <g>
      <polygon
        points={`${x},${baseY} ${x + POINT_WIDTH},${baseY} ${x + POINT_WIDTH / 2},${tipY}`}
        fill={dark ? POINT_DARK : POINT_LIGHT}
      />
      <text x={x + POINT_WIDTH / 2} y={labelY} textAnchor="middle" fontSize={10} fill="#666">
        {label}
      </text>
    </g>
  );
}

function Checker({ cx, cy, isBlack }: { cx: number; cy: number; isBlack: boolean }) {
  return (
    <circle
      cx={cx}
      cy={cy}
      r={CHECKER_RADIUS}
      fill={isBlack ? CHECKER_BLACK : CHECKER_WHITE}
      stroke={BORDER_COLOR}
      strokeWidth={1.5}
    />
  );
}

function CheckerStack({ count, cx, top, customStartY }: { count: number; cx: number; top: boolean; customStartY?: number }) {
  if (count === 0) return null;
  const isBlack = count > 0;
  const abs = Math.abs(count);
  const dir = top ? 1 : -1;
  const startY = customStartY ?? (top
    ? BOARD_Y + CHECKER_RADIUS + 2
    : BOARD_Y + BOARD_HEIGHT - CHECKER_RADIUS - 2);
  const numToDraw = Math.min(abs, MAX_VISIBLE);
  const spacing = CHECKER_DIAMETER + 1;

  return (
    <g>
      {Array.from({ length: numToDraw }, (_, i) => (
        <Checker key={i} cx={cx} cy={startY + i * spacing * dir} isBlack={isBlack} />
      ))}
      {abs > MAX_VISIBLE && (
        <text
          x={cx}
          y={startY + (numToDraw - 1) * spacing * dir}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={12}
          fontWeight="bold"
          fill={isBlack ? "#fff" : "#000"}
        >
          {abs}
        </text>
      )}
    </g>
  );
}

const OFF_BAR_W = 8;
const OFF_BAR_H = 20;
const OFF_BAR_GAP = 2;
const OFF_PER_ROW = 5;

function BorneOffStack({ count, cx, top, isBlack }: { count: number; cx: number; top: boolean; isBlack: boolean }) {
  const rowWidth = OFF_PER_ROW * OFF_BAR_W + (OFF_PER_ROW - 1) * OFF_BAR_GAP;
  const startX = cx - rowWidth / 2;
  // Position between player info and center
  const baseY = top
    ? BOARD_Y + 100  // below player 2's score info
    : BOARD_Y + BOARD_HEIGHT - 100; // above player 1's score info
  const bars = [];
  for (let i = 0; i < count; i++) {
    const col = i % OFF_PER_ROW;
    const row = Math.floor(i / OFF_PER_ROW);
    const bx = startX + col * (OFF_BAR_W + OFF_BAR_GAP);
    const by = top
      ? baseY + row * (OFF_BAR_H + OFF_BAR_GAP)
      : baseY - (row + 1) * (OFF_BAR_H + OFF_BAR_GAP);
    bars.push(
      <rect key={i} x={bx} y={by} width={OFF_BAR_W} height={OFF_BAR_H} rx={1}
        fill={isBlack ? CHECKER_BLACK : CHECKER_WHITE} stroke={BORDER_COLOR} strokeWidth={0.5} />
    );
  }
  return <g>{bars}</g>;
}

const DIE_SIZE = 38;
const DIE_GAP = 8;
const DOT_R = 3;

// Standard dice pip positions (normalized 0-1 within the die face)
const PIP_POSITIONS: Record<number, [number, number][]> = {
  1: [[0.5, 0.5]],
  2: [[0.25, 0.25], [0.75, 0.75]],
  3: [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  4: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]],
  5: [[0.25, 0.25], [0.75, 0.25], [0.5, 0.5], [0.25, 0.75], [0.75, 0.75]],
  6: [[0.25, 0.25], [0.75, 0.25], [0.25, 0.5], [0.75, 0.5], [0.25, 0.75], [0.75, 0.75]],
};

function DiceFace({ x, y, value, isBlack }: { x: number; y: number; value: number; isBlack: boolean }) {
  if (value < 1 || value > 6) return null;
  const pips = PIP_POSITIONS[value];
  const fill = isBlack ? CHECKER_BLACK : CHECKER_WHITE;
  const dotFill = isBlack ? "#fff" : "#000";
  const pad = 4; // padding inside die face
  const inner = DIE_SIZE - pad * 2;

  return (
    <g>
      <rect x={x} y={y} width={DIE_SIZE} height={DIE_SIZE} rx={4}
        fill={fill} stroke={BORDER_COLOR} strokeWidth={1} />
      {pips.map(([px, py], i) => (
        <circle key={i}
          cx={x + pad + px * inner}
          cy={y + pad + py * inner}
          r={DOT_R} fill={dotFill} />
      ))}
    </g>
  );
}

function PlayerName({ name, x, y }: { name: string; x: number; y: number }) {
  const parts = name.split(" ");
  if (parts.length <= 1) {
    return <text x={x} y={y} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#333">{name}</text>;
  }
  return (
    <text x={x} y={y} textAnchor="middle" fontSize={11} fontWeight="bold" fill="#333">
      {parts.map((part, i) => (
        <tspan key={i} x={x} dy={i === 0 ? 0 : 13}>{part}</tspan>
      ))}
    </text>
  );
}

interface MatchInfo {
  player1: string;
  player2: string;
  score: [number, number];
  player1PR?: number;
  player2PR?: number;
}

interface ExtendedBoardProps extends BoardProps {
  arrows?: MoveStep[];
  arrowPlayerOnRoll?: 1 | 2;
  crawfordLabel?: string;
  dice?: [number, number];
  dicePlayer?: 1 | 2;
  flipped?: boolean;
  arrowColor?: string;
  matchInfo?: MatchInfo;
  hidePlayerInfo?: boolean;
}

function checkerTopY(count: number, top: boolean): number {
  if (count === 0) return top ? BOARD_Y + CHECKER_RADIUS + 2 : BOARD_Y + BOARD_HEIGHT - CHECKER_RADIUS - 2;
  const abs = Math.min(Math.abs(count), MAX_VISIBLE);
  const dir = top ? 1 : -1;
  const startY = top
    ? BOARD_Y + CHECKER_RADIUS + 2
    : BOARD_Y + BOARD_HEIGHT - CHECKER_RADIUS - 2;
  const spacing = CHECKER_DIAMETER + 1;
  return startY + (abs - 1) * spacing * dir;
}

function arrowEndpoint(
  point: number,
  playerOnRoll: 1 | 2,
  barCx: number,
  isFrom: boolean,
  position: { points: number[]; bar: [number, number] },
  flipped = false,
): { x: number; y: number } {
  const midY = BOARD_Y + BOARD_HEIGHT / 2;
  const p1Top = flipped;

  if (point === 25) {
    const barCount = playerOnRoll === 1 ? position.bar[0] : position.bar[1];
    const barTop = playerOnRoll === 1 ? p1Top : !p1Top;
    const barStartY = barTop
      ? midY - CHECKER_RADIUS - 4
      : midY + CHECKER_RADIUS + 4;
    if (barCount > 0 && isFrom) {
      const dir = barTop ? 1 : -1;
      const spacing = CHECKER_DIAMETER + 1;
      const abs = Math.min(barCount, MAX_VISIBLE);
      const topY = barStartY + (abs - 1) * spacing * dir;
      return { x: barCx, y: topY };
    }
    return { x: barCx, y: barStartY };
  }
  if (point === 0) {
    const rightTrayCx = LEFT_TRAY + BOARD_WIDTH + RIGHT_TRAY / 2;
    const playerTop = playerOnRoll === 1 ? p1Top : !p1Top;
    return { x: rightTrayCx, y: playerTop ? BOARD_Y + 30 : BOARD_Y + BOARD_HEIGHT - 30 };
  }

  const layout = pointLayout(point - 1, flipped);
  const cx = layout.x + POINT_WIDTH / 2;
  const count = position.points[point - 1];

  if (isFrom) {
    return { x: cx, y: checkerTopY(count, layout.top) };
  }
  const nextCount = Math.abs(count) + 1;
  return { x: cx, y: checkerTopY(nextCount, layout.top) };
}

export default function Board({
  position,
  players,
  pipCounts,
  cubeValue = 1,
  cubeOwner = 0,
  score = [0, 0],
  matchLength = 0,
  arrows,
  arrowPlayerOnRoll = 1,
  crawfordLabel,
  dice,
  dicePlayer = 1,
  flipped = false,
  arrowColor = "rgba(59,130,246,0.6)",
  matchInfo,
  hidePlayerInfo = false,
}: ExtendedBoardProps) {
  const barCx = BAR_X + BAR_WIDTH / 2;
  const compactRight = hidePlayerInfo ? 60 : RIGHT_TRAY;
  const rightTrayCx = LEFT_TRAY + BOARD_WIDTH + compactRight / 2;
  const totalWidth = LEFT_TRAY + BOARD_WIDTH + compactRight;
  const matchLabel = matchLength === 0 ? "Unlimited" : `to ${matchLength}`;
  const infoHeight = !hidePlayerInfo && matchInfo ? 40 : 0;

  // When flipped, player 1 is top and player 2 is bottom
  const p1Top = flipped;
  const p2Top = !flipped;

  // Cube position
  const cubeCx = LEFT_TRAY / 2;
  let cubeY: number;
  if (cubeOwner === 1) cubeY = p1Top ? BOARD_Y + 10 : BOARD_Y + BOARD_HEIGHT - CUBE_SIZE - 10;
  else if (cubeOwner === 2) cubeY = p2Top ? BOARD_Y + 10 : BOARD_Y + BOARD_HEIGHT - CUBE_SIZE - 10;
  else cubeY = BOARD_Y + BOARD_HEIGHT / 2 - CUBE_SIZE / 2;

  const layouts = position.points.map((_, i) => pointLayout(i, flipped));

  return (
    <svg
      viewBox={`0 ${-infoHeight} ${totalWidth} ${TOTAL_HEIGHT + infoHeight}`}
      width="100%"
      height="100%"
      style={{ display: "block" }}
      preserveAspectRatio="xMidYMid meet"
      data-testid="board"
    >
      {/* Match info above board (desktop only) */}
      {!hidePlayerInfo && matchInfo && (
        <g>
          {/* Player 1: name + PR right-aligned to left of center */}
          <text x={barCx - 40} y={-infoHeight + 14} textAnchor="end" fontSize={12} fontWeight="bold" fill="#333">
            {matchInfo.player1}
          </text>
          {matchInfo.player1PR != null && (
            <text x={barCx - 40} y={-infoHeight + 28} textAnchor="end" fontSize={11} fill="#888">
              PR: {Math.abs(matchInfo.player1PR).toFixed(3)}
            </text>
          )}
          {/* Score centered */}
          <text x={barCx} y={-infoHeight + 22} textAnchor="middle" fontSize={14} fontWeight="bold" fill="#333">
            {matchInfo.score[0]} – {matchInfo.score[1]}
          </text>
          {/* Player 2: name + PR left-aligned to right of center */}
          <text x={barCx + 40} y={-infoHeight + 14} textAnchor="start" fontSize={12} fontWeight="bold" fill="#333">
            {matchInfo.player2}
          </text>
          {matchInfo.player2PR != null && (
            <text x={barCx + 40} y={-infoHeight + 28} textAnchor="start" fontSize={11} fill="#888">
              PR: {Math.abs(matchInfo.player2PR).toFixed(3)}
            </text>
          )}
        </g>
      )}

      {/* Board background */}
      <rect
        x={LEFT_TRAY} y={BOARD_Y}
        width={BOARD_WIDTH} height={BOARD_HEIGHT}
        fill={SURFACE}
      />

      {/* Bar */}
      <rect
        x={BAR_X}
        y={BOARD_Y} width={BAR_WIDTH} height={BOARD_HEIGHT}
        fill={BAR_COLOR}
      />

      {/* All point triangles first (so checkers render on top) */}
      {position.points.map((_, i) => {
        const { x, top } = layouts[i];
        return <PointTriangle key={i} x={x} top={top} dark={(i + 1) % 2 === 0} label={flipped ? 25 - (i + 1) : i + 1} />;
      })}

      {/* Board outline drawn on top of triangles so it doesn't peek through at bases */}
      <rect
        x={LEFT_TRAY} y={BOARD_Y}
        width={BOARD_WIDTH} height={BOARD_HEIGHT}
        fill="none" stroke={BORDER_COLOR} strokeWidth={BORDER}
      />

      {/* All checker stacks on top of triangles */}
      {position.points.map((count, i) => {
        const { x, top } = layouts[i];
        return <CheckerStack key={i} count={count} cx={x + POINT_WIDTH / 2} top={top} />;
      })}

      {/* Bar checkers — near center, offset toward their player's side */}
      {position.bar[0] > 0 && (
        <CheckerStack count={position.bar[0]} cx={barCx} top={p1Top}
          customStartY={p1Top
            ? BOARD_Y + BOARD_HEIGHT / 2 - CHECKER_RADIUS - 4
            : BOARD_Y + BOARD_HEIGHT / 2 + CHECKER_RADIUS + 4} />
      )}
      {position.bar[1] > 0 && (
        <CheckerStack count={-position.bar[1]} cx={barCx} top={p2Top}
          customStartY={p2Top
            ? BOARD_Y + BOARD_HEIGHT / 2 - CHECKER_RADIUS - 4
            : BOARD_Y + BOARD_HEIGHT / 2 + CHECKER_RADIUS + 4} />
      )}

      {/* Pip counts on the bar */}
      {pipCounts && (
        <>
          <text x={barCx} y={p1Top ? BOARD_Y + 16 : BOARD_Y + BOARD_HEIGHT - 8}
            textAnchor="middle" fontSize={11} fill="#333">{pipCounts[0]}</text>
          <text x={barCx} y={p2Top ? BOARD_Y + 16 : BOARD_Y + BOARD_HEIGHT - 8}
            textAnchor="middle" fontSize={11} fill="#333">{pipCounts[1]}</text>
        </>
      )}

      {/* Borne off in right tray — vertical stacked bars */}
      {position.off[0] > 0 && (
        <BorneOffStack count={position.off[0]} cx={rightTrayCx} top={p1Top} isBlack={true} />
      )}
      {position.off[1] > 0 && (
        <BorneOffStack count={position.off[1]} cx={rightTrayCx} top={p2Top} isBlack={false} />
      )}

      {/* Doubling cube */}
      <g>
        <rect x={cubeCx - CUBE_SIZE / 2} y={cubeY} width={CUBE_SIZE} height={CUBE_SIZE} rx={4}
          fill="#fff" stroke={BORDER_COLOR} strokeWidth={1.5} />
        <text x={cubeCx} y={cubeY + CUBE_SIZE * 0.7} textAnchor="middle" fontSize={20} fontWeight="bold">
          {cubeOwner === 0 ? 64 : cubeValue}
        </text>
      </g>

      {/* Right tray — player info (hidden on mobile) */}
      {!hidePlayerInfo && (
        <>
          <g textAnchor="middle" fontSize={10} fill="#333">
            {players && <PlayerName name={p2Top ? players.player2 : players.player1} x={rightTrayCx} y={BOARD_Y + 20} />}
            <text x={rightTrayCx} y={BOARD_Y + 50}>Score</text>
            <text x={rightTrayCx} y={BOARD_Y + 72} fontSize={18} fontWeight="bold">{p2Top ? score[1] : score[0]}</text>
            <text x={rightTrayCx} y={BOARD_Y + 88}>{matchLabel}</text>
          </g>
          {crawfordLabel && (
            <text x={rightTrayCx} y={BOARD_Y + BOARD_HEIGHT / 2 + 4}
              textAnchor="middle" fontSize={10} fontWeight="bold" fill="#c00">{crawfordLabel}</text>
          )}
          <g textAnchor="middle" fontSize={10} fill="#333">
            <text x={rightTrayCx} y={BOARD_Y + BOARD_HEIGHT - 78}>Score</text>
            <text x={rightTrayCx} y={BOARD_Y + BOARD_HEIGHT - 56} fontSize={18} fontWeight="bold">{p2Top ? score[0] : score[1]}</text>
            <text x={rightTrayCx} y={BOARD_Y + BOARD_HEIGHT - 40}>{matchLabel}</text>
            {players && <PlayerName name={p2Top ? players.player1 : players.player2} x={rightTrayCx} y={BOARD_Y + BOARD_HEIGHT - 10} />}
          </g>
        </>
      )}

      {/* Dice */}
      {dice && dice[0] > 0 && dice[1] > 0 && (() => {
        const midY = BOARD_Y + BOARD_HEIGHT / 2;
        const isBlack = dicePlayer === 1;
        // Dice on the rolling player's side of the board
        const isPlayerTop = dicePlayer === 1 ? p1Top : p2Top;
        const diceAreaCx = isPlayerTop
          ? LEFT_X + (HALF_POINTS * POINT_WIDTH) / 2
          : RIGHT_X + (HALF_POINTS * POINT_WIDTH) / 2;
        const totalW = DIE_SIZE * 2 + DIE_GAP;
        const dx = diceAreaCx - totalW / 2;
        const dy = midY - DIE_SIZE / 2;
        return (
          <g>
            <DiceFace x={dx} y={dy} value={dice[0]} isBlack={isBlack} />
            <DiceFace x={dx + DIE_SIZE + DIE_GAP} y={dy} value={dice[1]} isBlack={isBlack} />
          </g>
        );
      })()}

      {/* Move arrows */}
      {arrows && arrows.length > 0 && (
        <g>
          <defs>
            <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
              <polygon points="0 0, 8 3, 0 6" fill={arrowColor} />
            </marker>
          </defs>
          {(() => {
            // Virtual position tracks checker counts as arrows are drawn,
            // so repeated moves (e.g. 21/11(2)) offset correctly.
            const vPos = {
              points: [...position.points],
              bar: [position.bar[0], position.bar[1]] as [number, number],
              off: [position.off[0], position.off[1]] as [number, number],
            };
            let prevTo: { x: number; y: number } | null = null;
            let prevStep: typeof arrows[0] | null = null;
            return arrows.map((step, i) => {
              // Chain: if this arrow's source matches the previous arrow's destination, start from its tip
              const from = (prevStep && prevTo && step.from === prevStep.to)
                ? prevTo
                : arrowEndpoint(step.from, arrowPlayerOnRoll, barCx, true, vPos, flipped);
              const to = arrowEndpoint(step.to, arrowPlayerOnRoll, barCx, false, vPos, flipped);
              prevTo = to;
              prevStep = step;

              // Update virtual position: remove checker from source, add to destination
              if (step.from >= 1 && step.from <= 24) {
                const idx = step.from - 1;
                if (vPos.points[idx] > 0) vPos.points[idx]--;
                else if (vPos.points[idx] < 0) vPos.points[idx]++;
              } else if (step.from === 25) {
                if (arrowPlayerOnRoll === 1) vPos.bar[0]--;
                else vPos.bar[1]--;
              }
              if (step.to >= 1 && step.to <= 24) {
                const idx = step.to - 1;
                if (arrowPlayerOnRoll === 1) vPos.points[idx]++;
                else vPos.points[idx]--;
              } else if (step.to === 0) {
                if (arrowPlayerOnRoll === 1) vPos.off[0]++;
                else vPos.off[1]++;
              }

              const dx = to.x - from.x;
              const dy = to.y - from.y;
              const cx1 = from.x + dx * 0.5 - dy * 0.15;
              const cy1 = from.y + dy * 0.5 + dx * 0.15;
              return (
                <path
                  key={i}
                  d={`M ${from.x} ${from.y} Q ${cx1} ${cy1} ${to.x} ${to.y}`}
                  fill="none"
                  stroke={arrowColor}
                  strokeWidth={2.5}
                  markerEnd="url(#arrowhead)"
                />
              );
            });
          })()}
        </g>
      )}
    </svg>
  );
}
