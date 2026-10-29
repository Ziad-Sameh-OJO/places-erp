# files
Object storage: MinIO (S3-compatible). Uploads go straight from the browser with a short-lived pre-signed URL;
the API stores only the record (`system.File`). Unit photos, PDFs, contracts, receipts, fingerprint sheets.

1. `POST /files/uploads` `{ name, mime, size }`: type and size checked (images jpg/png/webp ≤ 10 MB, PDF ≤ 20 MB),
   a `PENDING` row, and a 5-minute PUT link with the size and type signed in.
2. The browser PUTs the bytes (`components/file-upload.tsx` shows progress).
3. `POST /files/:id/complete`: the stored object must match, or it's deleted and the row is `REJECTED`.
4. `GET /files/:id/url`: a 5-minute GET link, **only to the uploader**. Modules attach files to their records and
   call `FilesService.downloadUrl()` after their own permission check.

Locally: `pnpm files:local` (a minio you installed) or `pnpm infra:up` (Docker). CI runs the MinIO container.
