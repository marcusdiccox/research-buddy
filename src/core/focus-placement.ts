type Rect = { x: number; y: number; width: number; height: number };
export const focusWindowSize = { width: 280, height: 180 };
export function placeFocusWindow(area: Rect, previous?: { x: number; y: number }) {
  const maxX = area.x + Math.max(0, area.width - focusWindowSize.width);
  const maxY = area.y + Math.max(0, area.height - focusWindowSize.height);
  return {
    x: Math.round(Math.max(area.x, Math.min(previous?.x ?? maxX - 20, maxX))),
    y: Math.round(Math.max(area.y, Math.min(previous?.y ?? area.y + 20, maxY))),
  };
}
