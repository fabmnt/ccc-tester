# CCC Tester

CCC Tester runs Playwright checks against the CCCdashboard project. The current smoke test opens the classic
`/#/executions/:clientId` route, loads one configured sheet, and verifies that the page renders without sending a
data mutation.

CCCdashboard must be running separately for local modes. The CLI does not start or stop it.

## Setup

Create `.env.e2e` in this project. It is ignored by Git:

```dotenv
TEST_ACCESS_TOKEN=your-dashboard-access-token
```

`TEST_ACCESS_TOKEN` is the value stored by CCCdashboard as `tokens` in browser local storage. The current dashboard
implementation uses an access token, not a username/password login, for this setup.

Client, clinic, execution, and sheet values are provided as CLI arguments when running the checks. The only
configuration values read from the environment are the access token and the optional dev/production dashboard URLs.

Optional values:

```dotenv
CCC_DEV_URL=http://127.0.0.1:4200
CCC_PRODUCTION_URL=https://controlcentralcarrier.com
```

The sheet should contain at least one row for the real dev and production checks. In the dashboard code, the route
parameter is a client ID; the execution ID identifies the selected execution tab/room and is used by the mocked
frontend check.

Install Chromium once:

```sh
pnpm exec playwright install chromium
```

The CLI source is [bin/ccc-tester.ts](bin/ccc-tester.ts). Each tester command compiles it into the ignored `dist-cli/`
directory, then runs the generated JavaScript file with Node. To compile the CLI without running tests, use
`pnpm build:cli`.

## Run the checks

```sh
pnpm test:e2e -- --mode=dev --client-id=dashboard-client-id --clinic-id=dashboard-clinic-id \
  --execution-id=dashboard-execution-or-sheet-id --execution-sheet=2026-08-28
pnpm test:e2e -- --mode=production --client-id=dashboard-client-id --clinic-id=dashboard-clinic-id \
  --execution-id=dashboard-execution-or-sheet-id --execution-sheet=2026-08-28
pnpm test:frontend:e2e -- --client-id=dashboard-client-id --clinic-id=dashboard-clinic-id \
  --execution-id=dashboard-execution-or-sheet-id --execution-sheet=2026-08-28
pnpm test:e2e -- --mode=all --client-id=dashboard-client-id --clinic-id=dashboard-clinic-id \
  --execution-id=dashboard-execution-or-sheet-id --execution-sheet=2026-08-28
```

Modes use the following targets:

- `dev`: local CCCdashboard dev server and real API requests.
- `production`: `https://controlcentralcarrier.com` and real API requests.
- `frontend`: local CCCdashboard dev server with dashboard API and sync endpoints mocked.
- `all`: runs all three modes sequentially.

Use Playwright options after the mode, for example `--headed`, `--debug`, or `--grep executions`.

Reports are written to `test-results/<mode>.json`. Credentials are never printed by the CLI. API endpoints can be
overridden with `--api-base-url`, `--dev-api-base-url`, or `--production-api-base-url`.
