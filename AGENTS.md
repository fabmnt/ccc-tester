# CCC Tester
This project is a e2e tester and reporter of CCC dashboard. It consists of:
- cli: runs end-to-end tests against dev server and production server of CCC dashboard.
- Dashboard: shows information about the latest test results and historical test results.
- backend: handles the storage and retrieval of test results and runs.

You should be able to find the CCCdashboard source code in `~/dev/dr/CCCdashboard`.
No behavior modifications must be done to the CCCdashboard source code, only data-test attributes can be added to elements to cover a specific test case. This works only for dev server testing until the user manually desploys the change to production.

<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->
