export interface MoveStep {
  from: number; // 1-24, 25=bar, 0=off
  to: number;
}

/**
 * Parse gnubg move notation into from/to pairs.
 *
 * Examples:
 *   "8/4 6/4"      → [{from:8,to:4}, {from:6,to:4}]
 *   "24/18(2)"     → [{from:24,to:18}, {from:24,to:18}]
 *   "8/4*"         → [{from:8,to:4}]
 *   "bar/17"       → [{from:25,to:17}]
 *   "4/off"        → [{from:4,to:0}]
 *   "bar/17*"      → [{from:25,to:17}]
 *   "1/off(2)"     → [{from:1,to:0}, {from:1,to:0}]
 *   "6/5star/1"    → [{from:6,to:5}, {from:5,to:1}]  (star = hit marker)
 *   "6/5star/1star" → [{from:6,to:5}, {from:5,to:1}]
 */
export function parseMoveNotation(notation: string): MoveStep[] {
  const steps: MoveStep[] = [];
  const parts = notation.trim().split(/\s+/);

  for (const part of parts) {
    // Strip trailing (N) repeat count
    const repeatMatch = part.match(/\((\d+)\)$/);
    const repeatCount = repeatMatch ? parseInt(repeatMatch[1], 10) : 1;
    const cleaned = repeatMatch ? part.slice(0, -repeatMatch[0].length) : part;

    // Split by "/" to get chain of points, stripping * from each segment
    const segments = cleaned.split("/").map((s) => s.replace(/\*$/, ""));

    if (segments.length < 2) continue;

    // Build steps from consecutive pairs in the chain
    const chainSteps: MoveStep[] = [];
    for (let i = 0; i < segments.length - 1; i++) {
      chainSteps.push({
        from: parsePoint(segments[i]),
        to: parsePoint(segments[i + 1]),
      });
    }

    // Apply repeat count
    for (let r = 0; r < repeatCount; r++) {
      steps.push(...chainSteps);
    }
  }

  return steps;
}

function parsePoint(s: string): number {
  if (s === "bar") return 25;
  if (s === "off") return 0;
  return parseInt(s, 10);
}
