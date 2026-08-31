import { z } from "zod";
import { isKnownCliOption, MODES } from "../../e2e/cli-arguments.js";
import { TEST_SCOPES } from "../../convex/validators.js";

export const runRequestSchema = z
  .object({
    mode: z.enum(MODES).optional(),
    accessToken: z.string().optional(),
    clientId: z.string().optional(),
    clinicId: z.string().optional(),
    executionId: z.string().optional(),
    executionSheet: z.string().optional(),
    baseUrl: z.string().optional(),
    apiBaseUrl: z.string().optional(),
    devApiBaseUrl: z.string().optional(),
    productionApiBaseUrl: z.string().optional(),
    scope: z.enum(TEST_SCOPES).optional(),
    route: z.string().optional(),
    playwrightArguments: z.array(z.string()).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const cliOption = value.playwrightArguments?.find(isKnownCliOption);
    if (cliOption !== undefined) {
      context.addIssue({
        code: "custom",
        path: ["playwrightArguments"],
        message: `must not contain ccc-tester options, found "${cliOption}"`,
      });
    }
  });

export type TestRunPayload = z.infer<typeof runRequestSchema>;

export function parseRunRequest(body: unknown): TestRunPayload | string {
  const result = runRequestSchema.safeParse(body);
  if (result.success) {
    return result.data;
  }

  return result.error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join(".") : "payload";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}
