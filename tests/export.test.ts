import { it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BuddyStore } from '../src/core/store';
import { exportDossier } from '../src/core/export';
import { summarize } from '../src/core/research';
it('exports exact saved evidence, journal history and safe names without credentials', () => {
  const db = new BuddyStore(':memory:');
  const dir = mkdtempSync(join(tmpdir(), 'buddy-export-'));
  try {
    const project = db.createProject({ name: '../CON' });
    const note = db.saveNote({ projectId: project.id, title: '../CON', body: 'Revenue grew 12%.' });
    db.saveResult(summarize(note));
    db.saveNote({ ...note, body: 'Revenue grew 15%.' });
    db.saveJournal({
      projectId: project.id,
      thesis: 'First thesis',
      counterarguments: '',
      conditions: '',
      evidence: [],
    });
    const dossier = exportDossier(db, project.id, dir);
    expect(dossier.startsWith(dir)).toBe(true);
    const index = readFileSync(join(dossier, 'README.md'), 'utf8');
    expect(index).toContain('First thesis');
    const sources = readdirSync(join(dossier, 'sources'));
    expect(sources.length).toBeGreaterThanOrEqual(2);
    expect(
      sources.some((f) =>
        readFileSync(join(dossier, 'sources', f), 'utf8').includes('Revenue grew 12%.'),
      ),
    ).toBe(true);
    expect(index).not.toContain('apiKey');
    const links = [...index.matchAll(/\]\((sources\/[^)]+)\)/g)].map((m) => m[1]);
    expect(links.length).toBeGreaterThan(0);
    links.forEach((path) => expect(() => readFileSync(join(dossier, path), 'utf8')).not.toThrow());
    expect(() => exportDossier(db, project.id, dir)).not.toThrow();
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
