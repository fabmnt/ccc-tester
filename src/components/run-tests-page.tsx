import * as React from "react";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  LoaderCircleIcon,
  PlayIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Modes accepted by POST /api/run, broadest option first. */
const RUN_MODES = ["all", "dev", "production", "frontend"] as const;
type RunMode = (typeof RUN_MODES)[number];

interface RunFields {
  mode: RunMode;
  clientId: string;
  clinicId: string;
  executionId: string;
  executionSheet: string;
  baseUrl: string;
  apiBaseUrl: string;
  devApiBaseUrl: string;
  productionApiBaseUrl: string;
  route: string;
  playwrightArguments: string;
}

const INITIAL_FIELDS: RunFields = {
  mode: "dev",
  clientId: "",
  clinicId: "",
  executionId: "",
  executionSheet: "",
  baseUrl: "",
  apiBaseUrl: "",
  devApiBaseUrl: "",
  productionApiBaseUrl: "",
  route: "",
  playwrightArguments: "",
};

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "started"; runId: string }
  | { kind: "error"; message: string };

/** Run request form with page header. The submit button lives in the header
 * and targets the form via its id, so Enter-in-input also works. */
export function RunTestsPage() {
  const [fields, setFields] = React.useState<RunFields>(INITIAL_FIELDS);
  const [status, setStatus] = React.useState<SubmitStatus>({
    kind: "idle",
  });
  const isSubmitting = status.kind === "submitting";

  const setField = (name: keyof RunFields, value: string): void => {
    setFields((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ kind: "submitting" });

    let response: Response;
    try {
      response = await fetch("/api/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(buildPayload(fields)),
      });
    } catch {
      setStatus({
        kind: "error",
        message:
          "Could not reach the server. Check that the dashboard is running.",
      });
      return;
    }

    const payload: unknown = await response.json().catch(() => null);
    if (
      response.status === 202 &&
      isRecord(payload) &&
      typeof payload.runId === "string"
    ) {
      setStatus({ kind: "started", runId: payload.runId });
      return;
    }

    const message =
      isRecord(payload) && typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;
    setStatus({ kind: "error", message });
  };

  return (
    <form
      id="run-tests-form"
      onSubmit={handleSubmit}
      className="flex flex-col gap-4"
    >
      <Card>
        <CardHeader>
          <CardTitle>Run tests</CardTitle>
          <CardDescription>
            Start a CCCdashboard check run in the background. One run at a time;
            results appear on the test results page once saved.
          </CardDescription>
          <CardAction>
            <Button
              type="submit"
              form="run-tests-form"
              size="sm"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <PlayIcon />
              )}
              {isSubmitting ? "Starting…" : "Start run"}
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium">Mode</span>
            <div
              role="radiogroup"
              aria-label="Test mode"
              className="flex flex-wrap gap-1.5"
            >
              {RUN_MODES.map((mode) => {
                const isSelected = fields.mode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    disabled={isSubmitting}
                    onClick={() => setField("mode", mode)}
                    className={cn(
                      "rounded-lg border px-3 py-1 text-sm transition-colors disabled:opacity-50",
                      isSelected
                        ? "border-primary bg-primary text-primary-foreground"
                        : "bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {mode}
                  </button>
                );
              })}
            </div>
            <span className="text-xs text-muted-foreground">
              &ldquo;all&rdquo; runs dev, production and frontend one after
              another.
            </span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Client ID" required>
              <Input
                value={fields.clientId}
                onChange={(event) => setField("clientId", event.target.value)}
                placeholder="client"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Clinic ID" required>
              <Input
                value={fields.clinicId}
                onChange={(event) => setField("clinicId", event.target.value)}
                placeholder="clinic"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Execution ID" required>
              <Input
                value={fields.executionId}
                onChange={(event) =>
                  setField("executionId", event.target.value)
                }
                placeholder="execution"
                required
                disabled={isSubmitting}
              />
            </Field>
            <Field label="Execution sheet" required>
              <Input
                value={fields.executionSheet}
                onChange={(event) =>
                  setField("executionSheet", event.target.value)
                }
                placeholder="2026-08-28"
                required
              />
            </Field>
          </div>

          <div className="flex flex-col gap-4 border-t pt-4">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Advanced options</h2>
              <p className="text-xs text-muted-foreground">
                Optional. Left empty, the CLI defaults from the environment
                apply.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Base URL">
                <Input
                  value={fields.baseUrl}
                  onChange={(event) => setField("baseUrl", event.target.value)}
                  placeholder="https://dashboard.example.com"
                />
              </Field>
              <Field label="API base URL">
                <Input
                  value={fields.apiBaseUrl}
                  onChange={(event) =>
                    setField("apiBaseUrl", event.target.value)
                  }
                  placeholder="https://api.example.com"
                />
              </Field>
              <Field label="Dev API base URL">
                <Input
                  value={fields.devApiBaseUrl}
                  onChange={(event) =>
                    setField("devApiBaseUrl", event.target.value)
                  }
                />
              </Field>
              <Field label="Production API base URL">
                <Input
                  value={fields.productionApiBaseUrl}
                  onChange={(event) =>
                    setField("productionApiBaseUrl", event.target.value)
                  }
                />
              </Field>
              <Field label="Route">
                <Input
                  value={fields.route}
                  onChange={(event) => setField("route", event.target.value)}
                  placeholder="/dashboard"
                />
              </Field>
              <Field
                label="Playwright arguments"
                hint="Space-separated, e.g. --headed --grep=login"
              >
                <Input
                  value={fields.playwrightArguments}
                  onChange={(event) =>
                    setField("playwrightArguments", event.target.value)
                  }
                  placeholder="--headed"
                />
              </Field>
            </div>
          </div>

          {status.kind === "started" && (
            <Alert>
              <CircleCheckIcon />
              <AlertTitle>Run started</AlertTitle>
              <AlertDescription>
                Run ID{" "}
                <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
                  {status.runId}
                </code>
                . Results appear on the <a href="/tests">test results page</a>{" "}
                once the run finishes.
              </AlertDescription>
            </Alert>
          )}

          {status.kind === "error" && (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>Could not start the run</AlertTitle>
              <AlertDescription>{status.message}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  hint,
  required = false,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

/**
 * Builds the /api/run payload: only non-empty fields are sent, so the server
 * defaults apply for everything the user left blank.
 */
function buildPayload(fields: RunFields): Record<string, string | string[]> {
  const payload: Record<string, string | string[]> = { mode: fields.mode };

  const optionalValues = {
    clientId: fields.clientId,
    clinicId: fields.clinicId,
    executionId: fields.executionId,
    executionSheet: fields.executionSheet,
    baseUrl: fields.baseUrl,
    apiBaseUrl: fields.apiBaseUrl,
    devApiBaseUrl: fields.devApiBaseUrl,
    productionApiBaseUrl: fields.productionApiBaseUrl,
    route: fields.route,
  };
  for (const [name, value] of Object.entries(optionalValues)) {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      payload[name] = trimmed;
    }
  }

  const playwrightArguments = fields.playwrightArguments
    .split(/\s+/)
    .filter((argument) => argument.length > 0);
  if (playwrightArguments.length > 0) {
    payload["playwrightArguments"] = playwrightArguments;
  }

  return payload;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
