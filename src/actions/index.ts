import { ActionError, defineAction } from "astro:actions";
import { runRequestSchema } from "@/lib/run-request";
import { getRunErrorResponse, startRunFromRequest } from "@/lib/run-service";

// The action is also used by the native Astro form script on /run.
export const server = {
  runTests: defineAction({
    input: runRequestSchema,
    handler: (request) => {
      try {
        return { runId: startRunFromRequest(request) };
      } catch (error) {
        const response = getRunErrorResponse(error);
        if (response) {
          throw new ActionError({
            code:
              response.status === 400
                ? "BAD_REQUEST"
                : response.status === 409
                  ? "CONFLICT"
                  : "INTERNAL_SERVER_ERROR",
            message: response.message,
          });
        }
        throw error;
      }
    },
  }),
};
