import type { BoardPosition } from "../types/match";

const BASE64 =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function base64ToBytes(s: string): Uint8Array {
  s = s.replace(/=+$/, "");
  const bytes = new Uint8Array(Math.floor((s.length * 6) / 8));
  let buf = 0;
  let bits = 0;
  let byteIdx = 0;
  for (let i = 0; i < s.length; i++) {
    const val = BASE64.indexOf(s[i]);
    if (val < 0) continue;
    buf = (buf << 6) | val;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes[byteIdx++] = (buf >> bits) & 0xff;
    }
  }
  return bytes;
}

/** Read bit at bitIndex, LSB-first within each byte (gnubg convention). */
function getBit(bytes: Uint8Array, bitIndex: number): number {
  const byteIdx = Math.floor(bitIndex / 8);
  const bitIdx = bitIndex % 8;
  return (bytes[byteIdx] >> bitIdx) & 1;
}

/**
 * Decode a gnubg Position ID into a BoardPosition.
 *
 * The Position ID is a 14-char base64 string encoding 10 bytes (80 bits).
 * Bits are read LSB-first. First come the checkers for the player on roll
 * (25 locations: points 1-24 from their perspective, then bar), then the
 * same for the opponent. At each location: N ones for N checkers, then a zero.
 *
 * playerOnRoll: 1 means Player1 (bottom) is on roll, 2 means Player2 (top).
 */
export function decodePositionId(
  positionId: string,
  playerOnRoll: 1 | 2,
): BoardPosition {
  const bytes = base64ToBytes(positionId);

  // Extract checkers for each side from the bit stream
  const sides: number[][] = [];
  let bitPos = 0;
  for (let side = 0; side < 2; side++) {
    const counts: number[] = [];
    for (let loc = 0; loc < 25; loc++) {
      let count = 0;
      while (bitPos < 80 && getBit(bytes, bitPos) === 1) {
        count++;
        bitPos++;
      }
      bitPos++; // skip the 0 separator
      counts.push(count);
    }
    sides.push(counts);
  }

  // In gnubg's internal representation:
  //   anBoard[0] = opponent of player on roll (encoded as sides[0])
  //   anBoard[1] = player on roll (encoded as sides[1])
  // Each side's points are from THEIR OWN perspective (point 1 = their ace point).

  const points = new Array(24).fill(0);

  if (playerOnRoll === 1) {
    // Player1 is on roll = sides[1]. Their ace point = our point 1 (index 0).
    for (let i = 0; i < 24; i++) {
      points[i] += sides[1][i];
    }
    const bar0 = sides[1][24]; // player1 bar

    // Player2 is opponent = sides[0]. Their ace point = our point 24 (index 23).
    for (let i = 0; i < 24; i++) {
      points[23 - i] -= sides[0][i];
    }
    const bar1 = sides[0][24]; // player2 bar

    let p1OnBoard = bar0;
    let p2OnBoard = bar1;
    for (let i = 0; i < 24; i++) {
      if (points[i] > 0) p1OnBoard += points[i];
      if (points[i] < 0) p2OnBoard += -points[i];
    }

    return {
      points,
      bar: [bar0, bar1],
      off: [15 - p1OnBoard, 15 - p2OnBoard],
    };
  } else {
    // Player2 is on roll = sides[1]. Their ace point = our point 24 (index 23).
    for (let i = 0; i < 24; i++) {
      points[23 - i] -= sides[1][i];
    }
    const bar1 = sides[1][24]; // player2 bar

    // Player1 is opponent = sides[0]. Their ace point = our point 1 (index 0).
    for (let i = 0; i < 24; i++) {
      points[i] += sides[0][i];
    }
    const bar0 = sides[0][24]; // player1 bar

    let p1OnBoard = bar0;
    let p2OnBoard = bar1;
    for (let i = 0; i < 24; i++) {
      if (points[i] > 0) p1OnBoard += points[i];
      if (points[i] < 0) p2OnBoard += -points[i];
    }

    return {
      points,
      bar: [bar0, bar1],
      off: [15 - p1OnBoard, 15 - p2OnBoard],
    };
  }
}
