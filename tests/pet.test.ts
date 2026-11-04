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
    expect(pet.tick(4000, 100, desktop, size, {}).pose).toBe('standing-up');
    expect(pet.tick(4800, 100, desktop, size, {}).pose).toBe('walking');
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
  it('respects silent mode and selects different jokes when asked twice', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petChatter: 'off', petJokeStyle: 'dad' },
      { x: 10, y: 10 },
      0,
      () => 0,
    );
    expect(
      pet.tick(900000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).phrase,
    ).toBeNull();
    const a = pet.tellJoke(900000);
    const b = pet.tellJoke(900001);
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThan(10);
    expect(
      pet.tick(910000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).phrase,
    ).toBeNull();
  });
  it('spaces automatic speech by the configured frequency and does not repeat consecutive phrases', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petChatter: 'chatty', petRoamArea: 'parked' },
      { x: 10, y: 10 },
      0,
      () => 0,
    );
    expect(
      pet.tick(29999, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).phrase,
    ).toBeNull();
    const first = pet.tick(30000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).phrase;
    expect(first).not.toBeNull();
    const next = pet.tick(60000, 100, { x: 0, y: 0, width: 1200, height: 900 }, size, {}).phrase;
    expect(next).not.toBe(first);
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
