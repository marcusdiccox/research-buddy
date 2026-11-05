import type { FocusStatus } from '../shared/contracts.js';

export const FOCUS_MINUTES = [15, 25, 45] as const;

/** One in-memory session. Wall-clock deadlines also account for time spent asleep. */
export class FocusSession {
  private deadline: number | null = null;

  start(minutes: unknown, now = Date.now()): FocusStatus {
    if (typeof minutes !== 'number' || !FOCUS_MINUTES.some((value) => value === minutes))
      throw new Error('Choose a 15, 25, or 45 minute focus session.');
    this.deadline = now + minutes * 60_000;
    return this.status(now);
  }

  stop(): FocusStatus {
    this.deadline = null;
    return this.status();
  }

  status(now = Date.now()): FocusStatus {
    const active = this.deadline !== null && now < this.deadline;
    return {
      active,
      endsAt: active ? new Date(this.deadline!).toISOString() : null,
      remainingSeconds: active ? Math.ceil((this.deadline! - now) / 1000) : 0,
    };
  }

  /** Consume completion once, independently of how many windows read status. */
  tick(now = Date.now()): boolean {
    if (this.deadline === null || now < this.deadline) return false;
    this.deadline = null;
    return true;
  }
}
