const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function extensionForMime(mimeType: string): 'pdf' | 'docx' {
  return mimeType === 'application/pdf' ? 'pdf' : 'docx';
}

/** Authoritative object key: `{userId}/{resumeId}.{ext}`. Never use the original filename. */
export function buildResumeStoragePath(userId: string, resumeId: string, mimeType: string): string {
  if (!isUuid(userId) || !isUuid(resumeId)) {
    throw new Error('Resume storage path requires UUID user and resume ids.');
  }
  if (userId.includes('/') || userId.includes('\\') || userId.includes('..')) {
    throw new Error('Invalid user id for storage path.');
  }
  return `${userId}/${resumeId}.${extensionForMime(mimeType)}`;
}

export function assertOwnedStoragePath(userId: string, storagePath: string): void {
  const expectedPrefix = `${userId}/`;
  if (!storagePath.startsWith(expectedPrefix) || storagePath.includes('..')) {
    throw new Error('Storage path is not owned by the authenticated user.');
  }
}

export function displayFilename(original: string): string {
  return original.replace(/[/\\]/g, '').trim().slice(0, 255) || 'resume';
}
