import pdfParse from 'pdf-parse/lib/pdf-parse.js';

export const MIN_CHARS = 200;
export const MAX_MATERIAL_CHARS = 30_000;
/** Below this per-page budget, keep fewer whole-ish pages instead of slivers of every page. */
const MIN_PAGE_BUDGET = 1_200;

export interface SourcePage {
  page: number | null;
  text: string;
}

export interface Material {
  /** Text sent to the LLM, as `[Page N]` blocks for PDFs. */
  text: string;
  /** Page numbers present in `text`; questions citing anything else get `page: null`. */
  validPages: Set<number>;
}

export type ExtractErrorCode = 'no_text' | 'too_short';

export class ExtractError extends Error {
  constructor(public code: ExtractErrorCode) {
    super(code);
  }
}

function clean(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Extract text per page so questions can cite page numbers. */
export async function extractPdfPages(buffer: Buffer): Promise<SourcePage[]> {
  const pages: string[] = [];
  await pdfParse(buffer, {
    // pdf-parse renders pages sequentially, so push order is page order.
    pagerender: async (pageData) => {
      const content = await pageData.getTextContent({ normalizeWhitespace: true });
      let text = '';
      let lastY: number | undefined;
      let lastEnd = 0;
      for (const item of content.items) {
        const [fontSize, , , , x, y] = item.transform;
        if (lastY !== undefined && lastY !== y) {
          text += '\n';
        } else if (lastY !== undefined && x - lastEnd > Math.abs(fontSize) * 0.15 && !/\s$/.test(text) && !/^\s/.test(item.str)) {
          // Slides often split a line into separate runs; a visible gap between runs is a word break.
          text += ' ';
        }
        text += item.str;
        lastY = y;
        lastEnd = x + (item.width ?? 0);
      }
      pages.push(text);
      return text;
    },
  });
  const result = stripRepeatedLines(pages.map(clean)).map((text, i) => ({ page: i + 1, text }));
  if (result.every((p) => p.text.length === 0)) throw new ExtractError('no_text');
  return result;
}

/**
 * Drop running headers/footers: lines (ignoring digits, e.g. slide numbers) that appear on more
 * than half of the pages of a multi-page document.
 */
function stripRepeatedLines(pages: string[]): string[] {
  if (pages.length < 4) return pages;
  const key = (line: string) => line.replace(/\d+/g, '#').trim();
  const counts = new Map<string, number>();
  for (const page of pages) {
    for (const k of new Set(page.split('\n').map(key).filter(Boolean))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const repeated = new Set([...counts].filter(([, n]) => n > pages.length / 2).map(([k]) => k));
  return pages.map((page) =>
    page
      .split('\n')
      .filter((line) => !repeated.has(key(line)))
      .join('\n')
      .trim(),
  );
}

export function textAsPages(text: string): SourcePage[] {
  return [{ page: null, text: clean(text) }];
}

/** Join pages into `[Page N]` blocks, sampling evenly across pages if over the size limit. */
export function buildMaterial(pages: SourcePage[]): Material {
  const nonEmpty = pages.filter((p) => p.text.length > 0);
  const total = nonEmpty.reduce((n, p) => n + p.text.length, 0);
  if (total < MIN_CHARS) throw new ExtractError('too_short');

  let selected = nonEmpty;
  let budget = Infinity;
  if (total > MAX_MATERIAL_CHARS) {
    budget = Math.floor(MAX_MATERIAL_CHARS / nonEmpty.length);
    if (budget < MIN_PAGE_BUDGET) {
      const keep = Math.max(1, Math.floor(MAX_MATERIAL_CHARS / MIN_PAGE_BUDGET));
      const stride = nonEmpty.length / keep;
      selected = Array.from({ length: keep }, (_, i) => nonEmpty[Math.floor(i * stride)]);
      budget = MIN_PAGE_BUDGET;
    }
  }

  const validPages = new Set<number>();
  const blocks = selected.map((p) => {
    const body = p.text.length > budget ? `${p.text.slice(0, budget)}…` : p.text;
    if (p.page === null) return body;
    validPages.add(p.page);
    return `[Page ${p.page}]\n${body}`;
  });

  return { text: blocks.join('\n\n'), validPages };
}
