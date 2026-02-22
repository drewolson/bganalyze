import { expect, test } from "vitest";
import { parseMoveNotation } from "./moveNotation";

test("simple two-part move", () => {
  expect(parseMoveNotation("8/4 6/4")).toEqual([
    { from: 8, to: 4 },
    { from: 6, to: 4 },
  ]);
});

test("single move", () => {
  expect(parseMoveNotation("24/18")).toEqual([{ from: 24, to: 18 }]);
});

test("move with repeat count", () => {
  expect(parseMoveNotation("24/18(2)")).toEqual([
    { from: 24, to: 18 },
    { from: 24, to: 18 },
  ]);
});

test("move with hit marker", () => {
  expect(parseMoveNotation("8/4*")).toEqual([{ from: 8, to: 4 }]);
});

test("bar entry", () => {
  expect(parseMoveNotation("bar/17")).toEqual([{ from: 25, to: 17 }]);
});

test("bearing off", () => {
  expect(parseMoveNotation("4/off")).toEqual([{ from: 4, to: 0 }]);
});

test("bar entry with hit", () => {
  expect(parseMoveNotation("bar/17*")).toEqual([{ from: 25, to: 17 }]);
});

test("bearing off with repeat", () => {
  expect(parseMoveNotation("1/off(2)")).toEqual([
    { from: 1, to: 0 },
    { from: 1, to: 0 },
  ]);
});

test("complex move with bar and repeat", () => {
  expect(parseMoveNotation("24/18(2) 7/1*(2)")).toEqual([
    { from: 24, to: 18 },
    { from: 24, to: 18 },
    { from: 7, to: 1 },
    { from: 7, to: 1 },
  ]);
});

test("bar entry with multiple parts", () => {
  expect(parseMoveNotation("bar/24 bar/22")).toEqual([
    { from: 25, to: 24 },
    { from: 25, to: 22 },
  ]);
});

test("chained move through intermediate point", () => {
  expect(parseMoveNotation("6/5*/1")).toEqual([
    { from: 6, to: 5 },
    { from: 5, to: 1 },
  ]);
});

test("chained move with hit at end", () => {
  expect(parseMoveNotation("6/5*/1*")).toEqual([
    { from: 6, to: 5 },
    { from: 5, to: 1 },
  ]);
});
