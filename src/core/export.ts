import { mkdirSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { BuddyStore } from './store.js';
function literal(value: string) {
  return value.replace(/[\\`*_{}\[\]<>#]/g, '\\$&');
}
export function exportDossier(db: BuddyStore, projectId: string, parent: string): string {
  const snapshot = db.snapshot(),
    project = snapshot.projects.find((p) => p.id === projectId);
  if (!project) throw new Error('Workspace not found.');
  const id = randomUUID(),
    root = resolve(parent),
    staging = join(root, `.research-buddy-${id}`),
    destination = join(root, `research-buddy-${id}`);
  mkdirSync(staging);
  mkdirSync(join(staging, 'sources'));
  try {
    const notes = snapshot.notes.filter((n) => n.projectId === projectId),
      results = snapshot.results.filter((r) => r.projectId === projectId),
      journal = snapshot.journal.filter((j) => j.projectId === projectId);
    const revisions = new Set([
      ...notes.map((n) => n.revisionId),
      ...results.flatMap((r) => r.points.map((p) => p.citation.revisionId)),
      ...journal.flatMap((j) => j.evidence.map((c) => c.revisionId)),
    ]);
    const files = new Map<string, string>();
    for (const revisionId of revisions) {
      const n = db.getRevision(projectId, revisionId),
        file = `${randomUUID()}.md`;
      files.set(revisionId, file);
      writeFileSync(
        join(staging, 'sources', file),
        `# ${literal(n.title)}\n\nPublished: ${n.publishedOn || 'Date unknown'}\nImported: ${n.createdAt}\nSource: ${literal(n.url || 'Personal note')}\nRevision: ${revisionId}\n\n${n.body}`,
        'utf8',
      );
    }
    let md = `# ${literal(project.name)}\n\nResearch Buddy dossier · ${new Date().toISOString()}\n\n## Sources\n\n`;
    for (const n of notes) md += `- [${literal(n.title)}](sources/${files.get(n.revisionId)})\n`;
    md += '\n## Research summaries and questions\n\n';
    for (const r of results) {
      md += `### ${literal(r.title)}\n\n${r.mode === 'local' ? 'Local key passages' : 'AI-assisted'} · ${r.createdAt}\n\n`;
      for (const p of r.points)
        md += `- ${literal(p.text)} [Source](sources/${files.get(p.citation.revisionId)})\n\n> ${p.citation.quote.replace(/\n/g, '\n> ')}\n\n`;
      for (const q of r.openQuestions) md += `- ${literal(q)}\n`;
    }
    md += '\n## Journal history\n\n';
    for (const j of journal) {
      md += `### ${j.createdAt}\n\n${j.thesis}\n\nCounterarguments: ${j.counterarguments || 'None recorded'}\n\nWhat would change my mind: ${j.conditions || 'Not recorded'}\n\n`;
      for (const c of j.evidence)
        md += `[Evidence](sources/${files.get(c.revisionId)})\n\n> ${c.quote.replace(/\n/g, '\n> ')}\n\n`;
    }
    md += '\n## Reminders\n\n';
    for (const r of snapshot.reminders.filter((r) => r.projectId === projectId))
      md += `- [${r.completed ? 'x' : ' '}] ${literal(r.title)} — ${r.dueAt}\n`;
    writeFileSync(join(staging, 'README.md'), md, 'utf8');
    renameSync(staging, destination);
    return destination;
  } catch (e) {
    if (dirname(resolve(staging)) === root) rmSync(staging, { recursive: true, force: true });
    throw e;
  }
}
