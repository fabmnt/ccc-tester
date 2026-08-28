import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { testResultValidator } from "./validators";

const WRITE_SECRET_ENV_VAR = "CONVEX_WRITE_SECRET";

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
