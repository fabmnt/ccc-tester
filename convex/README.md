# Welcome to your Convex functions directory!

Write your Convex functions here.
See https://docs.convex.dev/functions for more.

This project stores the results of the CCC Tester E2E runs in two tables:

- `runChecks` — one document per executed check.
- `runs` — one document per run (run id, modes, start/finish wall-clock time,
  and check counts). Written in the same
  transaction as its check rows.

The CLI submits them with the `--save-results` flag; the schema lives in
`convex/schema.ts` and the write mutation in `convex/runChecks.ts`.
