import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() ?? '';
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';

export const DOCUMENTS_BUCKET =
  (import.meta.env.VITE_SUPABASE_DOCS_BUCKET as string | undefined)?.trim() || 'tenant-documents';

export const MAX_DOCUMENT_SIZE_BYTES = 5 * 1024 * 1024;

export const ALLOWED_DOCUMENT_TYPES: readonly string[] = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/webp'
];

const ACCEPTED_TYPES_LABEL = 'PDF, PNG, JPEG or WebP';

export class DocumentStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentStorageError';
  }
}

let clientPromise: Promise<SupabaseClient | null> | null = null;

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

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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

function randomId(): string {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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

export interface StoredDocument {
  path: string;
  url: string;
}

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

export function getStoragePathFromUrl(documentUrl: string): { path: string; bucket: string } | null {
  try {
    const url = new URL(documentUrl);
    const marker = '/storage/v1/object/';
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    const segments = url.pathname.slice(markerIndex + marker.length).split('/').filter(Boolean);
    if (segments.length < 3) return null;
    const bucket = segments[1];
    if (bucket !== DOCUMENTS_BUCKET) return null;
    return { bucket, path: decodeURIComponent(segments.slice(2).join('/')) };
  } catch {
    return null;
  }
}

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
