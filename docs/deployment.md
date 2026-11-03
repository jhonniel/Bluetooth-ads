# Deployment

## Web application

1. Provision PostgreSQL 14+ and create a database and a least-privilege user.
2. Configure environment variables (see `apps/web/.env.example`). Production values:
   - `AUTH_SECRET`, `DEVICE_TOKEN_SECRET`: long random values (`openssl rand -base64 32`), different from each other.
   - `AUTH_URL` / `APP_URL`: the public `https://` URL.
   - `MOBILE_API_KEY`: random value shared with the mobile app build.
   - `ALLOW_TEST_COMPANY_ID=false`, and set the Bluetooth SIG company identifier in System Settings.
   - `TRUST_PROXY=true` only when running behind a reverse proxy that sets `X-Forwarded-For`.
   - `STORAGE_DRIVER=s3` with DigitalOcean Spaces (or any S3-compatible bucket) for uploaded images.
     Local storage is only suitable for a single server with a persistent volume.
3. Build and migrate:
   ```bash
   npm ci
   npm run db:deploy          # prisma migrate deploy; never use migrate dev in production
   npm run build
   SEED_SAMPLE_DATA=false npm run db:seed   # first install only: admin user and default settings
   npm run start              # or run apps/web with your process manager
   ```
4. Put the app behind HTTPS (TLS terminates at the proxy or load balancer). Agents refuse plain
   `http://` servers other than localhost.
5. Health check: `GET /api/health` (200 when the database is reachable).

### Scaling notes

- Rate limiting is in-process. With several web instances, enforce limits at the proxy or move the
  limiter to a shared store.
- Event volume grows with foot traffic; `advertising_events` is indexed on time, campaign, station
  and device. Archive or partition by month when it becomes large; do not delete history without
  approval.

## Windows stations

See [apps/windows-agent/README.md](../apps/windows-agent/README.md). Summary:

1. Build `dist/agent.cjs` (`npm run build`) and `dist/native/BpaBleHelper.exe` (`npm run build:native`)
   on a build machine with Node 20+ and the .NET 8 SDK.
2. Copy `dist/` and `scripts/` to the station. Install Node.js 20+ on the station.
3. Enroll with the one-time credential, then run `scripts\install-agent.ps1` as Administrator.

## Security checklist

- [ ] Default seed passwords changed; sample users removed or deactivated
- [ ] `ALLOW_TEST_COMPANY_ID=false` and a real company identifier configured
- [ ] Secrets stored in the platform's secret manager, not in the repository
- [ ] HTTPS everywhere; HSTS enabled at the proxy
- [ ] `TRUST_PROXY` matches the network topology
- [ ] Database backups enabled and restore tested
- [ ] Station credentials issued with expiry and rotated on schedule; revoked when a PC is retired
- [ ] Agent data directory ACL restricted (installer does this)
- [ ] Mobile app sends only anonymous install tokens
- [ ] Sample analytics removed: `DELETE FROM advertising_events WHERE app_version = 'seed-sample';`
