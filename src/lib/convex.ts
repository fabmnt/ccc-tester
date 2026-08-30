import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "astro:env/server";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

const client = new ConvexHttpClient(CONVEX_URL);

export type TestResultDoc = Doc<"testResults">;
export type RunDoc = Doc<"runs">;

export async function listTestResults(): Promise<TestResultDoc[]> {
  return client.query(api.testResults.list);
}

export async function listRuns(): Promise<RunDoc[]> {
  return client.query(api.testResults.listRuns);
}

export async function getTestResult(id: string): Promise<TestResultDoc | null> {
  return client.query(api.testResults.getById, { id });
}
