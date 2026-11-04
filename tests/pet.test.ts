import { describe, it, expect } from 'vitest';
import {
  PetBehavior,
  clampPetPosition,
  pointHitsRegions,
  bindPetShortcut,
  defaultPetPreferences,
} from '../src/core/pet';
import { BuddyStore } from '../src/core/store';

const area = { x: -1920, y: 0, width: 1920, height: 1040 };
const size = { width: 240, height: 260 };
describe('fox movement and chatter', () => {
  it('walks on from the screen edge when summoned, respecting hover and reduced motion', () => {
    const desktop = { x: 0, y: 0, width: 1600, height: 900 };
    const pet = new PetBehavior(defaultPetPreferences, { x: 700, y: 628 }, 0, () => 0);
    pet.enter(desktop, size, 0);
    expect(pet.snapshot().x).toBeLessThan(0);
    expect(pet.snapshot().direction).toBe(1);
    const start = pet.snapshot().x;
    pet.tick(100, 100, desktop, size, { hovered: true });
    expect(pet.snapshot().x).toBe(start);
    for (let t = 200; t < 9000; t += 100) pet.tick(t, 100, desktop, size, {});
    expect(pet.snapshot().x).toBeGreaterThanOrEqual(0);
    const still = new PetBehavior(
      { ...defaultPetPreferences, petReducedMotion: true },
      { x: 700, y: 628 },
      0,
      () => 0,
    );
    still.enter(desktop, size, 0);
    expect(still.snapshot().x).toBeGreaterThanOrEqual(0);
    expect(still.snapshot().pose).toBe('idle');
  });
  it('walks along the bottom of a negative-coordinate monitor without leaving its work area', () => {
    const pet = new PetBehavior(defaultPetPreferences, { x: -400, y: 768 }, 0, () => 0.5);
    const positions: number[] = [];
    for (let time = 0; time < 120000; time += 100) {
      const frame = pet.tick(time, 100, area, size, {});
      positions.push(frame.x);
      expect(frame.x).toBeGreaterThanOrEqual(-1920);
      expect(frame.x + 240).toBeLessThanOrEqual(0);
      expect(frame.y).toBe(1040 - 260 - 12);
    }
    expect(new Set(positions.map(Math.round)).size).toBeGreaterThan(20);
  });
  it('keeps still while hovered, hidden, sleeping, parked or using reduced motion', () => {
    for (const flags of [
      { hovered: true },
      { visible: false },
      { menuOpen: true },
      { dragging: true },
    ]) {
      const pet = new PetBehavior(defaultPetPreferences, { x: 100, y: 100 }, 0, () => 0.5);
      const frame = pet.tick(15000, 500, { x: 0, y: 0, width: 1200, height: 900 }, size, flags);
      expect(frame.x).toBe(100);
      expect(frame.pose).not.toBe('walking');
    }
    for (const preferences of [
      { ...defaultPetPreferences, petRoamArea: 'parked' as const },
      { ...defaultPetPreferences, petReducedMotion: true },
    ]) {
      const pet = new PetBehavior(preferences, { x: 100, y: 100 }, 0, () => 0.5);
      expect(pet.tick(15000, 500, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).x).toBe(100);
    }
    const pet = new PetBehavior(defaultPetPreferences, { x: 100, y: 100 }, 0, () => 0.5);
    pet.tick(120000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {});
    expect(pet.tick(121000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).pose).toBe(
      'sleeping',
    );
  });
  it('starts strolling sooner with a stand-up transition, then sleeps only after fox inactivity', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petChatter: 'off' },
      { x: 100, y: 628 },
      0,
      () => 0.5,
    );
    const desktop = { x: 0, y: 0, width: 1200, height: 900 };
    expect(pet.tick(6000, 100, desktop, size, {}).pose).toBe('standing-up');
    expect(pet.tick(6800, 100, desktop, size, {}).pose).toBe('walking');
    pet.interact(119000);
    expect(pet.tick(120000, 100, desktop, size, {}).pose).not.toBe('sleeping');
    expect(pet.tick(239000, 100, desktop, size, {}).pose).toBe('curling-up');
    expect(pet.tick(240000, 100, desktop, size, {}).pose).toBe('sleeping');
    const resting = pet.snapshot();
    expect(pet.tick(250000, 100, desktop, size, {}).x).toBe(resting.x);
    pet.interact(250001);
    expect(pet.snapshot().pose).toBe('waking-up');
    expect(pet.tick(251500, 100, desktop, size, { hovered: true }).pose).not.toBe('sleeping');
  });
  it('keeps desktop wandering inside bounds and corrects an off-screen saved position', () => {
    expect(clampPetPosition({ x: 4000, y: -800 }, size, [area])).toEqual({ x: -240, y: 0 });
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petRoamArea: 'desktop' },
      { x: -700, y: 500 },
      0,
      () => 0.5,
    );
    const ys = new Set<number>();
    for (let t = 0; t < 90000; t += 100) {
      const f = pet.tick(t, 100, area, size, {});
      ys.add(Math.round(f.y));
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.y + 260).toBeLessThanOrEqual(1040);
    }
    expect(ys.size).toBeGreaterThan(10);
  });
  it('tells automatic themed jokes even with a legacy off setting, without repeats', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petChatter: 'off', petJokeStyle: 'dad', petRoamArea: 'parked' },
      { x: 10, y: 10 },
      0,
      () => 0,
    );
    const desktop = { x: 0, y: 0, width: 1200, height: 900 };
    expect(pet.tick(17999, 100, desktop, size, {}).phrase).toBeNull();
    const first = pet.tick(18000, 100, desktop, size, {}).phrase;
    expect(first).toBe('I only know 25 letters of the alphabet. I don’t know y.');
    expect(pet.tick(27000, 100, desktop, size, {}).phrase).toBeNull();
    const next = pet.tick(53000, 100, desktop, size, {}).phrase;
    expect(next).toBeTruthy();
    expect(next).not.toBe(first);
  });
  it('uses varied slow paces and randomly reverses before reaching an edge', () => {
    const desktop = { x: 0, y: 0, width: 1600, height: 900 };
    const measure = (random: number) => {
      const pet = new PetBehavior(defaultPetPreferences, { x: 700, y: 628 }, 0, () => random);
      pet.tick(7100, 100, desktop, size, {});
      pet.tick(7800, 100, desktop, size, {});
      const before = pet.snapshot().x;
      const frame = pet.tick(8000, 200, desktop, size, {});
      return frame.x - before;
    };
    const slow = measure(0),
      fast = measure(0.99);
    expect(slow).toBeLessThan(0);
    expect(fast).toBeGreaterThan(0);
    expect(Math.abs(slow)).toBeCloseTo(2.4, 6);
    expect(Math.abs(fast)).toBeLessThanOrEqual(4.8);
    expect(Math.abs(fast)).toBeGreaterThan(Math.abs(slow));
  });
  it('only captures clicks on actual pet or menu surfaces', () => {
    const regions = [
      { x: 60, y: 120, width: 120, height: 120, shape: 'ellipse' as const },
      { x: 20, y: 10, width: 200, height: 70, shape: 'rect' as const },
    ];
    expect(pointHitsRegions({ x: 120, y: 180 }, regions)).toBe(true);
    expect(pointHitsRegions({ x: 60, y: 120 }, regions)).toBe(false);
    expect(pointHitsRegions({ x: 2, y: 2 }, regions)).toBe(false);
    expect(pointHitsRegions({ x: 40, y: 30 }, regions)).toBe(true);
  });
});
describe('fox preferences and shortcut recovery', () => {
  it('persists fox behavior settings and rejects unsupported values', () => {
    const db = new BuddyStore(':memory:');
    db.saveSettings({
      petAppearance: 'arctic',
      petRoamArea: 'desktop',
      petJokeStyle: 'nerdy',
      petChatter: 'quiet',
      petReducedMotion: true,
      petShortcut: 'Control+Shift+Space',
    });
    expect(db.settings()).toMatchObject({
      petAppearance: 'arctic',
      petRoamArea: 'desktop',
      petJokeStyle: 'nerdy',
      petChatter: 'quiet',
      petReducedMotion: true,
      petShortcut: 'Control+Shift+Space',
    });
    expect(() => db.saveSettings({ petAppearance: 'unknown' } as never)).toThrow();
    expect(() => db.saveSettings({ petShortcut: 'Alt+F4' } as never)).toThrow();
    expect(db.settings().petAppearance).toBe('arctic');
    db.close();
  });
  it('keeps the previous shortcut active if a requested replacement is taken', () => {
    const callbacks = new Map<string, () => void>();
    let toggles = 0;
    const registry = {
      register: (key: string, callback: () => void) => {
        if (key === 'Alt+Shift+P') return false;
        callbacks.set(key, callback);
        return true;
      },
      unregister: (key: string) => {
        callbacks.delete(key);
      },
    };
    const first = bindPetShortcut(registry, 'Control+Alt+P', null, () => toggles++);
    const failed = bindPetShortcut(registry, 'Alt+Shift+P', first.active, () => toggles++);
    expect(failed).toEqual({ requested: 'Alt+Shift+P', active: 'Control+Alt+P', available: false });
    callbacks.get('Control+Alt+P')!();
    expect(toggles).toBe(1);
    const replacement = bindPetShortcut(
      registry,
      'Control+Shift+Space',
      failed.active,
      () => toggles++,
    );
    expect(replacement.available).toBe(true);
    expect(callbacks.has('Control+Alt+P')).toBe(false);
  });
});
