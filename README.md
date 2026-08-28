# CCC Tester

CCC Tester runs Playwright checks against the CCCdashboard project. The current smoke test opens the classic
`/#/executions/:clientId` route, loads one configured sheet, and verifies that the page renders without sending a
data mutation.

CCCdashboard must be running separately for local modes. The CLI does not start or stop it.

## Setup

Create `.env.e2e` in this project. It is ignored by Git:

```dotenv
TEST_ACCESS_TOKEN=your-dashboard-access-token
CCC_CLIENT_ID=dashboard-client-id
CCC_CLINIC_ID=dashboard-clinic-id
CCC_EXECUTION_ID=dashboard-execution-or-sheet-id
CCC_EXECUTION_SHEET=2026-08-28
```

`TEST_ACCESS_TOKEN` is the value stored by CCCdashboard as `tokens` in browser local storage. The current dashboard
implementation uses an access token, not a username/password login, for this setup.

Optional values:

```dotenv
CCC_DEV_URL=http://127.0.0.1:4200
CCC_PRODUCTION_URL=https://controlcentralcarrier.com
CCC_DEV_API_BASE_URL=https://dev-carrier.dentalautomation.ai/
CCC_PRODUCTION_API_BASE_URL=https://carriers.dentalautomation.ai/
```

The sheet should contain at least one row for the real dev and production checks. In the dashboard code, the route
parameter is a client ID; `CCC_EXECUTION_ID` identifies the selected execution tab/room and is used by the mocked
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
pnpm test:e2e -- --mode=dev
pnpm test:e2e -- --mode=production
pnpm test:frontend:e2e
pnpm test:e2e -- --mode=all
```

Modes use the following targets:

- `dev`: local CCCdashboard dev server and real API requests.
- `production`: `https://controlcentralcarrier.com` and real API requests.
- `frontend`: local CCCdashboard dev server with dashboard API and sync endpoints mocked.
- `all`: runs all three modes sequentially.

Use Playwright options after the mode, for example `--headed`, `--debug`, or `--grep executions`.

Reports are written to `test-results/<mode>.json`. Credentials are never printed by the CLI. Use the mode-specific API
variables when running `--mode=all`; the single `CCC_API_BASE_URL` variable remains available for one-off overrides.
