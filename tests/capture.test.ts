import { it, expect } from 'vitest';
import { validateCapture, appendCapture, decodeCaptureResult } from '../src/core/capture';
it('validates plain text without accepting stale, empty or oversized values', () => {
  expect(validateCapture('  A useful passage 🦊  ')).toBe('  A useful passage 🦊  ');
  for (const value of ['', ' \n ', null, 5, 'x'.repeat(100001)])
    expect(() => validateCapture(value)).toThrow();
  expect(validateCapture('🦊'.repeat(100000)).length).toBe(200000);
});
it('checks the combined draft before appending a capture', () => {
  expect(appendCapture('\n    indented code', '  selection\n')).toBe(
    '\n    indented code\n\n  selection\n',
  );
  expect(appendCapture('My draft', 'A passage')).toBe('My draft\n\nA passage');
  expect(appendCapture('', 'A passage')).toBe('A passage');
  expect(() => appendCapture('x'.repeat(99999), 'ab')).toThrow();
});
it('uses only a successful fresh helper result and sanitizes helper failures', () => {
  expect(decodeCaptureResult(JSON.stringify({ text: 'Fresh passage', fresh: true }))).toEqual({
    text: 'Fresh passage',
  });
  expect(
    decodeCaptureResult(JSON.stringify({ text: 'Stale secret', fresh: false })).error,
  ).toBeTruthy();
  expect(
    decodeCaptureResult(JSON.stringify({ error: 'foreground_changed', text: 'secret' })),
  ).toEqual({ error: 'The active app changed. Select the text and try again.' });
  expect(decodeCaptureResult('private diagnostic content').error).not.toContain('private');
});
