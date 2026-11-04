import { randomUUID } from 'node:crypto';
import type { Note, ResearchResult, Takeaway } from '../shared/contracts.js';
const stop = new Set(
  'a an and are as at be been but by can did do does for from has have how i in into is it its me my of on or our that the their them there these they this to us was we were what when where which who why will with would your'.split(
    ' ',
  ),
);
function terms(s: string) {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((w) => !stop.has(w))
    .map((w) => (w.length > 4 ? w.replace(/s$/, '') : w));
}
function passages(note: Note): Takeaway[] {
  const sentences = note.body
    .split(/\n+/)
    .flatMap((p) =>
      [...new Intl.Segmenter('en', { granularity: 'sentence' }).segment(p)].map((s) =>
        s.segment.trim(),
      ),
    )
    .filter(Boolean);
  return sentences
    .flatMap((s) => {
      if ([...s].length <= 800) return [s];
      const chars = [...s],
        chunks: string[] = [];
      for (let i = 0; i < chars.length; i += 800) chunks.push(chars.slice(i, i + 800).join(''));
      return chunks;
    })
    .map((quote) => ({ text: quote, citation: { revisionId: note.revisionId, quote } }));
}
function base(projectId: string, title: string, kind: ResearchResult['kind']): ResearchResult {
  return {
    id: randomUUID(),
    projectId,
    title,
    kind,
    mode: 'local',
    points: [],
    openQuestions: [],
    createdAt: new Date().toISOString(),
  };
}
export function summarize(note: Note): ResearchResult {
  const all = passages(note);
  const ranked = all
    .map((p, i) => ({
      p,
      i,
      score:
        (i === 0 ? 8 : 0) +
        (/\d/.test(p.text) ? 3 : 0) +
        (/risk|concern|declin|uncertain|however|expect|growth|increase|decrease|shortage|deadline/i.test(
          p.text,
        )
          ? 4
          : 0) +
        Math.min(terms(p.text).length / 10, 2),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => a.i - b.i);
  return {
    ...base(note.projectId, note.title, 'summary'),
    noteId: note.id,
    points: ranked.map((x) => x.p),
    openQuestions:
      all.length > 6
        ? ['This quick summary selects key passages. Open the full note for all details.']
        : [],
  };
}
export function answerFromNotes(
  projectId: string,
  question: string,
  notes: Note[],
): ResearchResult {
  if (notes.some((n) => n.projectId !== projectId))
    throw new Error('Evidence must belong to this workspace.');
  const query = terms(question);
  const scored = notes
    .flatMap(passages)
    .map((p) => ({ p, score: terms(p.text).filter((w) => query.includes(w)).length }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);
  return {
    ...base(projectId, question, 'answer'),
    points: scored.map((x) => x.p),
    openQuestions: scored.length
      ? ['These are matching passages from your notes, not an exhaustive answer.']
      : [
          'I couldn’t find an answer in the matching notes. Try different words or add a source about this question.',
        ],
  };
}
export function validateAIResult(
  projectId: string,
  value: unknown,
  notes: Note[],
): { points: Takeaway[]; openQuestions: string[] } {
  if (!value || typeof value !== 'object') throw new Error('The AI returned an unreadable answer.');
  const v = value as { points?: Takeaway[]; openQuestions?: string[] };
  if (
    !Array.isArray(v.points) ||
    v.points.length > 12 ||
    !Array.isArray(v.openQuestions) ||
    v.openQuestions.length > 10 ||
    !v.openQuestions.every((q) => typeof q === 'string' && q.length <= 2000)
  )
    throw new Error('The AI returned an unexpected answer format.');
  for (const p of v.points) {
    if (
      !p ||
      typeof p.text !== 'string' ||
      !p.text.trim() ||
      p.text.length > 3000 ||
      !p.citation ||
      typeof p.citation.quote !== 'string' ||
      !p.citation.quote.trim()
    )
      throw new Error('The AI answer is missing its supporting passages.');
    const note = notes.find(
      (n) => n.revisionId === p.citation.revisionId && n.projectId === projectId,
    );
    if (!note || !note.body.includes(p.citation.quote))
      throw new Error('A supporting quote did not match your saved notes. No answer was saved.');
  }
  return { points: v.points, openQuestions: v.openQuestions };
}
