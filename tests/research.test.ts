import { describe, it, expect } from 'vitest';
import { summarize, answerFromNotes, validateAIResult } from '../src/core/research';
import type { Note } from '../src/shared/contracts';
const note: Note = {
  id: 'n1',
  revisionId: 'rev1',
  projectId: 'a',
  title: 'Quarterly update',
  body: 'Revenue grew 12% to $40 million.\n\nManagement expects demand to remain strong.\n\nThe main risk is a shortage of components.',
  url: '',
  publishedOn: '2026-10-01',
  createdAt: '',
  updatedAt: '',
};
describe('research grounded in saved notes', () => {
  it('summarizes locally with exact evidence and no invented figures', () => {
    const result = summarize(note);
    expect(result.mode).toBe('local');
    expect(result.points.length).toBeGreaterThan(0);
    expect(
      result.points.every(
        (p) => note.body.includes(p.citation.quote) && p.citation.revisionId === 'rev1',
      ),
    ).toBe(true);
    expect(result.points.some((p) => p.text.includes('12%'))).toBe(true);
    expect(result.points.some((p) => p.text.includes('shortage'))).toBe(true);
  });
  it('returns matching passages, or an honest missing-evidence result', () => {
    const found = answerFromNotes('a', 'What is the component shortage risk?', [note]);
    expect(found.points.some((p) => p.citation.quote.includes('shortage'))).toBe(true);
    const missing = answerFromNotes('a', 'Who is the chief scientist?', [note]);
    expect(missing.points).toEqual([]);
    expect(missing.openQuestions.length).toBeGreaterThan(0);
  });
  it('rejects evidence from another project or fabricated AI quotes', () => {
    expect(() => answerFromNotes('b', 'Revenue', [note])).toThrow();
    expect(() =>
      validateAIResult(
        'a',
        {
          points: [
            { text: 'Revenue doubled', citation: { revisionId: 'rev1', quote: 'Revenue doubled' } },
          ],
          openQuestions: [],
        },
        [note],
      ),
    ).toThrow();
    expect(() =>
      validateAIResult(
        'b',
        {
          points: [
            { text: 'Revenue rose', citation: { revisionId: 'rev1', quote: 'Revenue grew 12%' } },
          ],
          openQuestions: [],
        },
        [note],
      ),
    ).toThrow();
  });
});
