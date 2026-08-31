import { ConvexHttpClient } from "convex/browser";
import { CONVEX_URL } from "astro:env/server";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";

const client = new ConvexHttpClient(CONVEX_URL);

export type RunCheckDoc = Doc<"runChecks">;
export type RunDoc = Doc<"runs">;

export async function listRunChecks(): Promise<RunCheckDoc[]> {
  return client.query(api.runChecks.list);
}

export async function listRuns(): Promise<RunDoc[]> {
  return client.query(api.runChecks.listRuns);
}

export async function getRunCheck(id: string): Promise<RunCheckDoc | null> {
  return client.query(api.runChecks.getById, { id });
}
