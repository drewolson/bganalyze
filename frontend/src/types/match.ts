// Positive values = player 1 checkers (bottom, moves 24→1).
// Negative values = player 2 checkers (top, moves 1→24).
// Index 0 = point 1, index 23 = point 24.
export interface BoardPosition {
  points: number[]; // 24 entries
  bar: [number, number]; // [player1 on bar, player2 on bar]
  off: [number, number]; // [player1 borne off, player2 borne off]
}

export interface Players {
  player1: string;
  player2: string;
}

export interface BoardProps {
  position: BoardPosition;
  players?: Players;
  pipCounts?: [number, number];
  cubeValue?: number;
  cubeOwner?: 0 | 1 | 2; // 0 = centered, 1 = player1, 2 = player2
  score?: [number, number]; // [player1 score, player2 score]
  matchLength?: number; // 0 = unlimited
}

// Standard backgammon starting position
export const STARTING_POSITION: BoardPosition = {
  points: [
    -2, 0, 0, 0, 0, 5,  // points 1-6
    0, 3, 0, 0, 0, -5,  // points 7-12
    5, 0, 0, 0, -3, 0,  // points 13-18
    -5, 0, 0, 0, 0, 2,  // points 19-24
  ],
  bar: [0, 0],
  off: [0, 0],
};

export const STARTING_PIP_COUNTS: [number, number] = [167, 167];

// Analysis types mirroring Go structs

export interface MatchData {
  Player1: string;
  Player2: string;
  MatchLength: number;
  Games: Game[];
  MatchStats: StatBlock | null;
}

export interface Game {
  GameNumber: number;
  ScoreBefore: [number, number];
  Moves: Move[];
  Winner: string;
  PointsWon: number;
  Stats: StatBlock | null;
}

export interface Move {
  Number: number;
  Player: string;
  Type: string; // "checker", "cube_decision", "double", "take", "reject", "cannot_move"
  Dice: [number, number];
  PositionID: string;
  MatchID: string;
  Action: string;
  PipCounts: [number, number];
  Alerts: string[] | null;
  CubeAnalysis: CubeAnalysis | null;
  MoveAnalysis: MoveAnalysis | null;
}

export interface CubeAnalysis {
  CubelessEquity: number;
  NoDouble: number;
  DoublePass: number;
  DoubleTake: number;
  ProperAction: string;
}

export interface MoveAnalysis {
  Dice: [number, number];
  EquityChange: number;
  Alternatives: Alternative[];
  ChosenRank: number;
}

export interface Alternative {
  Rank: number;
  Ply: string;
  Move: string;
  Equity: number;
  Diff: number;
  IsChosen: boolean;
  Win: number;
  WinG: number;
  WinBG: number;
  Lose: number;
  LoseG: number;
  LoseBG: number;
}

export interface StatBlock {
  Checkerplay: [CheckerplayStats, CheckerplayStats];
  Luck: [LuckStats, LuckStats];
  Cube: [CubeStats, CubeStats];
  Overall: [OverallStats, OverallStats];
}

export interface CheckerplayStats {
  TotalMoves: number;
  UnforcedMoves: number;
  MovesDoubtful: number;
  MovesBad: number;
  MovesVeryBad: number;
  ErrorRateMWC: number;
  Rating: string;
}

export interface LuckStats {
  VeryLucky: number;
  Lucky: number;
  Unlucky: number;
  VeryUnlucky: number;
  TotalMWC: number;
  Rating: string;
}

export interface CubeStats {
  TotalDecisions: number;
  CloseOrActual: number;
  Doubles: number;
  Takes: number;
  Passes: number;
  ErrorRateMWC: number;
  Rating: string;
}

export interface OverallStats {
  ErrorRateMWC: number;
  SnowieErrorRate: number;
  Rating: string;
  ActualResult: string;
  LuckAdjustedResult: string;
  FIBSRating: number;
}
