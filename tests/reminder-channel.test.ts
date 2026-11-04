import { describe, expect, it, vi } from 'vitest';
import { ReminderChannel } from '../src/core/reminder-channel.js';
describe('foreground reminder delivery', () => {
  it('spaces simultaneous reminders so each is visible before acknowledgement', () => {
    const channel = new ReminderChannel();
    const shown = vi.fn(),
      failed = vi.fn(),
      publish = vi.fn();
    channel.enqueue('one', () => 'First', shown, failed);
    channel.enqueue('two', () => 'Second', shown, failed);
    channel.tick(0, true, publish);
    expect(publish.mock.calls).toEqual([['First']]);
    expect(shown).toHaveBeenCalledTimes(1);
    channel.tick(11999, true, publish);
    expect(shown).toHaveBeenCalledTimes(1);
    channel.tick(12000, true, publish);
    expect(publish.mock.calls).toEqual([['First'], ['Second']]);
    expect(shown).toHaveBeenCalledTimes(2);
    expect(failed).not.toHaveBeenCalled();
  });
  it('revalidates queued reminders and retries when the editor disappears', () => {
    const channel = new ReminderChannel();
    const shown = vi.fn(),
      failed = vi.fn(),
      publish = vi.fn();
    channel.enqueue('cancelled', () => null, shown, failed);
    channel.tick(0, true, publish);
    expect(failed).toHaveBeenCalledTimes(1);
    channel.enqueue('hidden', () => 'Hidden', shown, failed);
    channel.tick(1, false, publish);
    expect(failed).toHaveBeenCalledTimes(2);
    expect(publish).not.toHaveBeenCalled();
    expect(shown).not.toHaveBeenCalled();
  });
});
