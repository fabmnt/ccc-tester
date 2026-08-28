# TODO

## CLI and test execution

- Add a stable configuration strategy for test accounts, client/clinic/execution fixtures, and secret rotation.
- Add more read-only checks for authentication, execution loading, empty sheets, failed API responses, and route state.
- Decide whether the CLI should start a separately configured CCCdashboard dev server or continue requiring one to be running.
- Add CI jobs for local mocked checks, dashboard dev checks, and scheduled production checks with safe concurrency limits.
- Upload Playwright traces, screenshots, videos, and JSON reports as build artifacts.

## Reports and backend

- Define a versioned test-run/report schema with environment, commit, duration, status, test case, error, and artifact metadata.
- Build the Astro backend persistence layer and database migrations.
- Add an authenticated endpoint for the CLI to submit completed reports.
- Add report retention, deduplication, access control, and failure behavior for unavailable storage.
- Make CLI report submission optional and keep local JSON output as a fallback.

## Dashboard

- Build the Astro dashboard pages for recent runs, environment health, pass rate, duration trends, and failure details.
- Add filters by environment, test, branch/commit, date range, and status.
- Link failures to traces, screenshots, videos, and the relevant source/test configuration.
- Add monitoring, deployment configuration, and documentation for operating the dashboard and database.
