import { v } from "convex/values";
import type { Infer } from "convex/values";

export const modeValidator = v.union(
  v.literal("dev"),
  v.literal("production"),
  v.literal("frontend"),
);

export const TEST_SCOPES = ["execution"] as const;
export type TestScope = (typeof TEST_SCOPES)[number];

export const testScopeValidator = v.union(
  ...TEST_SCOPES.map((scope) => v.literal(scope)),
);

export const testResultStatusValidator = v.union(
  v.literal("passed"),
  v.literal("failed"),
);

export const testResultValidator = v.object({
  scope: testScopeValidator,
  route: v.optional(v.string()),
  mode: modeValidator,
  status: testResultStatusValidator,
  startedAt: v.number(),
  durationMs: v.number(),
  testTitle: v.string(),
  clientId: v.string(),
  clinicId: v.string(),
  executionId: v.string(),
  sheetName: v.string(),
  commitHash: v.optional(v.string()),
  errorMessage: v.optional(v.string()),
  tracePath: v.optional(v.string()),
  screenshotPath: v.optional(v.string()),
  videoPath: v.optional(v.string()),
});

export type TestResult = Infer<typeof testResultValidator>;
