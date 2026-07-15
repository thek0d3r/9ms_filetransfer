# 9ms

9ms is a temporary, anonymous file-transfer and secret-sharing service. It supports multipart uploads up to 2 GB, password-protected links, seven-day expiry, malware scanning, individual downloads, streamed ZIP downloads, sender deletion, abuse reporting, and encrypted one-time password links.

## Architecture

The production deployment is designed for one Oracle Cloud VM plus a private S3 bucket. MinIO is included only as an optional local-development substitute.

- Next.js web/control plane
- PostgreSQL metadata
- S3 object storage for file bytes
- Valkey/BullMQ jobs and rate limits
- ClamAV fail-closed scanning worker
- Nginx reverse proxy

Browser uploads go directly to S3 using short-lived signed multipart URLs. The Next.js container never buffers upload bodies. ZIP downloads are streamed with bounded application memory.

## Local start

1. Copy `.env.example` to `.env` and replace every development secret.
2. Set `POSTGRES_PASSWORD` and make `DATABASE_URL` use the same password.
3. Run `npm install`, then `npm run db:generate`.
4. Start local infrastructure with `docker compose -f compose.yaml -f compose.local.yaml up -d postgres valkey minio minio-init clamav`.
5. Apply migrations with `npm run db:migrate`.
6. Run `npm run dev` and, in another terminal, `npm run worker`.

For a lightweight UI-only development session, set `CLAMAV_DISABLED=true`. Never disable scanning on a public deployment.

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
