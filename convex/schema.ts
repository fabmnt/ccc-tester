import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { testResultValidator } from "./validators";

export default defineSchema({
  testResults: defineTable(testResultValidator.extend({ runId: v.string() }))
    .index("by_run_id", ["runId"])
    .index("by_started_at", ["startedAt"])
    .index("by_mode_status", ["mode", "status"])
    .index("by_scope", ["scope"]),
});
