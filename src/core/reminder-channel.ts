interface Delivery {
  key: string;
  read: () => string | null;
  shown: (() => void)[];
  failed: (() => void)[];
}
/** A readable foreground slot; queued items are acknowledged only when displayed. */
export class ReminderChannel {
  private queue: Delivery[] = [];
  private until = 0;
  enqueue(key: string, read: () => string | null, shown: () => void, failed: () => void) {
    const existing = this.queue.find((item) => item.key === key);
    if (existing) {
      existing.shown.push(shown);
      existing.failed.push(failed);
    } else this.queue.push({ key, read, shown: [shown], failed: [failed] });
  }
  tick(now: number, available: boolean, publish: (message: string) => void) {
    if (!available) {
      for (const item of this.queue.splice(0)) for (const failed of item.failed) failed();
      return;
    }
    if (now < this.until) return;
    while (this.queue.length) {
      const item = this.queue.shift()!;
      const message = item.read();
      if (!message) {
        for (const failed of item.failed) failed();
        continue;
      }
      publish(message);
      this.until = now + 12000;
      for (const shown of item.shown) shown();
      break;
    }
  }
}
