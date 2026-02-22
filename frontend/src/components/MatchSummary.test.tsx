import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import MatchSummary from "./MatchSummary";
import type { MatchData } from "../types/match";

const mockMatch: MatchData = {
  Player1: "Alice",
  Player2: "Bob",
  MatchLength: 5,
  Games: [
    {
      GameNumber: 1,
      ScoreBefore: [0, 0],
      Moves: [],
      Winner: "Alice",
      PointsWon: 2,
      Stats: null,
    },
    {
      GameNumber: 2,
      ScoreBefore: [2, 0],
      Moves: [],
      Winner: "Bob",
      PointsWon: 1,
      Stats: null,
    },
  ],
  MatchStats: {
    Checkerplay: [
      { TotalMoves: 10, UnforcedMoves: 8, MovesDoubtful: 1, MovesBad: 0, MovesVeryBad: 0, ErrorRateMWC: -0.2, Rating: "Intermediate" },
      { TotalMoves: 10, UnforcedMoves: 9, MovesDoubtful: 0, MovesBad: 1, MovesVeryBad: 0, ErrorRateMWC: -0.5, Rating: "Beginner" },
    ],
    Luck: [
      { VeryLucky: 0, Lucky: 1, Unlucky: 0, VeryUnlucky: 0, TotalMWC: 1.5, Rating: "None" },
      { VeryLucky: 0, Lucky: 0, Unlucky: 1, VeryUnlucky: 0, TotalMWC: -1.5, Rating: "None" },
    ],
    Cube: [
      { TotalDecisions: 3, CloseOrActual: 2, Doubles: 1, Takes: 0, Passes: 0, ErrorRateMWC: -0.1, Rating: "Good" },
      { TotalDecisions: 3, CloseOrActual: 1, Doubles: 0, Takes: 1, Passes: 0, ErrorRateMWC: -0.3, Rating: "Bad" },
    ],
    Overall: [
      { ErrorRateMWC: -0.25, SnowieErrorRate: -5.0, Rating: "Advanced", ActualResult: "+10%", LuckAdjustedResult: "+5%", FIBSRating: 1800.5 },
      { ErrorRateMWC: -0.60, SnowieErrorRate: -12.0, Rating: "Casual player", ActualResult: "-10%", LuckAdjustedResult: "-5%", FIBSRating: 1500.3 },
    ],
  },
};

test("renders player names", () => {
  render(<MatchSummary match={mockMatch} />);
  expect(screen.getAllByText("Alice").length).toBeGreaterThanOrEqual(1);
  expect(screen.getAllByText("Bob").length).toBeGreaterThanOrEqual(1);
});

test("renders PR for each player", () => {
  const { container } = render(<MatchSummary match={mockMatch} />);
  expect(container.textContent).toContain("5.000");
  expect(container.textContent).toContain("12.000");
});

test("renders final score", () => {
  const { container } = render(<MatchSummary match={mockMatch} />);
  expect(container.textContent).toContain("2 - 1");
});

test("caps score at match length", () => {
  const matchWithOverflow: MatchData = {
    ...mockMatch,
    Games: [
      { GameNumber: 1, ScoreBefore: [0, 0], Moves: [], Winner: "Alice", PointsWon: 4, Stats: null },
      { GameNumber: 2, ScoreBefore: [4, 0], Moves: [], Winner: "Alice", PointsWon: 4, Stats: null },
    ],
  };
  const { container } = render(<MatchSummary match={matchWithOverflow} />);
  // Total raw score would be 8, but capped at 5
  expect(container.textContent).toContain("5 - 0");
});
