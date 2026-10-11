# Shared cPanel deployment and test runbook

This platform supports direct Node.js + PostgreSQL deployment. Docker is optional and is not required on shared cPanel hosting.

## Recommended layout
- API: api.example.org -> repository root, startup file server.js
- Web: www.example.org -> web/, startup file server.js
- PostgreSQL: cPanel PostgreSQL database
- TLS: HTTPS for both hostnames

## 1. DNS and SSL
1. Create api.example.org and www.example.org DNS records pointing to the cPanel server.
2. In cPanel SSL/TLS Status, issue AutoSSL certificates for both hostnames.
3. Confirm both names open over HTTPS.
4. Do not expose PostgreSQL publicly.

## 2. Create PostgreSQL database
1. Open PostgreSQL Databases in cPanel.
2. Create a production database and database user.
3. Add the user to the database with required privileges.
4. Record the exact cPanel-generated database/user names.
5. Build DATABASE_URL from the provider values, for example:
postgresql://CPUSER_MPAUSER:PASSWORD@localhost:5432/CPUSER_MPA_PROD
Use the host/port supplied by the provider if different.

## 3. Upload or clone the repository
Preferred: cPanel Git Version Control -> clone the private repository.
Use an application directory outside public_html, for example /home/CPUSER/apps/ET-Professionals-Network.
For production, deploy the reviewed/merged main commit rather than an unreviewed feature branch.

## 4. Install dependencies
From cPanel Terminal or SSH:

cd /home/CPUSER/apps/ET-Professionals-Network
npm ci

Do not commit production secrets.

## 5. Configure the API Node.js application
In Setup Node.js App / Application Manager create the API app:
- Node.js: 20 or newer
- Mode: Production
- Application root: /home/CPUSER/apps/ET-Professionals-Network
- Application URL: https://api.example.org
- Startup file: server.js
- NODE_ENV=production
- HOST=0.0.0.0
- PORT=<port assigned by cPanel>
- DATABASE_URL=<production PostgreSQL URL>
- JWT_SECRET=<long random secret>
- LOG_LEVEL=info

If cPanel supplies PORT, use that value; do not hard-code a public port.
Run NPM Install and restart the application.

## 6. Run migrations
Use the same production environment variables and run:

cd /home/CPUSER/apps/ET-Professionals-Network
npm run migrate

Then test:

curl -fsS https://api.example.org/healthz
curl -fsS https://api.example.org/readyz

Expected: status ok and databaseConfigured true. Stop if migration or readiness fails.

## 7. Configure the Next.js web application
Create a second Node.js app:
- Node.js: 20 or newer
- Mode: Production
- Application root: /home/CPUSER/apps/ET-Professionals-Network/web
- Application URL: https://www.example.org
- Startup file: server.js
- NODE_ENV=production
- HOST=0.0.0.0
- PORT=<port assigned by cPanel>
- API_SERVER_BASE_URL=https://api.example.org

Before building, from the repository root run:
npm ci
npm run web:build

The browser calls the same-origin `/api/*` paths. Next.js rewrites those requests to `API_SERVER_BASE_URL` from the server runtime/build configuration, so the API origin is never embedded in browser JavaScript. Rebuild and restart the web app after changing this value.

## 8. Smoke test
API:
1. GET /healthz -> HTTP 200.
2. GET /readyz -> HTTP 200.
3. GET /api/v1/membership/products -> HTTP 200.

Landing:
1. Open https://www.example.org/.
2. Confirm Apply / Register, Login and Track progress work.
3. Confirm responsive desktop/mobile layout.
4. Confirm the Guide button still opens contextual help.

Registration/login:
1. Create a dedicated test account.
2. Confirm registration reaches /apply.
3. Login and confirm the browser lands on /dashboard.
4. Open /track from the dashboard and verify private application progress is scoped to the signed-in account.

Member application:
1. Apply from /apply.
2. Confirm /track shows Submitted.
3. Move the application through review, correction, payment and activation in the reviewer workspace.
4. Refresh /track after each state change.
5. Confirm private reviewer notes/evidence are not exposed.

Organization application:
1. Login.
2. Register an organization from /apply.
3. Confirm /track shows Draft until verification is submitted.
4. Submit organization verification in the authorized organization workspace.
5. Confirm /track reflects Pending and later decision states.

Job application:
1. Use an eligible verified professional test account.
2. Apply to a published job.
3. Confirm it appears in /track.
4. Move it through screening/interview/offer.
5. Confirm the applicant sees progress but not internal notes or reviewer-only scorecard details.

## 9. cPanel logs and troubleshooting
Check Setup Node.js App -> Logs or Passenger/application logs.
Use the API response x-request-id to correlate a failed request with server logs.

Useful checks:
node --version
npm --version
npm run test
npm run web:build
curl -i https://api.example.org/healthz
curl -i https://api.example.org/readyz

For browser/API connection failures, verify the web origin serves `/api/healthz` through its Next.js rewrite and that `API_SERVER_BASE_URL` is reachable from the web server. Do not configure a browser loopback URL such as `127.0.0.1` as a public API base.

## 10. Production acceptance checklist
- HTTPS works for web and API.
- API uses production PostgreSQL.
- Web's same-origin `/api/*` rewrite reaches the API through `API_SERVER_BASE_URL`.
- Migrations completed successfully.
- Health/readiness return 200.
- Landing page works on desktop/mobile.
- Register -> Apply -> Track works.
- Login -> Track works.
- Member application state changes are visible to the applicant.
- Organization verification state changes are visible to the organization owner.
- Job application progress is visible to the applicant.
- Private evidence/reviewer notes remain protected.
- Admin Experience Lab remains restricted to administrators.
- Production secrets are not committed.
- Database backup/restore has been tested before real records are accepted.

## cPanel limitation
Some shared hosts disable long-running Node.js processes, custom ports, PostgreSQL, or shell access. If Setup Node.js App / Passenger is unavailable, use a hosting plan that explicitly supports Node.js + PostgreSQL or deploy the runtime to a VPS/PaaS. Do not replace the database with browser storage just to fit an incompatible hosting plan.
## Production security and first administrator

Before the first production start, set these API-only environment variables in cPanel Node.js application configuration (never in web/.env and never commit real values):

- JWT_SECRET — long random signing secret, minimum 32 characters.
- AUTH_SESSION_DAYS — default 7; use the shortest practical lifetime.
- BOOTSTRAP_SUPER_ADMIN_EMAIL — first system administrator email.
- BOOTSTRAP_SUPER_ADMIN_PASSWORD — unique random password, minimum 14 characters.
- BOOTSTRAP_ADMIN_NAME — display name for the first administrator.
- CORS_ORIGIN — optional comma-separated exact HTTPS origins only for browser clients that call the API domain directly. The standard Next.js web app uses a same-origin API rewrite and does not require cross-origin access.

On startup, the bootstrap is idempotent: it creates the administrator if absent and assigns system_admin; it does not replace an existing account password. Remove the bootstrap password from the hosting environment after the initial administrator is securely established, or rotate it to a value unavailable to application operators.

### Administrator security operations

System administrators can manage account status, assign roles, revoke all sessions, and reset passwords. Suspending/disabling an account revokes active sessions. Password resets also revoke sessions. These operations are audited.

### Production acceptance

1. HTTPS/AutoSSL is active on both web and API domains.
2. PostgreSQL is private to the application account where possible.
3. DATABASE_URL, JWT_SECRET, and bootstrap credentials are server-side environment secrets only.
4. The web app's `/api/*` rewrite reaches the configured API; configure exact `CORS_ORIGIN` values only for any approved clients that bypass the web proxy.
5. The first administrator signs in, changes the bootstrap password, and confirms a second trusted administrator account before removing bootstrap credentials.
6. Test logout: the old bearer token must no longer access protected routes.
7. Test suspension: suspended user sessions must fail immediately.
8. Test failed-login throttling and confirm legitimate sign-in recovers after the window.
9. Confirm audit records exist for bootstrap, login, logout/session revocation, role/status changes and password resets.
10. Do not expose database credentials, JWT secrets, bootstrap passwords, private evidence, or reviewer notes in frontend builds or logs.

The API uses bearer access tokens rather than browser cookies, so CSRF is not the primary session threat. HTTPS remains mandatory; exact CORS configuration is needed only for approved browser clients that call the API cross-origin instead of using the same-origin web rewrite.