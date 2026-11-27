import { it, expect } from 'vitest';
import { ActivationGate } from '../src/core/activation';
it('suppresses early automatic login activation but permits a later intentional Dock opening', () => {
  const gate = new ActivationGate();
  expect(gate.activate()).toBe(false);
  expect(gate.markReady(true)).toBe(false);
  expect(gate.activate()).toBe(true);
});
it('suppresses a late initial login activation, not later ones', () => {
  const gate = new ActivationGate();
  expect(gate.markReady(true)).toBe(false);
  expect(gate.activate()).toBe(false);
  expect(gate.activate()).toBe(true);
});
it('queues a manual activation until initialization is complete', () => {
  const gate = new ActivationGate();
  expect(gate.activate()).toBe(false);
  expect(gate.markReady(false)).toBe(true);
  expect(gate.activate()).toBe(true);
});
