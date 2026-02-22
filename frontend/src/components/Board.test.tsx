import { render } from "@testing-library/react";
import { expect, test } from "vitest";
import Board from "./Board";
import { STARTING_POSITION, STARTING_PIP_COUNTS } from "../types/match";

test("renders board SVG with 24 point labels", () => {
  const { container } = render(
    <Board
      position={STARTING_POSITION}
      players={{ player1: "Alice", player2: "Bob" }}
      pipCounts={STARTING_PIP_COUNTS}
      cubeValue={1}
      cubeOwner={0}
    />
  );

  const svg = container.querySelector('[data-testid="board"]');
  expect(svg).not.toBeNull();

  // Should have point labels 1-24
  const texts = svg!.querySelectorAll("text");
  // 24 point labels + 2 player names + 2 pip counts + 1 cube = 29
  expect(texts.length).toBeGreaterThanOrEqual(24);
});

test("renders correct number of checkers for starting position", () => {
  const { container } = render(
    <Board position={STARTING_POSITION} cubeValue={1} cubeOwner={0} />
  );

  // Starting position has 30 total checkers (15 per side)
  const circles = container.querySelectorAll("circle");
  expect(circles.length).toBe(30);
});

test("renders player names", () => {
  const { container } = render(
    <Board
      position={STARTING_POSITION}
      players={{ player1: "Alice", player2: "Bob" }}
      cubeValue={1}
      cubeOwner={0}
    />
  );

  expect(container.textContent).toContain("Alice");
  expect(container.textContent).toContain("Bob");
});

test("renders pip counts", () => {
  const { container } = render(
    <Board
      position={STARTING_POSITION}
      pipCounts={[167, 167]}
      cubeValue={1}
      cubeOwner={0}
    />
  );

  const text = container.textContent || "";
  const matches = text.match(/167/g);
  expect(matches).not.toBeNull();
  expect(matches!.length).toBeGreaterThanOrEqual(2);
});
