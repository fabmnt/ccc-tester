# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

This project stores the results of the CCC Tester E2E runs in two tables:

- `runChecks` — one document per executed check.
- `runs` — one document per run (run id, modes, lifecycle status, start/finish
  wall-clock time, and check counts). A row is created with `running` status
  before Playwright starts, then updated as each mode saves its results.

The CLI submits them with the `--save-results` flag; the schema lives in
`convex/schema.ts` and the write mutation in `convex/runChecks.ts`.
