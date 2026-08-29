import { ConvexError, v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { testResultValidator } from "./validators";

const WRITE_SECRET_ENV_VAR = "CONVEX_WRITE_SECRET";

// Convex document IDs are lowercase alphanumeric strings.
const CONVEX_ID_PATTERN = /^[a-z0-9]{16,}$/;

export const list = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("testResults")
      .withIndex("by_started_at")
      .order("desc")
      .collect();
  },
});

export const getById = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    if (!CONVEX_ID_PATTERN.test(id)) {
      return null;
    }
    try {
      return await ctx.db.get("testResults", id as Id<"testResults">);
    } catch {
      return null;
    }
  },
});

export const save = mutation({
  args: {
    secret: v.string(),
    runId: v.string(),
    results: v.array(testResultValidator),
  },
  handler: async (ctx, { secret, runId, results }) => {
    if (secret !== process.env[WRITE_SECRET_ENV_VAR]) {
      throw new ConvexError(
        `Invalid or missing write secret. Set ${WRITE_SECRET_ENV_VAR} in the deployment environment.`,
      );
    }

    const existingRun = await ctx.db
      .query("testResults")
      .withIndex("by_run_id", (query) => query.eq("runId", runId))
      .first();
    if (existingRun !== null) {
      return { saved: 0, skipped: true };
    }

    for (const result of results) {
      await ctx.db.insert("testResults", { ...result, runId });
    }

    return { saved: results.length, skipped: false };
  },
});
