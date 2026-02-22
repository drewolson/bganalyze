import { expect, test } from "vitest";
import { decodePositionId } from "./positionId";
import { STARTING_POSITION } from "../types/match";

test("decodes starting position ID", () => {
  // 4HPwATDgc/ABMA is the starting position with player1 on roll
  const pos = decodePositionId("4HPwATDgc/ABMA", 1);

  expect(pos.points).toEqual(STARTING_POSITION.points);
  expect(pos.bar).toEqual([0, 0]);
  expect(pos.off).toEqual([0, 0]);
});

test("decodes starting position with player2 on roll", () => {
  // Same position ID but player2 is on roll — positions swap
  const pos = decodePositionId("4HPwATDgc/ABMA", 2);

  // When player2 is on roll, the encoding flips:
  // side 0 = player2's perspective, side 1 = player1's perspective
  // The starting position is symmetric from each player's view,
  // so the result should still match the starting position
  expect(pos.points).toEqual(STARTING_POSITION.points);
  expect(pos.bar).toEqual([0, 0]);
  expect(pos.off).toEqual([0, 0]);
});

test("decodes position with checker on bar", () => {
  // From heroes analysis game 1, move 5: rchoice to play 53
  // Position ID: mLfgATCY5+ABUA  (player1=rchoice on roll, has 1 on bar)
  // Board shows O (rchoice) has 1 checker on bar
  const pos = decodePositionId("mLfgATCY5+ABUA", 1);

  // Total checkers should be 15 each
  let p1 = pos.bar[0] + pos.off[0];
  let p2 = pos.bar[1] + pos.off[1];
  for (let i = 0; i < 24; i++) {
    if (pos.points[i] > 0) p1 += pos.points[i];
    if (pos.points[i] < 0) p2 += -pos.points[i];
  }
  expect(p1).toBe(15);
  expect(p2).toBe(15);

  // At least one player should have a checker on bar in this position
  // rchoice (player1) was hit, so bar[0] should be >= 1
  // But A192K (player2) was also hit by bar/17* in previous move...
  // Actually move 4 was: A192K moves 8/4* 6/4 (hitting rchoice)
  // So rchoice has 1 on bar
  expect(pos.bar[0]).toBe(1);
});

test("decodes position with checkers borne off", () => {
  // A192K wins 4 points in game 5, so near end there should be borne-off checkers
  // Position from move 8 game 1: mOfgAyAyN+QANA with player2 on roll
  const pos = decodePositionId("mOfgAyAyN+QANA", 2);

  // Verify 15 checkers per side
  let p1 = pos.bar[0] + pos.off[0];
  let p2 = pos.bar[1] + pos.off[1];
  for (let i = 0; i < 24; i++) {
    if (pos.points[i] > 0) p1 += pos.points[i];
    if (pos.points[i] < 0) p2 += -pos.points[i];
  }
  expect(p1).toBe(15);
  expect(p2).toBe(15);
});
