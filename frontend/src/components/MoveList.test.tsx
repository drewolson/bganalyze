import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";
import MoveList from "./MoveList";
import type { Game } from "../types/match";

const mockGame: Game = {
  GameNumber: 1,
  ScoreBefore: [0, 0],
  Winner: "Alice",
  PointsWon: 1,
  Stats: null,
  Moves: [
    {
      Number: 1,
      Player: "Alice",
      Type: "checker",
      Dice: [4, 2],
      PositionID: "abc123",
      MatchID: "def456",
      Action: "8/4 6/4",
      PipCounts: [167, 167],
      Alerts: null,
      CubeAnalysis: null,
      MoveAnalysis: {
        Dice: [4, 2],
        EquityChange: 0.161,
        ChosenRank: 1,
        Alternatives: [
          { Rank: 1, Ply: "2-ply", Move: "8/4 6/4", Equity: 0.160, Diff: 0, IsChosen: true, Win: 0.536, WinG: 0.165, WinBG: 0.007, Lose: 0.464, LoseG: 0.122, LoseBG: 0.005 },
          { Rank: 2, Ply: "2-ply", Move: "24/20 13/11", Equity: 0.016, Diff: -0.145, IsChosen: false, Win: 0.504, WinG: 0.138, WinBG: 0.007, Lose: 0.496, LoseG: 0.132, LoseBG: 0.006 },
        ],
      },
    },
    {
      Number: 2,
      Player: "Bob",
      Type: "checker",
      Dice: [6, 1],
      PositionID: "xyz789",
      MatchID: "uvw012",
      Action: "13/7 8/7",
      PipCounts: [161, 167],
      Alerts: ["very bad move ( -0.125)"],
      CubeAnalysis: null,
      MoveAnalysis: {
        Dice: [6, 1],
        EquityChange: 0.021,
        ChosenRank: 5,
        Alternatives: [
          { Rank: 1, Ply: "2-ply", Move: "bar/23 7/5(2)", Equity: -0.311, Diff: 0, IsChosen: false, Win: 0.41, WinG: 0.118, WinBG: 0.004, Lose: 0.59, LoseG: 0.149, LoseBG: 0.008 },
          { Rank: 5, Ply: "2-ply", Move: "13/7 8/7", Equity: -0.437, Diff: -0.125, IsChosen: true, Win: 0.403, WinG: 0.11, WinBG: 0.004, Lose: 0.597, LoseG: 0.204, LoseBG: 0.019 },
        ],
      },
    },
  ],
};

const noop = () => {};

test("renders move rows", () => {
  render(
    <MoveList
      game={mockGame}
      selectedMoveIndex={0}
      selectedAltIndex={0}
      onSelectMove={noop}
      onSelectAlt={noop}
    />,
  );
  expect(screen.getByTestId("move-row-0")).not.toBeNull();
  expect(screen.getByTestId("move-row-1")).not.toBeNull();
});

test("renders move actions", () => {
  const { container } = render(
    <MoveList
      game={mockGame}
      selectedMoveIndex={-1}
      selectedAltIndex={0}
      onSelectMove={noop}
      onSelectAlt={noop}
    />,
  );
  expect(container.textContent).toContain("8/4 6/4");
  expect(container.textContent).toContain("13/7 8/7");
});

test("does not show rank indicator on move rows", () => {
  const { container } = render(
    <MoveList
      game={mockGame}
      selectedMoveIndex={-1}
      selectedAltIndex={0}
      onSelectMove={noop}
      onSelectAlt={noop}
    />,
  );
  const rankEl = container.querySelector('[data-testid="chosen-rank-1"]');
  expect(rankEl).toBeNull();
});

test("highlights bad moves with background color", () => {
  const { container } = render(
    <MoveList
      game={mockGame}
      selectedMoveIndex={-1}
      selectedAltIndex={0}
      onSelectMove={noop}
      onSelectAlt={noop}
    />,
  );
  const badRow = container.querySelector('[data-testid="move-row-1"]') as HTMLElement;
  expect(badRow).not.toBeNull();
  // very_bad (diff -0.125) = red background (#fee2e2)
  expect(badRow.style.background).toBe("rgb(254, 226, 226)");
});
