import type { APIRoute } from "astro";
import { getActiveRun } from "@/lib/convex";

export const GET: APIRoute = async () => {
  const run = await getActiveRun();
  return new Response(JSON.stringify({ run }), {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json",
    },
  });
};
