/**
 * Regenerate sample/sampleDeck.json from sample/sample-notes.txt through the real pipeline.
 * Needs GEMINI_API_KEY. Review the output by hand before committing it.
 */
import 'dotenv/config';
import { readFile, writeFile } from 'node:fs/promises';
import { buildMaterial, type SourcePage } from '../src/lib/extract.js';
import { generateDeck } from '../src/routes/generate.js';

const notesPath = new URL('../sample/sample-notes.txt', import.meta.url);
const deckPath = new URL('../sample/sampleDeck.json', import.meta.url);

// Split the notes on their [Page N] markers so the deck cites pages like a PDF would.
const notes = await readFile(notesPath, 'utf8');
const pages: SourcePage[] = notes
  .split(/^\[Page (\d+)\]\s*$/m)
  .slice(1)
  .reduce<SourcePage[]>((acc, part, i, parts) => {
    if (i % 2 === 0) acc.push({ page: Number(part), text: parts[i + 1].trim() });
    return acc;
  }, []);

const deck = await generateDeck(buildMaterial(pages));
await writeFile(deckPath, `${JSON.stringify({ ...deck, id: 'sample-data-structures' }, null, 2)}\n`);
console.log(`Wrote ${deck.questions.length} questions to ${deckPath.pathname}`);
