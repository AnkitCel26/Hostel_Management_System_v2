-- Supabase document storage setup (Phase 9, MRD §12.7)
--
-- Run once in Supabase -> SQL Editor. Idempotent: re-running is a no-op.
--
-- The bucket must be PUBLIC. The frontend calls getPublicUrl() and the backend
-- persists that URL permanently (document.service.ts stores a docUrl column,
-- there is no signed-URL refresh path), so a private bucket would make every
-- stored document link 404.
--
-- Nothing here needs a secret; the browser uploads with the publishable anon
-- key. Tenant isolation is enforced by the app's own GraphQL layer (documents
-- are scoped to the caller's tenant record server-side), NOT by Supabase —
-- this client is created with persistSession: false and never signs in, so
-- auth.uid() is always null and any RLS policy keyed on it would reject every
-- upload. Deliberately no RLS policy is created for that reason.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'tenant-documents',
  'tenant-documents',
  true,
  5242880, -- 5 MB, matches MAX_DOCUMENT_SIZE_BYTES in frontend/src/supabase/client.ts
  array['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
)
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Verify: expect one row with public = true and the limits above.
select id, name, public, file_size_limit, allowed_mime_types
from storage.buckets
where id = 'tenant-documents';
