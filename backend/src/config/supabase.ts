/** Bucket that holds tenant documents; mirrors the frontend default. */
export const DOCUMENTS_BUCKET =
  (process.env.SUPABASE_DOCS_BUCKET ?? '').trim() || 'tenant-documents';

export function getDocumentsPublicBase(): string | null {
  const raw = (process.env.SUPABASE_URL ?? '').trim();
  if (raw.length === 0) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return `${url.origin}/storage/v1/object/public/${DOCUMENTS_BUCKET}`;
  } catch {
    return null;
  }
}

export function buildDocumentUrl(objectPath: string): string | null {
  const base = getDocumentsPublicBase();
  if (!base) return null;
  const path = objectPath.replace(/^\/+/, '');
  return path.length > 0 ? `${base}/${path}` : null;
}

/** One-time console warning so an unconfigured project is obvious in the logs. */
export function warnStorageNotConfigured(scriptName: string): void {
  console.warn(
    `[${scriptName}] SUPABASE_URL is not set — document URLs will not point at a real ` +
      'storage bucket. Copy backend/.env.example to backend/.env and set SUPABASE_URL.'
  );
}
