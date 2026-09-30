/**
 * Supabase document-storage configuration for the dev/verify/seed scripts
 * (Phase 9, MRD §12.7).
 *
 * The browser talks to Supabase with the publishable anon key and uploads the
 * file itself; the backend only ever stores the resulting URL. Scripts that
 * need to build a plausible document URL without a browser (the Phase 9
 * verification sweep and the demo seeder) read the same project settings from
 * the backend environment, so a stored URL always points at the real bucket
 * instead of a placeholder host.
 *
 * Environment (backend/.env, see .env.example):
 *   SUPABASE_URL          — project URL, e.g. https://<project-ref>.supabase.co
 *   SUPABASE_DOCS_BUCKET  — storage bucket name (default: tenant-documents)
 *
 * No secret is involved: SUPABASE_URL and the bucket name are public values.
 * The publishable anon key stays in the frontend environment only, so nothing
 * here is needed for normal API traffic.
 */

/** Bucket that holds tenant documents; mirrors the frontend default. */
export const DOCUMENTS_BUCKET =
  (process.env.SUPABASE_DOCS_BUCKET ?? '').trim() || 'tenant-documents';

/**
 * Public base URL for objects in the documents bucket, without a trailing
 * slash, or null when SUPABASE_URL is not configured.
 *
 * Kept deliberately lenient about the URL shape: only the project origin is
 * needed, so both `https://<ref>.supabase.co` and
 * `https://<ref>.supabase.co/` are accepted.
 */
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

/**
 * Builds a public object URL under the documents bucket, or returns null when
 * storage is not configured. Callers decide whether an unconfigured project is
 * a hard failure (verification must not persist junk URLs) or something to
 * warn about and skip (a demo seed should stay runnable).
 */
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
