import 'server-only';

import { extractText, getDocumentProxy } from 'unpdf';
import { normalizeResumeText } from '../normalize-text';
import type { ParseFailure } from '../types';

export async function extractPdfText(bytes: Uint8Array): Promise<{ text: string } | ParseFailure> {
  try {
    // unpdf rejects Node Buffer; copy into a plain Uint8Array.
    const data = new Uint8Array(bytes);
    const pdf = await getDocumentProxy(data);
    const extracted = await extractText(pdf, { mergePages: true });
    const text = normalizeResumeText(extracted.text);
    if (text.length === 0) {
      return { code: 'empty', message: "We couldn't find readable text in this PDF." };
    }
    if (text.length < 40) {
      return {
        code: 'scanned',
        message: 'This resume looks like a scanned document. Try uploading a text-based PDF or DOCX.',
      };
    }
    return { text };
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : '';
    if (message.includes('password') || message.includes('encrypt')) {
      return { code: 'encrypted', message: 'Please upload an unlocked PDF.' };
    }
    return { code: 'corrupt', message: "We couldn't read this file." };
  }
}
