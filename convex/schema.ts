import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { modeValidator, testResultValidator } from "./validators";

export default defineSchema({
  runChecks: defineTable(testResultValidator.extend({ runId: v.string() }))
    .index("by_run_id", ["runId"])
    .index("by_run_id_and_mode", ["runId", "mode"])
    .index("by_started_at", ["startedAt"])
    .index("by_mode_status", ["mode", "status"])
    .index("by_scope", ["scope"]),
  runs: defineTable({
    runId: v.string(),
    modes: v.array(modeValidator),
    startedAt: v.number(),
    finishedAt: v.number(),
    checks: v.number(),
    passed: v.number(),
    /** Wall clock from first check start to save time; includes idle gaps. */
    durationMs: v.number(),
    commitHash: v.optional(v.string()),
    clientId: v.string(),
    clinicId: v.string(),
    executionId: v.string(),
    sheetName: v.string(),
  })
    .index("by_run_id", ["runId"])
    .index("by_started_at", ["startedAt"]),
});
