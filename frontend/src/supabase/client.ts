import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase storage integration for tenant documents (MRD §6.1, §12.7, §16).
 *
 * Storage split: the actual file lives in Supabase storage, while the backend
 * database keeps only the document metadata and the stored URL. The browser
 * uploads the file here and then records the resulting URL through the
 * uploadTenantDocs mutation. Deleting a record removes the storage object from
 * the client too — the backend never touches storage.
 *
 * The bucket is expected to be PUBLIC so the stored URL stays valid for the
 * lifetime of the record (a signed URL expires and would break the persisted
 * link). Objects are namespaced by the app's own user id
 * (`<userId>/<uuid>-<file name>`) so one tenant never overwrites another's
 * file, and every record's read/delete scope is decided by the backend, which
 * forces the caller's tenant record server-side.
 *
 * There is deliberately NO Supabase RLS policy keyed on auth.uid(): this client
 * is storage-only (see persistSession: false below) and never signs in, so
 * auth.uid() is always null and such a policy would reject every upload.
 * Isolation therefore comes from the app's GraphQL layer, not from Supabase.
 * See supabase/storage-setup.sql for the bucket definition.
 *
 * Configuration (frontend/.env, see .env.example):
 *   VITE_SUPABASE_URL        — project URL
 *   VITE_SUPABASE_ANON_KEY   — publishable anon key (safe to ship to the
 *                              browser; never the service_role key)
 *   VITE_SUPABASE_DOCS_BUCKET — storage bucket name, must be a PUBLIC bucket
 */

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

/** Bucket that holds tenant documents. */
export const DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_DOCS_BUCKET as string | undefined)?.trim() || 'tenant-documents';

/** Largest accepted upload (5 MB) — tenant paperwork, not large binaries. */
export const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

/** Accepted upload types: PDF and the common image formats. */
export const ALLOWED_DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
];

const ACCEPTED_TYPES_LABEL = 'PDF, PNG, JPEG or WebP';

/** Storage failure with a message safe to show to the tenant. */
export class DocumentStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentStorageError';
  }
}

// null = not built yet.
let clientPromise: Promise<SupabaseClient | null> | null = null;

/**
 * Builds the Supabase client on first use. The SDK is imported dynamically so
 * it is only fetched when a tenant actually touches a document — the public
 * pages, login, and every other portal module stay free of its weight.
 */
function getClient(): Promise<SupabaseClient | null> {
  if (clientPromise === null) {
    clientPromise = (async (): Promise<SupabaseClient | null> => {
      if (SUPABASE_URL.length === 0 || SUPABASE_ANON_KEY.length === 0) return null;
      try {
        const { createClient } = await import('@supabase/supabase-js');
        return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: {
            // Document access is decided by the app's own session cookies;
            // the Supabase client is storage-only, so it keeps no session.
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
          }
        });
      } catch (error) {
        // A failed chunk load must not be cached forever — the next attempt
        // gets a fresh try.
        clientPromise = null;
        throw new DocumentStorageError(
          `The document storage library could not be loaded. ${
            error instanceof Error ? error.message : ''
          }`.trim()
        );
      }
    })();
  }
  return clientPromise;
}

/**
 * True when the storage environment variables are present. Reads only the
 * environment, so storage-aware UI can render synchronously without pulling
 * the Supabase SDK into the page.
 */
export function isDocumentStorageConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

async function requireClient(): Promise<SupabaseClient> {
  const supabase = await getClient();
  if (!supabase) {
    throw new DocumentStorageError(
      'Document storage is not configured. Add the Supabase settings to the frontend environment file.'
    );
  }
  return supabase;
}

/** Human-readable file size, e.g. "1.4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Returns a validation message for a chosen file, or null when it is
 * acceptable. Shared by the upload form so the browser and the storage layer
 * apply exactly the same rules.
 */
export function getDocumentFileError(file: File | null | undefined): string | null {
  if (!file) return 'Choose a file to upload';
  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return `Unsupported file type. Upload ${ACCEPTED_TYPES_LABEL} only.`;
  }
  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return `File is too large. The maximum size is ${formatFileSize(MAX_DOCUMENT_SIZE_BYTES)}.`;
  }
  if (file.size === 0) {
    return 'The selected file is empty.';
  }
  return null;
}

/**
 * Random unique prefix for an object name.
 *
 * `crypto.randomUUID` only exists in a secure context, so it is missing when
 * the dev server is opened over a plain-HTTP LAN address (for example
 * http://192.168.1.5:5173 from a phone) and would throw mid-upload. The
 * fallback uses getRandomValues, which is available in every context the app
 * can realistically run in.
 */
function randomId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 version 4 / variant 10xx bit layout.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Safe, collision-free object name: strips odd characters, adds a UUID prefix. */
function buildObjectName(fileName: string): string {
  const extension = fileName.includes('.') ? fileName.slice(fileName.lastIndexOf('.')) : '';
  const base = extension ? fileName.slice(0, -extension.length) : fileName;
  const safeBase =
    base
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^[-.]+|[-.]+$/g, '')
      .slice(0, 60) || 'document';
  const safeExtension = /^\.[a-zA-Z0-9]{1,10}$/.test(extension) ? extension.toLowerCase() : '';
  return `${randomId()}-${safeBase}${safeExtension}`;
}

/** Result of a successful storage upload. */
export interface StoredDocument {
  /** Object path inside the bucket (kept for future storage operations). */
  path: string;
  /** Public URL persisted in the database. */
  url: string;
}

/**
 * Uploads one document to the caller's own folder and returns its public URL.
 * The object is written under `<userId>/…` so another tenant can never
 * overwrite or read it.
 */
export async function uploadDocumentFile(file: File, userId: string): Promise<StoredDocument> {
  const fileError = getDocumentFileError(file);
  if (fileError) {
    throw new DocumentStorageError(fileError);
  }

  const path = `${userId}/${buildObjectName(file.name)}`;
  const supabase = await requireClient();

  const { error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });

  if (error) {
    throw new DocumentStorageError(`The file could not be uploaded. ${error.message}`);
  }

  const { data } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

/**
 * Recovers the object path from a stored document URL, so a record created
 * earlier can still be cleaned up. Handles both public and signed URLs and
 * refuses URLs that do not belong to the configured bucket.
 */
export function getStoragePathFromUrl(documentUrl: string): { path: string; bucket: string } | null {
  try {
    const url = new URL(documentUrl);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    // public/<bucket>/<path…> | sign/<bucket>/<path…> | authenticated/<bucket>/<path…>
    const segments = url.pathname.slice(markerIndex + marker.length).split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const bucket = segments[1];
    if (bucket !== DOCUMENTS_BUCKET) return null;
    return { bucket, path: decodeURIComponent(segments.slice(2).join('/')) };
  } catch {
    return null;
  }
}

/**
 * Removes the stored file behind a document URL or object path. Throws a
 * DocumentStorageError when the file is not in our bucket or storage rejects
 * the delete, so the caller can report a partially completed operation.
 */
export async function removeDocumentFile(documentUrlOrPath: string): Promise<void> {
  const target = documentUrlOrPath.startsWith('/')
    ? { bucket: DOCUMENTS_BUCKET, path: documentUrlOrPath.slice(1) }
    : getStoragePathFromUrl(documentUrlOrPath);
  if (!target) {
    throw new DocumentStorageError(
      'This file is not stored in the document storage bucket, so it could not be removed automatically.'
    );
  }

  const supabase = await requireClient();
  const { error } = await supabase.storage.from(target.bucket).remove([target.path]);
  if (error) {
    throw new DocumentStorageError(`The stored file could not be removed. ${error.message}`);
  }
}
