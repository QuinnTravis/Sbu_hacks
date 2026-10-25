/**
 * Pre-demo check: runs the real generation pipeline on the sample notes (or a PDF/TXT you pass)
 * and prints timing and the question mix. Writes nothing. Needs GEMINI_API_KEY.
 *
 *   npm run smoke -w server
 *   npm run smoke -w server -- ../my-notes.pdf
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import { buildMaterial, extractPdfPages, textAsPages, type SourcePage } from '../src/lib/extract.js';
import { generateDeck } from '../src/routes/generate.js';

const input = process.argv[2];
let pages: SourcePage[];
if (input?.toLowerCase().endsWith('.pdf')) {
  pages = await extractPdfPages(await readFile(input));
} else if (input) {
  pages = textAsPages(await readFile(input, 'utf8'));
} else {
  // Split the sample notes on their [Page N] markers so citations behave like a PDF.
  const notes = await readFile(new URL('../sample/sample-notes.txt', import.meta.url), 'utf8');
  const parts = notes.split(/^\[Page (\d+)\]\s*$/m).slice(1);
  pages = [];
  for (let i = 0; i < parts.length; i += 2) pages.push({ page: Number(parts[i]), text: parts[i + 1].trim() });
}

const material = buildMaterial(pages);
console.log(`Model ${process.env.GEMINI_MODEL || 'gemini-flash-lite-latest'}, ${pages.length} page(s), ${material.text.length} chars sent`);
const t0 = Date.now();
try {
  const deck = await generateDeck(material);
  const count = (pick: (q: (typeof deck.questions)[number]) => boolean) => deck.questions.filter(pick).length;
  console.log(`OK in ${((Date.now() - t0) / 1000).toFixed(1)}s: "${deck.title}"`);
  console.log(`  ${deck.questions.length} questions: easy ${count((q) => q.difficulty === 'easy')}, medium ${count((q) => q.difficulty === 'medium')}, hard ${count((q) => q.difficulty === 'hard')}; mcq ${count((q) => q.type === 'mcq')}, tf ${count((q) => q.type === 'tf')}`);
  console.log(`  concepts: ${deck.concepts.join(', ')}`);
  console.log(`  pages cited: ${[...new Set(deck.questions.map((q) => q.source.label))].join(', ')}`);
} catch (err) {
  console.error(`FAILED after ${((Date.now() - t0) / 1000).toFixed(1)}s: ${(err as Error).message}`);
  process.exitCode = 1;
}
