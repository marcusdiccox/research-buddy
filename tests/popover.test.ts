import { describe, it, expect } from 'vitest';
import { placeWritingBubble } from '../src/core/popover';
describe('writing bubble placement', () => {
  it('anchors above Pip near the bottom, keeping the tail aligned', () => {
    const p = placeWritingBubble(
      { x: 500, y: 600, width: 240, height: 260 },
      { x: 0, y: 0, width: 1600, height: 900 },
      { width: 360, height: 340 },
    );
    expect(p.tailSide).toBe('bottom');
    expect(p.x + p.tailX).toBe(620);
    expect(p.y + 340).toBeLessThan(780);
  });
  it('flips below a fox near the top and clamps on a negative-coordinate monitor', () => {
    const area = { x: -1920, y: 0, width: 1920, height: 1080 };
    const p = placeWritingBubble({ x: -1930, y: 0, width: 240, height: 260 }, area, {
      width: 360,
      height: 340,
    });
    expect(p.tailSide).toBe('top');
    expect(p.x).toBeGreaterThanOrEqual(area.x);
    expect(p.y).toBeGreaterThan(250);
    expect(p.tailX).toBeGreaterThanOrEqual(24);
  });
});
