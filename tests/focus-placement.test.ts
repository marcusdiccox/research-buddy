import { describe, expect, it } from 'vitest';
import { placeFocusWindow } from '../src/core/focus-placement';
import { BuddyStore } from '../src/core/store';

describe('floating focus placement and preference', () => {
  it('opens near the upper right of the selected monitor, including negative coordinates', () => {
    expect(placeFocusWindow({ x: -1920, y: 50, width: 1920, height: 1000 })).toEqual({
      x: -300,
      y: 70,
    });
  });
  it('preserves a dragged position and clamps it after a display changes', () => {
    const area = { x: 0, y: 0, width: 1200, height: 800 };
    expect(placeFocusWindow(area, { x: 150, y: 300 })).toEqual({ x: 150, y: 300 });
    expect(placeFocusWindow(area, { x: -500, y: 1200 })).toEqual({ x: 0, y: 620 });
    expect(placeFocusWindow(area, { x: 1800, y: -50 })).toEqual({ x: 920, y: 0 });
  });
  it('keeps the timer pin independent of note pinning and pet stacking', () => {
    const store = new BuddyStore(':memory:');
    try {
      expect(store.settings().focusPinned).toBe(true);
      store.saveSettings({ focusPinned: false, bubblePinned: true, alwaysOnTop: false });
      store.saveSettings({ focusPinned: true });
      expect(store.settings()).toMatchObject({
        focusPinned: true,
        bubblePinned: true,
        alwaysOnTop: false,
      });
    } finally {
      store.close();
    }
  });
});
