import { describe, expect, it } from 'vitest';
import { FocusSession } from '../src/core/focus.js';

describe('session-local focus', () => {
  const now = Date.parse('2026-11-05T12:00:00Z');

  it.each([15, 25, 45])('starts a %i minute session with an absolute deadline', (minutes) => {
    const session = new FocusSession();
    expect(session.start(minutes, now)).toEqual({
      active: true,
      endsAt: new Date(now + minutes * 60_000).toISOString(),
      remainingSeconds: minutes * 60,
    });
    expect(session.status(now + 1001).remainingSeconds).toBe(minutes * 60 - 1);
  });

  it('finishes at the deadline and delivers completion once after sleep', () => {
    const session = new FocusSession();
    session.start(15, now);
    expect(session.tick(now + 899_999)).toBe(false);
    expect(session.status(now + 900_000)).toEqual({
      active: false,
      endsAt: null,
      remainingSeconds: 0,
    });
    expect(session.tick(now + 3_600_000)).toBe(true);
    expect(session.tick(now + 3_600_001)).toBe(false);
  });

  it('stops without announcing completion and starts fresh after quit', () => {
    const session = new FocusSession();
    session.start(25, now);
    expect(session.stop()).toEqual({ active: false, endsAt: null, remainingSeconds: 0 });
    expect(session.tick(now + 9_000_000)).toBe(false);
    session.start(45, now);
    expect(new FocusSession().status(now)).toEqual({
      active: false,
      endsAt: null,
      remainingSeconds: 0,
    });
  });

  it('replaces an active session without the old deadline completing', () => {
    const session = new FocusSession();
    session.start(15, now);
    session.start(45, now + 60_000);
    expect(session.tick(now + 900_000)).toBe(false);
    expect(session.status(now + 900_000).remainingSeconds).toBe(1860);
  });

  it.each([0, -15, 1, 30, 15.5, NaN, Infinity, '25', null, undefined, {}, true])(
    'rejects invalid duration %s without changing the existing deadline',
    (minutes) => {
      const session = new FocusSession();
      const initial = session.start(25, now);
      expect(() => session.start(minutes, now)).toThrow('Choose a 15, 25, or 45');
      expect(session.status(now)).toEqual(initial);
    },
  );
});
