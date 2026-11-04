type Rect = { x: number; y: number; width: number; height: number };
export function placeWritingBubble(pet: Rect, area: Rect, size: { width: number; height: number }) {
  const anchorX = pet.x + 120,
    headY = pet.y + 174;
  const above = headY - size.height - 8;
  const tailSide: 'top' | 'bottom' = above >= area.y ? 'bottom' : 'top';
  const desiredY = tailSide === 'bottom' ? above : pet.y + 252 + 8;
  const x = Math.max(
    area.x,
    Math.min(anchorX - size.width / 2, area.x + Math.max(0, area.width - size.width)),
  );
  const y = Math.max(area.y, Math.min(desiredY, area.y + Math.max(0, area.height - size.height)));
  return {
    x: Math.round(x),
    y: Math.round(y),
    tailX: Math.max(24, Math.min(size.width - 24, anchorX - x)),
    tailSide,
  };
}
