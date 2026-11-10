import { describe, it, expect } from 'vitest';
import { BuddyStore } from '../src/core/store';
import { PetBehavior, defaultPetPreferences, petWindowSize } from '../src/core/pet';

const area = { x: 0, y: 0, width: 1200, height: 900 };
describe('animal companions', () => {
  it('defaults old notebooks to fox and persists only supported species', () => {
    const store = new BuddyStore(':memory:');
    try {
      expect(store.settings().petSpecies).toBe('fox');
      expect(store.saveSettings({ petSpecies: 'red-panda' }).petSpecies).toBe('red-panda');
      expect(store.saveSettings({ petSpecies: 'otter' }).petSpecies).toBe('otter');
      expect(() => store.saveSettings({ petSpecies: 'dragon' as never })).toThrow();
      expect(store.settings().petSpecies).toBe('otter');
    } finally {
      store.close();
    }
  });
  it('gives each species its own greeting and interaction', () => {
    const greetings = new Set<string | null>();
    for (const petSpecies of ['fox', 'red-panda', 'otter'] as const) {
      const pet = new PetBehavior(
        { ...defaultPetPreferences, petSpecies },
        { x: 400, y: 628 },
        0,
        () => 0,
      );
      pet.wake(0);
      greetings.add(pet.snapshot().phrase);
    }
    expect(greetings.size).toBe(3);
  });
  it('animates entering, slow swimming and leaving for an otter, then pauses on hover', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petSpecies: 'otter' },
      { x: 400, y: 628 },
      0,
      () => 0,
    );
    expect(pet.tick(4000, 100, area, petWindowSize, {}).pose).toBe('entering-swim');
    const swimming = pet.tick(4800, 100, area, petWindowSize, {});
    expect(swimming.pose).toBe('swimming');
    expect(Math.abs(swimming.x - 400)).toBeGreaterThan(0);
    expect(Math.abs(swimming.x - 400)).toBeLessThanOrEqual(2.4);
    const hover = pet.tick(4900, 100, area, petWindowSize, { hovered: true });
    expect(hover.x).toBe(swimming.x);
    expect(hover.pose).toBe('leaving-swim');
    expect(pet.tick(5700, 100, area, petWindowSize, { hovered: true }).pose).toBe('idle');
  });
  it('keeps swimming in bounds and disables it with reduced motion', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petSpecies: 'otter' },
      { x: 0, y: 628 },
      0,
      () => 0,
    );
    for (let time = 4000; time < 18000; time += 100) {
      const frame = pet.tick(time, 100, area, petWindowSize, {});
      expect(frame.x).toBeGreaterThanOrEqual(0);
      expect(frame.x + petWindowSize.width).toBeLessThanOrEqual(1200);
    }
    const still = new PetBehavior(
      { ...defaultPetPreferences, petSpecies: 'otter', petReducedMotion: true },
      { x: 400, y: 628 },
      0,
      () => 0,
    );
    expect(still.tick(4000, 100, area, petWindowSize, {})).toMatchObject({ x: 400, pose: 'idle' });
  });
  it('never gives foxes or red pandas a swimming pose', () => {
    for (const petSpecies of ['fox', 'red-panda'] as const) {
      const pet = new PetBehavior(
        { ...defaultPetPreferences, petSpecies },
        { x: 400, y: 628 },
        0,
        () => 0,
      );
      for (let time = 4000; time < 18000; time += 100)
        expect(pet.tick(time, 100, area, petWindowSize, {}).pose).not.toMatch(/swim/);
    }
  });
  it('lets the otter float during play while the red panda hugs its tail', () => {
    for (const petSpecies of ['red-panda', 'otter'] as const) {
      const pet = new PetBehavior(
        { ...defaultPetPreferences, petSpecies },
        { x: 400, y: 628 },
        0,
        () => 0,
      );
      pet.play(100);
      const frame = pet.tick(200, 100, area, petWindowSize, {});
      expect(frame.pose).toBe(petSpecies === 'otter' ? 'floating' : 'waving');
      expect(frame.x).toBe(400);
    }
  });
  it('finishes waking before a sleeping otter starts to play', () => {
    const pet = new PetBehavior(
      { ...defaultPetPreferences, petSpecies: 'otter' },
      { x: 400, y: 628 },
      0,
      () => 0,
    );
    pet.tick(120001, 100, area, petWindowSize, {});
    pet.tick(121001, 100, area, petWindowSize, {});
    pet.play(121100);
    expect(pet.snapshot().pose).toBe('waking-up');
    expect(pet.tick(122300, 100, area, petWindowSize, {}).pose).toBe('floating');
  });
  it('does not call a red panda or otter a fox in its joke pool', () => {
    for (const petSpecies of ['red-panda', 'otter'] as const) {
      const pet = new PetBehavior(
        { ...defaultPetPreferences, petSpecies },
        { x: 400, y: 628 },
        0,
        () => 0,
      );
      for (let i = 0; i < 120; i++) expect(pet.tellJoke(i * 10000)).not.toMatch(/\bfox\b/i);
    }
  });
});
