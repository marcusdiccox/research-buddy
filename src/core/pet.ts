import type { HitRegion, PetPreferences, PetView } from '../shared/contracts.js';
export const defaultPetPreferences: PetPreferences = {
  petAppearance: 'red',
  petRoamArea: 'bottom',
  petJokeStyle: 'wholesome',
  petChatter: 'friendly',
  petReducedMotion: false,
  petShortcut: 'Control+Alt+P',
};
export type Point = { x: number; y: number };
export type WorkArea = Point & { width: number; height: number };
export const petWindowSize = { width: 240, height: 260 };
const jokes: Record<PetPreferences['petJokeStyle'], string[]> = {
  wholesome: [
    'Why did the fox bring a blanket? For a little undercover work.',
    'My favorite kind of meeting? A meet-cute with a snack.',
    'I made a tiny to-do list. First item: believe in you.',
    'What’s a fox’s favorite weather? A little tailwind.',
    'I tried to catch some fog. I mist.',
    'I’m not procrastinating. I’m strategically fluffing my tail.',
    'What do you call a fox who loves books? Well-red.',
    'My paws are small, but my snack ambitions are enormous.',
  ],
  dad: [
    'I only know 25 letters of the alphabet. I don’t know y.',
    'Why did the scarecrow get promoted? Outstanding in his field.',
    'I used to hate facial hair. Then it grew on me.',
    'I’m reading a book about anti-gravity. It’s impossible to put down.',
    'What do you call a fake noodle? An impasta.',
    'I ordered a chicken and an egg. I’ll let you know.',
    'What’s orange and sounds like a parrot? A carrot.',
    'I don’t trust stairs. They’re always up to something.',
  ],
  nerdy: [
    'There are 10 kinds of foxes: those who know binary and those who don’t.',
    'Why was the computer cold? It left its Windows open.',
    'My code has no bugs. Just surprise woodland creatures.',
    'I asked my database for a snack. It returned a byte.',
    'A SQL query walks into a forest and asks: can I join you?',
    'I told a recursive joke. To understand it, first understand this joke.',
    'My favorite shortcut? The one to the snack folder.',
    'Why did the developer go outside? To get a fresh branch.',
  ],
};
export function clampPetPosition(
  point: Point,
  size: { width: number; height: number },
  areas: WorkArea[],
): Point {
  if (!areas.length) return point;
  const distance = (area: WorkArea) =>
    Math.hypot(
      point.x + size.width / 2 - (area.x + area.width / 2),
      point.y + size.height / 2 - (area.y + area.height / 2),
    );
  const area =
    areas.find(
      (a) =>
        point.x >= a.x &&
        point.y >= a.y &&
        point.x + size.width <= a.x + a.width &&
        point.y + size.height <= a.y + a.height,
    ) ?? [...areas].sort((a, b) => distance(a) - distance(b))[0];
  return {
    x: Math.max(area.x, Math.min(point.x, area.x + Math.max(0, area.width - size.width))),
    y: Math.max(area.y, Math.min(point.y, area.y + Math.max(0, area.height - size.height))),
  };
}
export function pointHitsRegions(point: Point, regions: HitRegion[]): boolean {
  return regions.some((r) => {
    if (
      r.width <= 0 ||
      r.height <= 0 ||
      point.x < r.x ||
      point.y < r.y ||
      point.x > r.x + r.width ||
      point.y > r.y + r.height
    )
      return false;
    return (
      r.shape === 'rect' ||
      ((point.x - r.x - r.width / 2) / (r.width / 2)) ** 2 +
        ((point.y - r.y - r.height / 2) / (r.height / 2)) ** 2 <=
        1
    );
  });
}
export interface ShortcutRegistry {
  register(key: string, callback: () => void): boolean;
  unregister(key: string): void;
}
export function bindPetShortcut(
  registry: ShortcutRegistry,
  requested: string,
  active: string | null,
  callback: () => void,
) {
  if (requested === active) return { requested, active, available: true };
  if (!registry.register(requested, callback)) return { requested, active, available: false };
  if (active) registry.unregister(active);
  return { requested, active: requested, available: true };
}
type Flags = {
  hovered?: boolean;
  visible?: boolean;
  menuOpen?: boolean;
  dragging?: boolean;
  reducedMotion?: boolean;
};
export type PetFrame = Point & Pick<PetView, 'pose' | 'direction' | 'phrase'>;
export class PetBehavior {
  private frame: PetFrame;
  private restUntil: number;
  private walkUntil = 0;
  private pace = 18;
  private entrance: { targetX: number } | null = null;
  private target: Point | null = null;
  private nextSpeech: number;
  private bubbleUntil = 0;
  private waveUntil = 0;
  private lastInteraction: number;
  private wasHovered = false;
  private transition: { until: number; next: PetView['pose'] } | null = null;
  private previousPhrase = '';
  constructor(
    public preferences: PetPreferences,
    position: Point,
    now: number,
    private random: () => number = Math.random,
  ) {
    this.frame = { ...position, pose: 'idle', direction: 1, phrase: null };
    this.lastInteraction = now;
    this.restUntil = now + this.range(3500, 7000);
    this.nextSpeech = now + this.range(18000, 30000);
  }
  private range(min: number, max: number) {
    return min + Math.max(0, Math.min(0.999999, this.random())) * (max - min);
  }
  private speechInterval() {
    return this.range(35000, 65000);
  }
  private choose(pool: string[]) {
    const candidates = pool.filter((p) => p !== this.previousPhrase);
    return candidates[Math.floor(this.range(0, candidates.length))] ?? pool[0];
  }
  private say(phrase: string, now: number) {
    this.previousPhrase = phrase;
    this.frame.phrase = phrase;
    this.bubbleUntil = now + 8000;
    this.waveUntil = now + 1400;
    this.restUntil = Math.max(this.restUntil, now + 1800);
    this.target = null;
    return phrase;
  }
  configure(preferences: PetPreferences, now: number) {
    this.preferences = preferences;
    this.resume(now);
  }
  place(position: Point) {
    this.entrance = null;
    this.frame.x = position.x;
    this.frame.y = position.y;
    this.target = null;
  }
  resume(now: number) {
    this.entrance = null;
    this.target = null;
    this.transition = null;
    this.lastInteraction = now;
    this.frame.pose = 'idle';
    this.restUntil = now + this.range(3500, 7000);
    this.nextSpeech = now + this.range(18000, 30000);
  }
  dismiss() {
    this.frame.phrase = null;
    this.bubbleUntil = 0;
  }
  private setPose(next: PetView['pose'], now: number, reduced = false) {
    const previous = this.frame.pose;
    if (next === previous) return;
    let kind: PetView['pose'] | undefined,
      duration = 0;
    if (!reduced && !this.preferences.petReducedMotion) {
      if (next === 'sleeping' && previous !== 'sleeping') {
        kind = 'curling-up';
        duration = 900;
      } else if (previous === 'sleeping' || previous === 'curling-up') {
        kind = 'waking-up';
        duration = 1100;
      } else if (next === 'walking' && (previous === 'idle' || previous === 'waving')) {
        kind = 'standing-up';
        duration = 650;
      } else if (previous === 'walking' && (next === 'idle' || next === 'waving')) {
        kind = 'sitting-down';
        duration = 550;
      }
    }
    this.frame.pose = kind ?? next;
    this.transition = kind
      ? { until: now + duration, next: kind === 'waking-up' ? 'walking' : next }
      : null;
  }
  interact(now: number) {
    this.lastInteraction = now;
    if (this.frame.pose === 'sleeping' || this.frame.pose === 'curling-up') {
      this.transition = null;
      this.setPose('idle', now);
      this.restUntil = now + 1400;
      this.nextSpeech = now + this.speechInterval();
    }
  }
  wake(now: number) {
    this.interact(now);
    this.say('Bright eyes, bushy tail. What shall we do?', now);
  }
  tellJoke(now: number) {
    this.interact(now);
    return this.say(this.choose(jokes[this.preferences.petJokeStyle]), now);
  }
  snapshot(): PetFrame {
    return { ...this.frame };
  }
  enter(area: WorkArea, size: { width: number; height: number }, now: number, reduced = false) {
    this.resume(now);
    if (reduced || this.preferences.petReducedMotion) {
      this.place(clampPetPosition(this.frame, size, [area]));
      return;
    }
    const left = this.random() < 0.5;
    this.frame.y = area.y + Math.max(0, area.height - size.height - 12);
    this.frame.x = left ? area.x - 160 : area.x + area.width - 80;
    this.frame.direction = left ? 1 : -1;
    this.frame.pose = 'walking';
    this.entrance = { targetX: left ? area.x : area.x + Math.max(0, area.width - size.width) };
  }
  tick(
    now: number,
    elapsed: number,
    area: WorkArea,
    size: { width: number; height: number },
    flags: Flags,
  ): PetFrame {
    if (flags.visible === false) {
      this.entrance = null;
      this.dismiss();
      this.frame.pose = 'idle';
      return this.snapshot();
    }
    if (this.entrance) {
      if (flags.reducedMotion || this.preferences.petReducedMotion) {
        this.entrance = null;
        this.frame.pose = 'idle';
      } else {
        if (flags.hovered || flags.menuOpen || flags.dragging) {
          this.interact(now);
          this.frame.pose = 'idle';
          return this.snapshot();
        }
        this.frame.pose = 'walking';
        const dx = this.entrance.targetX - this.frame.x;
        const step = Math.min(Math.abs(dx), (24 * Math.max(0, Math.min(elapsed, 250))) / 1000);
        this.frame.x += Math.sign(dx) * step;
        if (Math.abs(this.entrance.targetX - this.frame.x) < 0.1) {
          this.entrance = null;
          this.restUntil = now + this.range(3500, 7000);
          this.setPose('idle', now);
        }
        return this.snapshot();
      }
    }
    const bounded = clampPetPosition(this.frame, size, [area]);
    this.frame.x = bounded.x;
    this.frame.y = bounded.y;
    if (flags.hovered && !this.wasHovered) this.interact(now);
    this.wasHovered = !!flags.hovered;
    if (this.transition) {
      if (
        flags.reducedMotion ||
        this.preferences.petReducedMotion ||
        now >= this.transition.until
      ) {
        this.frame.pose = this.transition.next;
        this.transition = null;
      } else return this.snapshot();
    }
    if (this.frame.phrase && now >= this.bubbleUntil) this.dismiss();
    const paused = flags.hovered || flags.menuOpen || flags.dragging;
    if (paused) {
      this.restUntil = Math.max(this.restUntil, now + 600);
      this.nextSpeech = Math.max(this.nextSpeech, now + 10000);
      this.target = null;
    }
    if (!paused && now - this.lastInteraction >= 120000) {
      this.target = null;
      this.dismiss();
      this.setPose('sleeping', now, flags.reducedMotion);
      return this.snapshot();
    }
    if (!paused && now >= this.nextSpeech) {
      this.say(this.choose(jokes[this.preferences.petJokeStyle]), now);
      this.nextSpeech = now + this.speechInterval();
    }
    if (
      paused ||
      flags.reducedMotion ||
      this.preferences.petReducedMotion ||
      this.preferences.petRoamArea === 'parked' ||
      now < this.waveUntil
    ) {
      this.setPose(now < this.waveUntil ? 'waving' : 'idle', now, flags.reducedMotion);
      return this.snapshot();
    }
    if (
      this.target &&
      (now >= this.walkUntil ||
        Math.hypot(this.target.x - this.frame.x, this.target.y - this.frame.y) < 2)
    ) {
      this.target = null;
      this.restUntil = now + this.range(3500, 7000);
    }
    if (!this.target && now >= this.restUntil) {
      const maxX = area.x + Math.max(0, area.width - size.width),
        maxY = area.y + Math.max(0, area.height - size.height) - 12;
      this.frame.direction = this.random() < 0.5 ? -1 : 1;
      this.pace = this.range(12, 24);
      if (this.preferences.petRoamArea === 'bottom') {
        let x = Math.max(
          area.x,
          Math.min(maxX, this.frame.x + this.frame.direction * this.range(50, 160)),
        );
        if (Math.abs(x - this.frame.x) < 20) {
          this.frame.direction = this.frame.direction === 1 ? -1 : 1;
          x = Math.max(
            area.x,
            Math.min(maxX, this.frame.x + this.frame.direction * this.range(50, 160)),
          );
        }
        this.target = { x, y: Math.max(area.y, maxY) };
      } else
        this.target = {
          x: this.range(area.x, maxX),
          y: this.range(area.y, Math.max(area.y, maxY)),
        };
      this.frame.direction = this.target.x < this.frame.x ? -1 : 1;
      this.walkUntil = now + this.range(4000, 8000);
    }
    if (this.target) {
      this.setPose('walking', now, flags.reducedMotion);
      if (this.transition) return this.snapshot();
      const dx = this.target.x - this.frame.x,
        dy = this.target.y - this.frame.y,
        distance = Math.hypot(dx, dy),
        step = Math.min(distance, (this.pace * Math.max(0, Math.min(elapsed, 250))) / 1000);
      if (distance > 0) {
        this.frame.x += (dx / distance) * step;
        this.frame.y += (dy / distance) * step;
      }
    } else this.setPose('idle', now, flags.reducedMotion);
    return this.snapshot();
  }
}
