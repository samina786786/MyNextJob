import 'server-only';

import mammoth from 'mammoth';
import { normalizeResumeText } from '../normalize-text';
import type { ParseFailure } from '../types';

export async function extractDocxText(bytes: Uint8Array): Promise<{ text: string } | ParseFailure> {
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = normalizeResumeText(result.value ?? '');
    if (text.length < 20) {
      return { code: 'empty', message: "We couldn't find readable text in this resume." };
    }
    return { text };
  } catch {
    return { code: 'corrupt', message: "We couldn't read this file." };
  }
}
