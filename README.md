# 9ms

9ms is a temporary file-transfer and secret-sharing service. It supports anonymous transfers, optional accounts, a paid Premium tier, multipart uploads, password-protected links, seven-day expiry, malware scanning, one-time individual and ZIP downloads, sender deletion, abuse reporting, and encrypted one-time password links.

## Architecture

The production deployment is designed for one Oracle Cloud VM plus a private S3 bucket. MinIO is included only as an optional local-development substitute.

- Next.js web/control plane
- PostgreSQL metadata
- S3 object storage for file bytes
- Valkey/BullMQ jobs and rate limits
- ClamAV fail-closed scanning worker
- Optional exact-hash CSAM denylisting
- Stripe Checkout, subscription webhooks, and customer billing portal
- Account transfer history and an operator activity dashboard
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

The production Compose profile hardens ClamD for the 10 GB Premium upload ceiling. Encrypted archives/documents, broken executables, Office files containing macros, PUA signatures, and any file that exceeds an internal scan limit are quarantined instead of being treated as clean. Set `CLAMAV_DETECT_PUA=no` only if the additional false-positive risk is unacceptable. Official signatures are checked six times per day.

ClamAV is signature-based and no engine detects every new sample. For a confirmed missed static sample, submit it to the ClamAV team and add a local hash signature to the persisted `${CLAMAV_DATA_DIR}` while waiting for an official signature. ClamAV automatically loads `.hdb`, `.hsb`, `.ndb`, `.ldb`, `.yar`, and `.yara` files placed in its database directory after a daemon reload.

## Child-safety scanning

The worker computes a SHA-256 digest while it streams each file to ClamAV. `CSAM_SHA256_DENYLIST` blocks exact matches for every file type. Matches delete the transfer objects and create only a minimal, content-free audit record. Never place illegal media or match data in logs, tests, or the operator API.

The exact-hash denylist is a supplemental control, not a complete detection system: do not source or curate CSAM hashes yourself. Establish a trained trust-and-safety and legally reviewed reporting/preservation process before enabling production hash matching; reporting duties vary by operator jurisdiction.

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

## Accounts and Premium billing

Free and anonymous transfers remain capped at 2 GB. An active Premium subscription allows 10 GB per transfer and 50 GB of declared uploads per UTC calendar month. The default price displayed by the application is €19.99/month. These values are configurable with `PREMIUM_MAX_TRANSFER_BYTES`, `PREMIUM_MONTHLY_BYTES`, and `PREMIUM_PRICE_EUR_CENTS`; keep the displayed price synchronized with the recurring Stripe Price.

1. Create a recurring EUR 19.99 monthly Price in Stripe.
2. Set `STRIPE_SECRET_KEY` and `STRIPE_PREMIUM_PRICE_ID`.
3. Add a Stripe webhook endpoint at `https://9ms.ro/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.
4. Set the webhook signing secret as `STRIPE_WEBHOOK_SECRET`.
5. Apply migration `0003_hesitant_cargill.sql` before starting the updated containers.
6. Register the owner account, then run `npm run admin:promote -- owner@example.com` (or the equivalent command inside the web container) to unlock `/admin`.
7. Set `PREMIUM_ENABLED=true` only after the service has a lawful merchant/operator and live Stripe configuration. Until then, checkout remains disabled and the UI displays “Coming soon.”

The dashboard records account lifecycle, transfer creation/readiness/downloads, and billing entitlement events. IP addresses are irreversibly pepper-hashed before storage, and file contents are never exposed in the dashboard.

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
