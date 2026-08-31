# CCC Tester

CCC Tester runs Playwright checks against the CCCdashboard project. The executions suite opens the classic
`/#/executions/:clientId` route, exercises sheet navigation, cell editing, filters, file links, and row actions, and
restores values it changes. It uses only the `Carriers Testing` client and requires real dev or production API
requests; frontend mock mode skips this suite.

CCCdashboard must be running separately for local modes. The CLI does not start or stop it.

## Setup

Create `.env.e2e` in this project. It is ignored by Git:

```dotenv
# The e2e suite logs in through the dashboard API with these credentials.
USERNAME=your-dashboard-username
PASSWORD=your-dashboard-password
```

The e2e suite obtains a short-lived access token from the dashboard's `/api/v2/auth/login` endpoint and stores it in
the browser context as CCCdashboard expects. Tests do not open the dashboard login page or require a manually copied
access token.

The tests always use the `Carriers Testing` client and `Carrier testing clinic` clinic. Only the execution sheet title
is provided for each run. The dashboard and API URLs use the defaults in `e2e/test-config.ts`.

The configured client must be `Carriers Testing`, and the configured clinic must be the Carrier testing clinic.
The configured sheet and at least one other sheet should each contain a data row for the real dev and production
checks. In the dashboard code, the route parameter is a client ID and the execution ID identifies the selected
execution tab/room.

Install Chromium once:

```sh
pnpm exec playwright install chromium
```

The CLI source is [bin/ccc-tester.ts](bin/ccc-tester.ts). Each tester command compiles it into the ignored `dist-cli/`
directory, then runs the generated JavaScript file with Node. To compile the CLI without running tests, use
`pnpm build:cli`.

## Run the checks

```sh
pnpm test:e2e -- --mode=dev --execution-sheet=2026-08-28
pnpm test:e2e -- --mode=production --execution-sheet=2026-08-28
pnpm test:frontend:e2e -- --execution-sheet=2026-08-28
pnpm test:e2e -- --mode=all --execution-sheet=2026-08-28
```

Modes use the following targets:

- `dev`: local CCCdashboard dev server and real API requests.
- `production`: `https://controlcentralcarrier.com` and real API requests.
- `frontend`: local CCCdashboard dev server with dashboard API and sync endpoints mocked. The real executions suite is
  skipped in this mode.
- `all`: runs all three modes in parallel.

Use Playwright options after the mode, for example `--headed`, `--debug`, or `--grep executions`.

Reports are written to `test-results/<mode>.json`. Credentials are never printed by the CLI. The CLI always uses the
default dashboard and API URLs defined in `e2e/test-config.ts`.

## Saving results to Convex

Pass `--save-results` to submit the test results to the Convex database after each mode finishes. The data powers the
future results dashboard.

```sh
pnpm test:e2e -- --mode=frontend --execution-sheet=... --save-results
```

Each saved result records the dashboard area under test (`--scope`, default `execution`). More scopes (e.g. `form`) will
be added as the corresponding tests are built.

Setup, once:

1. Create the Convex project and push the schema/functions:
   `npx convex dev`. This writes `convex/_generated/` and a `.env.local` with the deployment URL.
2. Store the write secret in the deployment so the `save` mutation accepts results:
   `npx convex env set CONVEX_WRITE_SECRET <a-random-secret>`.
3. Make the secret available to the CLI, either in `.env.e2e` or the environment:

   ```dotenv
   CONVEX_WRITE_SECRET=<a-random-secret>
   ```

The CLI reads `CONVEX_URL` and `CONVEX_WRITE_SECRET` from `.env.e2e` or the environment, falling back to the `.env.local`
file written by `npx convex dev` for `CONVEX_URL`. Saving is best-effort: if Convex is unreachable or the variables are
missing, the CLI warns and keeps the local `test-results/<mode>.json` report.

## Running from the Astro endpoint

`POST /api/run` starts a background test run and always enables result saving. The endpoint returns `202` with a `runId`;
a running row appears on the `/tests` page immediately, with more results added as each mode finishes. The `/run` page
uses the equivalent `runTests` Astro action, while `/api/run` remains available for HTTP clients.

Set `CONVEX_WRITE_SECRET` in the Astro server environment. The JSON payload uses the CLI options as structured fields:

```json
{
  "mode": "all",
  "executionSheet": "2026-08-28",
  "playwrightArguments": ["--headed"]
}
```

The `executionSheet` field is required by the endpoint. The server uses `USERNAME` and `PASSWORD` from `.env.e2e` to
authenticate each test context. The dashboard handles the internal client, clinic, and execution IDs while opening the
test context. The optional field is `scope`.
