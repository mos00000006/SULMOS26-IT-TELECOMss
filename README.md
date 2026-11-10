# SULMOS26 IT & Telecommunications — Fresh Foundation v1.0

**This is a working first milestone, not a finished commercial ERP.** It contains a real Cloudflare Worker API, D1 schema, password-authenticated company accounts, company-isolated customers, tickets, technician jobs and category-specific security, hardware, LTE, cabling records. The dashboard reflects saved D1 records. The official provided SULMOS26 logo appears in the web app, and its symbol is used for the PWA installation icon.

## Keep the setup simple

Use **Cloudflare Workers Builds → GitHub integration**. **No GitHub deployment secrets** are required. Do not create a separate Pages project. Ensure the repository contains the project files at the root (including `wrangler.jsonc`, `src/`, `public/` and `migrations/`).

### 1. GitHub

Create a **new** repository named `SULMOS26-IT-TELECOM` (or reuse an empty one). Upload all extracted files, keeping the folders intact. Do not upload the ZIP as a single file. If you have a previous Worker or D1 database still in your Cloudflare account, **do not delete it until you have confirmed there are no records you need**. The same Worker name will redeploy to an existing Worker rather than creating an independent copy.

### 2. Cloudflare D1

Cloudflare dashboard → Storage & databases → D1 → Create database → name: `sulmos26-it-telecom-db`.

Copy its **Database ID** (UUID). In `wrangler.jsonc`, replace only `REPLACE_WITH_YOUR_D1_DATABASE_ID` with that UUID. Keep `binding`: `DB`.

### 3. Build and deploy

Cloudflare → Workers & Pages → Create application → Worker → import Git repository. Choose the repository, production branch `main` and Workers Builds (not Pages); build command can be blank and deploy command `npx wrangler deploy`. The `wrangler.jsonc` file tells Cloudflare to deploy **both the Worker backend and website assets**, and connects D1 at build time. If prompted for root directory, use `/`.

Alternatively, on a computer with Node.js:

```bash
npm install
npm run db:remote
npm run deploy
```

For Git integration you may need to run remote migrations separately: Cloudflare D1 database → Console → run the contents of `migrations/0001_initial.sql`, or using Wrangler: `npx wrangler d1 migrations apply sulmos26-it-telecom-db --remote` from the repository folder.

**Important: migrate the database BEFORE registering a company.** Do not paste migration SQL into the website itself.

### 4. First usage

Open your `*.workers.dev` domain; click **Register a new company**. Create the first owner account with a unique email and a password at least 12 characters long. Sign in and add a customer, a ticket, a job and a service. The system saves records in Cloudflare D1; try signing in from a second browser to verify the records are shared. Different company accounts are isolated by company ID at the API layer.

### 5. Installation as app

On HTTPS, use browser **Install** (Chrome/Edge) or **Add to Home Screen**. The installed PWA uses the cropped symbol from the supplied SULMOS26 logo. Offline caching supports the app shell only; **creating records offline is not enabled**.

## Security and production readiness

- PBKDF2-SHA256 password hashes with per-account random salts; secure HTTP-only SameSite cookies; tenant-filtered SQL; SQL parameterization.
- Users are currently created as company **owner** at registration; staff invitations, permission management, password reset, MFA, brute-force rate limiting, audit trails, email verification, subscription processing, payment gateways, and stock transaction locking still need implementation and security review before real commercial use.
- The registration endpoint currently allows anyone to create a new company; do not confuse this with a paid subscription system.
- Back up your D1 database before replacing any deployed application. Do not put real sensitive customer data in this initial release until access controls and operations have been independently tested.
- Hardware records are catalogue/asset records, **not** fully transactional stock control yet. LTE records are subscription tracking, **not** network service provisioning or payment collection.

## Important files

- `src/index.js`: real Cloudflare Worker API
- `migrations/0001_initial.sql`: database schema
- `wrangler.jsonc`: Worker, static assets and D1 binding
- `public/index.html`, `public/app.js`, `public/style.css`: responsive interface
- `public/manifest.webmanifest`, `public/icons/`: installable SULMOS26 app branding

## Deployment troubleshooting

- Error `REPLACE_WITH_YOUR_D1_DATABASE_ID`: edit `wrangler.jsonc` and enter the real D1 UUID.
- Error `no such table`: run the migration against the same D1 database listed in your Wrangler config.
- Error `Bindings cannot be added to a Worker that only has static assets`: deploy the complete repository with `main`: `src/index.js` in `wrangler.jsonc`, not just the `public` folder.
- GitHub Actions displays only `pages build and deployment`: that is the separate GitHub Pages workflow; check **Cloudflare → Worker → Deployments** for the Worker build.
- Cloudflare disconnected from Git: GitHub → Settings → Applications → Cloudflare Workers and Pages → allow this repository, retaining permissions for existing repositories.

© SULMOS26 · Your business. One system.
