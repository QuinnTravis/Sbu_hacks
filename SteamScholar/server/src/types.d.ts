declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PageTextItem {
    str: string;
    transform: number[];
    width?: number;
  }
  interface PageData {
    getTextContent(options?: { normalizeWhitespace?: boolean; disableCombineTextItems?: boolean }): Promise<{
      items: PageTextItem[];
    }>;
  }
  interface PdfParseOptions {
    pagerender?: (pageData: PageData) => Promise<string>;
    max?: number;
  }
  interface PdfParseResult {
    numpages: number;
    text: string;
  }
  export default function pdfParse(data: Buffer, options?: PdfParseOptions): Promise<PdfParseResult>;
}
