import { ConvexError, v } from "convex/values";
import {
  query,
  mutation,
  internalMutation,
  type MutationCtx,
} from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import schema from "./schema";
import {
  modeValidator,
  testResultValidator,
  type TestMode,
  type TestResult,
  type RunStatus,
} from "./validators";

const WRITE_SECRET_ENV_VAR = "CONVEX_WRITE_SECRET";

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("runChecks")
      .withIndex("by_started_at")
      .order("desc")
      .collect();
  },
});

/** Run summaries for the results table, newest run first (bounded to 100). */
export const listRuns = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_started_at")
      .order("desc")
      .take(100);
  },
});

export const getRunDetails = query({
  args: { runId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      run: schema.doc("runs"),
      checks: v.array(schema.doc("runChecks")),
    }),
  ),
  handler: async (ctx, { runId }) => {
    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (query) => query.eq("runId", runId))
      .unique();
    if (run === null) {
      return null;
    }

    const checks = await ctx.db
      .query("runChecks")
      .withIndex("by_run_id", (query) => query.eq("runId", runId))
      .order("desc")
      .collect();

    return { run, checks };
  },
});

export const getActive = query({
  args: {},
  returns: v.union(v.null(), schema.doc("runs")),
  handler: async (ctx) => {
    return await ctx.db
      .query("runs")
      .withIndex("by_status", (query) => query.eq("status", "running"))
      .order("desc")
      .first();
  },
});

export const start = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    modes: v.array(modeValidator),
    startedAt: v.number(),
    clientId: v.string(),
    clinicId: v.string(),
    executionId: v.string(),
    sheetName: v.string(),
  },
  returns: v.object({ created: v.boolean() }),
  handler: async (ctx, args) => {
    assertWriteSecret(args.secret);

    const existingRun = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (query) => query.eq("runId", args.runId))
      .unique();
    if (existingRun !== null) {
      return { created: false };
    }

    const updatedAt = Date.now();
    await ctx.db.insert("runs", {
      runId: args.runId,
      modes: args.modes,
      status: "running",
      startedAt: args.startedAt,
      updatedAt,
      checks: 0,
      passed: 0,
      durationMs: 0,
      clientId: args.clientId,
      clinicId: args.clinicId,
      executionId: args.executionId,
      sheetName: args.sheetName,
    });

    return { created: true };
  },
});

export const finish = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    status: v.union(v.literal("passed"), v.literal("failed")),
  },
  returns: v.object({ updated: v.boolean() }),
  handler: async (ctx, args) => {
    assertWriteSecret(args.secret);

    const run = await ctx.db
      .query("runs")
      .withIndex("by_run_id", (query) => query.eq("runId", args.runId))
      .unique();
    if (run === null) {
      return { updated: false };
    }

    const finishedAt = Date.now();
    await ctx.db.patch("runs", run._id, {
      status: args.status,
      finishedAt,
      updatedAt: finishedAt,
      durationMs: finishedAt - run.startedAt,
    });

    return { updated: true };
  },
});

export const save = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    mode: modeValidator,
    results: v.array(testResultValidator),
  },
  handler: async (ctx, { secret, runId, mode, results }) => {
    assertWriteSecret(secret);

    const existingRun = await ctx.db
      .query("runChecks")
      .withIndex("by_run_id_and_mode", (query) =>
        query.eq("runId", runId).eq("mode", mode),
      )
      .first();
    if (existingRun !== null) {
      return { saved: 0, skipped: true };
    }

    await upsertRunDoc(ctx, runId, mode, results);

    for (const result of results) {
      await ctx.db.insert("runChecks", { ...result, runId });
    }

    return { saved: results.length, skipped: false };
  },
});

/** Create or extend the run document for a run/mode save. */
async function upsertRunDoc(
  ctx: MutationCtx,
  runId: string,
  mode: TestMode,
  results: TestResult[],
): Promise<void> {
  const firstResult = results[0];
  const earliestStart = Math.min(...results.map((result) => result.startedAt));
  const savedAt = Date.now();
  const passedCount = results.filter(
    (result) => result.status === "passed",
  ).length;
  const commitHash = results.find((result) => result.commitHash)?.commitHash;

  const existingRun = await ctx.db
    .query("runs")
    .withIndex("by_run_id", (query) => query.eq("runId", runId))
    .unique();
  if (existingRun === null) {
    await ctx.db.insert("runs", {
      runId,
      modes: [mode],
      status: results.some((result) => result.status === "failed")
        ? "failed"
        : "passed",
      startedAt: earliestStart,
      finishedAt: savedAt,
      updatedAt: savedAt,
      checks: results.length,
      passed: passedCount,
      durationMs: savedAt - earliestStart,
      commitHash,
      clientId: firstResult.clientId,
      clinicId: firstResult.clinicId,
      executionId: firstResult.executionId,
      sheetName: firstResult.sheetName,
    });
    return;
  }

  const modes = existingRun.modes.includes(mode)
    ? existingRun.modes
    : [...existingRun.modes, mode];
  const startedAt = Math.min(existingRun.startedAt, earliestStart);
  const finishedAt = Math.max(existingRun.finishedAt ?? savedAt, savedAt);
  const status: RunStatus =
    existingRun.status === "running"
      ? "running"
      : (existingRun.status ??
        (results.some((result) => result.status === "failed")
          ? "failed"
          : "passed"));
  const patch: Partial<Doc<"runs">> = {
    modes,
    checks: existingRun.checks + results.length,
    passed: existingRun.passed + passedCount,
    startedAt,
    durationMs: savedAt - startedAt,
    commitHash: existingRun.commitHash ?? commitHash,
    status,
    updatedAt: savedAt,
  };
  if (status !== "running") {
    patch.finishedAt = existingRun.finishedAt ?? finishedAt;
  }
  await ctx.db.patch("runs", existingRun._id, patch);
}

function assertWriteSecret(secret: string): void {
  if (secret !== process.env[WRITE_SECRET_ENV_VAR]) {
    throw new ConvexError(
      `Invalid or missing write secret. Set ${WRITE_SECRET_ENV_VAR} in the deployment environment.`,
    );
  }
}

/**
 * One-time backfill: creates a run document for every runId that only exists
 * as check rows (data saved before the runs table existed).
 */
export const backfillRuns = internalMutation({
  args: {},
  handler: async (ctx) => {
    const statsByRunId = new Map<
      string,
      {
        checks: number;
        passed: number;
        startedAt: number;
        finishedAt: number;
        modes: TestMode[];
        commitHash?: string;
        first: Doc<"runChecks">;
      }
    >();
    for await (const check of ctx.db.query("runChecks")) {
      const stats = statsByRunId.get(check.runId);
      if (!stats) {
        statsByRunId.set(check.runId, {
          startedAt: check.startedAt,
          finishedAt: check.startedAt + check.durationMs,
          modes: [check.mode],
          commitHash: check.commitHash,
          checks: 1,
          passed: check.status === "passed" ? 1 : 0,
          first: check,
        });
        continue;
      }
      stats.checks += 1;
      if (check.status === "passed") {
        stats.passed += 1;
      }
      stats.startedAt = Math.min(stats.startedAt, check.startedAt);
      stats.finishedAt = Math.max(
        stats.finishedAt,
        check.startedAt + check.durationMs,
      );
      if (!stats.modes.includes(check.mode)) {
        stats.modes.push(check.mode);
      }
      stats.commitHash ??= check.commitHash;
    }

    let created = 0;
    for (const [runId, stats] of statsByRunId) {
      const existing = await ctx.db
        .query("runs")
        .withIndex("by_run_id", (query) => query.eq("runId", runId))
        .unique();
      if (existing !== null) {
        continue;
      }
      await ctx.db.insert("runs", {
        runId,
        modes: stats.modes,
        startedAt: stats.startedAt,
        finishedAt: stats.finishedAt,
        checks: stats.checks,
        passed: stats.passed,
        durationMs: stats.finishedAt - stats.startedAt,
        commitHash: stats.commitHash,
        clientId: stats.first.clientId,
        clinicId: stats.first.clinicId,
        executionId: stats.first.executionId,
        sheetName: stats.first.sheetName,
      });
      created += 1;
    }
    return { created };
  },
});
