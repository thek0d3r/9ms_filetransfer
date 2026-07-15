# 9ms

9ms is a temporary, anonymous file-transfer and secret-sharing service. It supports multipart uploads up to 2 GB, password-protected links, seven-day expiry, malware scanning, one-time individual and ZIP downloads, sender deletion, abuse reporting, and encrypted one-time password links.

## Architecture

The production deployment is designed for one Oracle Cloud VM plus a private S3 bucket. MinIO is included only as an optional local-development substitute.

- Next.js web/control plane
- PostgreSQL metadata
- S3 object storage for file bytes
- Valkey/BullMQ jobs and rate limits
- ClamAV fail-closed scanning worker
- Exact-hash CSAM denylisting with optional Hive/Thorn known-and-novel media scanning
- Nginx reverse proxy

Browser uploads go directly to S3 using short-lived signed multipart URLs. The Next.js container never buffers upload bodies. Individual downloads are claimed once, redirected to a short-lived signed S3 URL, and deleted after that URL expires. ZIP downloads are streamed with bounded application memory and their source objects are queued for deletion when archiving completes.

## Local start

1. Copy `.env.example` to `.env` and replace every development secret.
2. Set `POSTGRES_PASSWORD` and make `DATABASE_URL` use the same password.
3. Run `npm install`, then `npm run db:generate`.
4. Start local infrastructure with `docker compose -f compose.yaml -f compose.local.yaml up -d postgres valkey minio minio-init clamav`.
5. Apply migrations with `npm run db:migrate`.
6. Run `npm run dev` and, in another terminal, `npm run worker`.

For a lightweight UI-only development session, set `CLAMAV_DISABLED=true`. Never disable scanning on a public deployment.

The production Compose profile hardens ClamD for the 2 GB upload ceiling. Encrypted archives/documents, broken executables, Office files containing macros, PUA signatures, and any file that exceeds an internal scan limit are quarantined instead of being treated as clean. Set `CLAMAV_DETECT_PUA=no` only if the additional false-positive risk is unacceptable. Official signatures are checked six times per day.

ClamAV is signature-based and no engine detects every new sample. For a confirmed missed static sample, submit it to the ClamAV team and add a local hash signature to the persisted `${CLAMAV_DATA_DIR}` while waiting for an official signature. ClamAV automatically loads `.hdb`, `.hsb`, `.ndb`, `.ldb`, `.yar`, and `.yara` files placed in its database directory after a daemon reload.

## Child-safety scanning

The worker computes a SHA-256 digest while it streams each file to ClamAV. `CSAM_SHA256_DENYLIST` blocks exact matches for every file type. Supported image/video formats are identified from magic bytes rather than the browser-provided MIME type.

For meaningful production coverage, obtain a CSAM Detection project key from Hive for its Thorn-powered Combined API, then set `CSAM_HIVE_API_KEY` and `CSAM_PROVIDER_REQUIRED=true`. The provider performs known-content hash matching first and a purpose-built classifier for potential novel CSAM second. Provider failures retry and ultimately quarantine the transfer; no file becomes downloadable before both malware and child-safety checks pass. Matches delete the transfer objects and create only a minimal, content-free audit record. Never place illegal media or provider match data in logs, tests, or the operator API.

The exact-hash denylist is a supplemental control, not a substitute for a vetted hash provider: do not source or curate CSAM hashes yourself. Establish a trained trust-and-safety and legally reviewed reporting/preservation process before enabling production provider matches; reporting duties vary by operator jurisdiction.

## Oracle Cloud deployment

Use an Ubuntu or Oracle Linux VM with Docker Engine and Compose. ClamAV needs substantial memory; 4 GB RAM is the practical minimum, and an Ampere A1 shape with 8 GB or more is recommended.

1. Attach and mount an Oracle Block Volume at `/srv/9ms-data` for PostgreSQL, Valkey, and ClamAV state.
2. Clone the project and create `.env` from `.env.example`.
3. Set these host paths in `.env`:

   ```dotenv
   POSTGRES_DATA_DIR=/srv/9ms-data/postgres
   VALKEY_DATA_DIR=/srv/9ms-data/valkey
   CLAMAV_DATA_DIR=/srv/9ms-data/clamav
   ```

4. Set `APP_URL=https://files.example.com`, the S3 bucket/region credentials, and `S3_FORCE_PATH_STYLE=false`. Leave `S3_ENDPOINT` and `S3_PUBLIC_ENDPOINT` unset for AWS S3; set them only for another S3-compatible provider.
5. Open only TCP 80/443 in the Oracle security list. Restrict SSH to the operator's IP. Keep PostgreSQL, Valkey, ClamAV, and port 9001 private.
6. Build and start with `docker compose up -d --build`.
7. Apply migrations: `docker compose run --rm web ./node_modules/.bin/drizzle-kit migrate`.
8. Put TLS in front of both web and storage hostnames. Update `infra/minio-cors.json` from `*` to the exact `APP_URL` before public launch.

Configure the S3 bucket CORS policy from `infra/s3-cors.json`, replacing the example origin with your production `APP_URL`.

## Operations

- Liveness: `/api/health/live`
- Readiness: `/api/health/ready`
- Prometheus metrics: `/api/metrics` (set `METRICS_TOKEN`)
- Abuse queue: `GET /api/ops/reports` with `Authorization: Bearer $OPS_TOKEN`
- Operator removal: `DELETE /api/ops/transfers/:id` with the same token
- Database backup: `BACKUP_DIR=/srv/9ms/backups ./scripts/backup.sh`

Back up PostgreSQL and snapshot the Oracle Block Volume. Use S3 lifecycle/versioning according to your recovery policy. Cleanup jobs are idempotent and reconcile expired or abandoned transfers every five minutes.

## Security notes

- Buckets are private; users receive narrowly scoped, short-lived signed URLs.
- Share and management tokens are stored only as peppered SHA-256 hashes.
- Passwords use Argon2id. Password access cookies are signed, HttpOnly, and expire after one hour.
- One-time secrets use AES-256-GCM and are erased after the first explicit reveal. Set a unique `SECRET_ENCRYPTION_KEY`; rotating it invalidates unopened links.
- Scanning fails closed. After the final failed scan attempt, objects are deleted and the transfer is quarantined.
- Use unique 32+ byte values for `TOKEN_PEPPER`, `COOKIE_SECRET`, and `OPS_TOKEN`.
- The provided Nginx configuration is HTTP-only. Terminate TLS with an Oracle Load Balancer, Caddy, or a certificate-managed Nginx configuration before public use.
